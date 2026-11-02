import * as THREE from 'three';
import { pick, rand } from '../lib/math';
import { SEA_Y } from '../scene/backdrop';
import { BOX, BOX_L, PALM_FRONDS, PALM_TRUNK, PLANE, PLANE_L, TREE_CONE, mesh } from '../scene/geometry';
import { LAMP_SODIUM, MATERIALS, NEON_CYAN, NEON_PINK, NEON_SIGN_MATERIALS, PASTELS } from '../scene/materials';
import { CHUNK_LENGTH, Instances, addLamp, addRoadBase, addVariant } from './parts';
import type { Chunk, RouteDefinition } from './types';

const CH = CHUNK_LENGTH;
const M = MATERIALS;
const WHITE = new THREE.Color(0xf2efe8);

/** The beach runs from the seawall down under the sea. */
const BEACH_EDGE = -2.9;
const BEACH_TOP = -0.25;
const BEACH_WIDTH = 34;
const BEACH_DROP = 3.3;
/** Nothing on the land side may come nearer the road than this, rotated corners included. */
const LAND_CLEAR = 7.8;

/** Height of the sand at x, on the sea side. */
const sandY = (x: number): number => BEACH_TOP - ((BEACH_EDGE - x) / BEACH_WIDTH) * BEACH_DROP;

/** Palms, each a trunk and a crown drawn as two instanced meshes. */
function palms(parent: THREE.Object3D, spots: readonly (readonly [x: number, z: number])[]): void {
  const trunks = new Instances(PALM_TRUNK, M.palmTrunk, spots.length, parent);
  const crowns = new Instances(PALM_FRONDS, M.palmLeaf, spots.length, parent);
  for (const [x, z] of spots) {
    const size = rand(0.75, 1.3), turn = rand(0, Math.PI * 2);
    trunks.add(x, -0.1, z, size, size, size, turn);
    crowns.add(x, -0.1, z, size, size, size, turn);
  }
}

/** Sand sloping from the seawall into the sea, with surf where it meets the water. */
function addBeach(chunk: Chunk): void {
  const g = chunk.group;
  // A white seawall with a teal stripe, in place of a guardrail.
  mesh(BOX_L, M.paint, -2.65, 0.3, -CH / 2, 0.3, 0.9, CH, g);
  mesh(BOX_L, M.neon, -2.79, 0.45, -CH / 2, 0.02, 0.08, CH, g);
  const slope = new THREE.Group();
  slope.position.set(BEACH_EDGE, BEACH_TOP, 0);
  slope.rotation.z = Math.atan(BEACH_DROP / BEACH_WIDTH);
  g.add(slope);
  mesh(PLANE_L, M.sand, -BEACH_WIDTH / 2, 0, -CH / 2, BEACH_WIDTH, CH, 1, slope).rotation.x = -Math.PI / 2;
  // The surf line, where the sand slips under the water.
  const shore = ((BEACH_TOP - SEA_Y) / BEACH_DROP) * BEACH_WIDTH;
  for (const [offset, width] of [[0.3, 1.4], [2.2, 0.5]] as const) {
    mesh(PLANE_L, M.foam, -shore + offset, 0.03, -CH / 2, width, CH, 1, slope).rotation.x = -Math.PI / 2;
  }
  palms(g, Array.from({ length: 4 }, () => [-rand(5, 18), -rand(0, CH)] as const));
}

/** A lifeguard hut on stilts, in one of the pastels. */
function addLifeguardHut(chunk: Chunk): void {
  const o = new THREE.Group();
  chunk.group.add(o);
  chunk.extras.push({ object: o, probability: 0.35 });
  const x = -rand(12, 18), z = -rand(8, 32), y = sandY(x);
  const parts = new Instances(BOX, M.tinted, 8, o);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) parts.add(x + dx, y + 1.2, z + dz, 0.15, 2.6, 0.15, 0, WHITE);
  parts.add(x, y + 2.5, z, 3, 0.15, 3, 0, WHITE);
  parts.add(x, y + 3.5, z, 2.4, 1.9, 2.4, 0, pick(PASTELS));
  parts.add(x, y + 4.55, z, 3, 0.2, 3, 0, WHITE);
  mesh(PLANE, M.warmWindow, x + 1.21, y + 3.6, z, 1.5, 0.8, 1, o).rotation.y = Math.PI / 2;
}

/** A few striped-looking umbrellas planted in the sand. */
function addUmbrellas(chunk: Chunk): void {
  const o = new THREE.Group();
  chunk.group.add(o);
  chunk.extras.push({ object: o, probability: 0.4 });
  const canopies = new Instances(TREE_CONE, M.tinted, 4, o);
  const poles = new Instances(BOX, M.paint, 4, o);
  for (let k = 0; k < 4; k++) {
    const x = -rand(6, 14), z = -rand(0, CH), y = sandY(x);
    poles.add(x, y + 1, z, 0.06, 2, 0.06);
    canopies.add(x, y + 2.1, z, 0.75, 0.13, 0.75, 0, pick(PASTELS));
  }
}

