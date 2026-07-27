import * as THREE from 'three';

const TRAIL_LEN = 56;
/** Cross-section: outerL, lipL, floor, lipR, outerR — reads as a packed channel. */
const CROSS = 5;
const VERTS = TRAIL_LEN * CROSS;
const MAX_TRIS = (TRAIL_LEN - 1) * (CROSS - 1) * 2;

/**
 * Match `MaterialLibrary` packed snow (`0xb2a898`) — warmer groom, not cool VFX blue.
 * Kept as linear RGB so the trail shares terrain albedo language.
 */
const PACKED_ALBEDO = new THREE.Color(0xb2a898);
/** Compressed carve floor — denser / dirtier pack (flattened corduroy channel). */
const COMPRESSED_ALBEDO = new THREE.Color(0x5e574e);

/** Same alpine key as MaterialLibrary sun response — keeps the strip lit, not emissive. */
const SUN_DIR = new THREE.Vector3(0.86, 0.24, 0.45).normalize();

const VERT = /* glsl */ `
attribute vec3 color;
attribute float aAcross;
attribute float aAge;
varying vec3 vColor;
varying float vAcross;
varying float vAge;
varying vec3 vWorldNormal;
void main() {
  vColor = color;
  vAcross = aAcross;
  vAge = aAge;
  // Ribbon faces mostly up; slight trough tilt from across so the channel catches light.
  float tilt = vAcross * 0.22;
  vec3 localN = normalize(vec3(tilt, 1.0, 0.0));
  vWorldNormal = normalize(mat3(modelMatrix) * localN);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uOpacity;
uniform vec3 uSunDir;
varying vec3 vColor;
varying float vAcross;
varying float vAge;
varying vec3 vWorldNormal;
void main() {
  float across = abs(vAcross);
  // Narrow feather at the lips only — floor stays a solid packed scar.
  float edge = smoothstep(1.0, 0.55, across);
  // Center AO / denser pack (never a bright / emissive groove).
  float channel = 1.0 - smoothstep(0.0, 0.75, across);
  // Age softens the scar; keep recent meters readable as compressed snow.
  float ageFade = mix(0.55, 1.0, 1.0 - vAge);
  float alpha = edge * ageFade * uOpacity;
  if (alpha < 0.05) discard;

  vec3 col = vColor;
  // Contact shadow in the cut — compression reads as darker pack, not chalk.
  col *= mix(0.96, 0.62, channel);

  // Lambert + soft hemi so the strip shares scene lighting (never additive/emissive).
  vec3 N = normalize(vWorldNormal);
  float ndl = max(0.0, dot(N, normalize(uSunDir)));
  float hemi = 0.55 + 0.45 * ndl;
  col *= hemi;

  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Carved packed-snow channel: denser/darker groom trough with a slight depression.
 * Intentionally not a glowing / translucent VFX ribbon.
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
  #packed = PACKED_ALBEDO.clone();
  #compressed = COMPRESSED_ALBEDO.clone();
  #mix = new THREE.Color();

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
      uniforms: {
        // Near-opaque pack floor; only lips feather into corduroy.
        uOpacity: { value: 0.96 },
        uSunDir: { value: SUN_DIR.clone() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      // Bias toward camera so the channel sits on groom without z-fight sparkle.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
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
    // Leave a packed channel once moving; edge deepens/densifies it.
    if (!grounded || speed < 3.5) {
      this.fade();
      return;
    }

    this.#forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.#right.set(this.#forward.z, 0, -this.#forward.x);
    const edge = Math.abs(edgeAngle);
    const side = Math.sign(edgeAngle || 1) * Math.min(0.22, edge * 0.38 + 0.03);
    // Board-scale channel — compressed pack width, not a fat neon ribbon.
    const halfW = THREE.MathUtils.clamp(0.16 + edge * 0.38 + (speed - 5) * 0.004, 0.14, 0.48);

    this.#tmp.copy(position).addScaledVector(this.#right, side);
    // Keep the strip *on* the snow mesh (depth-tested). Depression reads via
    // AO + denser albedo — burying geometry under the groom just occludes it.
    this.#tmp.y += 0.028;

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
    // Linger as a packed scar briefly after air / slow — not an instant VFX kill.
    this.#count = Math.max(0, this.#count - 1);
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
    // outer / lip / floor / lip / outer — shallow trough; depth is shading, not z-bury.
    const ACROSS = [-1, -0.55, 0, 0.55, 1];
    const SIDE = [-1, -1, 0, 1, 1];
    const WIDTH_MUL = [1, 0.72, 0, 0.72, 1];
    const Y_BIAS = [0.006, 0.0, -0.01, 0.0, 0.006];
    // How compressed each column reads (1 = floor pack).
    const PACK = [0.35, 0.8, 1, 0.8, 0.35];

    for (let n = 0; n < this.#count; n++) {
      const src = (start + n) % TRAIL_LEN;
      const px = this.#ringPos[src * 3]!;
      const py = this.#ringPos[src * 3 + 1]!;
      const pz = this.#ringPos[src * 3 + 2]!;
      const rx = this.#ringRight[src * 3]!;
      const rz = this.#ringRight[src * 3 + 2]!;
      const half = this.#ringHalfW[src]!;
      const age = 1 - n / (this.#count - 1);
      // Fresh cut = denser pack; older samples wash toward groom albedo then fade via aAge.
      const fresh = 1 - age;

      for (let c = 0; c < CROSS; c++) {
        const dst = (n * CROSS + c) * 3;
        const w = half * WIDTH_MUL[c]!;
        const side = SIDE[c]!;
        this.#pos[dst] = px + rx * side * w;
        this.#pos[dst + 1] = py + Y_BIAS[c]!;
        this.#pos[dst + 2] = pz + rz * side * w;

        const packAmt = PACK[c]! * (0.55 + 0.45 * fresh);
        this.#mix.copy(this.#packed).lerp(this.#compressed, packAmt);
        this.#color[dst] = this.#mix.r;
        this.#color[dst + 1] = this.#mix.g;
        this.#color[dst + 2] = this.#mix.b;
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
