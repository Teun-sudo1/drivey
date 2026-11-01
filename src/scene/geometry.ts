import * as THREE from 'three';

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const PLANE = new THREE.PlaneGeometry(1, 1);
/** Long road strips, subdivided so they curve smoothly. */
export const PLANE_L = new THREE.PlaneGeometry(1, 1, 1, 10);
/** Long barriers and rails. */
export const BOX_L = new THREE.BoxGeometry(1, 1, 1, 1, 1, 10);

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  parent?: THREE.Object3D
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent?.add(m);
  return m;
}

/** A box whose side UVs tile the window texture at a constant scale; top and bottom sample an unlit texel. */
export function buildingGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (f === 2 || f === 3) {
        uv.setXY(i, 0.5, 0.995);
        continue;
      }
      const fw = f < 2 ? d : w;
      uv.setXY(i, (uv.getX(i) * fw) / 16, (uv.getY(i) * h) / 32);
    }
  }
  return g;
}
