import { $ } from './dom';

/** The settings surface: a slide-out panel in landscape, a bottom sheet in portrait (see layout.css). */
export interface ControlSurface {
  isOpen(): boolean;
  toggle(open?: boolean): void;
}

export function createControlSurface(onToggle: () => void, onTab: (tab: string) => void): ControlSurface {
  const panel = $('#panel');
  const isOpen = (): boolean => !panel.classList.contains('hidden');
  const toggle = (open = !isOpen()): void => {
    panel.classList.toggle('hidden', !open);
    // Keeps the off-screen controls out of the tab order.
    panel.inert = !open;
    // Chrome leaves focus on a button inside the now inert panel, which would swallow key presses.
    if (!open && panel.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    onToggle();
  };

  const tabs = document.querySelectorAll<HTMLElement>('.tabs [data-tab]');
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const t of tabs) t.classList.toggle('on', t === tab);
      for (const s of panel.querySelectorAll('section')) s.classList.toggle('on', s.id === `tab-${tab.dataset.tab}`);
      onTab(tab.dataset.tab!);
    });
  }
  $('#btnPanel').addEventListener('click', () => toggle());
  $('#btnClose').addEventListener('click', () => toggle(false));
  return { isOpen, toggle };
}
