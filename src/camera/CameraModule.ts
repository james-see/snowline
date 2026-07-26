import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { ChaseCamera } from './ChaseCamera.ts';

export class CameraModule implements GameModule {
  readonly name = 'camera';
  readonly order = 60;
  readonly chase = new ChaseCamera();

  init(ctx: EngineContext): void {
    ctx.events.on('rider:landing', ({ impact }) => this.chase.onLanding(impact));
    ctx.events.on('rider:crash', () => this.chase.impulse(0.55));
    ctx.events.on('rider:boost', ({ active }) => {
      if (active) this.chase.impulse(0.12);
    });
  }

  lateUpdate(dt: number, ctx: EngineContext): void {
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;
    if (ctx.time.frame < 2) this.chase.snap(rider.state);
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
