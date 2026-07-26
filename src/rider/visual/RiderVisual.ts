import * as THREE from 'three';
import type { EngineContext } from '@/types/engine.ts';
import type { BoardPhysics } from '@/rider/BoardPhysics.ts';
import { buildProceduralRig, type ProceduralRig } from './buildProceduralRig.ts';
import { resolveCosmetics, type RiderCosmetics } from './cosmetics.ts';
import { tryLoadRiderGltf, type LoadedRiderGltf } from './loadRiderGltf.ts';

const LEAN_FOLLOW = 10;
const LEAN_BODY = 0.34;
const LEAN_HIP = 0.12;
const MENU_SCREENS = new Set(['title', 'course', 'mode', 'settings']);

/**
 * Rider + board scene graph: glTF when present under public/assets, else
 * procedural silhouette. Owns run visibility and cosmetic tint hooks.
 */
export class RiderVisual {
  readonly root = new THREE.Group();

  #procedural: ProceduralRig | null = null;
  #gltf: LoadedRiderGltf | null = null;
  #body: THREE.Object3D;
  #lean = 0;
  #cosmetics: RiderCosmetics = resolveCosmetics();
  #mounted = false;
  #usingGltf = false;

  constructor() {
    this.root.name = 'riderRoot';
    this.root.visible = false;
    this.#procedural = buildProceduralRig();
    this.#body = this.#procedural.body;
    this.root.add(this.#procedural.root);
    this.applyCosmetics(this.#cosmetics);
  }

  get usingGltf(): boolean {
    return this.#usingGltf;
  }

  get cosmetics(): RiderCosmetics {
    return this.#cosmetics;
  }

  /** Attach to scene, wire run visibility, optionally upgrade to glTF. */
  mount(ctx: EngineContext): void {
    if (this.#mounted) return;
    this.#mounted = true;
    ctx.scene.add(this.root);
    this.root.visible = false;

    ctx.events.on('run:start', () => {
      this.applyCosmetics(resolveCosmetics());
      this.root.visible = true;
    });
    ctx.events.on('ui:navigate', ({ screen }) => {
      if (MENU_SCREENS.has(screen)) this.root.visible = false;
    });

    void this.#tryUpgradeGltf();
  }

  applyCosmetics(cosmetics: RiderCosmetics = resolveCosmetics()): void {
    this.#cosmetics = cosmetics;
    const boardMats =
      this.#gltf?.tints.boardMaterials ?? this.#procedural?.tints.boardMaterials ?? [];
    const suitMats =
      this.#gltf?.tints.suitMaterials ?? this.#procedural?.tints.suitMaterials ?? [];

    for (const m of boardMats) m.color.setHex(cosmetics.boardColor);
    for (const m of suitMats) m.color.setHex(cosmetics.suitColor);
  }

  /** Pose root from board physics and animate lean / limbs. */
  sync(dt: number, board: BoardPhysics): void {
    this.root.position.copy(board.position);
    this.root.rotation.set(board.boardPitch, board.boardYaw, board.boardRoll, 'YXZ');

    const target = board.lean;
    const k = 1 - Math.exp(-LEAN_FOLLOW * Math.max(0, dt));
    this.#lean += (target - this.#lean) * (dt > 0 ? k : 1);
    const lean = this.#lean;
    const abs = Math.abs(lean);

    if (this.#procedural && !this.#usingGltf) {
      const p = this.#procedural;
      p.body.rotation.set(0.06 * abs, 0, lean * LEAN_BODY);
      p.body.position.set(-lean * 0.07, 0.05, -0.02 - abs * 0.02);
      p.hips.rotation.z = lean * LEAN_HIP;
      p.torso.rotation.z = lean * 0.08;
      p.torso.rotation.x = -0.08 - abs * 0.06;
      p.head.rotation.z = -lean * 0.1;
      p.head.rotation.x = -0.05;

      p.leftArm.rotation.set(0.25 + abs * 0.35, 0.1 * lean, 0.55 + lean * 0.35);
      p.rightArm.rotation.set(0.15 + abs * 0.3, 0.1 * lean, -0.45 + lean * 0.35);
      p.leftLeg.rotation.set(0.42 + lean * 0.08, 0.08, 0.12 + lean * 0.05);
      p.rightLeg.rotation.set(-0.18 - lean * 0.08, -0.06, -0.1 + lean * 0.05);
    } else {
      this.#body.rotation.set(0.05 * abs, 0, lean * LEAN_BODY);
      this.#body.position.set(-lean * 0.06, this.#body.position.y, this.#body.position.z);
    }
  }

  dispose(ctx?: EngineContext): void {
    if (this.#mounted && ctx) ctx.scene.remove(this.root);
    this.#mounted = false;
    this.#gltf?.dispose();
    this.#gltf = null;
    this.#procedural?.dispose();
    this.#procedural = null;
  }

  async #tryUpgradeGltf(): Promise<void> {
    const loaded = await tryLoadRiderGltf();
    if (!loaded || !this.#procedural) return;

    this.root.remove(this.#procedural.root);
    this.#procedural.dispose();
    this.#procedural = null;

    this.#gltf = loaded;
    this.#body = loaded.body;
    this.#usingGltf = true;
    this.root.add(loaded.root);
    this.applyCosmetics(this.#cosmetics);
  }
}
