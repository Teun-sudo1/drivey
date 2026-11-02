import * as THREE from 'three';
import { FACADE, GLOW, neonSignTexture, signTexture, windowTexture } from './textures';

export const MATERIALS = {
  road: new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.92 }),
  line: new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.6, emissive: 0x666660, emissiveIntensity: 0.35 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x5a5b61, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.45, metalness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.9 }),
  under: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(1.2) }),
  rock: new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 1, flatShading: true }),
  grass: new THREE.MeshStandardMaterial({ color: 0x2c3d25, roughness: 1 }),
  tree: new THREE.MeshStandardMaterial({ color: 0x1f3320, roughness: 1, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 }),
  house: new THREE.MeshStandardMaterial({ color: 0x6d6258, roughness: 0.9 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x3b2622, roughness: 0.9, flatShading: true }),
  warmWindow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(2) }),
  reflector: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5030).multiplyScalar(1.5) }),
  tunnelWall: new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.8 }),
  /** Sandstone for the coast's cliffs. */
  cliff: new THREE.MeshStandardMaterial({ color: 0x8a6650, roughness: 1, flatShading: true }),
  sand: new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 1 }),
  foam: new THREE.MeshStandardMaterial({ color: 0xe6eef0, roughness: 0.8, emissive: 0x405058, emissiveIntensity: 0.5 }),
  /** Seawalls, railings and beach huts: painted white. */
  paint: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.7 }),
  palmTrunk: new THREE.MeshStandardMaterial({ color: 0x5c4a3a, roughness: 1, flatShading: true }),
  palmLeaf: new THREE.MeshStandardMaterial({ color: 0x2a4a2c, roughness: 0.9, side: THREE.DoubleSide }),
  /** White, so each instance's own colour shows: the pastels of a beach town. */
  tinted: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
  /** Neon tubes, tinted per instance; the environment dims them by day. */
  neon: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  /** Lakes, harbour basins and the water under causeways; the environment tints it like the sea. */
  water: new THREE.MeshStandardMaterial({ color: 0x0b1a28, roughness: 0.25, metalness: 0.7 }),
  crane: new THREE.MeshStandardMaterial({ color: 0xc8642a, roughness: 0.7 }),
  /** Tunnel lights burn day and night. */
  tunnelLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc56e).multiplyScalar(2.4) })
};

// Named after their keys, for debugging and the browser tests.
for (const [name, material] of Object.entries(MATERIALS)) material.name = name;

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

/** 80s pastels for beach towns, and the two neon colours. */
export const PASTELS = [0xf7a8c4, 0x9fe3cf, 0xf9d98c, 0xc3a8f0, 0xffb894, 0x9fd0f5].map(hex => new THREE.Color(hex));
export const NEON_PINK = new THREE.Color(0xff3fa4);
export const NEON_CYAN = new THREE.Color(0x3ff2ff);

/** Shipping-container paint. */
export const CONTAINER_COLORS = [0x9c3b2a, 0x2b5d8a, 0x2e7d6b, 0xc99a2e, 0x6d6f74, 0x8a2f4f].map(hex => new THREE.Color(hex));

const neonSigns = (words: readonly string[]) =>
  words.map((word, i) => new THREE.MeshBasicMaterial({ map: neonSignTexture(word, i % 2 ? NEON_CYAN : NEON_PINK), toneMapped: false }));

/** Glowing roadside signs on the coast; dimmed by day along with the neon. */
export const NEON_SIGN_MATERIALS = neonSigns(['MOTEL', 'SURF', 'DINER', 'ARCADE', 'VACANCY', 'PALMS', 'VIDEO', 'OCEAN DR']);
/** Billboards in the city's nightlife district. */
export const CITY_NEON_MATERIALS = neonSigns(['HOTEL', 'CINEMA', 'JAZZ', 'NOODLES', 'OPEN 24H', 'RECORDS', 'BAR', 'DANCE']);

/** The sign announcing a rest stop. */
export const REST_SIGN_MATERIAL = (() => {
  const t = signTexture('Rest area', 'P  ·  Kiosk');
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3, roughness: 0.6 });
})();

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
