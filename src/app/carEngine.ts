export type EngineState = 'off' | 'acc' | 'on' | 'cranking' | 'running';

/** The car's ignition state, driven by the key on the start screen. */
export class CarEngine {
  private current: EngineState = 'off';
  private readonly listeners = new Set<(state: EngineState) => void>();

  get state(): EngineState {
    return this.current;
  }

  get running(): boolean {
    return this.current === 'running';
  }

  set(state: EngineState): void {
    if (state === this.current) return;
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }

  onChange(listener: (state: EngineState) => void): void {
    this.listeners.add(listener);
  }
}
