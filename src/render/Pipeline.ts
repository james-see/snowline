import * as THREE from 'three';
import type { EngineContext } from '@/types/engine.ts';
import type { RenderPipeline } from '@/types/render.ts';
import { PostStack } from '@/render/post/PostStack.ts';

export class RenderPipelineImpl implements RenderPipeline {
  readonly post: PostStack;

  #hdrTarget: THREE.WebGLRenderTarget;
  #width = 1;
  #height = 1;
  #fogColor = new THREE.Color(0xc5b8a8);
  // Post-stack grade density (not scene FogExp2). Zero = no UV fog wash.
  #fogDensity = 0;
  #sunDirWorld = new THREE.Vector3(0.82, 0.34, 0.46).normalize();
  #sunDirView = new THREE.Vector3();
  #viewMatrix = new THREE.Matrix4();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.post = new PostStack(renderer);
    const depth = new THREE.DepthTexture(1, 1);
    depth.format = THREE.DepthFormat;
    depth.type = THREE.UnsignedIntType;
    this.#hdrTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      depthTexture: depth,
    });
  }

  setSize(width: number, height: number, _dpr: number): void {
    this.#width = width;
    this.#height = height;
    this.#hdrTarget.setSize(width, height);
    this.post.setSize(width, height);
  }

  setFog(color: THREE.Color, density: number): void {
    this.#fogColor.copy(color);
    // Hard clamp — never reintroduce white-out UV fog from callers.
    void density;
    this.#fogDensity = 0;
  }

  render(ctx: EngineContext): void {
    const { renderer, scene, camera, settings } = ctx;

    renderer.shadowMap.enabled = settings.shadowsEnabled;

    this.#updateSunDirection(scene, camera);

    renderer.setRenderTarget(this.#hdrTarget);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    this.post.apply(
      this.#hdrTarget.texture,
      settings,
      this.#fogColor,
      this.#fogDensity,
      {
        depth: this.#hdrTarget.depthTexture,
        camera,
        sunDirView: this.#sunDirView,
      }
    );
  }

  #updateSunDirection(scene: THREE.Scene, camera: THREE.Camera): void {
    let found = false;
    scene.traverse((obj) => {
      if (found || !(obj instanceof THREE.DirectionalLight)) return;
      if (!obj.castShadow && obj.intensity < 1) return;
      this.#sunDirWorld.subVectors(obj.position, obj.target.position).normalize();
      found = true;
    });
    this.#viewMatrix.copy(camera.matrixWorldInverse);
    this.#sunDirView.copy(this.#sunDirWorld).transformDirection(this.#viewMatrix).normalize();
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
