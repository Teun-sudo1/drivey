import { $ } from './dom';

const VISIBLE_MS = 2600;
let hideTimer = 0;

export function toast(message: string): void {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('on');
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => el.classList.remove('on'), VISIBLE_MS);
}
