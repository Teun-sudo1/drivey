import * as THREE from 'three';
import { pick, rand } from '../lib/math';
import { BOX, BOX_L, PLANE, PLANE_L, TREE_CONE, buildingGeometry, mesh } from '../scene/geometry';
import { LAMP_SODIUM, MATERIALS, SIGN_MATERIALS, WINDOW_MATERIALS } from '../scene/materials';
import { CHUNK_LENGTH, Instances, addGuardrail, addLamp, addRoadBase, addShoulder, addVariant, addWater } from './parts';
import type { Chunk, RouteDefinition } from './types';

const CH = CHUNK_LENGTH;
const M = MATERIALS;
/** Both carriageways, from the outer edge of ours to the outer edge of the oncoming one. */
const LEFT = -2.3, RIGHT = 15.1, MEDIAN = 6.3;
const CENTRE = (LEFT + RIGHT) / 2;
const TUNNEL_HEIGHT = 6.8;
const TUNNEL_LIGHT_SPACING = 8;
const TUNNEL_LIGHT = 0xffc56e;
/** How far the hill a tunnel runs through spreads either side of the road. */
const HILL_WIDTH = 92, HILL_HEIGHT = 14;

function group(parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  parent.add(g);
  return g;
}

/** A bore through a hill: walls, ceiling and its lights; the portal is a face on the hill. */
function addTunnel(chunk: Chunk): void {
  const bore = group(chunk.group), portal = group(chunk.group);
  bore.visible = portal.visible = false;
  const wallX = [LEFT - 1.3, RIGHT + 1.3];
  for (const x of wallX) mesh(BOX_L, M.tunnelWall, x, TUNNEL_HEIGHT / 2, -CH / 2, 0.6, TUNNEL_HEIGHT, CH, bore);
  mesh(BOX_L, M.tunnelWall, CENTRE, TUNNEL_HEIGHT + 0.2, -CH / 2, RIGHT - LEFT + 3.2, 0.4, CH, bore);
  mesh(BOX_L, M.rock, CENTRE, TUNNEL_HEIGHT + 0.4 + HILL_HEIGHT / 2, -CH / 2, HILL_WIDTH, HILL_HEIGHT, CH, bore);
  for (let z = -TUNNEL_LIGHT_SPACING / 2; z > -CH; z -= TUNNEL_LIGHT_SPACING) {
    for (const x of [1.4, 11.2]) mesh(BOX, M.tunnelLight, x, TUNNEL_HEIGHT - 0.05, z, 0.3, 0.08, 3, bore);
    chunk.lamps.push({ z, hex: TUNNEL_LIGHT, object: bore });
  }

  const [inner, outer] = [wallX[0] - 0.3, wallX[1] + 0.3];
  const sideWidth = (HILL_WIDTH - (outer - inner)) / 2;
  const faceY = (TUNNEL_HEIGHT + 0.4 + HILL_HEIGHT) / 2;
  mesh(BOX, M.concrete, inner - sideWidth / 2, faceY, -1, sideWidth, faceY * 2, 2, portal);
  mesh(BOX, M.concrete, outer + sideWidth / 2, faceY, -1, sideWidth, faceY * 2, 2, portal);
  mesh(BOX, M.concrete, CENTRE, TUNNEL_HEIGHT + (faceY * 2 - TUNNEL_HEIGHT) / 2, -1, outer - inner, faceY * 2 - TUNNEL_HEIGHT, 2, portal);
  chunk.tunnel = { bore, portal };
}

/** A road bridge crossing high over both carriageways. */
function addOverpass(chunk: Chunk): void {
  const o = group(chunk.group);
  chunk.extras.push({ object: o, probability: 0.4 });
  mesh(BOX, M.concrete, CENTRE, 8.4, -20, 120, 1.2, 10, o);
  mesh(BOX, M.concrete, CENTRE, 9.4, -15.2, 120, 0.9, 0.25, o);
  mesh(BOX, M.under, CENTRE, 7.75, -17, 120, 0.06, 0.25, o);
  for (const x of [LEFT - 4, MEDIAN, RIGHT + 4]) mesh(BOX, M.concrete, x, 3.9, -20, 1.6, 7.8, 2.4, o);
}

/** An overhead sign gantry over our carriageway. */
function addGantry(chunk: Chunk): void {
  const o = group(chunk.group);
  chunk.extras.push({ object: o, probability: 0.5 });
  for (const x of [-3.4, 5.9]) mesh(BOX, M.metal, x, 3.6, -30, 0.3, 7.2, 0.3, o);
  mesh(BOX, M.metal, 1.25, 7, -30, 9.6, 0.35, 0.35, o);
  for (const x of [-0.4, 3.2]) chunk.labels.push(mesh(PLANE, pick(SIGN_MATERIALS), x, 6.1, -29.8, 3.4, 1.7, 1, o));
}

/** Either side of the road beyond the guardrails, by distance out: negative is our side. */
const sideX = (side: number, out: number): number => (side < 0 ? LEFT - out : RIGHT + out);

