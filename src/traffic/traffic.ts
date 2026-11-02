import * as THREE from 'three';
import { damp, lerp, pick, rand } from '../lib/math';
import type { RouteDefinition } from '../routes/types';
import { bendTree } from '../scene/bend';
import { disposeTree, mergeStatic } from '../scene/geometry';
import { CAR_GLOWS, CAR_LENGTH, TRUCK_LENGTH, makeVehicle } from './cars';

const TRUCK_SHARE = 0.15;
const LANE_CHANGE_SECONDS = 3;
const LANE_CHANGE_EVERY = [6, 18] as const;
/** How often our own car moves over on a multi-lane road, and how long it takes. */
const OWN_CHANGE_EVERY = [40, 90] as const;
const OWN_CHANGE_SECONDS = 4;
/** We only move over above this speed, with this much room in the lane, ahead and behind. */
const OWN_CHANGE_SPEED = 8;
const OWN_CHANGE_ROOM_AHEAD = 40, OWN_CHANGE_ROOM_BEHIND = 30;
/** Gap a car keeps to the one in front, bumper to bumper. */
const FOLLOW_GAP = 12;
/** Room a car needs beside it before it moves over. */
const MERGE_CLEARANCE = 14;
/** A car ahead in our lane closer than this pulls away, so we never drive into it. */
const OWN_LANE_BUFFER = 28;
/** Cars only move into our lane well ahead of us. */
const OWN_LANE_MERGE_AHEAD = 40;
/** Where our own bonnet ends, in world z. */
const OUR_FRONT = -2;
const SPEED_EASE = 1.5;

export interface Vehicle {
  readonly group: THREE.Group;
  readonly length: number;
  readonly oncoming: boolean;
  /** World z of the vehicle's centre. */
  z: number;
  speed: number;
  /** The speed it settles at when the road is clear. */
  cruise: number;
  /** The least it may drive at this moment, to stay clear of whoever is behind it. */
  floor: number;
  /** The lane it is in, or moving to. */
  lane: number;
  /** The lane it is leaving; the same as `lane` once settled. */
  fromLane: number;
  /** 0 to 1 through a lane change. */
  shift: number;
  changeTimer: number;
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Our own car's place on the road: which lane, and how far through a change. */
interface OwnLane {
  lane: number;
  fromLane: number;
  shift: number;
  timer: number;
}

/** Cars ahead and oncoming, which follow the road's lanes and keep clear of each other and of us. */
export class Traffic {
  readonly group = new THREE.Group();
  vehicles: Vehicle[] = [];
  private route: RouteDefinition;
  private own: OwnLane = { lane: 0, fromLane: 0, shift: 1, timer: 0 };
  /** Keeps our car in the first lane, moving back to it when there's room, e.g. to pull in at a rest stop. */
  holdFirstLane = false;

  constructor(scene: THREE.Scene, route: RouteDefinition) {
    scene.add(this.group);
    this.route = route;
    this.setRoute(route);
  }

  setRoute(route: RouteDefinition): void {
    this.route = route;
    for (const v of this.vehicles) {
      this.group.remove(v.group);
      // Each car's merged body is its own geometry.
      disposeTree(v.group);
    }
    this.vehicles = [];
    const first = route.traffic.ahead[0];
    this.own = { lane: first, fromLane: first, shift: 1, timer: rand(...OWN_CHANGE_EVERY) };
    const { aheadCount, oncomingCount } = route.traffic;
    for (let i = 0; i < aheadCount; i++) this.add(false, rand(30, 380));
    for (let i = 0; i < oncomingCount; i++) this.add(true, rand(50, 500));
  }

  /** 1 keeps traffic on the left; -1 mirrors it for driving on the right. */
  setSide(side: number): void {
    this.group.scale.x = side;
  }

  /** Lateral position of a vehicle, part way through any lane change. */
  laneX(v: Pick<Vehicle, 'lane' | 'fromLane' | 'shift'>): number {
    return lerp(v.fromLane, v.lane, smoothstep(v.shift));
  }

  /** How far our car sits from the first lane, sideways, before mirroring. */
  get ownOffset(): number {
    return this.laneX(this.own) - this.route.traffic.ahead[0];
  }

  /** The lanes our car is in: one, or two while moving over. */
  private ownLanes(): number[] {
    return this.own.shift < 1 ? [this.own.fromLane, this.own.lane] : [this.own.lane];
  }

