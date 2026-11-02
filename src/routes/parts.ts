import * as THREE from 'three';
import { BOX, BOX_L, PLANE, PLANE_L, mesh } from '../scene/geometry';
import { MATERIALS, lampMaterials } from '../scene/materials';
import type { Chunk } from './types';

export const CHUNK_LENGTH = 40;

export function addLamp(chunk: Chunk, x: number, z: number, arm: number, h: number, hex: number): THREE.Group {
  const m = lampMaterials(hex);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  chunk.group.add(g);
  mesh(BOX, MATERIALS.metal, 0, h / 2, 0, 0.16, h, 0.16, g);
  mesh(BOX, MATERIALS.metal, arm / 2, h, 0, Math.abs(arm) + 0.1, 0.12, 0.12, g);
  mesh(BOX, m.head, arm, h - 0.1, 0, 0.9, 0.1, 0.32, g);
  const glow = new THREE.Sprite(m.glow);
  glow.position.set(arm, h - 0.25, 0);
  glow.scale.set(4.5, 4.5, 1);
  g.add(glow);
  // Narrow enough to fade out before the barriers, which would otherwise cut it with a hard edge.
  mesh(PLANE, m.pool, arm, 0.05, 0, 7, 14, 1, g).rotation.x = -Math.PI / 2;
  chunk.lamps.push({ z, hex, object: g });
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
export function addGuardrail(chunk: Chunk, x: number): void {
  mesh(BOX_L, MATERIALS.metal, x, 0.65, -CHUNK_LENGTH / 2, 0.08, 0.32, CHUNK_LENGTH, chunk.group);
  const posts = new THREE.InstancedMesh(BOX, MATERIALS.metal, CHUNK_LENGTH / 4);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.1, 0.7, 0.1), p = new THREE.Vector3();
  for (let k = 0; k < posts.count; k++) posts.setMatrixAt(k, m.compose(p.set(x - 0.02, 0.35, -k * 4), q, s));
  chunk.group.add(posts);
}

/** A grass strip beside the road, just under its surface. */
export function addVerge(chunk: Chunk, x: number, width: number): void {
  mesh(PLANE_L, MATERIALS.grass, x, -0.01, -CHUNK_LENGTH / 2, width, CHUNK_LENGTH, 1, chunk.group).rotation.x = -Math.PI / 2;
}
