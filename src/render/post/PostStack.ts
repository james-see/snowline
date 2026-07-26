import * as THREE from 'three';
import type { QualitySettings } from '@/types/settings.ts';

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const TONEMAP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float bloomStrength;
uniform float exposure;
uniform float vignette;
varying vec2 vUv;

vec3 agxTonemap(vec3 x) {
  const mat3 agx = mat3(
    0.842479, 0.078357, 0.076240,
    0.042328, 0.878404, 0.079268,
    0.001024, 0.045532, 0.953444
  );
  x = agx * max(x, 0.0);
  return clamp(pow(x, vec3(0.4545)), 0.0, 1.0);
}

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb * exposure;
  // Gentle bloom: only lift bright pixels, never re-add the full frame.
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  float luma = dot(bloom, vec3(0.2126, 0.7152, 0.0722));
  col += bloom * bloomStrength * smoothstep(0.72, 1.15, luma);
  col = agxTonemap(col);
  vec2 d = vUv - 0.5;
  col *= 1.0 - vignette * dot(d, d) * 1.8;
  gl_FragColor = vec4(col, 1.0);
}
`;

const FXAA_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 resolution;
varying vec2 vUv;

void main() {
  vec2 px = 1.0 / resolution;
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.25;
  c += texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb * 0.25;
  c += texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb * 0.25;
  c += texture2D(tDiffuse, vUv + px).rgb * 0.25;
  gl_FragColor = vec4(c, 1.0);
}
`;

export class PostStack {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly quad: THREE.Mesh;

  #tonemapMat: THREE.ShaderMaterial;
  #fxaaMat: THREE.ShaderMaterial;
  #bloomTarget: THREE.WebGLRenderTarget;
  #fxaaTarget: THREE.WebGLRenderTarget;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.#tonemapMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: TONEMAP_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        vignette: { value: 0.2 },
        exposure: { value: 0.88 },
        bloomStrength: { value: 0.1 },
      },
    });
    this.#fxaaMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FXAA_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
    });
    this.quad = new THREE.Mesh(geo, this.#tonemapMat);
    this.scene.add(this.quad);

    const rtOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
    };
    this.#bloomTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.#fxaaTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  }

  setSize(w: number, h: number): void {
    this.#bloomTarget.setSize(Math.floor(w / 2), Math.floor(h / 2));
    this.#fxaaTarget.setSize(w, h);
    (this.#fxaaMat.uniforms.resolution!.value as THREE.Vector2).set(w, h);
  }

  apply(
    hdrColor: THREE.Texture,
    settings: QualitySettings,
    _fogColor: THREE.Color,
    _fogDensity: number
  ): void {
    let bloomTex = hdrColor;
    if (settings.bloomEnabled) {
      // Bright-ish downsample proxy: exposure-only, no fog/vignette wash into bloom.
      this.renderer.setRenderTarget(this.#bloomTarget);
      this.renderer.clear();
      this.#tonemapMat.uniforms.tDiffuse!.value = hdrColor;
      this.#tonemapMat.uniforms.tBloom!.value = hdrColor;
      this.#tonemapMat.uniforms.bloomStrength!.value = 0;
      this.#tonemapMat.uniforms.exposure!.value = 0.95;
      this.#tonemapMat.uniforms.vignette!.value = 0;
      this.quad.material = this.#tonemapMat;
      this.renderer.render(this.scene, this.camera);
      bloomTex = this.#bloomTarget.texture;
    }

    this.#tonemapMat.uniforms.tDiffuse!.value = hdrColor;
    this.#tonemapMat.uniforms.tBloom!.value = bloomTex;
    // Cap bloom so quality presets cannot re-whitewash alpine snow.
    this.#tonemapMat.uniforms.bloomStrength!.value = settings.bloomEnabled
      ? Math.min(settings.bloomIntensity, 0.4) * 0.22
      : 0;
    this.#tonemapMat.uniforms.exposure!.value = 0.88;
    this.#tonemapMat.uniforms.vignette!.value = settings.vignetteEnabled ? 0.2 : 0;

    this.quad.material = this.#tonemapMat;

    if (settings.antialias === 'fxaa') {
      this.renderer.setRenderTarget(this.#fxaaTarget);
      this.renderer.render(this.scene, this.camera);
      this.#fxaaMat.uniforms.tDiffuse!.value = this.#fxaaTarget.texture;
      this.renderer.setRenderTarget(null);
      this.quad.material = this.#fxaaMat;
      this.renderer.render(this.scene, this.camera);
      this.quad.material = this.#tonemapMat;
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose(): void {
    this.#bloomTarget.dispose();
    this.#fxaaTarget.dispose();
    this.#tonemapMat.dispose();
    this.#fxaaMat.dispose();
    this.quad.geometry.dispose();
  }
}
