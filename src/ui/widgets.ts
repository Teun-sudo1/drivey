/** Fills a `.tog` row (its text is the label) with a labelled switch. */
export function mountSwitch(row: HTMLElement, get: () => boolean, set: (on: boolean) => void): void {
  const sw = document.createElement('button');
  sw.className = 'sw';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-label', row.textContent?.trim() ?? '');
  const refresh = (): void => {
    sw.classList.toggle('on', get());
    sw.setAttribute('aria-checked', String(get()));
  };
  row.appendChild(sw);
  // The whole row is the tap target; the inner button's click bubbles up to it.
  row.addEventListener('click', () => {
    set(!get());
    refresh();
  });
  refresh();
}

/** Fills a `.num` row (its text is the label) with a − value + stepper. */
export function mountStepper(row: HTMLElement, get: () => number, set: (v: number) => void, [min, max, step]: readonly [number, number, number]): void {
  const label = row.textContent?.trim() ?? '';
  const wrap = document.createElement('div');
  wrap.className = 'st';
  const value = document.createElement('span');
  const button = (text: string, aria: string, delta: number): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = text;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => {
      set(Math.min(max, Math.max(min, get() + delta)));
      value.textContent = String(get());
    });
    return b;
  };
  value.textContent = String(get());
  wrap.append(button('−', `Decrease ${label}`, -step), value, button('+', `Increase ${label}`, step));
  row.appendChild(wrap);
}

/** Fills a `.seg` element with one button per option. */
export function mountSegmented<T extends string>(el: HTMLElement, options: readonly (readonly [value: T, label: string])[], get: () => T, set: (v: T) => void): () => void {
  el.setAttribute('role', 'group');
  const buttons = options.map(([value, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => {
      set(value);
      refresh();
    });
    el.appendChild(b);
    return [value, b] as const;
  });
  const refresh = (): void => {
    for (const [value, b] of buttons) {
      b.classList.toggle('on', get() === value);
      b.setAttribute('aria-pressed', String(get() === value));
    }
  };
  refresh();
  return refresh;
}
