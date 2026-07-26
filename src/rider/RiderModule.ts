/**
 * Rider game module — board physics, trick tracking and a lightweight visual.
 */

import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderSpawn, RiderState, SurfaceKind } from '@/types/gameplay.ts';
import { readRiderInput } from '@/types/input.ts';
import { AirTricks } from './AirTricks.ts';
import { BoardPhysics } from './BoardPhysics.ts';
import { GrindSystem } from './GrindSystem.ts';
import { evaluateLanding } from './LandingEvaluator.ts';

const DEFAULT_SPAWN: RiderSpawn = {
  position: new THREE.Vector3(0, 2, 0),
  yaw: Math.PI,
};

/** Mutable backing store; exposed as `RiderState` via getter. */
interface RiderStateStore {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  grounded: boolean;
  airborne: boolean;
  grinding: boolean;
  crashed: boolean;
  boardYaw: number;
  boardPitch: number;
  boardRoll: number;
  lean: number;
  edgeAngle: number;
  surfaceKind: SurfaceKind;
  boostMeter: number;
  recoveryRemaining: number;
}

export class RiderModule implements GameModule {
  readonly name = 'rider';
  readonly order: number;

  readonly board = new BoardPhysics();
  readonly tricks = new AirTricks();
  readonly grinds = new GrindSystem();

  readonly #root = new THREE.Group();
  readonly #boardMesh: THREE.Mesh;
  readonly #bodyGroup = new THREE.Group();
  readonly #published: RiderStateStore;

  #ctx: EngineContext | null = null;
  #wasAirborne = false;
  #boostActive = false;
  #lastBoostMeter = 1;

