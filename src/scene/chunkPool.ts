import * as THREE from 'three';
import { pick, rand } from '../lib/math';
import { CHUNK_LENGTH } from '../routes/parts';
import type { Chunk, RouteDefinition } from '../routes/types';
import { bendTree } from './bend';
import { disposeTree, mergeStatic } from './geometry';
import { WINDOW_MATERIALS } from './materials';

const CHUNK_COUNT = 14;
const TUNNEL_CHANCE = 0.08;
const TUNNEL_CHUNKS = [3, 5] as const;
/** Open road between two tunnels, in chunks. */
const MIN_TUNNEL_GAP = 8;
/** How far in from a portal the tunnel fully shelters the car, in metres. */
const SHELTER_RAMP = 6;

export interface NearestLamp {
  /** 0 to 1, peaking as the lamp passes overhead. */
  strength: number;
  hex: number;
}

/** A covered stretch of road in world z, from its far end to its near end. */
export interface Shelter {
  far: number;
  near: number;
}

/** 0 in the open to 1 well inside one of the tunnels, at world z. */
export function shelterAt(shelters: readonly Shelter[], z: number): number {
  let amount = 0;
  for (const s of shelters) {
    amount = Math.max(amount, Math.min(THREE.MathUtils.clamp((s.near - z) / SHELTER_RAMP, 0, 1), THREE.MathUtils.clamp((z - s.far) / SHELTER_RAMP, 0, 1)));
  }
  return amount;
}

function shown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** A fixed set of chunks that leapfrog from behind the car to the far end of the road. */
export class ChunkPool {
  private chunks: Chunk[] = [];
  private side = 1;
  private tunnelLeft = 0;
  private sinceTunnel = 0;

  constructor(private readonly scene: THREE.Scene, route: RouteDefinition) {
    this.setRoute(route);
  }

  /** Replaces the whole road with a new route's, keeping the chunks where they were. */
  setRoute(route: RouteDefinition): void {
    for (const chunk of this.chunks) {
      this.scene.remove(chunk.group);
      disposeTree(chunk.group);
    }
    this.chunks = [];
    this.tunnelLeft = 0;
    // The road the car starts on is open, so a tunnel can only appear far ahead.
    this.sinceTunnel = 0;
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk: Chunk = { group: new THREE.Group(), lamps: [], extras: [], buildings: [], labels: [], openAir: [] };
      route.buildChunk(chunk, i);
      // Buildings get new materials, signs flip with the driving side and some scenery hides in tunnels.
      mergeStatic(chunk.group, new Set([...chunk.buildings, ...chunk.labels, ...chunk.openAir]));
      chunk.group.position.z = CHUNK_LENGTH - i * CHUNK_LENGTH;
      bendTree(chunk.group);
      this.refresh(chunk, false);
      this.scene.add(chunk.group);
      this.chunks.push(chunk);
    }
    this.setSide(this.side);
  }

  /** 1 keeps the road as built, with traffic on the left; -1 mirrors it for driving on the right. */
  setSide(side: number): void {
    this.side = side;
    for (const chunk of this.chunks) {
      chunk.group.scale.x = side;
      for (const label of chunk.labels) label.scale.x = Math.abs(label.scale.x) * side;
    }
  }

  advance(distance: number): void {
    for (const chunk of this.chunks) {
      chunk.group.position.z += distance;
      if (chunk.group.position.z > CHUNK_LENGTH + 5) {
        chunk.group.position.z -= CHUNK_COUNT * CHUNK_LENGTH;
        this.refresh(chunk, true);
      }
    }
  }

  nearestLamp(): NearestLamp {
    const nearest: NearestLamp = { strength: 0, hex: 0xffffff };
    for (const chunk of this.chunks) {
      for (const lamp of chunk.lamps) {
        const z = chunk.group.position.z + lamp.z;
        const strength = Math.exp(-(((z + 1.5) / 5) ** 2));
        if (strength > nearest.strength && shown(lamp.object)) {
          nearest.strength = strength;
          nearest.hex = lamp.hex;
        }
      }
    }
    return nearest;
  }

  /** Every tunnel on the road, nearest first. */
  shelters(): Shelter[] {
    const covered = this.chunks.filter(c => c.tunnel?.bore.visible).map(c => c.group.position.z).sort((a, b) => b - a);
    const shelters: Shelter[] = [];
    for (const near of covered) {
      const last = shelters.at(-1);
      if (last && Math.abs(last.far - near) < 1) last.far = near - CHUNK_LENGTH;
      else shelters.push({ near, far: near - CHUNK_LENGTH });
    }
    return shelters;
  }

  /** Whether the chunk going to the far end is open road, the start of a tunnel, or more of one. */
  private nextStretch(): 'open' | 'entrance' | 'bore' {
    if (this.tunnelLeft > 0) {
      this.tunnelLeft--;
      return 'bore';
    }
    this.sinceTunnel++;
    if (this.sinceTunnel <= MIN_TUNNEL_GAP || Math.random() >= TUNNEL_CHANCE) return 'open';
    this.sinceTunnel = 0;
    this.tunnelLeft = Math.round(rand(...TUNNEL_CHUNKS)) - 1;
    return 'entrance';
  }

  private refresh(chunk: Chunk, recycled: boolean): void {
    const stretch = recycled && chunk.tunnel ? this.nextStretch() : 'open';
    const tunnel = stretch !== 'open';
    if (chunk.tunnel) {
      chunk.tunnel.bore.visible = tunnel;
      chunk.tunnel.portal.visible = stretch === 'entrance';
    }
    for (const extra of chunk.extras) extra.object.visible = !tunnel && Math.random() < extra.probability;
    for (const object of chunk.openAir) object.visible = !tunnel;
    for (const building of chunk.buildings) {
      building.material = pick(WINDOW_MATERIALS);
      building.visible = Math.random() < 0.9;
    }
  }
}