/** Rocks and a cliff, each set back far enough that no corner reaches the road. */
function cliffs(o: THREE.Object3D): void {
  mesh(PLANE_L, M.grass, 6.4, -0.01, -CH / 2, 2.6, CH, 1, o).rotation.x = -Math.PI / 2;
  for (let k = 0; k < 7; k++) {
    const big = k < 4;
    const w = big ? rand(5, 10) : rand(1.2, 3), d = big ? rand(6, 10) : rand(1.2, 3), h = big ? rand(5, 16) : rand(0.8, 2.5);
    const turn = rand(0, Math.PI), lean = rand(-0.12, 0.12);
    // Half the footprint across the road once turned, plus what the lean adds at the top.
    const reach = Math.abs((w / 2) * Math.cos(turn)) + Math.abs((d / 2) * Math.sin(turn)) + Math.abs((h / 2) * Math.sin(lean));
    const x = LAND_CLEAR + reach + (big ? rand(1, 9) : rand(0, 3));
    const rock = mesh(BOX, M.cliff, x, h / 2 - 1, -rand(0, CH), w, h, d, o);
    rock.rotation.set(0, turn, lean);
  }
  // The cliff itself, behind the rocks.
  mesh(BOX_L, M.cliff, rand(32, 40), 9, -CH / 2, 12, rand(22, 30), CH, o);
}

/** A strip of 80s motels in pastels, trimmed with neon, with a glowing sign by the road. */
function beachTown(chunk: Chunk, o: THREE.Object3D): void {
  mesh(PLANE_L, M.concrete, 7.3, 0.02, -CH / 2, 4, CH, 1, o).rotation.x = -Math.PI / 2;
  const walls = new Instances(BOX, M.tinted, 6, o);
  const neon = new Instances(BOX, M.neon, 9, o);
  const windows = new Instances(PLANE, M.warmWindow, 24, o);
  let z = -rand(0, 4);
  while (z > -CH + 8) {
    const w = rand(8, 13), d = rand(9, 14), floors = Math.random() < 0.5 ? 1 : 2, h = floors * 3.4 + 0.6;
    const x = 11 + w / 2 + rand(0, 4), cz = z - d / 2, front = x - w / 2, tube = pick([NEON_PINK, NEON_CYAN]);
    walls.add(x, h / 2, cz, w, h, d, 0, pick(PASTELS));
    walls.add(x, h + 0.15, cz, w + 0.6, 0.3, d + 0.6, 0, WHITE);
    // Neon along the roofline facing the road and up one corner.
    neon.add(front - 0.33, h - 0.1, cz, 0.08, 0.08, d + 0.6, 0, tube);
    neon.add(front - 0.33, h / 2, cz + d / 2 + 0.25, 0.08, h, 0.08, 0, tube);
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < 3; k++) {
        if (Math.random() < 0.7) windows.add(front - 0.02, 1.7 + f * 3.4, cz - d / 2 + ((k + 0.5) * d) / 3, 1.6, 1.1, 1, -Math.PI / 2);
      }
    }
    z -= d + rand(3, 8);
  }
  palms(o, [[9.2, -rand(0, CH)], [9.6, -rand(0, CH)], [rand(14, 30), -rand(0, CH)]]);
  addNeonSign(chunk, o);
}

/** A pylon sign by the road, turned to face the oncoming driver. */
function addNeonSign(chunk: Chunk, parent: THREE.Object3D): void {
  const z = -rand(6, 30);
  mesh(BOX, M.metal, 9, 2.6, z, 0.2, 5.2, 0.2, parent);
  const sign = mesh(PLANE, pick(NEON_SIGN_MATERIALS), 9, 5.6, z, 3.6, 1.8, 1, parent);
  sign.rotation.y = -1.05;
  chunk.labels.push(sign);
}

/** Dunes and a grove of palms, with now and then a pastel beach house. */
function palmGrove(chunk: Chunk, o: THREE.Object3D): void {
  mesh(PLANE_L, M.sand, 12, 0.01, -CH / 2, 13, CH, 1, o).rotation.x = -Math.PI / 2;
  const dunes = new Instances(TREE_CONE, M.sand, 4, o);
  for (let k = 0; k < 4; k++) dunes.add(rand(17, 30), -0.3, -rand(0, CH), rand(2.5, 4.5), rand(0.25, 0.45), rand(2.5, 4), rand(0, Math.PI));
  palms(o, Array.from({ length: 9 }, (_, k) => [LAND_CLEAR + 1.5 + (k % 3) * rand(3, 7), -rand(0, CH)] as const));
  if (Math.random() < 0.5) {
    const house = new THREE.Group();
    o.add(house);
    chunk.extras.push({ object: house, probability: 0.6 });
    const x = rand(22, 30), z = -rand(10, 30);
    const parts = new Instances(BOX, M.tinted, 2, house);
    parts.add(x, 2.2, z, 7, 3.6, 6, 0, pick(PASTELS));
    parts.add(x, 4.15, z, 7.8, 0.3, 6.8, 0, WHITE);
    mesh(PLANE, M.warmWindow, x - 3.52, 2.3, z, 1.4, 1.1, 1, house).rotation.y = -Math.PI / 2;
  }
}

/**
 * A two-lane coast road in 80s colours: a beach with palms and lifeguard huts
 * down to the sea on our side, and on the other side stretches of cliffs, a
 * neon-lit motel strip, or palm groves and dunes.
 */
function buildChunk(chunk: Chunk, i: number): void {
  addRoadBase(chunk, -2.3, 5.1, [-2.05, 4.85], [1.4]);
  addBeach(chunk);
  addLifeguardHut(chunk);
  addUmbrellas(chunk);
  cliffs(addVariant(chunk));
  beachTown(chunk, addVariant(chunk));
  palmGrove(chunk, addVariant(chunk));
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
