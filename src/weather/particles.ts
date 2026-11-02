import * as THREE from 'three';
import { MAX_PARTICLES } from '../app/quality';
import { rand } from '../lib/math';
import { hideFromReflection } from '../scene/roadSurface';
import { GLOW } from '../scene/textures';

const REDUCED_MOTION_RATE = 0.5;
const STREAK_LENGTH = 0.045;
const SPAWN_X = 14;

export interface ParticleFrame {
  dt: number;
  speed: number;
  clock: number;
  /** 0 to 1 blended amounts from the environment. */
  rain: number;
  snow: number;
  reducedMotion: boolean;
}

/** Rain streaks and snowflakes in a box ahead of the car, at the speed the car drives through them. */
export class Particles {
  private readonly rainMaterial = new THREE.LineBasicMaterial({ color: 0xa8b8cf, transparent: true, opacity: 0.35, depthWrite: false });
  private readonly rainTips = new Float32Array(MAX_PARTICLES * 3);
  private readonly rainPositions = new Float32Array(MAX_PARTICLES * 6);
  private readonly rainGeometry = new THREE.BufferGeometry();
  private readonly rain: THREE.LineSegments;
  private readonly snowPositions = new Float32Array(MAX_PARTICLES * 3);
  private readonly snowGeometry = new THREE.BufferGeometry();
  private readonly snow: THREE.Points;

  /** Streaks at full downpour, set by the quality level. */
  budget = MAX_PARTICLES;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.rainTips.set([rand(-SPAWN_X, SPAWN_X), rand(0, 14), rand(-45, -3)], i * 3);
      this.snowPositions.set([rand(-SPAWN_X, SPAWN_X), rand(0, 12), rand(-40, -3)], i * 3);
    }
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rain.frustumCulled = false;
    this.snowGeometry.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    this.snow = new THREE.Points(this.snowGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, map: GLOW, transparent: true, depthWrite: false, opacity: 0.9 }));
    this.snow.frustumCulled = false;
    scene.add(this.rain, this.snow);
    hideFromReflection(this.rain);
    hideFromReflection(this.snow);
  }

  /** Streaks read brighter against the dark, and paler by day. */
  applyEnvironment(head: number): void {
    this.rainMaterial.opacity = 0.14 + 0.14 * head;
    this.rainMaterial.color.set(head > 0.5 ? 0x8fa0b8 : 0xc8d2e0);
  }

  update(frame: ParticleFrame): void {
    const dt = frame.reducedMotion ? frame.dt * REDUCED_MOTION_RATE : frame.dt;
    this.updateRain(dt, frame.speed, frame.rain);
    this.updateSnow(dt, frame.speed, frame.clock, frame.snow);
  }

  private updateRain(dt: number, speed: number, amount: number): void {
    const count = Math.floor(this.budget * amount), fall = 10 + 5 * amount;
    const tips = this.rainTips, positions = this.rainPositions;
    this.rain.visible = count > 5;
    if (!this.rain.visible) return;
    for (let i = 0; i < count; i++) {
      let x = tips[i * 3], y = tips[i * 3 + 1], z = tips[i * 3 + 2];
      y -= fall * dt;
      z += speed * dt;
      if (y < 0 || z > -2.5) {
        x = rand(-SPAWN_X, SPAWN_X);
        y = rand(6, 15);
        z = rand(-45, -6);
      }
      tips[i * 3] = x;
      tips[i * 3 + 1] = y;
      tips[i * 3 + 2] = z;
      const j = i * 6;
      positions[j] = x;
      positions[j + 1] = y;
      positions[j + 2] = z;
      positions[j + 3] = x;
      positions[j + 4] = y + fall * STREAK_LENGTH;
      positions[j + 5] = z - speed * STREAK_LENGTH;
    }
    this.rainGeometry.setDrawRange(0, count * 2);
    this.rainGeometry.attributes.position.needsUpdate = true;
  }

  private updateSnow(dt: number, speed: number, clock: number, amount: number): void {
    const count = Math.floor(this.budget * 0.7 * amount), p = this.snowPositions;
    this.snow.visible = count > 5;
    if (!this.snow.visible) return;
    for (let i = 0; i < count; i++) {
      let y = p[i * 3 + 1] - 1.4 * dt, z = p[i * 3 + 2] + speed * dt;
      p[i * 3] += Math.sin(clock * 1.3 + i) * 0.4 * dt;
      if (y < 0 || z > -2.5) {
        p[i * 3] = rand(-SPAWN_X, SPAWN_X);
        y = rand(4, 12);
        z = rand(-40, -5);
      }
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    this.snowGeometry.setDrawRange(0, count);
    this.snowGeometry.attributes.position.needsUpdate = true;
  }
}
