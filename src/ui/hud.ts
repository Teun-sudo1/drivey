import type { Phase, Pomodoro } from '../timer/pomodoro';
import { $ } from './dom';

const PHASES: Record<Phase, { name: string; color: string; lcd: string }> = {
  focus: { name: 'Focus', color: '#ffb46b', lcd: 'FOCUS' },
  short: { name: 'Short break', color: '#7fe6cf', lcd: 'BREAK' },
  long: { name: 'Long break', color: '#9fb7ff', lcd: 'BREAK' }
};

const PLAY_ICON = '<path d="M8 5v14l11-7z"/>';
const PAUSE_ICON = '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>';

export function phaseName(phase: Phase): string {
  return PHASES[phase].name;
}

export function formatTime(ms: number): string {
  const s = Math.ceil(ms / 1000), m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export interface Hud {
  render(): void;
}

export function createHud(timer: Pomodoro, every: () => number, subtitle: () => string, showOnDash: (txt: string, label: string) => void): Hud {
  const time = $('#time'), phase = $('#phaseName'), dot = $('#chip .dot'), cycle = $('#cycle');
  const sub = $('#sub'), play = $('#btnPlay'), icon = $('#playIco');
  let lastKey = '';

  function render(): void {
    const txt = formatTime(timer.remainingMs), info = PHASES[timer.phase];
    const label = timer.phase === 'focus' && !timer.running ? 'PAUSED' : info.lcd;
    showOnDash(txt, label);
    const cycleText = timer.phase === 'focus' ? `${(timer.completedFocus % every()) + 1}/${every()}` : '';
    const key = [txt, timer.phase, timer.running, cycleText, subtitle()].join('|');
    if (key === lastKey) return;
    lastKey = key;
    time.textContent = txt;
    phase.textContent = info.name;
    dot.style.background = info.color;
    dot.style.boxShadow = `0 0 10px ${info.color}`;
    cycle.textContent = cycleText;
    sub.textContent = subtitle();
    icon.innerHTML = timer.running ? PAUSE_ICON : PLAY_ICON;
    play.setAttribute('aria-label', timer.running ? 'Pause' : 'Start');
    document.title = (timer.running ? txt + ' · ' : '') + 'Night Drive';
  }

  $('#btnPlay').addEventListener('click', () => timer.toggle());
  $('#btnReset').addEventListener('click', () => timer.reset());
  timer.onChange(render);
  render();
  return { render };
}
