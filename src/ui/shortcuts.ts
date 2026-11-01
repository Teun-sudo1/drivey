export interface ShortcutActions {
  togglePlay(): void;
  toggleFullscreen(): void;
  toggleHidden(): void;
}

export function bindShortcuts(actions: ShortcutActions): void {
  addEventListener('keydown', e => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      // A keyboard user's Space belongs to the focused control. A button that
      // merely kept focus after a mouse click shouldn't swallow the shortcut.
      if (target.tagName === 'BUTTON' && target.matches(':focus-visible')) return;
      e.preventDefault();
      target.blur();
      actions.togglePlay();
    } else if (e.key.toLowerCase() === 'f') {
      void actions.toggleFullscreen();
    } else if (e.key.toLowerCase() === 'h') {
      actions.toggleHidden();
    }
  });
}
