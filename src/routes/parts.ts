import * as THREE from 'three';
import { BOX, BOX_L, PLANE, PLANE_L, mesh } from '../scene/geometry';
import { MATERIALS, lampMaterials } from '../scene/materials';
import type { Chunk } from './types';

export const CHUNK_LENGTH = 40;

export function addLamp(chunk: Chunk, x: number, z: number, arm: number, h: number, hex: number): THREE.Group {
  const g = buildLamp(chunk.group, x, z, arm, h, hex);
  chunk.lamps.push({ z, hex, object: g });
  return g;
}

/** A street lamp on a post, its head `arm` metres out to the side, with its glow and the pool it casts. */
export function buildLamp(parent: THREE.Object3D, x: number, z: number, arm: number, h: number, hex: number): THREE.Group {
  const m = lampMaterials(hex);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  mesh(BOX, MATERIALS.metal, 0, h / 2, 0, 0.16, h, 0.16, g);
  mesh(BOX, MATERIALS.metal, arm / 2, h, 0, Math.abs(arm) + 0.1, 0.12, 0.12, g);
  mesh(BOX, m.head, arm, h - 0.1, 0, 0.9, 0.1, 0.32, g);
  const glow = new THREE.Sprite(m.glow);
  glow.position.set(arm, h - 0.25, 0);
  glow.scale.set(4.5, 4.5, 1);
  g.add(glow);
  // Narrow enough to fade out before the barriers, which would otherwise cut it with a hard edge.
  mesh(PLANE, m.pool, arm, 0.05, 0, 7, 14, 1, g).rotation.x = -Math.PI / 2;
  return g;
}

/** Decals sit slightly above the road surface to avoid z-fighting. */
export function addRoadBase(chunk: Chunk, left: number, right: number, edges: number[], dashes: number[]): void {
  const g = chunk.group;
  mesh(PLANE_L, MATERIALS.road, (left + right) / 2, 0, -CHUNK_LENGTH / 2, right - left, CHUNK_LENGTH, 1, g).rotation.x = -Math.PI / 2;
  for (const x of edges) mesh(PLANE_L, MATERIALS.line, x, 0.025, -CHUNK_LENGTH / 2, 0.14, CHUNK_LENGTH, 1, g).rotation.x = -Math.PI / 2;
  for (const x of dashes) {
    for (let k = 0; k < 4; k++) mesh(PLANE, MATERIALS.line, x, 0.025, -5 - k * 10, 0.13, 3.2, 1, g).rotation.x = -Math.PI / 2;
  }
}

/** A steel guardrail on posts every 4 m. */
export function addGuardrail(parent: THREE.Object3D, x: number): void {
  mesh(BOX_L, MATERIALS.metal, x, 0.65, -CHUNK_LENGTH / 2, 0.08, 0.32, CHUNK_LENGTH, parent);
  const posts = new THREE.InstancedMesh(BOX, MATERIALS.metal, CHUNK_LENGTH / 4);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.1, 0.7, 0.1), p = new THREE.Vector3();
  for (let k = 0; k < posts.count; k++) posts.setMatrixAt(k, m.compose(p.set(x - 0.02, 0.35, -k * 4), q, s));
  parent.add(posts);
}

/** A paved strip beside the road from x0 to x1, so the road looks wider there. */
export function addShoulder(parent: THREE.Object3D, x0: number, x1: number): void {
  mesh(PLANE_L, MATERIALS.road, (x0 + x1) / 2, -0.005, -CHUNK_LENGTH / 2, Math.abs(x1 - x0), CHUNK_LENGTH, 1, parent).rotation.x = -Math.PI / 2;
}

/** Up to `max` instances of one shape, placed with `add` calls; any left over aren't drawn. */
export class Instances {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, max: number, parent: THREE.Object3D) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, turn = 0, color?: THREE.Color): void {
    const i = this.mesh.count++;
    this.mesh.setMatrixAt(i, this.m.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e.set(0, turn, 0)), new THREE.Vector3(sx, sy, sz)));
    if (color) this.mesh.setColorAt(i, color);
  }
}

/** One kind of scenery for a chunk; the pool shows one at a time, in stretches. */
export function addVariant(chunk: Chunk): THREE.Group {
  const g = new THREE.Group();
  chunk.group.add(g);
  chunk.variants.push(g);
  return g;
}

/** A flat stretch of water from x0 to x1 (either way round), just under the ground at y. */
export function addWater(parent: THREE.Object3D, x0: number, x1: number, y: number): void {
  mesh(PLANE_L, MATERIALS.water, (x0 + x1) / 2, y, -CHUNK_LENGTH / 2, Math.abs(x1 - x0), CHUNK_LENGTH, 1, parent).rotation.x = -Math.PI / 2;
}

/** A group for what stands on our side of the road, so a rest stop can clear it. */
export function addRoadside(chunk: Chunk): THREE.Group {
  const g = new THREE.Group();
  chunk.group.add(g);
  chunk.roadside.push(g);
  return g;
}
