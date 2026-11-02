import * as THREE from 'three';
import { lerp } from '../lib/math';
import { laneCentres, type RouteDefinition } from '../routes/types';
import type { Shelter } from './chunkPool';
import { MATERIALS, LAMP_KINDS } from './materials';
import { INTERIOR_LAYER, type Stage } from './stage';
import { TILING_NOISE } from './textures';

/** Short side of the reflection in pixels; a fixed height would starve portrait of width. */
const REFLECTION_SHORT_SIDE = 360;
const REFLECTION_LONG_SIDE = 720;
/** Below this the road is effectively dry, so the reflection pass is skipped. */
const MIN_WET = 0.03;
/** Snow is dimmer under headlights, whose tuning for dark asphalt would otherwise blow it out to white. */
const SNOW_ALBEDO_DAY = 0.68;
const SNOW_ALBEDO_HEADLIGHTS = 0.1;
/** The shader has room for this many lanes and tunnels. */
const MAX_LANES = 4;
const MAX_SHELTERS = 2;
/** Stands in for a missing tunnel: a stretch of road far behind the car. */
const NO_SHELTER = 1e5;

const VERTEX_HEADER = `
uniform mat4 uReflectionMatrix;
varying vec4 vReflection;
varying vec3 vRoad;
`;

const FRAGMENT_HEADER = `
uniform sampler2D tReflection;
uniform float uTexelY;
uniform sampler2D tRoadNoise;
uniform float uWet;
uniform float uReflect;
uniform float uSnow;
uniform float uSnowAlbedo;
uniform vec4 uLanes;
uniform vec4 uShelters;
varying vec4 vReflection;
varying vec3 vRoad;

float laneRut(float x, float lane) {
  return abs(abs(x - lane) - 0.75);
}

float covered(float z, vec2 tunnel) {
  return clamp((tunnel.x - z) / 4.0, 0.0, 1.0) * clamp((z - tunnel.y) / 4.0, 0.0, 1.0);
}
`;

/* Runs early in main(), so the masks are in scope for the later chunks. The
   noise repeats a whole number of times per chunk, so chunk joins don't show. */
const SURFACE_GLSL = `
vec2 roadUv = vec2(vRoad.x / 8.0, vRoad.y * 5.0);
float roadNoise = texture2D(tRoadNoise, roadUv).r;
float roadDetail = texture2D(tRoadNoise, roadUv * 7.0).r;

float rutDistance = min(
  min(laneRut(vRoad.x, uLanes.x), laneRut(vRoad.x, uLanes.y)),
  min(laneRut(vRoad.x, uLanes.z), laneRut(vRoad.x, uLanes.w))
) + (roadDetail - 0.5) * 0.25;
float rut = 1.0 - smoothstep(0.12, 0.45, rutDistance);
// Inside a tunnel the road stays clear of snow, and only damp from what cars carry in.
float sheltered = max(covered(vRoad.z, uShelters.xy), covered(vRoad.z, uShelters.zw));
float snowMask = smoothstep(0.2, 0.5, uSnow * (1.1 - rut * 0.85) + (roadNoise - 0.5) * 0.35) * (1.0 - sheltered);

float wetMask = smoothstep(roadNoise - 0.15, roadNoise + 0.15, uWet * 1.1 * (1.0 - sheltered * 0.8)) * (1.0 - snowMask);
diffuseColor.rgb *= mix(1.0, 0.55, wetMask);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 1.0) * uSnowAlbedo, snowMask);
`;

const ROUGHNESS_GLSL = `
roughnessFactor = mix(mix(roughnessFactor, 0.2, wetMask), 0.85, snowMask);
`;

/* Sampled in a vertical smear, because rough wet asphalt stretches lights
   towards the viewer. The samples are two texels apart, and read from the
   half-size mip level, whose texels are two wide: so each sample's reach meets
   the next one's and a one-texel light is smeared evenly. Read from the full
   size, a light that small falls between samples and shows as a ladder of
   stripes. Jittering them instead shows up as blocks, hatching or sand on
   bright reflections, depending on the noise. */
