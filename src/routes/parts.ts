import * as THREE from 'three';
import { BOX, PLANE, PLANE_L, mesh } from '../scene/geometry';
import { MATERIALS, lampMaterials } from '../scene/materials';
import type { Chunk } from './types';

export const CHUNK_LENGTH = 40;

export function addLamp(chunk: Chunk, x: number, z: number, arm: number, h: number, hex: number): void {
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
  mesh(PLANE, m.pool, arm, 0.05, 0, 12, 12, 1, g).rotation.x = -Math.PI / 2;
  mesh(PLANE, m.streak, arm, 0.07, 10, 1.8, 22, 1, g).rotation.x = -Math.PI / 2;
  chunk.lamps.push({ z, hex });
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
