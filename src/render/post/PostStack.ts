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
uniform sampler2D tDepth;
uniform float bloomStrength;
uniform float exposure;
uniform float vignette;
uniform float contactStrength;
uniform float aerialStrength;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 sunDirView;
uniform vec3 fogColor;
uniform vec2 resolution;
varying vec2 vUv;

float perspectiveDepthToViewZ(const in float depth, const in float near, const in float far) {
  return (near * far) / ((far - near) * depth - far);
}

float sampleViewZ(const in vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return perspectiveDepthToViewZ(d, cameraNear, cameraFar);
}

// Screen-space directional cast shadows: march toward the sun looking for occluders.
// Long steps sell chase-scale tree/rider stripes when ortho maps thin out at range.
float castShadow(const in vec2 uv, const in float depth) {
  if (contactStrength < 0.001 || depth >= 0.9999) return 1.0;

  float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  // Skip sky / extremely far samples (keep mid-groom casts alive).
  if (-viewZ > 520.0) return 1.0;

  vec3 dir = normalize(sunDirView);
  // Keep a slight camera-facing bias so grazing sun still finds rider/trunk occluders.
  if (dir.z > -0.015) dir.z = -0.015;

  float occ = 0.0;
  vec2 invRes = 1.0 / resolution;

  // Phase A — long cast (≈32 m): readable striped umbra under trees/rider on groom.
  float stepLong = 0.55;
  for (int i = 1; i <= 58; i++) {
    float t = float(i);
    float wz = viewZ + dir.z * stepLong * t;
    float scale = stepLong * t / max(abs(viewZ), 0.5);
    // Stretch UV travel for grazing late sun (long lateral stripes).
    vec2 suv = uv + dir.xy * scale * 0.95;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;

    float sampleDepth = texture2D(tDepth, suv).x;
    if (sampleDepth >= 0.9999) continue;
    float sz = perspectiveDepthToViewZ(sampleDepth, cameraNear, cameraFar);

    float thickness = 1.35 + t * 0.028;
    if (sz > wz - 0.05 && sz < wz + thickness) {
      float w = 1.0 - t / 58.0;
      occ += w * w * 1.45;
    }
  }

  // Phase B — tight contact puddles under feet / trunks.
  float stepShort = 0.1;
  for (int i = 1; i <= 12; i++) {
    float t = float(i);
    float wz = viewZ + dir.z * stepShort * t;
    float scale = stepShort * t / max(abs(viewZ), 0.5);
    vec2 suv = uv + dir.xy * scale * 0.62;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;

    float sampleDepth = texture2D(tDepth, suv).x;
    if (sampleDepth >= 0.9999) continue;
    float sz = perspectiveDepthToViewZ(sampleDepth, cameraNear, cameraFar);

    if (sz > wz - 0.02 && sz < wz + 0.6) {
      float w = 1.0 - t / 12.0;
      occ += w * w * 1.05;
    }

    vec2 nUv = uv + invRes * vec2(float(i) * 0.7, float(i) * -0.35);
    float nz = sampleViewZ(nUv);
    float diff = nz - viewZ;
    if (diff > 0.03 && diff < 1.35) {
      occ += 0.22 * (1.0 - diff / 1.35);
    }
  }

  occ = clamp(occ * 0.52, 0.0, 1.0);
  // Deep umbra so long casts read on dark corduroy, not just bright powder.
  return mix(1.0, 1.0 - occ * 0.97, contactStrength);
}

// Depth aerial haze — cool navy lift that reveals mountain mass (NOT milk whiteout).
vec3 applyAerial(const in vec3 col, const in float depth) {
  if (aerialStrength < 0.001) return col;

  float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  float dist = max(-viewZ, 0.0);

  // Near stays crisp; only mid/far get cool aerial (preserve peak form).
  float haze = 1.0 - exp(-dist * 0.00078);
  haze = clamp(haze, 0.0, 0.52) * aerialStrength;

  // Soft sky cue — never a bright wash that erases silhouette.
  float skyBoost = smoothstep(0.985, 0.9998, depth) * 0.14 * aerialStrength;

  // Thin horizon band; keep midfield geometry readable.
  float horizon = smoothstep(0.55, 0.02, vUv.y) * 0.12 * aerialStrength;

  // Cool navy grade from fogColor — desaturate + darken slightly so mass reads.
  vec3 cool = mix(fogColor, vec3(0.38, 0.48, 0.62), 0.55);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // Keep some of the original luminance so peaks don't flatten to blank fill.
  vec3 grade = mix(cool, cool * (0.55 + luma * 0.55), 0.4);

  float amt = clamp(haze * 0.55 + horizon + skyBoost, 0.0, 0.48);
  return mix(col, grade, amt);
}

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

  float depth = texture2D(tDepth, vUv).x;
  float shadow = castShadow(vUv, depth);
  col *= shadow;

  col = applyAerial(col, depth);

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

