import * as THREE from 'three';

/** Short camera-relative streaks that read as speed when boosting / going fast. */
export class SpeedLines {
  readonly object: THREE.LineSegments;

  readonly #pos: Float32Array;
  readonly #life: Float32Array;
  readonly #attr: THREE.BufferAttribute;
  readonly capacity: number;
  #budget: number;
  #cursor = 0;

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.#budget = capacity;
    // 2 verts per segment
    this.#pos = new Float32Array(capacity * 2 * 3);
    this.#life = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.#life[i] = 0;

    const geo = new THREE.BufferGeometry();
    this.#attr = new THREE.BufferAttribute(this.#pos, 3);
    this.#attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.#attr);
    geo.setDrawRange(0, 0);

    this.object = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0xd8e8f8,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.object.frustumCulled = false;
  }

  setBudget(n: number): void {
    this.#budget = Math.max(0, Math.min(this.capacity, Math.floor(n)));
  }

  setOpacity(o: number): void {
    (this.object.material as THREE.LineBasicMaterial).opacity = o;
  }

  spawn(origin: THREE.Vector3, dir: THREE.Vector3, length: number): void {
    if (this.#budget <= 0) return;
    let slot = -1;
    for (let n = 0; n < this.#budget; n++) {
      const i = (this.#cursor + n) % this.#budget;
      if (this.#life[i]! <= 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) slot = this.#cursor % this.#budget;
    this.#cursor = (slot + 1) % Math.max(1, this.#budget);

    const a = slot * 6;
    this.#pos[a] = origin.x;
    this.#pos[a + 1] = origin.y;
    this.#pos[a + 2] = origin.z;
    this.#pos[a + 3] = origin.x - dir.x * length;
    this.#pos[a + 4] = origin.y - dir.y * length;
    this.#pos[a + 5] = origin.z - dir.z * length;
    this.#life[slot] = 0.12 + Math.random() * 0.1;
  }

  update(dt: number): void {
    let live = 0;
    for (let i = 0; i < this.#budget; i++) {
      if (this.#life[i]! <= 0) continue;
      this.#life[i]! -= dt;
      if (this.#life[i]! <= 0) {
        const a = i * 6;
        this.#pos[a] = 0;
        this.#pos[a + 1] = -9999;
        this.#pos[a + 2] = 0;
        this.#pos[a + 3] = 0;
        this.#pos[a + 4] = -9999;
        this.#pos[a + 5] = 0;
        continue;
      }
      live++;
    }
    this.#attr.needsUpdate = true;
    this.object.visible = live > 0;
    this.object.geometry.setDrawRange(0, this.#budget * 2);
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}
