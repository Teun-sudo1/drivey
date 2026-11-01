import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Stage } from './stage';

/** Bloom runs in WebGL; vignette and grain are cheap CSS layers over the canvas (see layout.css). */
export class PostFx {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  constructor(private readonly stage: Stage) {
    this.composer = new EffectComposer(stage.renderer);
    this.composer.addPass(new RenderPass(stage.scene, stage.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.55, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    stage.onResize((w, h, pixelRatio) => {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(w, h);
    });
  }

  set bloomStrength(v: number) {
    this.bloom.strength = v;
  }

  render(bloomEnabled: boolean): void {
    if (bloomEnabled) this.composer.render();
    else this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }
}
