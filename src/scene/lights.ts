import * as THREE from 'three';

export interface SceneLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  /** One beam per headlamp, so two pools of light show on the road. */
  headlights: [THREE.SpotLight, THREE.SpotLight];
}

/** Half the distance between the headlamps, and how far apart their beams aim, 60 m out. */
const LAMP_SPREAD = 0.65;
const LAMP_TOE = 1.6;

/** Keeps the headlights on our car: its side of the road, and any lane change, as a world x shift. */
export function placeHeadlights(lights: SceneLights, side: number, offset: number): void {
  const centre = -0.4 * side + offset;
  lights.headlights.forEach((lamp, i) => {
    const x = centre + (i ? LAMP_SPREAD : -LAMP_SPREAD);
    lamp.position.x = x;
    // Toed out a little, so each lamp leaves its own pool, and a touch towards the kerb, as dipped beams are.
    lamp.target.position.x = x + (i ? LAMP_TOE : -LAMP_TOE) - 0.2 * side;
  });
}

export function createLights(scene: THREE.Scene): SceneLights {
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202024, 0.3);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-60, 80, -120);
  const headlights = [-LAMP_SPREAD, LAMP_SPREAD].map(dx => {
    // Narrower and crisper-edged than one big beam, so each lamp's pool reads on its own.
    const lamp = new THREE.SpotLight(0xfff0d8, 0, 110, 0.36, 0.5, 1.35);
    lamp.position.set(-0.4 + dx, 0.75, -2.2);
    lamp.target.position.set(-0.6 + dx + Math.sign(dx) * LAMP_TOE, 0, -60);
    scene.add(lamp, lamp.target);
    return lamp;
  }) as [THREE.SpotLight, THREE.SpotLight];
  scene.add(hemi, sun);
  return { hemi, sun, headlights };
}
