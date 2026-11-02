import * as THREE from 'three';
import { rand } from '../lib/math';
import { BOX, BOX_L, PLANE, ROOF_CONE, TREE_CONE, mesh } from '../scene/geometry';
import { LAMP_SODIUM, MATERIALS } from '../scene/materials';
import { CHUNK_LENGTH, Instances, addLamp, addRoadBase, addRoadside, addShoulder, addVariant, addWater } from './parts';
import type { Chunk, RouteDefinition } from './types';

const CH = CHUNK_LENGTH;
const M = MATERIALS;
const TREES_PER_CHUNK = 16;

/** Trees at x positions from `spot`, alternating sides by index. */
function addTrees(parent: THREE.Object3D, count: number, spot: (k: number) => number): void {
  const crowns = new Instances(TREE_CONE, M.tree, count, parent);
  const trunks = new Instances(BOX, M.trunk, count, parent);
  for (let k = 0; k < count; k++) {
    const x = spot(k), z = -rand(0, CH), size = rand(0.7, 1.6);
    crowns.add(x, 3.4 * size, z, size, size, size);
    trunks.add(x, 0.9 * size, z, 0.3, 1.8 * size, 0.3);
  }
}

/** A house with lit windows facing the road, its roof hipped. */
function addHouse(parent: THREE.Object3D, x: number, z: number, scale = 1): void {
  const facing = x < 0 ? 1 : -1;
  mesh(BOX, M.house, x, 2.2 * scale, z, 6, 4.4 * scale, 8, parent);
  mesh(ROOF_CONE, M.roof, x, 4.4 * scale + 1.5, z, 0.75, 1, 1, parent).rotation.y = Math.PI / 4;
  for (const dz of [-2, 1.5]) mesh(PLANE, M.warmWindow, x + facing * 3.02, 2.2 * scale, z + dz, 1.2, 1, 1, parent).rotation.y = (facing * Math.PI) / 2;
}

/** Fields and trees, with a farmhouse set back now and then. */
function farmland(chunk: Chunk, o: THREE.Object3D): void {
  addTrees(o, TREES_PER_CHUNK, k => (k % 2 ? rand(8, 45) : -rand(5, 40)));
  const farm = new THREE.Group();
  o.add(farm);
  chunk.extras.push({ object: farm, probability: 0.4 });
  addHouse(farm, rand(18, 34), -20);
}

/** Houses close to the road behind low stone walls, and sometimes a church. */
function village(chunk: Chunk, o: THREE.Object3D): void {
  // The road widens through the village, with parking on both sides.
  addShoulder(o, -2, -4.2);
  addShoulder(o, 4.8, 7);
  for (const x of [-4.6, 7.4]) mesh(BOX_L, M.concrete, x, 0.35, -CH / 2, 0.5, 0.7, CH, o);
  for (const z of [-8, -24]) {
    addHouse(o, -rand(9, 12), z - rand(0, 6), rand(0.9, 1.3));
    addHouse(o, rand(12, 15), z - rand(0, 6), rand(0.9, 1.3));
  }
  const church = new THREE.Group();
  o.add(church);
  chunk.extras.push({ object: church, probability: 0.25 });
  mesh(BOX, M.house, 26, 4, -20, 10, 8, 18, church);
  mesh(BOX, M.house, 26, 9, -9, 4, 18, 4, church);
  mesh(ROOF_CONE, M.roof, 26, 20, -9, 0.45, 2.4, 0.45, church).rotation.y = Math.PI / 4;
  addTrees(o, 4, k => (k % 2 ? rand(20, 40) : -rand(18, 35)));
}

/** A lake on our side with reeds and sometimes a jetty; trees on the other. */
function lake(chunk: Chunk, o: THREE.Object3D): void {
  addWater(o, -4, -300, -0.15);
  const reeds = new Instances(BOX, M.tree, 30, o);
  for (let k = 0; k < 30; k++) reeds.add(-rand(4, 9), 0.4, -rand(0, CH), 0.05, rand(0.6, 1.4), 0.05);
  const jetty = new THREE.Group();
  o.add(jetty);
  chunk.extras.push({ object: jetty, probability: 0.3 });
  mesh(BOX, M.trunk, -14, 0.1, -20, 16, 0.15, 1.6, jetty);
  addTrees(o, 10, () => rand(8, 45));
}

/** A narrow lane marked by reflector posts, through fields, villages and past lakes. */
function buildChunk(chunk: Chunk, i: number): void {
  const g = chunk.group;
  addRoadBase(chunk, -2, 4.8, [-1.8, 4.6], [1.4]);
  const roadside = addRoadside(chunk);
  for (const x of [-2.4, 5.2]) {
    const parent = x < 0 ? roadside : g;
    for (let k = 0; k < 2; k++) {
      mesh(BOX, M.metal, x, 0.5, -k * 20 - 8, 0.1, 1, 0.1, parent);
      mesh(BOX, M.reflector, x, 0.85, -k * 20 - 7.94, 0.08, 0.08, 0.02, parent);
    }
  }
  farmland(chunk, addVariant(chunk));
  village(chunk, addVariant(chunk));
  lake(chunk, addVariant(chunk));
  if (i % 7 === 0) addLamp(chunk, 5.4, -20, -3, 7, LAMP_SODIUM);
}

export const country: RouteDefinition = {
  name: 'Countryside',
  lampTint: 'sodium',
  speed: 16,
  maxBend: 0.00045,
  traffic: { ahead: [-0.4], oncoming: [3.2], aheadCount: 2, oncomingCount: 3 },
  scenery: { skyline: 'hills', groundY: -0.2, ground: 'grass', sea: false },
  mirrorLamps: { spacing: Infinity, colors: [LAMP_SODIUM, LAMP_SODIUM] },
  buildChunk
};
