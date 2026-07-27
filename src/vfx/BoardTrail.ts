import * as THREE from 'three';

const TRAIL_LEN = 56;
/** Cross-section verts per sample: outerL, grooveL, grooveR, outerR. */
const CROSS = 4;
const VERTS = TRAIL_LEN * CROSS;
const MAX_TRIS = (TRAIL_LEN - 1) * (CROSS - 1) * 2;

const VERT = /* glsl */ `
attribute vec3 color;
attribute float aAcross;
attribute float aAge;
varying vec3 vColor;
varying float vAcross;
varying float vAge;
void main() {
  vColor = color;
  vAcross = aAcross;
  vAge = aAge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAcross;
varying float vAge;
void main() {
  float across = abs(vAcross);
  // Soft ribbon edges + darker packed groove down the middle.
  float edge = smoothstep(1.0, 0.42, across);
  float groove = mix(0.78, 1.0, smoothstep(0.0, 0.55, across));
  float ageFade = 1.0 - vAge * vAge;
  float alpha = edge * ageFade * uOpacity;
  if (alpha < 0.02) discard;
  vec3 col = vColor * groove;
  // Slight cool shadow in the cut so it reads as displaced snow, not chalk.
  col *= mix(vec3(0.88, 0.92, 0.96), vec3(1.0), across);
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Soft carved-snow wake: a short ribbon with a shallow center groove,
 * not a single Line stroke.
 */
export class BoardTrail {
  readonly object: THREE.Mesh;

  readonly #ringPos = new Float32Array(TRAIL_LEN * 3);
  readonly #ringRight = new Float32Array(TRAIL_LEN * 3);
  readonly #ringHalfW = new Float32Array(TRAIL_LEN);
  readonly #pos = new Float32Array(VERTS * 3);
  readonly #color = new Float32Array(VERTS * 3);
  readonly #across = new Float32Array(VERTS);
  readonly #age = new Float32Array(VERTS);
  readonly #index = new Uint16Array(MAX_TRIS * 3);
  readonly #attrPos: THREE.BufferAttribute;
  readonly #attrColor: THREE.BufferAttribute;
  readonly #attrAcross: THREE.BufferAttribute;
  readonly #attrAge: THREE.BufferAttribute;
  readonly #mat: THREE.ShaderMaterial;
  #count = 0;
  #head = 0;
  #tmp = new THREE.Vector3();
  #right = new THREE.Vector3();
  #forward = new THREE.Vector3();

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.#attrPos = new THREE.BufferAttribute(this.#pos, 3);
    this.#attrPos.setUsage(THREE.DynamicDrawUsage);
    this.#attrColor = new THREE.BufferAttribute(this.#color, 3);
    this.#attrColor.setUsage(THREE.DynamicDrawUsage);
    this.#attrAcross = new THREE.BufferAttribute(this.#across, 1);
    this.#attrAcross.setUsage(THREE.DynamicDrawUsage);
    this.#attrAge = new THREE.BufferAttribute(this.#age, 1);
    this.#attrAge.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.#attrPos);
    geo.setAttribute('color', this.#attrColor);
    geo.setAttribute('aAcross', this.#attrAcross);
    geo.setAttribute('aAge', this.#attrAge);
    geo.setIndex(new THREE.BufferAttribute(this.#index, 1));
    geo.setDrawRange(0, 0);

    this.#mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.78 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });

    this.object = new THREE.Mesh(geo, this.#mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 1;
  }

  push(
    position: THREE.Vector3,
    yaw: number,
    edgeAngle: number,
    grounded: boolean,
    speed: number
  ): void {
    if (!grounded || speed < 6.5) {
      this.fade();
      return;
    }

    this.#forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.#right.set(this.#forward.z, 0, -this.#forward.x);
    const edge = Math.abs(edgeAngle);
    const side = Math.sign(edgeAngle || 1) * Math.min(0.28, edge * 0.45 + 0.04);
    // Wider when edged hard / faster — reads as a carved cut, not a hairline.
    const halfW = THREE.MathUtils.clamp(0.22 + edge * 0.55 + (speed - 7) * 0.006, 0.2, 0.72);

    this.#tmp.copy(position).addScaledVector(this.#right, side);
    this.#tmp.y += 0.025;

    const i = this.#head % TRAIL_LEN;
    this.#ringPos[i * 3] = this.#tmp.x;
    this.#ringPos[i * 3 + 1] = this.#tmp.y;
    this.#ringPos[i * 3 + 2] = this.#tmp.z;
    this.#ringRight[i * 3] = this.#right.x;
    this.#ringRight[i * 3 + 1] = this.#right.y;
    this.#ringRight[i * 3 + 2] = this.#right.z;
    this.#ringHalfW[i] = halfW;
    this.#head++;
    this.#count = Math.min(TRAIL_LEN, this.#count + 1);
    this.#rebuild();
  }

  fade(): void {
    if (this.#count <= 0) return;
    this.#count = Math.max(0, this.#count - 2);
    this.#rebuild();
  }

  clear(): void {
    this.#count = 0;
    this.#head = 0;
    this.object.geometry.setDrawRange(0, 0);
  }

  #rebuild(): void {
    if (this.#count < 2) {
      this.object.geometry.setDrawRange(0, 0);
      return;
    }

    const start = this.#head - this.#count;
    // Across weights: outer / groove lips (shallow V cut).
    const ACROSS = [-1, -0.28, 0.28, 1];
    const SIDE = [-1, -1, 1, 1];
    const WIDTH_MUL = [1, 0.38, 0.38, 1];
    const Y_BIAS = [0.01, -0.018, -0.018, 0.01];

    for (let n = 0; n < this.#count; n++) {
      const src = (start + n) % TRAIL_LEN;
      const px = this.#ringPos[src * 3]!;
      const py = this.#ringPos[src * 3 + 1]!;
      const pz = this.#ringPos[src * 3 + 2]!;
      const rx = this.#ringRight[src * 3]!;
      const rz = this.#ringRight[src * 3 + 2]!;
      const half = this.#ringHalfW[src]!;
      const age = 1 - n / (this.#count - 1);
      const a = 1 - age;
      // Fresh cut brighter / bluer; older wash toward pack snow.
      const cr = 0.78 + 0.16 * a;
      const cg = 0.88 + 0.08 * a;
      const cb = 0.94 + 0.04 * a;

      for (let c = 0; c < CROSS; c++) {
        const dst = (n * CROSS + c) * 3;
        const w = half * WIDTH_MUL[c]!;
        const side = SIDE[c]!;
        this.#pos[dst] = px + rx * side * w;
        this.#pos[dst + 1] = py + Y_BIAS[c]!;
        this.#pos[dst + 2] = pz + rz * side * w;
        this.#color[dst] = cr;
        this.#color[dst + 1] = cg;
        this.#color[dst + 2] = cb;
        this.#across[n * CROSS + c] = ACROSS[c]!;
        this.#age[n * CROSS + c] = age;
      }
    }

    let idx = 0;
    for (let n = 0; n < this.#count - 1; n++) {
      const b0 = n * CROSS;
      const b1 = (n + 1) * CROSS;
      for (let c = 0; c < CROSS - 1; c++) {
        const a = b0 + c;
        const b = b0 + c + 1;
        const d = b1 + c;
        const e = b1 + c + 1;
        this.#index[idx++] = a;
        this.#index[idx++] = d;
        this.#index[idx++] = b;
        this.#index[idx++] = b;
        this.#index[idx++] = d;
        this.#index[idx++] = e;
      }
    }

    this.#attrPos.needsUpdate = true;
    this.#attrColor.needsUpdate = true;
    this.#attrAcross.needsUpdate = true;
    this.#attrAge.needsUpdate = true;
    const indexAttr = this.object.geometry.getIndex();
    if (indexAttr) indexAttr.needsUpdate = true;
    this.object.geometry.setDrawRange(0, idx);
  }

  setVisible(v: boolean): void {
    this.object.visible = v;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.#mat.dispose();
  }
}
