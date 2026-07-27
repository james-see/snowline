import * as THREE from 'three';
import type { EngineContext } from '@/types/engine.ts';
import type { BoardPhysics } from '@/rider/BoardPhysics.ts';
import { buildProceduralRig, type ProceduralRig } from './buildProceduralRig.ts';
import { resolveCosmetics, type RiderCosmetics } from './cosmetics.ts';
import { tryLoadRiderGltf, type LoadedRiderGltf } from './loadRiderGltf.ts';

/** Fast into carve so steering reads immediately. */
const LEAN_IN = 16;
/** Slow exit so capture settle + converge still show athlete lean. */
const LEAN_OUT = 1.35;
const LEAN_BODY = 1.05;
const LEAN_HIP = 0.48;
const MENU_SCREENS = new Set(['title', 'course', 'mode', 'settings']);
/** Below this speed + zero lean → treat as spawn/idle snap (m/s). */
const IDLE_SNAP_SPEED = 0.08;

// SSX-style deep crouch base — readable athlete even when physics lean decays.
const BASE = {
  bodyX: 0.38,
  torsoX: -0.42,
  headX: -0.18,
  leftLegX: 1.05,
  rightLegX: 0.92,
  leftShinX: -1.38,
  rightShinX: -1.28,
  leftArmX: 0.55,
  rightArmX: 0.48,
  armSpread: 0.95,
} as const;

/** Neutral crouch floor used at spawn / after lean clears (deep, not upright). */
const SPAWN_CROUCH = 0.28;

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

  /**
   * Clear lean filter and snap joints to neutral spawn crouch.
   * Required by RiderModule.reset / init — must not be a no-op stub.
   */
  resetPose(): void {
    this.#lean = 0;
    this.#applyStance(0, SPAWN_CROUCH);
  }

  /** Pose root from board physics and animate lean / knee flex. */
  sync(dt: number, board: BoardPhysics): void {
    this.root.position.copy(board.position);
    this.root.rotation.set(board.boardPitch, board.boardYaw, board.boardRoll, 'YXZ');

    const target = board.lean;
    if (dt > 0) {
      const engaging = Math.abs(target) >= Math.abs(this.#lean) - 0.02;
      const rate = engaging ? LEAN_IN : LEAN_OUT;
      const k = 1 - Math.exp(-rate * dt);
      this.#lean += (target - this.#lean) * k;
    } else if (Math.abs(target) < 1e-4 && board.speed < IDLE_SNAP_SPEED) {
      // Spawn / true idle — snap. Capture converge keeps speed > idle → hold lean.
      this.#lean = 0;
    }
    // dt === 0 with residual speed: freeze silhouette for pin/converge stills.

    const lean = this.#lean;
    const abs = Math.abs(lean);
    const edge = Math.min(1, Math.abs(board.edgeAngle) / 0.4);
    const roll = Math.min(1, Math.abs(board.boardRoll) / 0.35);
    const speedN = Math.min(1, board.speed / 12);
    const carve = board.grounded
      ? Math.max(abs, edge * 0.85, roll * 0.7) * 0.75 + edge * 0.35 * Math.max(0.35, speedN)
      : abs * 0.4;
    const crouch = SPAWN_CROUCH + carve * 0.55;

    this.#applyStance(lean, crouch);
  }

  /** Apply body / limb stance for current lean + crouch (procedural or glTF body). */
  #applyStance(lean: number, crouch: number): void {
    const abs = Math.abs(lean);

    if (this.#procedural && !this.#usingGltf) {
      const p = this.#procedural;
      p.body.rotation.set(BASE.bodyX + crouch * 0.7, lean * 0.08, lean * LEAN_BODY);
      p.body.position.set(-lean * 0.22, 0.01 - crouch * 0.1, -0.06 - abs * 0.08);
      p.hips.rotation.z = lean * LEAN_HIP;
      p.hips.rotation.x = crouch * 0.15;
      p.torso.rotation.z = lean * 0.35;
      p.torso.rotation.x = BASE.torsoX - crouch * 0.45 - abs * 0.18;
      p.head.rotation.z = -lean * 0.28;
      p.head.rotation.x = BASE.headX - abs * 0.1;

      p.leftArm.rotation.set(
        BASE.leftArmX + abs * 0.85 + crouch * 0.3,
        0.22 * lean,
        BASE.armSpread + lean * 0.7
      );
      p.rightArm.rotation.set(
        BASE.rightArmX + abs * 0.78 + crouch * 0.26,
        0.22 * lean,
        -BASE.armSpread + lean * 0.7
      );

      p.leftLeg.rotation.set(
        BASE.leftLegX + crouch * 1.05 + lean * 0.28,
        0.14,
        0.22 + lean * 0.2
      );
      p.rightLeg.rotation.set(
        BASE.rightLegX + crouch * 0.98 - lean * 0.28,
        -0.12,
        -0.2 + lean * 0.2
      );
      p.leftShin.rotation.x = BASE.leftShinX - crouch * 1.15 - Math.max(0, lean) * 0.35;
      p.rightShin.rotation.x = BASE.rightShinX - crouch * 1.1 - Math.max(0, -lean) * 0.35;
      return;
    }

    this.#body.rotation.set(0.28 + crouch * 0.55, 0, lean * LEAN_BODY);
    this.#body.position.set(-lean * 0.18, this.#body.position.y, this.#body.position.z);
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
