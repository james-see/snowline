import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { ChaseCamera } from './ChaseCamera.ts';

export class CameraModule implements GameModule {
  readonly name = 'camera';
  readonly order = 60;
  readonly chase = new ChaseCamera();

  #idleFramed = false;

  init(ctx: EngineContext): void {
    ctx.events.on('rider:landing', ({ impact }) => this.chase.onLanding(impact));
    ctx.events.on('rider:crash', () => this.chase.impulse(0.55));
    ctx.events.on('rider:boost', ({ active }) => {
      if (active) this.chase.impulse(0.12);
    });

    // Snap after spawn — never chase the (0,2,0) placeholder from boot frames.
    ctx.events.on('run:start', () => {
      const rider = ctx.getModule<RiderModule>('rider');
      if (!rider) return;
      this.chase.snap(rider.state, ctx.camera);
    });
  }

  lateUpdate(dt: number, ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;

    if (!this.chase.active) {
      // One-shot menu framing; do not lerp/chase while parked at idle spawn.
      if (!this.#idleFramed) {
        this.chase.frameIdle(ctx.camera);
        this.#idleFramed = true;
      }
      return;
    }

    this.#idleFramed = false;
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