export type PostApplyExtras = {
  depth?: THREE.Texture | null;
  camera?: THREE.PerspectiveCamera | THREE.Camera;
  sunDirView?: THREE.Vector3;
};

export class PostStack {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly quad: THREE.Mesh;

  #tonemapMat: THREE.ShaderMaterial;
  #fxaaMat: THREE.ShaderMaterial;
  #bloomTarget: THREE.WebGLRenderTarget;
  #fxaaTarget: THREE.WebGLRenderTarget;
  #dummyDepth: THREE.DataTexture;
  #resolution = new THREE.Vector2(1, 1);

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.#dummyDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.#dummyDepth.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(2, 2);
    this.#tonemapMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: TONEMAP_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        tDepth: { value: this.#dummyDepth },
        vignette: { value: 0.2 },
        exposure: { value: 0.9 },
        bloomStrength: { value: 0.1 },
        contactStrength: { value: 0 },
        aerialStrength: { value: 1 },
        cameraNear: { value: 0.45 },
        cameraFar: { value: 8000 },
        sunDirView: { value: new THREE.Vector3(0.86, 0.24, 0.45) },
        fogColor: { value: new THREE.Color(0x7a8fa8) },
        resolution: { value: this.#resolution },
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
    this.#resolution.set(w, h);
    (this.#fxaaMat.uniforms.resolution!.value as THREE.Vector2).set(w, h);
  }

  apply(
    hdrColor: THREE.Texture,
    settings: QualitySettings,
    fogColor: THREE.Color,
    fogDensity: number,
    extras: PostApplyExtras = {}
  ): void {
    // Post fog must stay ~0 — ignore any non-zero grade density (white-out guard).
    void fogDensity;

    const depthTex = extras.depth ?? this.#dummyDepth;
    const cam = extras.camera;
    const near = cam && 'near' in cam ? cam.near : 0.45;
    const far = cam && 'far' in cam ? cam.far : 8000;

    let bloomTex = hdrColor;
    if (settings.bloomEnabled) {
      // Bright-ish downsample proxy: exposure-only, no fog/vignette wash into bloom.
      this.renderer.setRenderTarget(this.#bloomTarget);
      this.renderer.clear();
      this.#tonemapMat.uniforms.tDiffuse!.value = hdrColor;
      this.#tonemapMat.uniforms.tBloom!.value = hdrColor;
      this.#tonemapMat.uniforms.tDepth!.value = depthTex;
      this.#tonemapMat.uniforms.bloomStrength!.value = 0;
      this.#tonemapMat.uniforms.contactStrength!.value = 0;
      this.#tonemapMat.uniforms.aerialStrength!.value = 0;
      this.#tonemapMat.uniforms.exposure!.value = 0.95;
      this.#tonemapMat.uniforms.vignette!.value = 0;
      this.quad.material = this.#tonemapMat;
      this.renderer.render(this.scene, this.camera);
      bloomTex = this.#bloomTarget.texture;
    }

    this.#tonemapMat.uniforms.tDiffuse!.value = hdrColor;
    this.#tonemapMat.uniforms.tBloom!.value = bloomTex;
    this.#tonemapMat.uniforms.tDepth!.value = depthTex;
    this.#tonemapMat.uniforms.cameraNear!.value = near;
    this.#tonemapMat.uniforms.cameraFar!.value = far;
    (this.#tonemapMat.uniforms.fogColor!.value as THREE.Color).copy(fogColor);
    if (extras.sunDirView) {
      (this.#tonemapMat.uniforms.sunDirView!.value as THREE.Vector3).copy(extras.sunDirView);
    }
    // Always-on long SS casts when shadows or SSAO quality flag is set.
    this.#tonemapMat.uniforms.contactStrength!.value =
      settings.shadowsEnabled || settings.ssaoEnabled ? 1.15 : 0;
    // Cool aerial — depth-driven; fogDensity stays 0 (white-out guard).
    this.#tonemapMat.uniforms.aerialStrength!.value = 0.92;
    // Cap bloom so quality presets cannot re-whitewash alpine snow.
    this.#tonemapMat.uniforms.bloomStrength!.value = settings.bloomEnabled
      ? Math.min(settings.bloomIntensity, 0.35) * 0.14
      : 0;
    this.#tonemapMat.uniforms.exposure!.value = 0.95;
    this.#tonemapMat.uniforms.vignette!.value = settings.vignetteEnabled ? 0.18 : 0;

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
    this.#dummyDepth.dispose();
    this.quad.geometry.dispose();
  }
}
