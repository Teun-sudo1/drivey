import * as THREE from 'three';
import { createCanvas } from '../lib/canvas';
import { pick, rand } from '../lib/math';
import type { RouteDefinition, SkylineKind } from '../routes/types';
import { PLANE, mesh } from './geometry';
import { MATERIALS } from './materials';

const SKYLINE_Y: Record<SkylineKind, number> = { city: 50, low: 62, hills: 62 };
/** The coast's low skyline is turned so the town sits across the bay. */
const COAST_SKYLINE_TURN = 2.2;
const SHORE_LIGHTS = 300;
const SEA_Y = -3;

function drawTowers(sil: CanvasRenderingContext2D, win: CanvasRenderingContext2D, kind: SkylineKind): void {
  let x = 0;
  while (x < 2048) {
    const bw = rand(18, 60), bh = kind === 'city' ? rand(40, 220) : rand(15, 60);
    sil.fillStyle = '#fff';
    sil.fillRect(x, 256 - bh, bw, bh);
    if (kind === 'city' && Math.random() < 0.15) sil.fillRect(x + bw / 2 - 1, 256 - bh - 25, 2, 25);
    for (let yy = 256 - bh + 6; yy < 250; yy += 7) {
      for (let xx = x + 3; xx < x + bw - 3; xx += 6) {
        if (Math.random() < 0.28) {
          win.globalAlpha = rand(0.3, 1);
          win.fillStyle = pick(['#ffd8a0', '#cfe6ff', '#fff0d0']);
          win.fillRect(xx, yy, 3, 3);
        }
      }
    }
    x += bw + rand(0, 6);
  }
}

/** Rolling hills with a scatter of farm lights at their feet. */
function drawHills(sil: CanvasRenderingContext2D, win: CanvasRenderingContext2D): void {
  sil.fillStyle = '#fff';
  sil.beginPath();
  sil.moveTo(0, 256);
  for (let i = 0; i <= 64; i++) sil.lineTo(i * 32, 200 - 40 * Math.sin(i * 0.35) - 25 * Math.sin(i * 0.9 + 1) - rand(0, 8));
  sil.lineTo(2048, 256);
  sil.fill();
  win.fillStyle = '#ffcf90';
  for (let i = 0; i < 40; i++) {
    win.globalAlpha = rand(0.4, 1);
    win.fillRect(rand(0, 2048), rand(215, 245), 2, 2);
  }
}

interface Skyline {
  group: THREE.Group;
  silhouette: THREE.MeshBasicMaterial;
  windows: THREE.MeshBasicMaterial;
  dispose(): void;
}

function createSkyline(kind: SkylineKind): Skyline {
  const sil = createCanvas(2048, 256);
  const win = createCanvas(2048, 256);
  if (kind === 'hills') drawHills(sil.ctx, win.ctx);
  else drawTowers(sil.ctx, win.ctx, kind);
  const geo = new THREE.CylinderGeometry(600, 600, 150, 64, 1, true);
  const alpha = new THREE.CanvasTexture(sil.canvas);
  const lights = new THREE.CanvasTexture(win.canvas);
  alpha.wrapS = lights.wrapS = THREE.RepeatWrapping;
  alpha.repeat.x = lights.repeat.x = 3;
  const silhouette = new THREE.MeshBasicMaterial({ alphaMap: alpha, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, color: 0x101418 });
  const windows = new THREE.MeshBasicMaterial({ map: lights, alphaMap: alpha, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const silMesh = new THREE.Mesh(geo, silhouette);
  const winMesh = new THREE.Mesh(geo, windows);
  silMesh.renderOrder = winMesh.renderOrder = -2;
  const group = new THREE.Group();
  group.add(silMesh, winMesh);
  group.position.y = SKYLINE_Y[kind];
  return {
    group,
    silhouette,
    windows,
    dispose() {
      for (const d of [geo, alpha, lights, silhouette, windows]) d.dispose();
    }
  };
}

function createStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const positions = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const a = rand(0, Math.PI * 2), e = rand(0.15, 1.4), r = 700;
    positions[i * 3] = Math.cos(a) * Math.cos(e) * r;
    positions[i * 3 + 1] = Math.sin(e) * r;
    positions[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
  stars.renderOrder = -3;
  return stars;
}

/** The lights of a far shore, across the water on the sea side. */
function createShoreLights(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const positions = new Float32Array(SHORE_LIGHTS * 3);
  for (let i = 0; i < SHORE_LIGHTS; i++) {
    positions[i * 3] = -rand(250, 500);
    positions[i * 3 + 1] = rand(-1, 3);
    positions[i * 3 + 2] = -rand(100, 600);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc98a, size: 2, sizeAttenuation: false, fog: false, transparent: true }));
}

/** Distant scenery that doesn't move with the road or bend with it. */
export class Backdrop {
  /** Ground and sea, which swap sides with the road. */
  readonly sided = new THREE.Group();
  readonly sea = mesh(PLANE, new THREE.MeshStandardMaterial({ color: 0x0b1a28, roughness: 0.25, metalness: 0.7 }), -404, SEA_Y, -300, 800, 1200, 1, this.sided);
  readonly shoreLights = createShoreLights();
  readonly ground = mesh(PLANE, MATERIALS.dark, 0, 0, -300, 800, 1200, 1, this.sided);
  private readonly stars = createStars();
  private skyline: Skyline | null = null;

  constructor(private readonly scene: THREE.Scene, route: RouteDefinition) {
    this.ground.rotation.x = this.sea.rotation.x = -Math.PI / 2;
    this.sided.add(this.shoreLights);
    scene.add(this.sided, this.stars);
    this.setRoute(route);
  }

  setRoute(route: RouteDefinition): void {
    const { skyline, groundY, ground, sea } = route.scenery;
    this.ground.material = ground === 'grass' ? MATERIALS.grass : MATERIALS.dark;
    this.ground.position.y = groundY;
    // Along the coast the land is only on the far side of the road.
    this.ground.position.x = sea ? 405 : 0;
    this.sea.visible = this.shoreLights.visible = sea;

    if (this.skyline) {
      this.scene.remove(this.skyline.group);
      this.skyline.dispose();
    }
    this.skyline = createSkyline(skyline);
    this.skyline.group.rotation.y = sea ? COAST_SKYLINE_TURN : 0;
    this.scene.add(this.skyline.group);
  }

  setSide(side: number): void {
    this.sided.scale.x = side;
  }

  /** Turns the distant scenery to follow the road through a curve. */
  rotate(angle: number): void {
    if (this.skyline) this.skyline.group.rotation.y += angle;
    this.stars.rotation.y += angle;
  }

  applyEnvironment(fogColor: THREE.Color, fogDensity: number, win: number, star: number): void {
    const visibility = THREE.MathUtils.clamp(1 - (fogDensity - 0.004) * 38, 0, 1);
    if (this.skyline) {
      this.skyline.silhouette.color.copy(fogColor).multiplyScalar(0.72);
      this.skyline.silhouette.opacity = visibility;
      this.skyline.windows.opacity = visibility * THREE.MathUtils.clamp(win, 0, 1);
    }
    this.stars.material.opacity = star * 0.9;
    (this.sea.material as THREE.MeshStandardMaterial).color.copy(fogColor).multiplyScalar(0.35);
    this.shoreLights.material.opacity = THREE.MathUtils.clamp(win, 0, 1) * THREE.MathUtils.clamp(1 - (fogDensity - 0.004) * 30, 0, 1);
  }
}
