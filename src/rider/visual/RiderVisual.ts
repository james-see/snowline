import * as THREE from 'three';
import type { EngineContext } from '@/types/engine.ts';
import type { BoardPhysics } from '@/rider/BoardPhysics.ts';
import { buildProceduralRig, type ProceduralRig } from './buildProceduralRig.ts';
import { resolveCosmetics, type RiderCosmetics } from './cosmetics.ts';
import { tryLoadRiderGltf, type LoadedRiderGltf } from './loadRiderGltf.ts';

const LEAN_FOLLOW = 14;
const LEAN_BODY = 0.78;
const LEAN_HIP = 0.32;
const MENU_SCREENS = new Set(['title', 'course', 'mode', 'settings']);

// Carve-ready base pose (radians) — deep crouch, never upright idle.
const BASE = {
  bodyX: 0.22,
  torsoX: -0.28,
  headX: -0.12,
  leftLegX: 0.88,
  rightLegX: 0.7,
  leftShinX: -1.15,
  rightShinX: -1.05,
  leftArmX: 0.42,
  rightArmX: 0.35,
} as const;

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

  /** Pose root from board physics and animate lean / knee flex. */
  sync(dt: number, board: BoardPhysics): void {
    this.root.position.copy(board.position);
    this.root.rotation.set(board.boardPitch, board.boardYaw, board.boardRoll, 'YXZ');

    const target = board.lean;
    const k = 1 - Math.exp(-LEAN_FOLLOW * Math.max(0, dt));
    this.#lean += (target - this.#lean) * (dt > 0 ? k : 1);
    const lean = this.#lean;
    const abs = Math.abs(lean);

    // Extra knee load when edged and moving — strong carve compression in stills.
    const edge = Math.min(1, Math.abs(board.edgeAngle) / 0.45);
    const speedN = Math.min(1, board.speed / 14);
    const carve = board.grounded ? abs * 0.7 + edge * 0.45 * speedN : abs * 0.35;
    const crouch = 0.14 + carve * 0.38;

    if (this.#procedural && !this.#usingGltf) {
      const p = this.#procedural;
      p.body.rotation.set(BASE.bodyX + crouch * 0.55, 0, lean * LEAN_BODY);
      p.body.position.set(-lean * 0.16, 0.02 - crouch * 0.07, -0.04 - abs * 0.05);
      p.hips.rotation.z = lean * LEAN_HIP;
      p.torso.rotation.z = lean * 0.22;
      p.torso.rotation.x = BASE.torsoX - crouch * 0.32 - abs * 0.12;
      p.head.rotation.z = -lean * 0.22;
      p.head.rotation.x = BASE.headX - abs * 0.06;

      p.leftArm.rotation.set(
        BASE.leftArmX + abs * 0.65 + crouch * 0.22,
        0.18 * lean,
        0.72 + lean * 0.55
      );
      p.rightArm.rotation.set(
        BASE.rightArmX + abs * 0.58 + crouch * 0.18,
        0.18 * lean,
        -0.62 + lean * 0.55
      );

      // Hip flex + shin counter-rotation = loud knee bend on carve.
      p.leftLeg.rotation.set(
        BASE.leftLegX + crouch * 0.85 + lean * 0.2,
        0.12,
        0.18 + lean * 0.14
      );
      p.rightLeg.rotation.set(
        BASE.rightLegX + crouch * 0.78 - lean * 0.2,
        -0.1,
        -0.16 + lean * 0.14
      );
      p.leftShin.rotation.x = BASE.leftShinX - crouch * 0.95 - Math.max(0, lean) * 0.22;
      p.rightShin.rotation.x = BASE.rightShinX - crouch * 0.9 - Math.max(0, -lean) * 0.22;
    } else {
      this.#body.rotation.set(0.16 + crouch * 0.4, 0, lean * LEAN_BODY);
      this.#body.position.set(-lean * 0.12, this.#body.position.y, this.#body.position.z);
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
