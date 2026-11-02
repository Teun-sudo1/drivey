import * as THREE from 'three';
import { pick, rand } from '../lib/math';
import { BOX, BOX_L, PLANE, buildingGeometry, mesh } from '../scene/geometry';
import { CITY_NEON_MATERIALS, CONTAINER_COLORS, LAMP_SODIUM, LAMP_TEAL, MATERIALS, NEON_CYAN, NEON_PINK, SIGN_MATERIALS, WINDOW_MATERIALS } from '../scene/materials';
import { CHUNK_LENGTH, Instances, addLamp, addRoadBase, addVariant } from './parts';
import type { Chunk, RouteDefinition } from './types';

const CH = CHUNK_LENGTH;
const M = MATERIALS;
/** The streets below the expressway. */
const GROUND = -14;
/** Both carriageways, ours from -2.3 and the oncoming one out to 15.1, either side of a median. */
const LEFT = -2.3, RIGHT = 15.1, MEDIAN = 6.3, CENTRE = (LEFT + RIGHT) / 2;
/** Where scenery on the far side may start. */
const FAR = RIGHT + 1;
/** Shipping containers: 2.4 m wide, 2.6 m tall, 6 m long. */
const BOX_W = 2.4, BOX_H = 2.6, BOX_L_ = 6;

function addBuilding(chunk: Chunk, parent: THREE.Object3D, x: number, z: number, w: number, h: number, d: number): void {
  chunk.buildings.push(mesh(buildingGeometry(w, h, d), pick(WINDOW_MATERIALS), x, GROUND + h / 2, z, 1, 1, 1, parent));
}

/** Towers on both sides, as far as the eye can see. */
function towers(chunk: Chunk, o: THREE.Object3D): void {
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const w = rand(10, 22), d = rand(9, 14), h = rand(22, 80);
      const x = side < 0 ? -rand(9, 34) - w / 2 : FAR + rand(8, 34) + w / 2;
      addBuilding(chunk, o, x, -k * 10 - 5, w, h, d);
    }
  }
}

/** Rows of containers, stacked up to `tiers` high on a quay at `base`. */
function containerStacks(parent: THREE.Object3D, x0: number, x1: number, base: number, tiers: number, count: number): void {
  const boxes = new Instances(BOX, M.tinted, count, parent);
  for (let k = 0; k < count; k++) {
    const x = rand(x0, x1), z = -rand(3, CH - 3), level = Math.floor(rand(0, tiers));
    boxes.add(x, base + BOX_H * (level + 0.5), z, BOX_W, BOX_H, BOX_L_, Math.random() < 0.8 ? 0 : Math.PI / 2, pick(CONTAINER_COLORS));
  }
}

/** A gantry crane over the quay, its boom reaching out over the water, with a warning light on top. */
function addCrane(parent: THREE.Object3D, x: number, z: number): void {
  const top = 24;
  for (const dx of [-5, 5]) for (const dz of [-5, 5]) mesh(BOX, M.crane, x + dx, (GROUND + top) / 2, z + dz, 0.8, top - GROUND, 0.8, parent);
  for (const dz of [-5, 5]) mesh(BOX, M.crane, x - 14, top, z + dz, 48, 1.2, 0.8, parent);
  mesh(BOX, M.crane, x + 4, top + 5, z, 2, 10, 2, parent);
  mesh(BOX, M.reflector, x + 4, top + 10.3, z, 0.6, 0.6, 0.6, parent);
}

/** Cranes, a ship and a container yard on our side; warehouses and stacked boxes on the other. */
function harbour(chunk: Chunk, o: THREE.Object3D): void {
  addCrane(o, -24, -rand(10, 30));
  const ship = new THREE.Group();
  o.add(ship);
  chunk.extras.push({ object: ship, probability: 0.5 });
  mesh(BOX, M.dark, -62, -9, -20, 16, 10, 36, ship);
  addBuilding(chunk, ship, -62, -32, 12, 23, 9);
  containerStacks(ship, -68, -56, -4, 3, 14);
  // A raised quay on the far side, so the stacks show over the barrier.
  mesh(BOX_L, M.concrete, FAR + 24, -6.5, -CH / 2, 40, 1, CH, o);
  containerStacks(o, FAR + 6, FAR + 42, -6, 4, 22);
  for (let k = 0; k < 2; k++) {
    const w = rand(18, 30), d = rand(14, 18);
    addBuilding(chunk, o, FAR + rand(46, 64) + w / 2, -k * 20 - 10, w, rand(18, 26), d);
  }
}