  update(dt: number, ourSpeed: number, headlights: number): void {
    CAR_GLOWS.tail.opacity = 0.35 + 0.65 * headlights;
    CAR_GLOWS.head.opacity = 0.25 + 0.75 * headlights;
    this.steerOwn(dt, ourSpeed);
    const ownLanes = this.ownLanes();
    this.pushAhead(ourSpeed, ownLanes);
    for (const v of this.vehicles) {
      const leader = this.leader(v);
      let desired = v.cruise;
      if (leader) {
        const gap = Math.abs(leader.z - v.z) - (leader.length + v.length) / 2;
        if (gap < FOLLOW_GAP) {
          desired = Math.min(desired, leader.speed * (gap < FOLLOW_GAP / 2 ? 0.9 : 1));
          v.changeTimer = Math.min(v.changeTimer, 0);
        }
      }
      // Anyone behind us in our lane, after we've moved over in front of them, drops back.
      if (!v.oncoming && v.z > OUR_FRONT && ownLanes.some(l => this.occupies(v, l))) desired = Math.min(desired, ourSpeed * 0.95);
      v.speed = lerp(v.speed, Math.max(desired, v.floor), damp(SPEED_EASE, dt));
      v.z += (v.oncoming ? ourSpeed + v.speed : ourSpeed - v.speed) * dt;
      this.steer(v, dt, ownLanes);
      this.recycle(v, ourSpeed);
      this.place(v);
    }
  }

  /**
   * We never brake, so a car we catch up with in our lane pulls away, and so
   * does any car it would then run into, all the way up the queue.
   */
  private pushAhead(ourSpeed: number, ownLanes: readonly number[]): void {
    for (const v of this.vehicles) v.floor = 0;
    for (const lane of this.route.traffic.ahead) {
      const queue = this.vehicles.filter(v => !v.oncoming && this.occupies(v, lane) && v.z < OUR_FRONT + v.length / 2).sort((a, b) => b.z - a.z);
      let front = OUR_FRONT, push = ownLanes.includes(lane) ? ourSpeed * 1.04 : 0, reach = OWN_LANE_BUFFER;
      for (const v of queue) {
        if (push === 0 || front - (v.z + v.length / 2) > reach) break;
        v.floor = Math.max(v.floor, push);
        front = v.z - v.length / 2;
        push = Math.max(push, v.speed);
        reach = FOLLOW_GAP;
      }
    }
  }

  private add(oncoming: boolean, distance: number): void {
    const truck = Math.random() < TRUCK_SHARE;
    const group = makeVehicle(truck);
    mergeStatic(group);
    bendTree(group);
    this.group.add(group);
    const v: Vehicle = { group, length: truck ? TRUCK_LENGTH : CAR_LENGTH, oncoming, z: 0, speed: 0, cruise: 0, floor: 0, lane: 0, fromLane: 0, shift: 1, changeTimer: 0 };
    this.vehicles.push(v);
    this.spawn(v, -distance);
    v.speed = v.cruise;
    this.place(v);
  }

  /** Puts a vehicle in a random lane near z, nudged further away until there's room for it. */
  private spawn(v: Vehicle, z: number, lanes = v.oncoming ? this.route.traffic.oncoming : this.route.traffic.ahead): void {
    v.lane = v.fromLane = pick(lanes);
    v.shift = 1;
    v.z = z;
    while (this.vehicles.some(o => o !== v && this.occupies(o, v.lane) && Math.abs(o.z - v.z) < MERGE_CLEARANCE + (o.length + v.length) / 2)) {
      v.z += z > 0 ? MERGE_CLEARANCE : -MERGE_CLEARANCE;
    }
    v.cruise = this.route.speed * (v.oncoming ? rand(0.85, 1.1) : rand(0.9, 0.98));
    v.changeTimer = rand(...LANE_CHANGE_EVERY);
  }

