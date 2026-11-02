import type * as THREE from 'three';

export interface LampSpot {
  z: number;
  hex: number;
  /** The lamp only lights the car while this is shown. */
  object: THREE.Object3D;
}

/** Optional set dressing, re-rolled each time its chunk is recycled. */
export interface ChunkExtra {
  object: THREE.Object3D;
  probability: number;
}

/** A stretch of tunnel; consecutive tunnel chunks join into one bore. */
export interface ChunkTunnel {
  bore: THREE.Object3D;
  /** The entrance, shown only on the first chunk of a run. */
  portal: THREE.Object3D;
}

export interface Chunk {
  group: THREE.Group;
  lamps: LampSpot[];
  extras: ChunkExtra[];
  buildings: THREE.Mesh[];
  /** Anything with text, which must not read backwards when the road is mirrored. */
  labels: THREE.Mesh[];
  /** Scenery that would poke through a tunnel, hidden while the chunk is one. */
  openAir: THREE.Object3D[];
  /** Alternative scenery for the same road; one shows at a time, for stretches of several chunks. */
  variants: THREE.Object3D[];
  tunnel?: ChunkTunnel;
}

export type LampTint = 'teal' | 'sodium';
export type SkylineKind = 'city' | 'low' | 'hills';

export interface TrafficPlan {
  /** Lane centres for traffic going our way; the first is our own lane. */
  ahead: readonly number[];
  /** Lane centres for oncoming traffic, empty on a divided road. */
  oncoming: readonly number[];
  aheadCount: number;
  oncomingCount: number;
}

export interface RouteScenery {
  skyline: SkylineKind;
  groundY: number;
  ground: 'dark' | 'grass';
  /** A sea on our side of the road, with the lights of a far shore. */
  sea: boolean;
}

export interface MirrorLamps {
  /** Metres between lamps seen in the mirror; Infinity for none. */
  spacing: number;
  colors: readonly [number, number];
}

export interface RouteDefinition {
  name: string;
  /** The lamp colour windshield drops pick up on this route. */
  lampTint: LampTint;
  /** Cruising speed in m/s. */
  speed: number;
  /** Largest bend coefficient the road may curve to. */
  maxBend: number;
  traffic: TrafficPlan;
  scenery: RouteScenery;
  mirrorLamps: MirrorLamps;
  /** Fills a new chunk; `index` varies the layout along the pool. */
  buildChunk(chunk: Chunk, index: number): void;
}

/** Every lane, where tyres clear tracks in snow. */
export function laneCentres(route: RouteDefinition): number[] {
  return [...route.traffic.ahead, ...route.traffic.oncoming];
}
