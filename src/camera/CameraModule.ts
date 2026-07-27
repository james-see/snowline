import * as THREE from 'three';
import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { GameFlowModule } from '@/modes/GameFlowModule.ts';
import { ChaseCamera } from './ChaseCamera.ts';

const _pathAim = new THREE.Vector3();

/**
 * Metres along the spline for lateral course-line aim.
 * Kept short so chase looks into readable midfield (B8), not empty far void.
 * ChaseCamera clamps aim distance to its look-ahead anyway.
 */
const PATH_LOOK_AHEAD_M = 38;

export class CameraModule implements GameModule {
  readonly name = 'camera';
  readonly order = 60;
  readonly chase = new ChaseCamera();

  #pendingSnap = false;

  init(ctx: EngineContext): void {
    ctx.events.on('rider:landing', ({ impact }) => this.chase.onLanding(impact));
    ctx.events.on('rider:crash', () => this.chase.impulse(0.55));
    ctx.events.on('rider:boost', ({ active }) => {
      if (active) this.chase.impulse(0.12);
    });
    ctx.events.on('rider:path-reset', () => {
      this.#pendingSnap = true;
      this.#snapNow(ctx);
    });
    // Snap as soon as a run begins so capture/warmup never inherit title-origin framing.
    ctx.events.on('run:start', () => {
      this.#pendingSnap = true;
      this.#snapNow(ctx);
    });
    // Course reload mid-session (retry) — re-frame on the new spawn line.
    ctx.events.on('course:loaded', () => {
      const flow = ctx.getModule<GameFlowModule>('flow');
      if (flow && flow.screen !== 'playing' && flow.screen !== 'paused') return;
      this.#pendingSnap = true;
      this.#snapNow(ctx);
    });
  }

  lateUpdate(dt: number, ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;

    // Ignore menu / hidden rider — do not chase DEFAULT_SPAWN at the origin.
    if (!rider.object3d.visible) return;
    const flow = ctx.getModule<GameFlowModule>('flow');
    if (flow && flow.screen !== 'playing' && flow.screen !== 'paused') return;

    if (this.#pendingSnap) {
      this.#snapNow(ctx);
      this.#pendingSnap = false;
    }

    this.chase.update(
      dt,
      ctx.camera,
      rider.state,
      ctx.physics,
      ctx.settings.fov,
      ctx.settings.cameraShakeScale * (ctx.settings.reducedMotion ? 0.2 : 1),
      ctx.input.look,
      this.#pathAim(ctx, rider)
    );
  }

  /** Capture / shot helper — hard re-frame onto rider + near course line. */
  resnap(ctx: EngineContext): void {
    this.#snapNow(ctx);
  }

  #snapNow(ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;
    this.chase.snap(rider.state, ctx.physics, ctx.camera, this.#pathAim(ctx, rider));
  }

  /** Sample the course spline ahead of the rider for mountain/forest framing. */
  #pathAim(ctx: EngineContext, rider: RiderModule): THREE.Vector3 | null {
    const path = ctx.getModule<CourseModule>('course')?.getPath();
    if (!path || path.totalLength < 1) return null;
    const { t } = path.closestPoint(rider.state.position);
    const aheadT = Math.min(1, t + PATH_LOOK_AHEAD_M / path.totalLength);
    return path.sample(aheadT, _pathAim);
  }
}
