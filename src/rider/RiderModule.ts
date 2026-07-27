/**
 * Rider game module — board physics, trick tracking and visual rig.
 */

import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderSpawn, RiderState, SurfaceKind } from '@/types/gameplay.ts';
import { readRiderInput } from '@/types/input.ts';
import { AirTricks } from './AirTricks.ts';
import { BoardPhysics } from './BoardPhysics.ts';
import { GrindSystem } from './GrindSystem.ts';
import { RiderVisual } from './visual/RiderVisual.ts';

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
  readonly #visual = new RiderVisual();
  readonly #published: RiderStateStore;

  #ctx: EngineContext | null = null;
  #wasAirborne = false;
  #boostActive = false;
  #lastBoostMeter = 1;

  constructor(order = 10) {
    this.order = order;

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

  /** Scene graph root for the board and rider visual. */
  get object3d(): THREE.Group {
    return this.#visual.root;
  }

  getPosition(): THREE.Vector3 {
    return this.board.position;
  }

  init(ctx: EngineContext): void {
    this.#ctx = ctx;
    this.reset(DEFAULT_SPAWN);
    this.board.attachBody(ctx.physics);
    this.#visual.mount(ctx);
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
    this.#visual.resetPose();
    this.#visual.sync(0, this.board);
    this.#syncPublished();
  }

  fixedUpdate(dt: number, ctx: EngineContext): void {
    if (ctx.input.lockedOut && !ctx.input.isDown('pause')) return;

    const input = readRiderInput(ctx.input);
    // Grade landings once in physics (same assist flag as HUD/score) so speed
    // keep and "PERFECT" popups cannot diverge.
    const frame = this.board.fixedUpdate(dt, input, ctx.physics, {
      landingAssist: ctx.settings.landingAssist,
    });
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
      ctx.events.emit('rider:landing', {
        grade: frame.landed.grade,
        impact: frame.landed.impactSpeed,
      });
      const trick = this.tricks.resolveLanding(frame.landed.grade);
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

  update(dt: number, _ctx: EngineContext): void {
    this.#visual.sync(dt, this.board);
  }

  dispose(): void {
    this.#visual.dispose(this.#ctx ?? undefined);
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
}

export type { RiderSpawn };