  private recycle(v: Vehicle, ourSpeed: number): void {
    const { ahead } = this.route.traffic;
    if (v.oncoming) {
      if (v.z > 25) {
        this.spawn(v, -rand(380, 520));
        v.speed = v.cruise;
      }
      return;
    }
    if (v.z < -470) {
      // On a multi-lane road it comes back as a faster car overtaking us, in a lane we aren't in.
      const passing = ahead.filter(l => !this.ownLanes().includes(l));
      if (passing.length && Math.random() < 0.5) {
        this.spawn(v, 20, passing);
        v.cruise = this.route.speed * rand(1.08, 1.2);
        v.speed = Math.max(v.cruise, ourSpeed * 1.08);
      } else {
        this.spawn(v, -rand(330, 420));
        v.speed = v.cruise;
      }
    } else if (v.z > 22) {
      this.spawn(v, -rand(330, 420));
      v.speed = v.cruise;
    }
  }

  /** Every so often, or when stuck behind someone, moves over to another lane with room. */
  private steer(v: Vehicle, dt: number, ownLanes: readonly number[]): void {
    if (v.shift < 1) {
      v.shift = Math.min(1, v.shift + dt / LANE_CHANGE_SECONDS);
      if (v.shift === 1) v.fromLane = v.lane;
      return;
    }
    const lanes = v.oncoming ? this.route.traffic.oncoming : this.route.traffic.ahead;
    v.changeTimer -= dt;
    if (lanes.length < 2 || v.changeTimer > 0) return;
    v.changeTimer = rand(...LANE_CHANGE_EVERY);
    const target = pick(lanes.filter(l => l !== v.lane));
    if (!v.oncoming && ownLanes.includes(target) && v.z > OUR_FRONT - OWN_LANE_MERGE_AHEAD) return;
    const clear = this.vehicles.every(o => o === v || !this.occupies(o, target) || Math.abs(o.z - v.z) > MERGE_CLEARANCE + (o.length + v.length) / 2);
    if (!clear) return;
    v.fromLane = v.lane;
    v.lane = target;
    v.shift = 0;
  }

  /** Now and then, on a road with more than one lane our way, moves us over when there's room. */
  private steerOwn(dt: number, ourSpeed: number): void {
    const own = this.own;
    if (own.shift < 1) {
      own.shift = Math.min(1, own.shift + dt / OWN_CHANGE_SECONDS);
      if (own.shift === 1) own.fromLane = own.lane;
      return;
    }
    const { ahead } = this.route.traffic;
    if (ahead.length < 2) return;
    if (this.holdFirstLane && own.lane === ahead[0]) return;
    own.timer -= dt;
    // Heading back to the first lane is tried at once, and again every step until there's room.
    if (!this.holdFirstLane && (ourSpeed < OWN_CHANGE_SPEED || own.timer > 0)) return;
    const target = this.holdFirstLane ? ahead[0] : pick(ahead.filter(l => l !== own.lane));
    const room = this.vehicles.every(v => v.oncoming || !this.occupies(v, target) || v.z + v.length / 2 < OUR_FRONT - OWN_CHANGE_ROOM_AHEAD || v.z - v.length / 2 > OWN_CHANGE_ROOM_BEHIND);
    // Without room it tries again shortly.
    own.timer = room ? rand(...OWN_CHANGE_EVERY) : 3;
    if (!room) return;
    own.fromLane = own.lane;
    own.lane = target;
    own.shift = 0;
  }

  /** The nearest vehicle in front of v in either lane it is in, in its direction of travel. */
  private leader(v: Vehicle): Vehicle | null {
    let best: Vehicle | null = null;
    for (const o of this.vehicles) {
      if (o === v || o.oncoming !== v.oncoming || !(this.occupies(o, v.lane) || this.occupies(o, v.fromLane))) continue;
      const ahead = v.oncoming ? o.z > v.z : o.z < v.z;
      if (ahead && (!best || Math.abs(o.z - v.z) < Math.abs(best.z - v.z))) best = o;
    }
    return best;
  }

  /** Whether any part of v is in the lane, counting both lanes during a change. */
  private occupies(v: Vehicle, lane: number): boolean {
    return v.lane === lane || (v.shift < 1 && v.fromLane === lane);
  }

  private place(v: Vehicle): void {
    v.group.position.set(this.laneX(v), 0, v.z);
    // Turned slightly into a lane change, as a car steers across.
    const sideways = v.shift < 1 ? ((v.lane - v.fromLane) * 6 * v.shift * (1 - v.shift)) / LANE_CHANGE_SECONDS : 0;
    v.group.rotation.y = (v.oncoming ? Math.PI : 0) - Math.atan2(sideways, Math.max(v.speed, 5));
  }
}
