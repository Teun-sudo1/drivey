import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const PLANE = new THREE.PlaneGeometry(1, 1);
/** Long road strips, subdivided so they curve smoothly. */
export const PLANE_L = new THREE.PlaneGeometry(1, 1, 1, 10);
/** Long barriers and rails. */
export const BOX_L = new THREE.BoxGeometry(1, 1, 1, 1, 1, 10);
export const TREE_CONE = new THREE.ConeGeometry(1.7, 5, 7);
/** A four-sided cone, turned to make a hipped roof. */
export const ROOF_CONE = new THREE.ConeGeometry(5.7, 3, 4);

const SHARED = new Set<THREE.BufferGeometry>([BOX, PLANE, PLANE_L, BOX_L, TREE_CONE, ROOF_CONE]);

/** Frees the GPU buffers of everything under root, except the shared geometries above. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse(o => {
    if (o instanceof THREE.InstancedMesh) o.dispose();
    if (o instanceof THREE.Mesh && !SHARED.has(o.geometry)) o.geometry.dispose();
  });
}

/**
 * Merges the plain meshes directly under each group of root that share a
 * material into one, so a chunk of road or a car costs a handful of draw calls
 * rather than dozens. Groups stay as they are, so anything shown or hidden as
 * a group still is; meshes in `keep` (ones that change on their own) are left alone.
 */
export function mergeStatic(root: THREE.Object3D, keep: ReadonlySet<THREE.Object3D> = new Set()): void {
  const groups: THREE.Object3D[] = [];
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) groups.push(o);
  });
  for (const group of groups) {
    const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || keep.has(child) || Array.isArray(child.material)) continue;
      const list = byMaterial.get(child.material) ?? [];
      list.push(child);
      byMaterial.set(child.material, list);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(m => {
        m.updateMatrix();
        // All shared geometries are indexed, so the merged parts line up.
        return m.geometry.clone().applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      if (!merged) continue;
      for (const m of meshes) group.remove(m);
      group.add(new THREE.Mesh(merged, material));
    }
  }
}

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
