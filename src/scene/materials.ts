import * as THREE from 'three';
import { FACADE, GLOW, signTexture, windowTexture } from './textures';

export const MATERIALS = {
  road: new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.92 }),
  line: new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.6, emissive: 0x666660, emissiveIntensity: 0.35 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x5a5b61, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.45, metalness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.9 }),
  under: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(1.2) })
};

export const WINDOW_MATERIALS = [0.22, 0.38, 0.55].map(
  lit => new THREE.MeshStandardMaterial({ map: FACADE, color: 0x1a1e26, roughness: 0.5, metalness: 0.4, emissive: 0xffffff, emissiveMap: windowTexture(lit), emissiveIntensity: 1.5 })
);

/** Wall colour by day, by position in WINDOW_MATERIALS, so neighbouring towers stand apart. */
export const BUILDING_DAY_COLORS = [new THREE.Color(0xe2d9c8), new THREE.Color(0x98a4b0), new THREE.Color(0xc2a184)];
export const BUILDING_NIGHT_COLOR = new THREE.Color(0x1a1e26);

export const SIGN_MATERIALS = ([['Central', '3 km'], ['Harbor', 'Exit 14'], ['Airport', '18 km'], ['Riverside', 'Exit 9'], ['Old Town', '5 km'], ['Bay Bridge', '2 km']] as const).map(([a, b]) => {
  const t = signTexture(a, b);
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3, roughness: 0.6 });
});

export interface LampMaterials {
  base: THREE.Color;
  head: THREE.MeshBasicMaterial;
  glow: THREE.SpriteMaterial;
  pool: THREE.MeshBasicMaterial;
}

export const LAMP_TEAL = 0x9fffe0;
export const LAMP_SODIUM = 0xffb46b;

export const LAMP_KINDS = new Map<number, LampMaterials>();

export function lampMaterials(hex: number): LampMaterials {
  const known = LAMP_KINDS.get(hex);
  if (known) return known;
  const base = new THREE.Color(hex);
  const additive = { map: GLOW, color: base, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false };
  const kind: LampMaterials = {
    base,
    head: new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(3) }),
    glow: new THREE.SpriteMaterial(additive),
    pool: new THREE.MeshBasicMaterial({ ...additive, opacity: 0.3 })
  };
  LAMP_KINDS.set(hex, kind);
  return kind;
}
