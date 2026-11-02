import * as THREE from 'three';
import type { VolumeFader } from '../scene/cockpit/volumeFader';

/** How close to the slot, in CSS pixels, a press grabs the fader: a finger's width. */
const GRAB_PX = 26;
/** A little past either end of the slot still counts, so 0 and 10 are easy to hit. */
const END_SLACK = 0.08;

/**
 * Lets the dashboard's volume fader be dragged with a mouse or finger, and
 * mirrors it in a hidden range input for keyboards and screen readers.
 */
export function bindDashVolume(canvas: HTMLCanvasElement, camera: THREE.Camera, fader: VolumeFader, input: HTMLInputElement, set: (level: number) => void): (level: number) => void {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let dragging = false;

  /** Where along the slot a screen point falls (0 to 1), and how far from it in pixels. */
  const measure = (e: PointerEvent): { t: number; distance: number } => {
    const [from, to] = fader.slotEnds;
    const toScreen = (v: THREE.Vector3, p: THREE.Vector3) => {
      fader.face.localToWorld(v.copy(p)).project(camera);
      v.set((v.x * 0.5 + 0.5) * innerWidth, (0.5 - v.y * 0.5) * innerHeight, 0);
    };
    camera.updateMatrixWorld();
    toScreen(a, from);
    toScreen(b, to);
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = ((e.clientX - a.x) * dx + (e.clientY - a.y) * dy) / len2;
    const nearest = THREE.MathUtils.clamp(t, 0, 1);
    const distance = Math.hypot(e.clientX - (a.x + dx * nearest), e.clientY - (a.y + dy * nearest));
    return { t, distance };
  };
  const onSlot = (m: { t: number; distance: number }) => m.distance < GRAB_PX && m.t > -END_SLACK && m.t < 1 + END_SLACK;

  canvas.addEventListener('pointerdown', e => {
    const m = measure(e);
    if (!onSlot(m)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    set(THREE.MathUtils.clamp(m.t, 0, 1));
  });
  canvas.addEventListener('pointermove', e => {
    const m = measure(e);
    if (dragging) set(THREE.MathUtils.clamp(m.t, 0, 1));
    else canvas.style.cursor = onSlot(m) ? 'grab' : '';
  });
  const release = () => {
    dragging = false;
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  input.addEventListener('input', () => set(Number(input.value)));

  return level => {
    input.value = String(level);
  };
}
