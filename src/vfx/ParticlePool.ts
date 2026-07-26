import * as THREE from 'three';
import { getSoftPointTexture } from './softPointTexture.ts';

export interface ParticlePoolOptions {
  capacity: number;
  color: number;
  size: number;
  opacity?: number;
  additive?: boolean;
  deadY?: number;
}

const VERT = /* glsl */ `
attribute float aSize;
uniform float uPixelRatio;
uniform float uSizeScale;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float depth = max(0.15, -mvPosition.z);
  gl_PointSize = aSize * uSizeScale * uPixelRatio * (45.0 / depth);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D uMap;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  float alpha = tex.a * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

/**
 * Fixed-capacity particle pool backed by one soft Points mesh.
 * Soft map + depthWrite:false keeps flakes readable against snow without z-fighting.
 */
export class ParticlePool {
  readonly points: THREE.Points;
  readonly capacity: number;

  readonly #pos: Float32Array;
  readonly #vel: Float32Array;
  readonly #life: Float32Array;
  readonly #maxLife: Float32Array;
  readonly #size: Float32Array;
  readonly #baseSize: Float32Array;
  readonly #attrPos: THREE.BufferAttribute;
  readonly #attrSize: THREE.BufferAttribute;
  readonly #mat: THREE.ShaderMaterial;
  readonly #deadY: number;
  #cursor = 0;
  #budget: number;

  constructor(opts: ParticlePoolOptions) {
    this.capacity = opts.capacity;
    this.#budget = opts.capacity;
    this.#deadY = opts.deadY ?? -999;

    this.#pos = new Float32Array(opts.capacity * 3);
    this.#vel = new Float32Array(opts.capacity * 3);
    this.#life = new Float32Array(opts.capacity);
    this.#maxLife = new Float32Array(opts.capacity);
    this.#size = new Float32Array(opts.capacity);
    this.#baseSize = new Float32Array(opts.capacity);

    for (let i = 0; i < opts.capacity; i++) {
      this.#pos[i * 3 + 1] = this.#deadY;
      this.#size[i] = opts.size;
      this.#baseSize[i] = opts.size;
    }

    const geo = new THREE.BufferGeometry();
    this.#attrPos = new THREE.BufferAttribute(this.#pos, 3);
    this.#attrPos.setUsage(THREE.DynamicDrawUsage);
    this.#attrSize = new THREE.BufferAttribute(this.#size, 1);
    this.#attrSize.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.#attrPos);
    geo.setAttribute('aSize', this.#attrSize);
    geo.setDrawRange(0, opts.capacity);

    this.#mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(opts.color) },
        uOpacity: { value: opts.opacity ?? 0.85 },
        uMap: { value: getSoftPointTexture() },
        uPixelRatio: { value: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1) },
        uSizeScale: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, this.#mat);
    this.points.frustumCulled = false;
  }

  get budget(): number {
    return this.#budget;
  }

  /** Cap live/spawned particles to respect settings.maxParticles share. */
  setBudget(n: number): void {
    this.#budget = Math.max(0, Math.min(this.capacity, Math.floor(n)));
    this.points.geometry.setDrawRange(0, this.#budget);
  }

  setPixelRatio(dpr: number): void {
    this.#mat.uniforms.uPixelRatio!.value = Math.min(2, dpr);
  }

  /** Screen-space multiplier for gl_PointSize (capture / readability boosts). */
  setSizeScale(scale: number): void {
    this.#mat.uniforms.uSizeScale!.value = Math.max(0.05, scale);
  }

  /** Spawn into the next free slot within the active budget. Returns index or -1. */
  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number
  ): number {
    if (this.#budget <= 0) return -1;
    const start = this.#cursor;
    let slot = -1;
    for (let n = 0; n < this.#budget; n++) {
      const i = (start + n) % this.#budget;
      if (this.#life[i]! > 0) continue;
      slot = i;
      break;
    }
    if (slot < 0) {
      let bestLife = Infinity;
      for (let i = 0; i < this.#budget; i++) {
        if (this.#life[i]! < bestLife) {
          bestLife = this.#life[i]!;
          slot = i;
        }
      }
    }
    this.#cursor = (slot + 1) % this.#budget;
    this.#pos[slot * 3] = x;
    this.#pos[slot * 3 + 1] = y;
    this.#pos[slot * 3 + 2] = z;
    this.#vel[slot * 3] = vx;
    this.#vel[slot * 3 + 1] = vy;
    this.#vel[slot * 3 + 2] = vz;
    this.#life[slot] = life;
    this.#maxLife[slot] = life;
    this.#baseSize[slot] = size;
    this.#size[slot] = size;
    return slot;
  }

  /** Integrate active particles with gravity/drag and life-based size fade. */
  update(dt: number, gravity = 0, drag = 0): number {
    let live = 0;
    const d = 1 - Math.min(0.98, drag * dt);
    for (let i = 0; i < this.#budget; i++) {
      let life = this.#life[i]!;
      if (life <= 0) {
        this.#pos[i * 3 + 1] = this.#deadY;
        continue;
      }
      life -= dt;
      this.#life[i] = life;
      if (life <= 0) {
        this.#pos[i * 3 + 1] = this.#deadY;
        continue;
      }
      this.#vel[i * 3]! *= d;
      this.#vel[i * 3 + 1]! = this.#vel[i * 3 + 1]! * d - gravity * dt;
      this.#vel[i * 3 + 2]! *= d;
      this.#pos[i * 3]! += this.#vel[i * 3]! * dt;
      this.#pos[i * 3 + 1]! += this.#vel[i * 3 + 1]! * dt;
      this.#pos[i * 3 + 2]! += this.#vel[i * 3 + 2]! * dt;
      const t = life / this.#maxLife[i]!;
      this.#size[i] = this.#baseSize[i]! * (0.3 + 0.7 * t);
      live++;
    }
    this.#attrPos.needsUpdate = true;
    this.#attrSize.needsUpdate = true;
    return live;
  }

  get positionArray(): Float32Array {
    return this.#pos;
  }

  get velocityArray(): Float32Array {
    return this.#vel;
  }

  get lifeArray(): Float32Array {
    return this.#life;
  }

  markPositionsDirty(): void {
    this.#attrPos.needsUpdate = true;
  }

  setOpacity(opacity: number): void {
    this.#mat.uniforms.uOpacity!.value = opacity;
  }

  setColor(color: number): void {
    (this.#mat.uniforms.uColor!.value as THREE.Color).set(color);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.#mat.dispose();
  }
}
