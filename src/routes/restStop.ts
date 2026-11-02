import * as THREE from 'three';
import { BOX, PLANE, mesh } from '../scene/geometry';
import { LAMP_SODIUM, MATERIALS, NEON_CYAN, NEON_PINK, REST_SIGN_MATERIAL } from '../scene/materials';
import { Instances, buildLamp } from './parts';

const M = MATERIALS;
/** Where the car comes to rest along the chunk: well onto the apron, with the kiosk ahead in view. */
export const REST_BAY_Z = -16;

export interface RestStop {
  group: THREE.Group;
  /** Text that must not read backwards when the road is mirrored. */
  labels: THREE.Mesh[];
}

/**
 * A lit lay-by on our side of the road for long breaks: parking on a raised
 * apron, two lamps, a kiosk with its window lit and a pair of vending machines.
 */
export function createRestStop(): RestStop {
  const group = new THREE.Group();
  // The apron sits on a slab, so it works on an elevated road or over a beach as well.
  mesh(BOX, M.dark, -13.2, -0.62, -20, 22, 1.2, 38, group);
  mesh(PLANE, M.road, -13.2, 0.004, -20, 22, 38, 1, group).rotation.x = -Math.PI / 2;
  for (let z = -22; z >= -37; z -= 3) mesh(PLANE, M.line, -7.5, 0.02, z, 4, 0.12, 1, group).rotation.x = -Math.PI / 2;
  buildLamp(group, -16, -8, 5, 7, LAMP_SODIUM);
  buildLamp(group, -16, -36, 5, 7, LAMP_SODIUM);
  mesh(BOX, M.house, -15, 1.6, -30, 4, 3.2, 7, group);
  mesh(BOX, M.paint, -15, 3.3, -30, 4.6, 0.25, 7.6, group);
  mesh(PLANE, M.warmWindow, -12.98, 1.7, -30, 4, 1.2, 1, group).rotation.y = Math.PI / 2;
  const machines = new Instances(BOX, M.neon, 2, group);
  machines.add(-12.6, 0.9, -34.8, 0.7, 1.8, 0.9, 0, NEON_CYAN.clone().multiplyScalar(0.6));
  machines.add(-12.6, 0.9, -35.9, 0.7, 1.8, 0.9, 0, NEON_PINK.clone().multiplyScalar(0.6));
  mesh(BOX, M.metal, -3.4, 1.6, -1, 0.12, 3.2, 0.12, group);
  const sign = mesh(PLANE, REST_SIGN_MATERIAL, -3.4, 3.4, -0.95, 2.6, 1.3, 1, group);
  return { group, labels: [sign] };
}
