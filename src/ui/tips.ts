import type { SettingsStore } from '../app/settings';
import { $ } from './dom';

/** A few pointers the first time the engine runs; once dismissed, never again. */
export function showTipsOnce(settings: SettingsStore): void {
  if (settings.value.tipsSeen) return;
  const card = $('#tips');
  // Keyboard shortcuts only help where there's a keyboard.
  card.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
  card.classList.remove('hidden');
  card.inert = false;
  $('#btnTips').addEventListener('click', () => {
    card.classList.add('hidden');
    card.inert = true;
    settings.update({ tipsSeen: true });
  }, { once: true });
}
