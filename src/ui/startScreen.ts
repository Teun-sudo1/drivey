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

export interface SeatStep {
  /** Whether the seat still has to be picked, which the first visit asks before anything else. */
  needed: boolean;
  /** Runs when the driver settles in, ending the step. */
  done(): void;
}

export interface StartScreen {
  /** Goes straight to driving, for the browser tests. */
  skip(): void;
}

/** Opens parked: set up the drive first, then start the engine with the key. */
export function createStartScreen(engine: CarEngine, seat: SeatStep): StartScreen {
  const screen = $('#start'), key = $('#ignition'), status = $('#ignitionStatus');
  const keyBody = document.querySelector<SVGElement>('#keyBody'), keyTag = document.querySelector<SVGElement>('#keyTag');
  if (!keyBody || !keyTag) throw new Error('Missing key artwork');

  const showStep = (step: 'seat' | 'setup' | 'key'): void => {
    screen.dataset.step = step;
  };
  if (seat.needed) showStep('seat');
  $('#btnSeated').addEventListener('click', () => {
    seat.done();
    showStep('setup');
  });
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
  return { skip: () => engine.set('running') };
}
