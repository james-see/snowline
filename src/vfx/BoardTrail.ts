import * as THREE from 'three';

const TRAIL_LEN = 64;
/**
 * Cross-section (board-wake language from user refs):
 * outerL → grooveL → packL → center → packR → grooveR → outerR
 * Dual dark edge grooves + brighter flattened packed center; soft feathered lips.
 */
const CROSS = 7;
const VERTS = TRAIL_LEN * CROSS;
const MAX_TRIS = (TRAIL_LEN - 1) * (CROSS - 1) * 2;

/**
 * Match `MaterialLibrary` packed snow — warmer groom, not cool VFX blue.
 * Kept as linear RGB so the trail shares terrain albedo language.
 */
const PACKED_ALBEDO = new THREE.Color(0xc4c8cc);
/** Flattened bright pack in the board center (compressed, sun-facing). */
const CENTER_ALBEDO = new THREE.Color(0xd8dce0);
/** Edge-groove compressed snow — darker AO floor in the ruts. */
const GROOVE_ALBEDO = new THREE.Color(0x6a6560);

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
  // Dual-groove trough: normals tip toward the nearest rut so AO catches light.
  float grooveSide = sign(vAcross) * smoothstep(0.2, 0.55, abs(vAcross));
  float tilt = grooveSide * 0.38 - vAcross * 0.08;
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
  // Soft feather at outer lips only — never a hard arcade stripe.
  float edge = smoothstep(1.0, 0.62, across);
  // Dual-edge groove AO peaks near the rails (~0.55), not the center.
  float groove = smoothstep(0.18, 0.48, across) * (1.0 - smoothstep(0.58, 0.92, across));
  // Flattened packed center reads brighter than the ruts.
  float center = 1.0 - smoothstep(0.0, 0.32, across);
  // Age softens the scar; keep recent meters readable as carved snow.
  float ageFade = mix(0.5, 1.0, 1.0 - vAge);
  float alpha = edge * ageFade * uOpacity;
  if (alpha < 0.04) discard;

  vec3 col = vColor;
  // Contact shadow / AO in the ruts — never emissive chalk.
  col *= mix(1.0, 0.52, groove);
  // Packed center lift (flattened corduroy) — brighter, not glowing.
  col *= mix(1.0, 1.1, center);

  // Lambert + soft hemi so the strip shares scene lighting (never additive/emissive).
  vec3 N = normalize(vWorldNormal);
  float ndl = max(0.0, dot(N, normalize(uSunDir)));
  float hemi = 0.52 + 0.48 * ndl;
  // Extra shade in groove floors when facing away from sun.
  hemi *= mix(1.0, 0.78 + 0.22 * ndl, groove);
  col *= hemi;

  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Dual-edge carved snow trail: dark parallel ruts + brighter packed center.
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
  #center = CENTER_ALBEDO.clone();
  #groove = GROOVE_ALBEDO.clone();
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
        uOpacity: { value: 0.94 },
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
    // Leave a carved channel once moving; edge deepens the rail grooves.
    if (!grounded || speed < 3.5) {
      this.fade();
      return;
    }

    this.#forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.#right.set(this.#forward.z, 0, -this.#forward.x);
    const edge = Math.abs(edgeAngle);
    const side = Math.sign(edgeAngle || 1) * Math.min(0.22, edge * 0.38 + 0.03);
    // Board-scale wake — dual rail grooves, not a fat neon ribbon.
    const halfW = THREE.MathUtils.clamp(0.2 + edge * 0.42 + (speed - 5) * 0.005, 0.18, 0.55);

    this.#tmp.copy(position).addScaledVector(this.#right, side);
    // Keep the strip *on* the snow mesh (depth-tested). Depression reads via
    // AO + groove albedo — burying geometry under the groom just occludes it.
    this.#tmp.y += 0.03;

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
    // outer / groove / pack / center / pack / groove / outer
    const ACROSS = [-1, -0.62, -0.28, 0, 0.28, 0.62, 1];
    const SIDE = [-1, -1, -1, 0, 1, 1, 1];
    const WIDTH_MUL = [1, 0.78, 0.42, 0, 0.42, 0.78, 1];
    // Groove floors sit lowest; center is a shallow packed shelf between ruts.
    const Y_BIAS = [0.008, -0.016, -0.004, -0.002, -0.004, -0.016, 0.008];
    // 0 = outer groom, 1 = groove AO, 2 = bright center pack
    const ROLE = [0, 1, 2, 2, 2, 1, 0] as const;

    for (let n = 0; n < this.#count; n++) {
      const src = (start + n) % TRAIL_LEN;
      const px = this.#ringPos[src * 3]!;
      const py = this.#ringPos[src * 3 + 1]!;
      const pz = this.#ringPos[src * 3 + 2]!;
      const rx = this.#ringRight[src * 3]!;
      const rz = this.#ringRight[src * 3 + 2]!;
      const half = this.#ringHalfW[src]!;
      const age = 1 - n / (this.#count - 1);
      const fresh = 1 - age;

      for (let c = 0; c < CROSS; c++) {
        const dst = (n * CROSS + c) * 3;
        const w = half * WIDTH_MUL[c]!;
        const side = SIDE[c]!;
        this.#pos[dst] = px + rx * side * w;
        this.#pos[dst + 1] = py + Y_BIAS[c]!;
        this.#pos[dst + 2] = pz + rz * side * w;

        const role = ROLE[c]!;
        if (role === 1) {
          // Groove: dark AO floor, fresher = deeper pack dirt.
          this.#mix.copy(this.#packed).lerp(this.#groove, 0.55 + 0.4 * fresh);
        } else if (role === 2) {
          // Center: brighter flattened pack.
          this.#mix.copy(this.#packed).lerp(this.#center, 0.45 + 0.4 * fresh);
        } else {
          // Outer lip: near groom, soft fade handled in shader.
          this.#mix.copy(this.#packed).lerp(this.#center, 0.12 * fresh);
        }
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
