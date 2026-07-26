import * as THREE from 'three';

const TRAIL_LEN = 48;

/** Soft fading board wake left in snow while carving at speed. */
export class BoardTrail {
  readonly object: THREE.Line;

  readonly #ring = new Float32Array(TRAIL_LEN * 3);
  readonly #drawPos: Float32Array;
  readonly #drawColor: Float32Array;
  readonly #attrPos: THREE.BufferAttribute;
  readonly #attrColor: THREE.BufferAttribute;
  #count = 0;
  #head = 0;
  #tmp = new THREE.Vector3();
  #right = new THREE.Vector3();
  #forward = new THREE.Vector3();

  constructor() {
    this.#drawPos = new Float32Array(TRAIL_LEN * 3);
    this.#drawColor = new Float32Array(TRAIL_LEN * 3);

    const geo = new THREE.BufferGeometry();
    this.#attrPos = new THREE.BufferAttribute(this.#drawPos, 3);
    this.#attrPos.setUsage(THREE.DynamicDrawUsage);
    this.#attrColor = new THREE.BufferAttribute(this.#drawColor, 3);
    this.#attrColor.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.#attrPos);
    geo.setAttribute('color', this.#attrColor);
    geo.setDrawRange(0, 0);

    this.object = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
    );
    this.object.frustumCulled = false;
  }

  push(
    position: THREE.Vector3,
    yaw: number,
    edgeAngle: number,
    grounded: boolean,
    speed: number
  ): void {
    if (!grounded || speed < 7) {
      this.fade();
      return;
    }

    this.#forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.#right.set(this.#forward.z, 0, -this.#forward.x);
    const side = Math.sign(edgeAngle || 1) * Math.min(0.35, Math.abs(edgeAngle) * 0.6 + 0.08);
    this.#tmp.copy(position).addScaledVector(this.#right, side);
    this.#tmp.y += 0.04;

    const i = this.#head % TRAIL_LEN;
    this.#ring[i * 3] = this.#tmp.x;
    this.#ring[i * 3 + 1] = this.#tmp.y;
    this.#ring[i * 3 + 2] = this.#tmp.z;
    this.#head++;
    this.#count = Math.min(TRAIL_LEN, this.#count + 1);
    this.#rebuild();
  }

  fade(): void {
    if (this.#count <= 0) return;
    this.#count = Math.max(0, this.#count - 2);
    this.#rebuild();
  }

  #rebuild(): void {
    if (this.#count < 2) {
      this.object.geometry.setDrawRange(0, 0);
      return;
    }

    const start = this.#head - this.#count;
    for (let n = 0; n < this.#count; n++) {
      const src = ((start + n) % TRAIL_LEN) * 3;
      const dst = n * 3;
      this.#drawPos[dst] = this.#ring[src]!;
      this.#drawPos[dst + 1] = this.#ring[src + 1]!;
      this.#drawPos[dst + 2] = this.#ring[src + 2]!;
      const age = n / (this.#count - 1);
      const a = age * age;
      this.#drawColor[dst] = 0.72 + 0.2 * a;
      this.#drawColor[dst + 1] = 0.84 + 0.12 * a;
      this.#drawColor[dst + 2] = 0.92 + 0.08 * a;
    }
    this.#attrPos.needsUpdate = true;
    this.#attrColor.needsUpdate = true;
    this.object.geometry.setDrawRange(0, this.#count);
  }

  setVisible(v: boolean): void {
    this.object.visible = v;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}
