/** What changed in each release, newest first: the latest shows under the setup card, and all are listed under Stats. */
export const RELEASES = [
  {
    id: '2026-11-04',
    notes: 'A new 80s interior with real knobs and buttons, A/C that keeps the glass clear in rain, drag to look around the car, and a new app icon.'
  },
  {
    id: '2026-11-03',
    notes: 'Traffic keeps to the kerb lane and overtakes, door mirrors with blinking indicators, twin headlamp beams, and a softer fade when closing.'
  },
  {
    id: '2026-11-02',
    notes: 'Pick where you sit behind steamed-up glass, a seat slider in Scene settings, a loading nav screen, and sound that keeps playing on the iPhone lock screen.'
  }
] as const;

const dateOf = (id: string): string => new Date(id).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** Lists every release, newest first, into the changelog under Stats, and the latest at the foot of the setup card. */
export function renderChangelog(list: HTMLElement, latest: HTMLElement): void {
  latest.textContent = `New · ${dateOf(RELEASES[0].id)}: ${RELEASES[0].notes}`;
  list.replaceChildren(...RELEASES.map(({ id, notes }) => {
    const item = document.createElement('li'), date = document.createElement('em'), text = document.createElement('span');
    date.textContent = dateOf(id);
    text.textContent = notes;
    item.append(date, text);
    return item;
  }));
}