/** Paved shoulders `width` wide outside both carriageways, with guardrails along their outer edge or marker posts. */
function addEdges(o: THREE.Object3D, width: number, guardrails: boolean): void {
  for (const side of [-1, 1]) {
    if (width > 0.5) addShoulder(o, sideX(side, 0), sideX(side, width));
    if (guardrails) addGuardrail(o, sideX(side, width));
    else for (const z of [-5, -25]) mesh(BOX, M.paint, sideX(side, width + 0.3), 0.5, z, 0.12, 1, 0.12, o);
  }
}

/** Sheds and warehouses with lit windows, and a chimney now and then. */
function industrial(chunk: Chunk, o: THREE.Object3D): void {
  addEdges(o, 0.45, true);
  for (const side of [-1, 1]) {
    if (Math.random() < 0.3) continue;
    const w = rand(20, 50), h = rand(6, 14), d = rand(15, 30);
    const shed = mesh(buildingGeometry(w, h, d), WINDOW_MATERIALS[0], sideX(side, rand(25, 60) + w / 2), h / 2, -20, 1, 1, 1, o);
    chunk.openAir.push(shed);
  }
  if (Math.random() < 0.3) {
    const x = sideX(pick([-1, 1]), rand(40, 70));
    mesh(BOX, M.concrete, x, 15, -rand(5, 35), 2.4, 30, 2.4, o);
    mesh(BOX, M.reflector, x, 30.4, -20, 0.5, 0.5, 0.5, o);
  }
}

/** Dark pines crowding both sides. */
function forest(o: THREE.Object3D): void {
  addEdges(o, 0.45, true);
  const pines = new Instances(TREE_CONE, M.tree, 26, o);
  for (let k = 0; k < 26; k++) {
    const size = rand(1.2, 2.6);
    // Set out by the cone's own radius, so no branch hangs over the guardrail.
    pines.add(sideX(k % 2 ? 1 : -1, rand(3, 40) + 1.7 * size), 2.5 * size - 0.2, -rand(0, CH), size, size, size, rand(0, Math.PI));
  }
}

/** Sand to the horizon, flat-topped mesas far off, scrub and a line of telephone poles. */
function desert(o: THREE.Object3D): void {
  addEdges(o, 3.2, false);
  for (const side of [-1, 1]) mesh(PLANE_L, M.sand, sideX(side, 60), -0.1, -CH / 2, 116, CH, 1, o).rotation.x = -Math.PI / 2;
  if (Math.random() < 0.5) {
    const side = pick([-1, 1]), h = rand(14, 30);
    mesh(BOX, M.cliff, sideX(side, rand(90, 160)), h / 2 - 0.2, -rand(0, CH), rand(30, 70), h, rand(20, 36), o).rotation.y = rand(0, 1);
  }
  const scrub = new Instances(TREE_CONE, M.tree, 10, o);
  for (let k = 0; k < 10; k++) {
    const size = rand(0.15, 0.35);
    scrub.add(sideX(k % 2 ? 1 : -1, rand(5, 50)), 0.3, -rand(0, CH), size * 2, size, size * 2);
  }
  for (const z of [-10, -30]) {
    mesh(BOX, M.trunk, sideX(-1, 6), 4, z, 0.25, 8, 0.25, o);
    mesh(BOX, M.trunk, sideX(-1, 6), 7.4, z, 1.8, 0.15, 0.15, o);
  }
}

/** A causeway: water out to the horizon on both sides. */
function causeway(o: THREE.Object3D): void {
  addEdges(o, 1.6, true);
  addWater(o, LEFT - 2.2, LEFT - 400, -0.12);
  addWater(o, RIGHT + 2.2, RIGHT + 400, -0.12);
}

/** A dual carriageway with a median barrier, gantries, overpasses and the odd tunnel, through industry, forest, desert or across water. */
function buildChunk(chunk: Chunk, i: number): void {
  const g = chunk.group;
  addRoadBase(chunk, LEFT, RIGHT, [-2.05, 4.85, 7.75, 14.85], [1.4, 11.2]);
  mesh(BOX_L, M.concrete, MEDIAN, 0.45, -CH / 2, 0.5, 0.9, CH, g);
  chunk.openAir.push(addLamp(chunk, MEDIAN, -20, -3.2, 11, LAMP_SODIUM), addLamp(chunk, MEDIAN, -20, 3.2, 11, LAMP_SODIUM));
  if (i % 4 === 1) addGantry(chunk);
  if (i % 5 === 3) addOverpass(chunk);
  industrial(chunk, addVariant(chunk));
  forest(addVariant(chunk));
  desert(addVariant(chunk));
  causeway(addVariant(chunk));
  addTunnel(chunk);
}

export const highway: RouteDefinition = {
  name: 'Highway',
  lampTint: 'sodium',
  speed: 28,
  maxBend: 0.00012,
  traffic: { ahead: [-0.4, 3.2], oncoming: [9.4, 13], aheadCount: 6, oncomingCount: 6 },
  scenery: { skyline: 'low', groundY: -0.2, ground: 'dark', sea: false },
  mirrorLamps: { spacing: 40, colors: [LAMP_SODIUM, LAMP_SODIUM] },
  buildChunk
};