const REFLECTION_GLSL = `
if (wetMask * uReflect > 0.001) {
  vec2 reflectionUv = vReflection.xy / vReflection.w;
  // Fades with distance, where the road's noise is too fine and would alias into a zigzag.
  reflectionUv.x += (roadNoise - 0.5) * 0.02 * clamp(4.0 / length(vViewPosition), 0.0, 1.0);
  vec3 reflected = vec3(0.0);
  for (int i = -4; i < 4; i++) {
    float at = float(i) + 0.5;
    reflected += textureLod(tReflection, reflectionUv + vec2(0.0, at * 2.0 * uTexelY), 1.0).rgb * (4.5 - abs(at));
  }
  reflected /= 20.0;
  float facing = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  float fresnel = mix(0.1, 1.0, pow(1.0 - facing, 5.0));
  // Capped so the lamp overhead can't wash the whole road near the car.
  outgoingLight += min(reflected, vec3(0.5)) * fresnel * wetMask;
}
`;

/**
 * The road's wet and snowy look. Wet reflections come from a low-resolution
 * render of the mirrored scene, so lamps, signs and buildings really do appear
 * in the road.
 *
 * Must be created before the road geometry, since bending wraps this shader.
 */
export class RoadSurface {
  // Multisampled because the rail's long diagonal edge otherwise shows up in the road as a row of steps.
  private readonly target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  private readonly virtualCamera = new THREE.PerspectiveCamera();
  private readonly reflectionMatrix = new THREE.Matrix4();
  private readonly wet = { value: 0 };
  private readonly texelY = { value: 1 };
  /** 1 while the reflection is rendered, 0 when the quality setting turns it off. */
  private readonly reflect = { value: 1 };
  private detail = 1;
  private size = { w: 1, h: 1 };
  private readonly snow = { value: 0 };
  private readonly lanes = { value: new THREE.Vector4() };
  private readonly shelters = { value: new THREE.Vector4(NO_SHELTER, NO_SHELTER, NO_SHELTER, NO_SHELTER) };
  private routeLanes: number[];
  private side = 1;
  private readonly snowAlbedo = { value: SNOW_ALBEDO_DAY };
  private renderThisFrame = true;

  // Scratch values, to avoid allocating every frame.
  private readonly cameraPosition = new THREE.Vector3();
  private readonly rotation = new THREE.Matrix4();
  private readonly lookAt = new THREE.Vector3();
  private readonly plane = new THREE.Plane();
  private readonly clip = new THREE.Vector4();
  private readonly q = new THREE.Vector4();

