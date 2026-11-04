import type { CarEngine, EngineState } from '../app/carEngine';
import { $ } from './dom';
import { createIgnition } from './ignition';

const STATUS: Record<EngineState, string> = {
  off: 'Turn the key',
  acc: 'Accessories on',
  on: 'Ignition on. Keep turning to START',
  cranking: 'Hold it…',
  running: 'Engine running'
};

export interface StartScreen {
  /** Settles into the seat and moves on to setting up the drive; instantly skips the glass clearing. */
  settle(instantly?: boolean): void;
  /** Goes straight to driving, for the browser tests. */
  skip(): void;
}

/** Opens parked: settle into the seat, set up the drive, then start the engine with the key. `settled` runs as the seat step ends. */
export function createStartScreen(engine: CarEngine, settled: (instantly: boolean) => void): StartScreen {
  const screen = $('#start'), key = $('#ignition'), status = $('#ignitionStatus');
  const keyBody = document.querySelector<SVGElement>('#keyBody'), keyTag = document.querySelector<SVGElement>('#keyTag');
  if (!keyBody || !keyTag) throw new Error('Missing key artwork');

  const showStep = (step: 'seat' | 'setup' | 'key'): void => {
    screen.dataset.step = step;
  };
  const settle = (instantly = false): void => {
    if (screen.dataset.step !== 'seat') return;
    settled(instantly);
    showStep('setup');
  };
  // The opening screen stays up until Start, then gives way to the car.
  const intro = $('#intro');
  $('#btnIntro').addEventListener('click', () => intro.classList.add('gone'));
  $('#btnSeated').addEventListener('click', () => settle());
  $('#btnGetIn').addEventListener('click', () => {
    showStep('key');
    key.focus({ preventScroll: true });
  });
  $('#btnBack').addEventListener('click', () => showStep('setup'));

  engine.onChange(state => {
    status.textContent = STATUS[state];
    screen.classList.toggle('cranking', state === 'cranking');
    if (state !== 'running') return;
    document.body.classList.remove('parked');
    screen.classList.add('gone');
    screen.inert = true;
  });

  createIgnition(key, keyBody, keyTag, engine);
  return {
    settle,
    skip: () => {
      intro.classList.add('gone');
      settle(true);
      engine.set('running');
    }
  };
}
