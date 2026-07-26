import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { AudioEngine } from './AudioEngine.ts';

export class AudioModule implements GameModule {
  readonly name = 'audio';
  readonly order = 40;
  readonly engine = new AudioEngine();

  init(ctx: EngineContext): void {
    const unlock = (): void => {
      void this.engine.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    ctx.events.on('rider:landing', ({ grade }) => {
      this.engine.oneshot(grade === 'bail' ? 'land_bail' : 'land_perfect');
    });
    ctx.events.on('rider:boost', ({ active }) => {
      if (active) this.engine.oneshot('boost');
    });
    ctx.events.on('rider:crash', () => this.engine.oneshot('land_bail', 1.2));
    ctx.events.on('course:checkpoint', () => this.engine.oneshot('checkpoint'));
    ctx.events.on('audio:oneshot', ({ id, volume }) => this.engine.oneshot(id, volume ?? 1));
    ctx.events.on('ui:navigate', () => this.engine.oneshot('ui', 0.7));
  }

  update(_dt: number, ctx: EngineContext): void {
    this.engine.setVolumes(
      ctx.settings.masterVolume,
      ctx.settings.sfxVolume,
      ctx.settings.musicVolume
    );
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;
    this.engine.setWind(rider.state.speed, rider.state.airborne);
    this.engine.setBoard(rider.state.surfaceKind, rider.state.speed, rider.state.grounded);
  }

  dispose(): void {
    this.engine.dispose();
  }
}
