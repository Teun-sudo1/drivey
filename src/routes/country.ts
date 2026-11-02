import * as THREE from 'three';
import { rand } from '../lib/math';
import { BOX, PLANE, ROOF_CONE, TREE_CONE, mesh } from '../scene/geometry';
import { LAMP_SODIUM, MATERIALS } from '../scene/materials';
import { CHUNK_LENGTH, addLamp, addRoadBase } from './parts';
import type { Chunk, RouteDefinition } from './types';

const CH = CHUNK_LENGTH;
const M = MATERIALS;
const TREES_PER_CHUNK = 16;

function addTrees(chunk: Chunk): void {
  const crowns = new THREE.InstancedMesh(TREE_CONE, M.tree, TREES_PER_CHUNK);
  const trunks = new THREE.InstancedMesh(BOX, M.trunk, TREES_PER_CHUNK);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let k = 0; k < TREES_PER_CHUNK; k++) {
    const x = k % 2 ? rand(8, 45) : -rand(5, 40), z = -rand(0, CH), size = rand(0.7, 1.6);
    crowns.setMatrixAt(k, m.compose(p.set(x, 3.4 * size, z), q, s.set(size, size, size)));
    trunks.setMatrixAt(k, m.compose(p.set(x, 0.9 * size, z), q, s.set(0.3, 1.8 * size, 0.3)));
  }
  chunk.group.add(crowns, trunks);
}

/** A farmhouse set back in the fields, with its windows lit. */
function addHouse(chunk: Chunk): void {
  const o = new THREE.Group();
  chunk.group.add(o);
  chunk.extras.push({ object: o, probability: 0.6 });
  const x = rand(18, 34);
  mesh(BOX, M.house, x, 2.2, -20, 8, 4.4, 6, o);
  mesh(ROOF_CONE, M.roof, x, 5.9, -20, 1, 1, 0.75, o).rotation.y = Math.PI / 4;
  for (const dx of [-1.5, 2]) mesh(PLANE, M.warmWindow, x + dx, 2.2, -16.98, 1.2, 1, 1, o);
}

/** A narrow lane through fields and trees, marked by reflector posts. */
function buildChunk(chunk: Chunk, i: number): void {
  const g = chunk.group;
  addRoadBase(chunk, -2, 4.8, [-1.8, 4.6], [1.4]);
  addTrees(chunk);
  for (const x of [-2.4, 5.2]) {
    for (let k = 0; k < 2; k++) {
      mesh(BOX, M.metal, x, 0.5, -k * 20 - 8, 0.1, 1, 0.1, g);
      mesh(BOX, M.reflector, x, 0.85, -k * 20 - 7.94, 0.08, 0.08, 0.02, g);
    }
  }
  if (i % 6 === 3) addHouse(chunk);
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