  constructor(private readonly stage: Stage, route: RouteDefinition) {
    this.routeLanes = laneCentres(route);
    const road = MATERIALS.road;
    road.onBeforeCompile = sh => {
      sh.uniforms.uReflectionMatrix = { value: this.reflectionMatrix };
      sh.uniforms.tReflection = { value: this.target.texture };
      sh.uniforms.uTexelY = this.texelY;
      sh.uniforms.tRoadNoise = { value: TILING_NOISE };
      sh.uniforms.uWet = this.wet;
      sh.uniforms.uReflect = this.reflect;
      sh.uniforms.uSnow = this.snow;
      sh.uniforms.uSnowAlbedo = this.snowAlbedo;
      sh.uniforms.uLanes = this.lanes;
      sh.uniforms.uShelters = this.shelters;
      sh.vertexShader = VERTEX_HEADER + sh.vertexShader.replace(
        'gl_Position = projectionMatrix * mvPosition;',
        'gl_Position = projectionMatrix * mvPosition;\nvReflection = uReflectionMatrix * bw;\nvRoad = vec3((modelMatrix * vec4(transformed, 1.0)).x, uv.y, bw.z);'
      );
      sh.fragmentShader = FRAGMENT_HEADER + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURFACE_GLSL)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + ROUGHNESS_GLSL)
        .replace('#include <opaque_fragment>', REFLECTION_GLSL + '#include <opaque_fragment>');
    };
    // Every bent material shares one onBeforeCompile source, which is the default cache key.
    road.customProgramCacheKey = () => 'road-surface';

    stage.onResize((w, h) => {
      this.size = { w, h };
      this.fitTarget();
    });
  }

  /** Reflection size as a share of full; 0 turns it off and the road just darkens when wet. */
  setDetail(detail: number): void {
    this.detail = detail;
    this.reflect.value = detail > 0 ? 1 : 0;
    this.fitTarget();
  }

  private fitTarget(): void {
    const { w, h } = this.size, detail = Math.max(this.detail, 0.1);
    const scale = Math.min(REFLECTION_SHORT_SIDE / Math.min(w, h), REFLECTION_LONG_SIDE / Math.max(w, h), 1) * detail;
    const height = Math.max(1, Math.round(h * scale));
    this.target.setSize(Math.max(1, Math.round(w * scale)), height);
    this.texelY.value = 1 / height;
  }

  setRoute(route: RouteDefinition): void {
    this.routeLanes = laneCentres(route);
    this.setSide(this.side);
  }

  setSide(side: number): void {
    this.side = side;
    // Unused slots repeat the first lane, which leaves the ruts unchanged.
    const lanes = Array.from({ length: MAX_LANES }, (_, i) => (this.routeLanes[i] ?? this.routeLanes[0]) * side);
    this.lanes.value.fromArray(lanes);
  }

  /** The tunnels on the road, nearest first, where it stays dry and clear of snow. */
  setShelters(shelters: readonly Shelter[]): void {
    const v = this.shelters.value;
    for (let i = 0; i < MAX_SHELTERS; i++) {
      const s = shelters[i];
      v.setComponent(i * 2, s ? s.near : NO_SHELTER);
      v.setComponent(i * 2 + 1, s ? s.far : NO_SHELTER);
    }
  }

  /** Renders the reflection every other frame; a slight lag doesn't show in a blurred, wet road. */
  render(): void {
    if (this.wet.value === 0 || !this.reflect.value) return;
    this.renderThisFrame = !this.renderThisFrame;
    if (this.renderThisFrame) this.renderReflection();
  }

  setLevels(wet: number, snow: number, headlights: number): void {
    this.wet.value = wet < MIN_WET ? 0 : wet;
    this.snow.value = snow;
    this.snowAlbedo.value = lerp(SNOW_ALBEDO_DAY, SNOW_ALBEDO_HEADLIGHTS, headlights);
  }

  private renderReflection(): void {
    const { renderer, scene, camera } = this.stage;
    camera.updateMatrixWorld(true);
    this.placeVirtualCamera();

    const surfaces = [MATERIALS.road, MATERIALS.line, ...[...LAMP_KINDS.values()].map(kind => kind.pool)];
    for (const m of surfaces) m.visible = false;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.virtualCamera);
    renderer.setRenderTarget(previous);
    for (const m of surfaces) m.visible = true;
  }

  /** Mirrors the camera in the road plane (y = 0), as three's Reflector does. */
  private placeVirtualCamera(): void {
    const { camera } = this.stage;
    const virtual = this.virtualCamera;
    const up = THREE.Object3D.DEFAULT_UP;

    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    this.rotation.extractRotation(camera.matrixWorld);
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rotation).add(this.cameraPosition);

    virtual.position.set(this.cameraPosition.x, -this.cameraPosition.y, this.cameraPosition.z);
    virtual.up.set(0, 1, 0).applyMatrix4(this.rotation).reflect(up);
    virtual.lookAt(this.lookAt.x, -this.lookAt.y, this.lookAt.z);
    virtual.far = camera.far;
    virtual.updateMatrixWorld();
    virtual.projectionMatrix.copy(camera.projectionMatrix);

    this.reflectionMatrix
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(virtual.projectionMatrix)
      .multiply(virtual.matrixWorldInverse);

    // Oblique near plane: clips everything below the road, like the deck and tower bases.
    this.plane.set(up, 0).applyMatrix4(virtual.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const p = virtual.projectionMatrix.elements;
    this.q.set((Math.sign(this.clip.x) + p[8]) / p[0], (Math.sign(this.clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    p[2] = this.clip.x;
    p[6] = this.clip.y;
    p[10] = this.clip.z + 1 - 0.003;
    p[14] = this.clip.w;
  }
}

/** Interior and rain would both be wrong in the road, so the reflection's camera doesn't see this layer. */
export function hideFromReflection(root: THREE.Object3D): void {
  root.traverse(o => {
    if (!(o instanceof THREE.Light)) o.layers.set(INTERIOR_LAYER);
  });
}
