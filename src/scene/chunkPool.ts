import * as THREE from 'three';
import { pick } from '../lib/math';
import { CHUNK_LENGTH } from '../routes/parts';
import type { Chunk, RouteDefinition } from '../routes/types';
import { bendTree } from './bend';
import { WINDOW_MATERIALS } from './materials';

const CHUNK_COUNT = 14;

export interface NearestLamp {
  /** 0 to 1, peaking as the lamp passes overhead. */
  strength: number;
  hex: number;
}

/** A fixed set of chunks that leapfrog from behind the car to the far end of the road. */
export class ChunkPool {
  private readonly chunks: Chunk[] = [];

  constructor(scene: THREE.Scene, route: RouteDefinition) {
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk: Chunk = { group: new THREE.Group(), lamps: [], extras: [], buildings: [], labels: [] };
      route.buildChunk(chunk, i);
      chunk.group.position.z = CHUNK_LENGTH - i * CHUNK_LENGTH;
      bendTree(chunk.group);
      this.refresh(chunk);
      scene.add(chunk.group);
      this.chunks.push(chunk);
    }
  }

  /** 1 keeps the road as built, with traffic on the left; -1 mirrors it for driving on the right. */
  setSide(side: number): void {
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
        this.refresh(chunk);
      }
    }
  }

  nearestLamp(): NearestLamp {
    const nearest: NearestLamp = { strength: 0, hex: 0xffffff };
    for (const chunk of this.chunks) {
      for (const lamp of chunk.lamps) {
        const z = chunk.group.position.z + lamp.z;
        const strength = Math.exp(-(((z + 1.5) / 5) ** 2));
        if (strength > nearest.strength) {
          nearest.strength = strength;
          nearest.hex = lamp.hex;
        }
      }
    }
    return nearest;
  }

  private refresh(chunk: Chunk): void {
    for (const extra of chunk.extras) extra.object.visible = Math.random() < extra.probability;
    for (const building of chunk.buildings) {
      building.material = pick(WINDOW_MATERIALS);
      building.visible = Math.random() < 0.9;
    }
  }
}
