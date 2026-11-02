import type { SessionStore } from '../platform/types';
import { ROUTES } from '../routes';
import { fromArchive, toArchive } from '../stats/archive';
import { summarize, type DayTotal, type SessionRecord } from '../stats/sessions';
import { WEATHERS } from '../weather/tables';
import { $ } from './dom';
import { toast } from './toast';
import { mountSegmented } from './widgets';

const RECENT = 6;
/** The chart's top is at least one default session, so a single short day doesn't fill it. */
const MIN_SCALE = 25;
const CLEAR_ARM_MS = 3000;
type Range = '7' | '30';

export interface StatsPanel {
  record(session: SessionRecord): Promise<void>;
  /** Re-reads the clock, e.g. when the tab opens on a new day. */
  render(): void;
}

const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

function barLabel(day: DayTotal, index: number, count: number): string {
  if (count <= 7) return day.date.toLocaleDateString(undefined, { weekday: 'narrow' });
  // A month of bars has room for a date under every fifth, counting back from today.
  return (count - 1 - index) % 5 === 0 ? String(day.date.getDate()) : '';
}

function whenLabel(endedAt: number, now: Date): string {
  const d = new Date(endedAt);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return sameDay(d, now) ? time : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

/** The Stats tab: totals, a bar chart of recent days, the last sessions, and export and import. */
export function createStatsPanel(store: SessionStore, saveFile: (name: string, text: string) => void): StatsPanel {
  let sessions: SessionRecord[] = [];
  let range: Range = '7';
  const bars = $('#bars'), hist = $('#hist');

  function render(): void {
    const now = new Date();
    const summary = summarize(sessions, now, Number(range));
    $('#stToday').textContent = String(Math.round(summary.todayMinutes));
    $('#stWeek').textContent = String(Math.round(summary.weekMinutes));
    $('#stStreak').textContent = String(summary.streak);

    const top = Math.max(MIN_SCALE, ...summary.days.map(d => d.minutes));
    bars.classList.toggle('month', range === '30');
    bars.replaceChildren(
      ...summary.days.map((day, i) => {
        const bar = document.createElement('div');
        const tip = `${day.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${Math.round(day.minutes)} min`;
        bar.className = 'bar';
        bar.role = 'listitem';
        bar.tabIndex = 0;
        bar.dataset.tip = tip;
        bar.setAttribute('aria-label', tip);
        const fill = document.createElement('i');
        fill.style.height = `${(day.minutes / top) * 100}%`;
        const label = document.createElement('span');
        label.textContent = barLabel(day, i, summary.days.length);
        bar.append(fill, label);
        return bar;
      })
    );

    const recent = sessions.slice(-RECENT).reverse();
    hist.replaceChildren(
      ...recent.map(s => {
        const item = document.createElement('li');
        const task = document.createElement('span'), detail = document.createElement('em');
        task.textContent = s.task || 'Focus session';
        detail.textContent = `${Math.round(s.minutes)} min · ${whenLabel(s.endedAt, now)} · ${ROUTES[s.route].name}, ${WEATHERS[s.weather].name.toLowerCase()}`;
        item.append(task, detail);
        return item;
      })
    );
    hist.classList.toggle('empty', recent.length === 0);
  }

  const reload = async (): Promise<void> => {
    sessions = await store.all();
    render();
  };

  mountSegmented<Range>($('#segRange'), [['7', '7 days'], ['30', '30 days']], () => range, r => {
    range = r;
    render();
  });

  $('#btnExport').addEventListener('click', () => {
    if (!sessions.length) {
      toast('No sessions to export yet');
      return;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    saveFile(`drivey-sessions-${stamp}.json`, toArchive(sessions, now));
  });

  const file = $<HTMLInputElement>('#importFile');
  $('#btnImport').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    try {
      const { sessions: imported, skipped } = fromArchive(await chosen.text());
      await store.put(imported);
      await reload();
      toast(`Imported ${imported.length} session${imported.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed');
    }
  });

  // Asks for a second tap rather than a dialog, which would break the full-screen view.
  const clear = $('#btnClear');
  let disarm = 0;
  clear.addEventListener('click', async () => {
    if (!clear.dataset.armed) {
      clear.dataset.armed = 'true';
      clear.textContent = 'Tap again to clear';
      disarm = window.setTimeout(() => {
        delete clear.dataset.armed;
        clear.textContent = 'Clear history';
      }, CLEAR_ARM_MS);
      return;
    }
    clearTimeout(disarm);
    delete clear.dataset.armed;
    clear.textContent = 'Clear history';
    await store.clear();
    await reload();
    toast('History cleared');
  });

  void reload();
  return {
    async record(session) {
      await store.put([session]);
      await reload();
    },
    render
  };
}
