import type { SettingsStore } from '../app/settings';
import { $ } from './dom';

/** The "What are you focusing on?" field. */
export function bindTask(settings: SettingsStore): () => void {
  const input = $<HTMLInputElement>('#taskIn');
  input.addEventListener('input', () => settings.update({ task: input.value }));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
  });
  const refresh = (): void => {
    if (document.activeElement !== input) input.value = settings.value.task;
  };
  refresh();
  return refresh;
}
