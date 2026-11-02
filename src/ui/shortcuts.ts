export interface ShortcutActions {
  togglePlay(): void;
  toggleMute(): void;
  toggleFullscreen(): void;
  toggleHidden(): void;
}

export function bindShortcuts(actions: ShortcutActions): void {
  // :focus-visible can't tell these apart: Chrome also applies it to a clicked button once any key is pressed.
  let focusedByKeyboard = false;
  addEventListener('pointerdown', () => {
    focusedByKeyboard = false;
  }, true);
  addEventListener('keydown', e => {
    if (e.key === 'Tab') focusedByKeyboard = true;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      // A keyboard user's Space belongs to the focused control. A button that
      // merely kept focus after a mouse click shouldn't swallow the shortcut.
      if (target.tagName === 'BUTTON' && focusedByKeyboard) return;
      e.preventDefault();
      target.blur();
      actions.togglePlay();
    } else if (e.key.toLowerCase() === 'f') {
      void actions.toggleFullscreen();
    } else if (e.key.toLowerCase() === 'm') {
      actions.toggleMute();
    } else if (e.key.toLowerCase() === 'h') {
      actions.toggleHidden();
    }
  });
}