/** Mid-rise blocks close to the road, with neon billboards and lit corners. */
function nightlife(chunk: Chunk, o: THREE.Object3D): void {
  const tubes = new Instances(BOX, M.neon, 8, o);
  for (const side of [-1, 1]) {
    let z = -rand(0, 4);
    while (z > -CH + 6) {
      const w = rand(10, 16), d = rand(10, 16), h = rand(20, 40);
      const x = side < 0 ? -rand(9, 14) - w / 2 : FAR + rand(4, 8) + w / 2;
      const cz = z - d / 2, near = x - (side * w) / 2;
      addBuilding(chunk, o, x, cz, w, h, d);
      tubes.add(near - side * 0.1, GROUND + h / 2, cz + d / 2, 0.15, h, 0.15, 0, pick([NEON_PINK, NEON_CYAN]));
      if (Math.random() < 0.6) {
        // A billboard on the roof, turned towards the oncoming driver.
        const sign = mesh(PLANE, pick(CITY_NEON_MATERIALS), near + side * 2, GROUND + h + 2.4, cz, 6.4, 3.2, 1, o);
        sign.rotation.y = side < 0 ? 1.05 : -1.05;
        chunk.labels.push(sign);
      }
      z -= d + rand(2, 5);
    }
  }
}

function buildChunk(chunk: Chunk, i: number): void {
  const g = chunk.group;
  addRoadBase(chunk, LEFT, RIGHT, [-2.05, 4.85, 7.75, 14.85], [1.4, 11.2]);
  for (const x of [LEFT - 0.2, MEDIAN, RIGHT + 0.2]) mesh(BOX_L, M.concrete, x, 0.55, -CH / 2, 0.35, 1.1, CH, g);
  mesh(BOX_L, M.dark, CENTRE, -0.7, -CH / 2, RIGHT - LEFT + 0.8, 1.2, CH, g); // deck (top below road)
  // Two lamps a chunk, both over our lanes; each costs several draw calls, which phones feel.
  addLamp(chunk, MEDIAN, -10, -3.6, 9, i % 3 ? LAMP_TEAL : LAMP_SODIUM);
  addLamp(chunk, LEFT - 0.3, -30, 3.4, 9, i % 2 ? LAMP_SODIUM : LAMP_TEAL);
  towers(chunk, addVariant(chunk));
  harbour(chunk, addVariant(chunk));
  nightlife(chunk, addVariant(chunk));
  if (i % 5 === 2) {
    const o = new THREE.Group();
    g.add(o);
    chunk.extras.push({ object: o, probability: 0.35 });
    mesh(BOX, M.concrete, CENTRE, 8.6, -20, 100, 1.3, 11, o);
    mesh(BOX, M.concrete, CENTRE, 9.6, -14.6, 100, 0.9, 0.25, o);
    mesh(BOX, M.under, CENTRE, 7.9, -17, 100, 0.06, 0.25, o);
    mesh(BOX, M.under, CENTRE, 7.9, -23, 100, 0.06, 0.25, o);
    for (const x of [-7, RIGHT + 5]) mesh(BOX, M.concrete, x, -2.7, -20, 2, 21, 3, o);
  }
  if (i % 4 === 1) {
    const o = new THREE.Group();
    g.add(o);
    chunk.extras.push({ object: o, probability: 0.5 });
    mesh(BOX, M.metal, 5.6, 3, -26, 0.2, 6, 0.2, o);
    mesh(BOX, M.metal, 4.3, 5.9, -26, 2.8, 0.15, 0.15, o);
    chunk.labels.push(mesh(PLANE, pick(SIGN_MATERIALS), 3.6, 5.1, -25.9, 3.4, 1.7, 1, o));
  }
}

export const city: RouteDefinition = {
  name: 'City expressway',
  lampTint: 'teal',
  speed: 22,
  maxBend: 0.00025,
  traffic: { ahead: [-0.4, 3.2], oncoming: [9.4, 13], aheadCount: 6, oncomingCount: 5 },
  scenery: { skyline: 'city', groundY: GROUND, ground: 'dark', sea: false },
  mirrorLamps: { spacing: 20, colors: [LAMP_SODIUM, LAMP_TEAL] },
  buildChunk
};
