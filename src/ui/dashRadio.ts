import * as THREE from 'three';
import type { CarRadio } from '../scene/cockpit/radio';

export interface RadioActions {
  volume(level: number): void;
  station(index: number): void;
  seek(): void;
  power(): void;
}

/**
 * Lets the dashboard radio be used with a mouse or finger: press the buttons and tap the dial; the volume
 * knob is turned from main. The volume is mirrored in a hidden range
 * input for keyboards and screen readers; stations are in the Sound tab too.
 */
export function bindDashRadio(canvas: HTMLCanvasElement, camera: THREE.Camera, radio: CarRadio, input: HTMLInputElement, actions: RadioActions): (level: number) => void {
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane();
  const normal = new THREE.Vector3(), origin = new THREE.Vector3(), point = new THREE.Vector3();

  /** Where on the radio's canvas a pointer is, even off its edge, or null if it's pointing away from it. */
  const canvasPoint = (e: PointerEvent): { x: number; y: number } | null => {
    camera.updateMatrixWorld();
    radio.face.updateWorldMatrix(true, false);
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    normal.set(0, 0, 1).transformDirection(radio.face.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, radio.face.getWorldPosition(origin));
    if (!raycaster.ray.intersectPlane(plane, point)) return null;
    return radio.localToCanvas(radio.face.worldToLocal(point));
  };
  const hitAt = (e: PointerEvent) => {
    const p = canvasPoint(e);
    return p ? radio.hit(p.x, p.y) : null;
  };

  canvas.addEventListener('pointerdown', e => {
    const hit = hitAt(e);
    if (!hit) return;
    if (hit.kind === 'station') actions.station(hit.index);
    else if (hit.kind === 'seek') actions.seek();
    else actions.power();
  });
  canvas.addEventListener('pointermove', e => {
    canvas.style.cursor = hitAt(e) ? 'pointer' : '';
  });
  input.addEventListener('input', () => actions.volume(Number(input.value)));

  return level => {
    input.value = String(level);
  };
}
