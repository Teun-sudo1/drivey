import * as THREE from 'three';
import { createCanvas } from '../lib/canvas';
import { pick, rand } from '../lib/math';
import type { RouteDefinition } from '../routes/types';
import { PLANE, mesh } from './geometry';
import { MATERIALS } from './materials';

const SKYLINE_Y = 50;

function createCitySkyline(): { group: THREE.Group; silhouette: THREE.MeshBasicMaterial; windows: THREE.MeshBasicMaterial } {
  const sil = createCanvas(2048, 256);
  const win = createCanvas(2048, 256);
  let x = 0;
  while (x < 2048) {
    const bw = rand(18, 60), bh = rand(40, 220);
    sil.ctx.fillStyle = '#fff';
    sil.ctx.fillRect(x, 256 - bh, bw, bh);
    if (Math.random() < 0.15) sil.ctx.fillRect(x + bw / 2 - 1, 256 - bh - 25, 2, 25);
    for (let yy = 256 - bh + 6; yy < 250; yy += 7) {
      for (let xx = x + 3; xx < x + bw - 3; xx += 6) {
        if (Math.random() < 0.28) {
          win.ctx.globalAlpha = rand(0.3, 1);
          win.ctx.fillStyle = pick(['#ffd8a0', '#cfe6ff', '#fff0d0']);
          win.ctx.fillRect(xx, yy, 3, 3);
        }
      }
    }
    x += bw + rand(0, 6);
  }
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
  group.position.y = SKYLINE_Y;
  return { group, silhouette, windows };
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

/** Distant scenery that doesn't move with the road or bend with it. */
export class Backdrop {
  private readonly skyline = createCitySkyline();
  private readonly stars = createStars();

  constructor(scene: THREE.Scene, route: RouteDefinition) {
    const ground = mesh(PLANE, MATERIALS.dark, 0, route.groundY, -300, 800, 1200, 1, scene);
    ground.rotation.x = -Math.PI / 2;
    scene.add(this.skyline.group, this.stars);
  }

  /** Turns the distant scenery to follow the road through a curve. */
  rotate(angle: number): void {
    this.skyline.group.rotation.y += angle;
    this.stars.rotation.y += angle;
  }

  applyEnvironment(fogColor: THREE.Color, fogDensity: number, win: number, star: number): void {
    const visibility = THREE.MathUtils.clamp(1 - (fogDensity - 0.004) * 38, 0, 1);
    this.skyline.silhouette.color.copy(fogColor).multiplyScalar(0.72);
    this.skyline.silhouette.opacity = visibility;
    this.skyline.windows.opacity = visibility * THREE.MathUtils.clamp(win, 0, 1);
    this.stars.material.opacity = star * 0.9;
  }
}
