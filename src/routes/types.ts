import type * as THREE from 'three';

export interface LampSpot {
  z: number;
  hex: number;
}

/** Optional set dressing, re-rolled each time its chunk is recycled. */
export interface ChunkExtra {
  object: THREE.Object3D;
  probability: number;
}

export interface Chunk {
  group: THREE.Group;
  lamps: LampSpot[];
  extras: ChunkExtra[];
  buildings: THREE.Mesh[];
}

export type LampTint = 'teal' | 'sodium';

export interface RouteDefinition {
  name: string;
  /** The lamp colour windshield drops pick up on this route. */
  lampTint: LampTint;
  /** Cruising speed in m/s. */
  speed: number;
  /** Largest bend coefficient the road may curve to. */
  maxBend: number;
  groundY: number;
  /** Fills a new chunk; `index` varies the layout along the pool. */
  buildChunk(chunk: Chunk, index: number): void;
}
