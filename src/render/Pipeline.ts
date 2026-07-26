import * as THREE from 'three';
import type { EngineContext } from '@/types/engine.ts';
import type { RenderPipeline } from '@/types/render.ts';
import { PostStack } from '@/render/post/PostStack.ts';

export class RenderPipelineImpl implements RenderPipeline {
  readonly post: PostStack;

  #hdrTarget: THREE.WebGLRenderTarget;
  #width = 1;
  #height = 1;
  #fogColor = new THREE.Color(0x9ec4e8);
  // Post-stack grade density (not scene FogExp2). Keep tiny to avoid white-wash.
  #fogDensity = 0.04;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.post = new PostStack(renderer);
    this.#hdrTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
    });
    this.#hdrTarget.depthTexture = new THREE.DepthTexture(1, 1);
  }

  setSize(width: number, height: number, _dpr: number): void {
    this.#width = width;
    this.#height = height;
    this.#hdrTarget.setSize(width, height);
    if (this.#hdrTarget.depthTexture) {
      this.#hdrTarget.depthTexture.image.width = width;
      this.#hdrTarget.depthTexture.image.height = height;
    }
    this.post.setSize(width, height);
  }

  setFog(color: THREE.Color, density: number): void {
    this.#fogColor.copy(color);
    this.#fogDensity = density;
  }

  render(ctx: EngineContext): void {
    const { renderer, scene, camera, settings } = ctx;

    renderer.shadowMap.enabled = settings.shadowsEnabled;

    renderer.setRenderTarget(this.#hdrTarget);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    this.post.apply(this.#hdrTarget.texture, settings, this.#fogColor, this.#fogDensity);
  }

  dispose(): void {
    this.#hdrTarget.dispose();
    this.post.dispose();
  }
}

/** Alias used by main boot path. */
export class ForwardPipeline extends RenderPipelineImpl {
  constructor(
    renderer: THREE.WebGLRenderer,
    width?: number,
    height?: number
  ) {
    super(renderer);
    if (width && height) this.setSize(width, height, 1);
  }
}
