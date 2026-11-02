import * as THREE from 'three';
import { pick, rand } from '../lib/math';
import { BOX, BOX_L, PLANE, buildingGeometry, mesh } from '../scene/geometry';
import { LAMP_SODIUM, MATERIALS, SIGN_MATERIALS, WINDOW_MATERIALS } from '../scene/materials';
import { CHUNK_LENGTH, addGuardrail, addLamp, addRoadBase } from './parts';
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

/** An open dual carriageway with a median barrier, gantries, overpasses and the odd tunnel. */
function buildChunk(chunk: Chunk, i: number): void {
  const g = chunk.group;
  addRoadBase(chunk, LEFT, RIGHT, [-2.05, 4.85, 7.75, 14.85], [1.4, 11.2]);
  mesh(BOX_L, M.concrete, MEDIAN, 0.45, -CH / 2, 0.5, 0.9, CH, g);
  addGuardrail(chunk, LEFT - 0.45);
  addGuardrail(chunk, RIGHT + 0.4);
  chunk.openAir.push(addLamp(chunk, MEDIAN, -20, -3.2, 11, LAMP_SODIUM), addLamp(chunk, MEDIAN, -20, 3.2, 11, LAMP_SODIUM));
  if (i % 4 === 1) addGantry(chunk);
  if (i % 5 === 3) addOverpass(chunk);
  if (i % 2) {
    const w = rand(20, 50), h = rand(6, 14), d = rand(15, 30);
    const shed = mesh(buildingGeometry(w, h, d), WINDOW_MATERIALS[0], (Math.random() < 0.5 ? -1 : 1) * rand(45, 90) + CENTRE, h / 2, -20, 1, 1, 1, g);
    chunk.openAir.push(shed);
  }
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
