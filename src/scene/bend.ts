import type * as THREE from 'three';

/* Road curvature: bend every world vertex in the shader (x += k * z²), so all
   chunks stay perfectly connected instead of being rotated rigid segments. */
export const BEND = { value: 0 };

const BEND_GLSL = `vec4 bw = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  bw = instanceMatrix * bw;
#endif
bw = modelMatrix * bw; bw.x += uBend * bw.z * bw.z;
vec4 mvPosition = viewMatrix * bw;
gl_Position = projectionMatrix * mvPosition;`;

function bendify(mat: THREE.Material): void {
  if (mat.userData.bent) return;
  mat.userData.bent = true;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uBend = BEND;
    sh.vertexShader = 'uniform float uBend;\n' + sh.vertexShader
      .replace('#include <project_vertex>', BEND_GLSL)
      .replace('vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );',
        'vec4 bw = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ); bw.x += uBend * bw.z * bw.z; vec4 mvPosition = viewMatrix * bw;');
  };
  mat.needsUpdate = true;
}

export function bendTree(root: THREE.Object3D): void {
  root.traverse(o => {
    const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    (Array.isArray(material) ? material : [material]).forEach(bendify);
  });
}
