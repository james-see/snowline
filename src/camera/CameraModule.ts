import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import type { GameFlowModule } from '@/modes/GameFlowModule.ts';
import { ChaseCamera } from './ChaseCamera.ts';

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
    // Snap as soon as a run begins so capture/warmup never inherit title-origin framing.
    ctx.events.on('run:start', () => {
      this.#pendingSnap = true;
      const rider = ctx.getModule<RiderModule>('rider');
      if (rider) this.chase.snap(rider.state, ctx.physics, ctx.camera);
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
      this.chase.snap(rider.state, ctx.physics, ctx.camera);
      this.#pendingSnap = false;
    }

    this.chase.update(
      dt,
      ctx.camera,
      rider.state,
      ctx.physics,
      ctx.settings.fov,
      ctx.settings.cameraShakeScale * (ctx.settings.reducedMotion ? 0.2 : 1),
      ctx.input.look
    );
  }
}
