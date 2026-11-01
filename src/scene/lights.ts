import * as THREE from 'three';

export interface SceneLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  headlights: THREE.SpotLight;
}

export function setLightsSide(lights: SceneLights, side: number): void {
  lights.headlights.position.x = -0.4 * side;
  lights.headlights.target.position.x = -0.6 * side;
}

export function createLights(scene: THREE.Scene): SceneLights {
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202024, 0.3);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-60, 80, -120);
  const headlights = new THREE.SpotLight(0xfff0d8, 0, 110, 0.5, 0.95, 1.35);
  headlights.position.set(-0.4, 0.75, -2.2);
  headlights.target.position.set(-0.6, 0, -60);
  scene.add(hemi, sun, headlights, headlights.target);
  return { hemi, sun, headlights };
}
