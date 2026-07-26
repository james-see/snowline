import * as THREE from 'three';
import type { EngineContext } from '@/types/engine.ts';
import type { BoardPhysics } from '@/rider/BoardPhysics.ts';
import { buildProceduralRig, type ProceduralRig } from './buildProceduralRig.ts';
import { resolveCosmetics, type RiderCosmetics } from './cosmetics.ts';
import { tryLoadRiderGltf, type LoadedRiderGltf } from './loadRiderGltf.ts';

const LEAN_FOLLOW = 12;
const LEAN_BODY = 0.48;
const LEAN_HIP = 0.18;
const MENU_SCREENS = new Set(['title', 'course', 'mode', 'settings']);

// Carve-ready base pose (radians) — always crouched, never upright idle.
const BASE = {
  bodyX: 0.14,
  torsoX: -0.18,
  headX: -0.08,
  leftLegX: 0.72,
  rightLegX: 0.55,
  leftShinX: -0.95,
  rightShinX: -0.85,
  leftArmX: 0.35,
  rightArmX: 0.28,
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

    // Extra knee load when edged and moving — reads as carve-ready in stills.
    const edge = Math.min(1, Math.abs(board.edgeAngle) / 0.55);
    const speedN = Math.min(1, board.speed / 18);
    const carve = board.grounded ? abs * 0.55 + edge * 0.35 * speedN : abs * 0.25;
    const crouch = 0.08 + carve * 0.22;

    if (this.#procedural && !this.#usingGltf) {
      const p = this.#procedural;
      p.body.rotation.set(BASE.bodyX + crouch * 0.35, 0, lean * LEAN_BODY);
      p.body.position.set(-lean * 0.1, 0.02 - crouch * 0.04, -0.04 - abs * 0.03);
      p.hips.rotation.z = lean * LEAN_HIP;
      p.torso.rotation.z = lean * 0.12;
      p.torso.rotation.x = BASE.torsoX - crouch * 0.2 - abs * 0.08;
      p.head.rotation.z = -lean * 0.14;
      p.head.rotation.x = BASE.headX - abs * 0.04;

      p.leftArm.rotation.set(
        BASE.leftArmX + abs * 0.45 + crouch * 0.15,
        0.12 * lean,
        0.62 + lean * 0.42
      );
      p.rightArm.rotation.set(
        BASE.rightArmX + abs * 0.4 + crouch * 0.12,
        0.12 * lean,
        -0.52 + lean * 0.42
      );

      // Hip flex + shin counter-rotation = visible knee bend on carve.
      p.leftLeg.rotation.set(
        BASE.leftLegX + crouch * 0.55 + lean * 0.12,
        0.1,
        0.14 + lean * 0.08
      );
      p.rightLeg.rotation.set(
        BASE.rightLegX + crouch * 0.5 - lean * 0.12,
        -0.08,
        -0.12 + lean * 0.08
      );
      p.leftShin.rotation.x = BASE.leftShinX - crouch * 0.65 - Math.max(0, lean) * 0.12;
      p.rightShin.rotation.x = BASE.rightShinX - crouch * 0.6 - Math.max(0, -lean) * 0.12;
    } else {
      this.#body.rotation.set(0.1 + crouch * 0.25, 0, lean * LEAN_BODY);
      this.#body.position.set(-lean * 0.08, this.#body.position.y, this.#body.position.z);
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
