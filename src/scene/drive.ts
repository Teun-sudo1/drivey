import { damp, lerp, rand } from '../lib/math';
import type { RouteDefinition } from '../routes/types';
import type { Backdrop } from './backdrop';
import { BEND } from './bend';
import type { ChunkPool } from './chunkPool';
import type { Cockpit } from './cockpit/cockpit';
import type { Stage } from './stage';

const BREAK_SPEED_FACTOR = 0.55;
const REDUCED_MOTION_SWAY = 0.2;

/** Moves the world past the car, and sways the camera and wheel to match. */
export class Drive {
  speed: number;
  bend = 0;
  clock = 0;

  private bendTarget = 0;
  private bendTimer = 0;

  constructor(
    private readonly stage: Stage,
    private readonly pool: ChunkPool,
    private readonly backdrop: Backdrop,
    private readonly cockpit: Cockpit,
    private readonly route: RouteDefinition
  ) {
    this.speed = route.speed;
  }

  update(dt: number, slowed: boolean, reducedMotion: boolean, lampLevel: number): void {
    this.clock += dt;
    const target = slowed ? this.route.speed * BREAK_SPEED_FACTOR : this.route.speed;
    this.speed = lerp(this.speed, target, damp(0.5, dt));

    this.bendTimer -= dt;
    if (this.bendTimer <= 0) {
      this.bendTimer = rand(14, 30);
      this.bendTarget = Math.random() < 0.3 ? 0 : rand(-1, 1) * this.route.maxBend;
    }
    this.bend = lerp(this.bend, this.bendTarget, damp(0.15, dt));
    BEND.value = this.bend;

    this.pool.advance(this.speed * dt);
    this.backdrop.rotate(this.bend * this.speed * dt * 2);

    const lamp = this.pool.nearestLamp();
    this.cockpit.passLight.color.set(lamp.hex);
    this.cockpit.passLight.intensity = lamp.strength * lampLevel * 2.2;

    this.moveCamera(reducedMotion);
  }

  private moveCamera(reducedMotion: boolean): void {
    const { camera, framing, eyeHeight } = this.stage;
    const t = this.clock, sway = reducedMotion ? REDUCED_MOTION_SWAY : 1;
    camera.position.y = eyeHeight + Math.sin(t * 9.3) * 0.0025 * sway * (this.speed / 22) + Math.sin(t * 1.7) * 0.004 * sway;
    camera.position.x = Math.sin(t * 0.43) * 0.02 * sway;
    camera.rotation.set(
      framing.pitch + Math.sin(t * 0.8) * 0.002 * sway,
      -this.bend * 20 + Math.sin(t * 0.31) * 0.006 * sway,
      Math.sin(t * 0.5) * 0.002 * sway
    );
    this.cockpit.roof.position.y = framing.roofY;
    this.cockpit.wheel.rotation.z = this.bend * 900;
  }
}
