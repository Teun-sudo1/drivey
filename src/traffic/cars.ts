import * as THREE from 'three';
import { pick } from '../lib/math';
import { BOX, mesh } from '../scene/geometry';
import { MATERIALS } from '../scene/materials';
import { GLOW } from '../scene/textures';

const BODY_COLORS = [0x1d2330, 0x5a1515, 0xcfd2d6, 0x2a2a2a, 0x1f3a4f, 0x6b6f75, 0x0f0f12, 0xe0dccf];
const BODIES = BODY_COLORS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.5 }));
const GLASS = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.2, metalness: 0.8 });
const TYRE = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
const TAIL = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(2.5) });
const FRONT = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4e0).multiplyScalar(3) });

/** The glows around car lights, faded by the time of day. */
export const CAR_GLOWS = {
  tail: new THREE.SpriteMaterial({ map: GLOW, color: 0xff3020, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  head: new THREE.SpriteMaterial({ map: GLOW, color: 0xfff2dc, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
};

export const CAR_LENGTH = 4.3;
export const TRUCK_LENGTH = 9.5;

/** A low-poly car or truck facing -z, its front at -z and tail lights at +z. */
export function makeVehicle(truck: boolean): THREE.Group {
  const g = new THREE.Group(), body = pick(BODIES);
  if (truck) {
    mesh(BOX, MATERIALS.house, 0, 1.9, 0.8, 2.4, 3, 7.5, g);
    mesh(BOX, body, 0, 1.4, -3.8, 2.3, 2.2, 1.9, g);
  } else {
    mesh(BOX, body, 0, 0.6, 0, 1.76, 0.62, CAR_LENGTH, g);
    mesh(BOX, GLASS, 0, 1.12, 0.25, 1.55, 0.5, 2.1, g);
  }
  const rear = truck ? 4.56 : 2.16, front = truck ? -4.76 : -2.16, y = truck ? 0.8 : 0.72;
  for (const x of [-0.68, 0.68]) {
    for (const z of [rear - 0.9, front + 0.9]) mesh(BOX, TYRE, x * 1.15, 0.3, z, 0.24, 0.6, 0.6, g);
    mesh(BOX, TAIL, x, y, rear, 0.32, 0.12, 0.04, g);
    mesh(BOX, FRONT, x, y - 0.05, front, 0.3, 0.1, 0.04, g);
    const tail = new THREE.Sprite(CAR_GLOWS.tail);
    tail.position.set(x, y, rear + 0.1);
    tail.scale.set(1.4, 1.4, 1);
    const head = new THREE.Sprite(CAR_GLOWS.head);
    head.position.set(x, y - 0.05, front - 0.1);
    head.scale.set(3.5, 3.5, 1);
    g.add(tail, head);
  }
  return g;
}
