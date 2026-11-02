import { rand } from '../lib/math';
import { BOX, BOX_L, mesh } from '../scene/geometry';
import { LAMP_SODIUM, MATERIALS } from '../scene/materials';
import { CHUNK_LENGTH, addGuardrail, addLamp, addRoadBase, addVerge } from './parts';
import type { Chunk, RouteDefinition } from './types';

const CH = CHUNK_LENGTH;

/** A two-lane road along a cliff, with the sea below on our side and rocks on the other. */
function buildChunk(chunk: Chunk, i: number): void {
  const g = chunk.group;
  addRoadBase(chunk, -2.3, 5.1, [-2.05, 4.85], [1.4]);
  addVerge(chunk, -3.4, 2.2);
  addGuardrail(chunk, -2.7);
  // The cliff face down to the water.
  mesh(BOX_L, MATERIALS.rock, -5.2, -1.6, -CH / 2, 1.6, 3.2, CH, g);
  addVerge(chunk, 6.4, 2.6);
  for (let k = 0; k < 5; k++) {
    const h = rand(4, 16);
    const rock = mesh(BOX, MATERIALS.rock, rand(9, 18), h / 2 - 1, -k * 8 - rand(0, 4), rand(5, 10), h, rand(6, 10), g);
    rock.rotation.set(rand(-0.2, 0.2), rand(0, 1), rand(-0.15, 0.15));
  }
  if (i % 2 === 0) addLamp(chunk, 5.7, -20, -3.8, 8, LAMP_SODIUM);
}

export const coast: RouteDefinition = {
  name: 'Coastal road',
  lampTint: 'sodium',
  speed: 19,
  maxBend: 0.00025,
  traffic: { ahead: [-0.4], oncoming: [3.2], aheadCount: 3, oncomingCount: 4 },
  scenery: { skyline: 'low', groundY: -0.2, ground: 'dark', sea: true },
  mirrorLamps: { spacing: 80, colors: [LAMP_SODIUM, LAMP_SODIUM] },
  buildChunk
};
