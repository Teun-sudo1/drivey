import * as THREE from 'three';
import { pick, rand } from '../lib/math';
import { BOX, BOX_L, PLANE, buildingGeometry, mesh } from '../scene/geometry';
import { LAMP_SODIUM, LAMP_TEAL, MATERIALS, SIGN_MATERIALS, WINDOW_MATERIALS } from '../scene/materials';
import { CHUNK_LENGTH, addLamp, addRoadBase } from './parts';
import type { Chunk, RouteDefinition } from './types';

const CH = CHUNK_LENGTH;
const M = MATERIALS;

function buildChunk(chunk: Chunk, i: number): void {
  const g = chunk.group;
  addRoadBase(chunk, -2.3, 5.1, [-2.05, 4.85], [1.4]);
  mesh(BOX_L, M.concrete, -2.5, 0.55, -CH / 2, 0.35, 1.1, CH, g);
  mesh(BOX_L, M.concrete, 5.3, 0.55, -CH / 2, 0.35, 1.1, CH, g);
  mesh(BOX_L, M.dark, 1.4, -0.7, -CH / 2, 8.2, 1.2, CH, g); // deck (top below road)
  addLamp(chunk, 5.4, -10, -3.6, 9, i % 3 ? LAMP_TEAL : LAMP_SODIUM);
  addLamp(chunk, -2.6, -30, 3.4, 9, i % 2 ? LAMP_SODIUM : LAMP_TEAL);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const w = rand(10, 22), d = rand(9, 14), h = rand(22, 80);
      const x = side < 0 ? -rand(9, 34) - w / 2 : 6 + rand(10, 36) + w / 2;
      chunk.buildings.push(mesh(buildingGeometry(w, h, d), pick(WINDOW_MATERIALS), x, -14 + h / 2, -k * 10 - 5, 1, 1, 1, g));
    }
  }
  if (i % 5 === 2) {
    const o = new THREE.Group();
    g.add(o);
    chunk.extras.push({ object: o, probability: 0.35 });
    mesh(BOX, M.concrete, 1.4, 8.6, -20, 90, 1.3, 11, o);
    mesh(BOX, M.concrete, 1.4, 9.6, -14.6, 90, 0.9, 0.25, o);
    mesh(BOX, M.under, 1.4, 7.9, -17, 90, 0.06, 0.25, o);
    mesh(BOX, M.under, 1.4, 7.9, -23, 90, 0.06, 0.25, o);
    for (const x of [-7, 10]) mesh(BOX, M.concrete, x, -2.7, -20, 2, 21, 3, o);
  }
  if (i % 4 === 1) {
    const o = new THREE.Group();
    g.add(o);
    chunk.extras.push({ object: o, probability: 0.5 });
    mesh(BOX, M.metal, 5.6, 3, -26, 0.2, 6, 0.2, o);
    mesh(BOX, M.metal, 4.3, 5.9, -26, 2.8, 0.15, 0.15, o);
    mesh(PLANE, pick(SIGN_MATERIALS), 3.6, 5.1, -25.9, 3.4, 1.7, 1, o);
  }
}

export const city: RouteDefinition = {
  name: 'City expressway',
  speed: 22,
  maxBend: 0.00025,
  groundY: -14,
  buildChunk
};