  constructor(order = 10) {
    this.order = order;

    const boardGeo = new THREE.BoxGeometry(0.22, 0.06, 1.56);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x2a6cb8,
      metalness: 0.35,
      roughness: 0.45,
    });
    this.#boardMesh = new THREE.Mesh(boardGeo, boardMat);
    this.#boardMesh.castShadow = true;
    this.#boardMesh.receiveShadow = true;
    this.#root.add(this.#boardMesh);

    this.#buildRiderBody(this.#bodyGroup);
    this.#root.add(this.#bodyGroup);

    this.#published = {
      position: this.board.position,
      velocity: this.board.velocity,
      speed: 0,
      grounded: true,
      airborne: false,
      grinding: false,
      crashed: false,
      boardYaw: 0,
      boardPitch: 0,
      boardRoll: 0,
      lean: 0,
      edgeAngle: 0,
      surfaceKind: 'packed',
      boostMeter: 1,
      recoveryRemaining: 0,
    };
  }

  /** Live rider state for camera rig and HUD. Values update in place each tick. */
  get state(): RiderState {
    return this.#published;
  }

  /** Scene graph root for the board and procedural rider. */
  get object3d(): THREE.Group {
    return this.#root;
  }

  getPosition(): THREE.Vector3 {
    return this.board.position;
  }

  init(ctx: EngineContext): void {
    this.#ctx = ctx;
    this.reset(DEFAULT_SPAWN);
    this.board.attachBody(ctx.physics);
    this.#root.visible = false;
    ctx.scene.add(this.#root);

    ctx.events.on('run:start', () => {
      this.#root.visible = true;
    });
    ctx.events.on('ui:navigate', ({ screen }) => {
      if (screen === 'title' || screen === 'course' || screen === 'mode' || screen === 'settings') {
        this.#root.visible = false;
      }
    });
  }

  /** Respawn at a course spawn pose. */
  spawnAt(position: THREE.Vector3, yaw: number): void {
    this.reset({ position: position.clone(), yaw });
    if (this.#ctx) this.board.attachBody(this.#ctx.physics);
  }

  reset(spawn: RiderSpawn = DEFAULT_SPAWN): void {
    this.board.reset(spawn);
    this.tricks.cancelAir();
    this.grinds.cancel();
    this.#wasAirborne = false;
    this.#syncVisual();
    this.#syncPublished();
  }

  fixedUpdate(dt: number, ctx: EngineContext): void {
    if (ctx.input.lockedOut && !ctx.input.isDown('pause')) return;

    const input = readRiderInput(ctx.input);
    const frame = this.board.fixedUpdate(dt, input, ctx.physics);
    const pose = { boardYaw: this.board.boardYaw, boardPitch: this.board.boardPitch };

    if (!this.#wasAirborne && this.board.airborne) {
      this.tricks.beginAir(pose);
    }

    if (this.board.airborne) {
      this.tricks.update(dt, input, pose);
      const grab = this.tricks.consumeGrabChanged();
      if (grab) ctx.events.emit('rider:grab', { grab });
    }

    if (frame.jumped) {
      // Jump is surfaced through physics state; audio can key off airborne transition.
    }

    if (frame.landed) {
      const graded = evaluateLanding({
        alignment: frame.landed.alignment,
        impactSpeed: frame.landed.impactSpeed,
        speed: frame.landed.speed,
        surface: frame.landed.surface,
        assist: ctx.settings.landingAssist,
      });
      ctx.events.emit('rider:landing', {
        grade: graded.grade,
        impact: graded.impactSpeed,
      });
      const trick = this.tricks.resolveLanding(graded.grade);
      if (trick) {
        ctx.events.emit('rider:trick', trick);
      } else {
        this.tricks.cancelAir();
      }
    }

    if (frame.crashed && frame.crashReason) {
      ctx.events.emit('rider:crash', { reason: frame.crashReason });
      this.tricks.cancelAir();
      this.grinds.cancel();
    }

    if (frame.recovered) {
      ctx.events.emit('rider:recover');
    }

    if (frame.spray) {
      ctx.events.emit('rider:spray', {
        intensity: frame.spray.intensity,
        surface: frame.spray.surface,
      });
    }

    if (frame.grindStarted) {
      this.grinds.begin(this.board.surfaceKind);
      ctx.events.emit('rider:grind:start');
    }

    if (this.board.grinding) {
      this.grinds.update(dt, this.board.boardYaw);
    }

    if (frame.grindEnded) {
      const grind = this.grinds.end();
      // Duration scores in ScoreModule; GrindSystem classifies kind/name for HUD later.
      ctx.events.emit('rider:grind:end', { duration: grind?.duration ?? 0 });
    }

    const boosting = input.boost && frame.boostMeter >= 0.08;
    if (boosting !== this.#boostActive) {
      this.#boostActive = boosting;
      ctx.events.emit('rider:boost', { active: boosting });
    }
    this.#lastBoostMeter = frame.boostMeter;

    this.#wasAirborne = this.board.airborne;
    this.#syncPublished();
  }

  update(_dt: number, _ctx: EngineContext): void {
    this.#syncVisual();
  }

  dispose(): void {
    this.#ctx?.scene.remove(this.#root);
    this.#boardMesh.geometry.dispose();
    (this.#boardMesh.material as THREE.Material).dispose();
    this.#bodyGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.#ctx = null;
  }

  #syncPublished(): void {
    const b = this.board;
    this.#published.speed = b.speed;
    this.#published.grounded = b.grounded;
    this.#published.airborne = b.airborne;
    this.#published.grinding = b.grinding;
    this.#published.crashed = b.crashed;
    this.#published.boardYaw = b.boardYaw;
    this.#published.boardPitch = b.boardPitch;
    this.#published.boardRoll = b.boardRoll;
    this.#published.lean = b.lean;
    this.#published.edgeAngle = b.edgeAngle;
    this.#published.surfaceKind = b.surfaceKind;
    this.#published.boostMeter = b.boostMeter;
    this.#published.recoveryRemaining = b.recoveryRemaining;
  }

  #syncVisual(): void {
    this.#root.position.copy(this.board.position);
    this.#root.rotation.set(this.board.boardPitch, this.board.boardYaw, this.board.boardRoll, 'YXZ');

    const leanVis = this.board.lean * 0.28;
    this.#bodyGroup.rotation.set(0, 0, leanVis);
    this.#bodyGroup.position.set(-leanVis * 0.08, 0.18, -0.08);
  }

  #buildRiderBody(group: THREE.Group): void {
    const suit = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.85 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.18), suit);
    torso.position.set(0, 0.48, -0.06);
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), suit);
    head.position.set(0, 0.78, -0.06);
    head.castShadow = true;
    group.add(head);

    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.16), accent);
    hip.position.set(0, 0.24, -0.04);
    group.add(hip);

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), accent);
    leftLeg.position.set(-0.1, 0.02, 0.02);
    leftLeg.rotation.x = 0.35;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), accent);
    rightLeg.position.set(0.1, 0.02, 0.06);
    rightLeg.rotation.x = -0.25;
    group.add(rightLeg);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), suit);
    leftArm.position.set(-0.24, 0.52, -0.02);
    leftArm.rotation.z = 0.45;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), suit);
    rightArm.position.set(0.24, 0.5, 0.04);
    rightArm.rotation.z = -0.35;
    group.add(rightArm);
  }
}

export type { RiderSpawn };
