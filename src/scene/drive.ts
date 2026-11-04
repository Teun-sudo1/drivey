import * as THREE from 'three';
import type { EngineState } from '../app/carEngine';
import { damp, lerp, rand } from '../lib/math';
import type { RouteDefinition } from '../routes/types';
import type { Backdrop } from './backdrop';
import { BEND } from './bend';
import type { ChunkPool } from './chunkPool';
import type { Cockpit } from './cockpit/cockpit';
import type { Stage } from './stage';

const BREAK_SPEED_FACTOR = 0.55;
const REDUCED_MOTION_SWAY = 0.2;
const MIN_CURVING_SPEED = 2;
/** Braking for a rest stop, in m/s², and how far the car pulls over: wholly past the road's edge line. */
const REST_DECEL = 1.2;
const PULL_OVER = 2.8;
/** The car moves over only once it's on the apron, which starts this far before the bay, past the barrier's gap. */
const PULL_OVER_DISTANCE = 12;
/** The whole cabin shakes while the starter turns the engine over. */
const CRANK_SHAKE = 0.004;

/** Moves the world past the car, and sways the camera and wheel to match. */
export class Drive {
  speed = 0;
  bend = 0;
  clock = 0;
  /** Sideways shift of our car from its usual lane, in world metres, while it changes lanes. */
  laneOffset = 0;
  /** How far the car has pulled over towards a rest stop, in metres, before mirroring. */
  pull = 0;

  private bendTarget = 0;
  private bendTimer = 0;

  constructor(
    private readonly stage: Stage,
    private readonly pool: ChunkPool,
    private readonly backdrop: Backdrop,
    private readonly cockpit: Cockpit,
    private route: RouteDefinition
  ) {}

  setRoute(route: RouteDefinition): void {
    this.route = route;
    // Straightens out, then picks curves suited to the new road.
    this.bendTarget = 0;
    this.bendTimer = rand(4, 10);
  }

  /** `restAt` is how far ahead a rest stop's bay is, to stop beside, or null to drive on. */
  update(dt: number, engine: EngineState, slowed: boolean, reducedMotion: boolean, lampLevel: number, restAt: number | null = null): void {
    this.clock += dt;
    let cruising = slowed ? this.route.speed * BREAK_SPEED_FACTOR : this.route.speed;
    // Brakes so as to come to rest at the bay: the speed from which REST_DECEL stops in the distance left.
    if (restAt !== null) cruising = Math.min(cruising, Math.sqrt(2 * REST_DECEL * Math.max(0, restAt)));
    const target = engine === 'running' ? cruising : 0;
    this.speed = restAt !== null && target < this.speed ? target : lerp(this.speed, target, damp(0.5, dt));
    const pullTarget = restAt === null ? 0 : PULL_OVER * THREE.MathUtils.clamp(1 - restAt / PULL_OVER_DISTANCE, 0, 1);
    this.pull = lerp(this.pull, pullTarget, damp(restAt === null ? 0.4 : 2, dt));

    // A parked car stays on a straight piece of road.
    if (this.speed > MIN_CURVING_SPEED) this.bendTimer -= dt;
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

    this.moveCamera(reducedMotion, engine === 'cranking');
  }

  private moveCamera(reducedMotion: boolean, cranking: boolean): void {
    const { camera, framing, eyeHeight } = this.stage;
    const t = this.clock, sway = reducedMotion ? REDUCED_MOTION_SWAY : 1;
    const crank = cranking && !reducedMotion ? CRANK_SHAKE : 0;
    camera.position.y = Math.sin(t * 61) * crank + eyeHeight - framing.eyeDrop + Math.sin(t * 9.3) * 0.0025 * sway * (this.speed / 22) + Math.sin(t * 1.7) * 0.004 * sway;
    camera.position.x = this.laneOffset + Math.sin(t * 0.43) * 0.02 * sway;
    const { look } = this.stage;
    camera.rotation.set(
      framing.pitch - framing.lookDown + look.pitch + Math.sin(t * 0.8) * 0.002 * sway,
      -this.bend * 20 + look.yaw + Math.sin(t * 0.31) * 0.006 * sway,
      Math.sin(t * 0.5) * 0.002 * sway + Math.sin(t * 47) * crank
    );
    this.cockpit.seat(framing.seatBack, framing.lookDown - look.pitch, look.yaw, framing.eyeDrop);
    this.cockpit.roof.position.y = framing.roofY;
    this.cockpit.mirror.place(framing);
    this.cockpit.radio.place(framing);
    this.cockpit.scaleGauges(framing.gaugeScale);
    this.cockpit.steer(this.bend);
  }
}
