import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { LandingGrade } from '@/types/gameplay.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { AudioEngine } from './AudioEngine.ts';

function landingId(grade: LandingGrade): string {
  switch (grade) {
    case 'perfect':
      return 'land_perfect';
    case 'good':
      return 'land_good';
    case 'sketchy':
      return 'land_sketchy';
    case 'bail':
      return 'land_bail';
  }
}

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

    ctx.events.on('rider:landing', ({ grade, impact }) => {
      const vol = Math.min(1.35, 0.7 + impact * 0.04);
      this.engine.oneshot(landingId(grade), vol);
    });
    ctx.events.on('rider:boost', ({ active }) => {
      if (active) this.engine.oneshot('boost');
    });
    ctx.events.on('rider:crash', () => this.engine.oneshot('crash', 1.15));
    ctx.events.on('rider:grind:start', () => this.engine.oneshot('grind_start', 0.85));
    ctx.events.on('course:checkpoint', () => this.engine.oneshot('checkpoint'));
    ctx.events.on('audio:oneshot', ({ id, volume }) => this.engine.oneshot(id, volume ?? 1));
    ctx.events.on('ui:navigate', () => this.engine.oneshot('ui', 0.7));
    ctx.events.on('settings:changed', () => {
      this.engine.setVolumes(
        ctx.settings.masterVolume,
        ctx.settings.sfxVolume,
        ctx.settings.musicVolume
      );
    });
  }

  update(_dt: number, ctx: EngineContext): void {
    this.engine.setVolumes(
      ctx.settings.masterVolume,
      ctx.settings.sfxVolume,
      ctx.settings.musicVolume
    );
    const rider = ctx.getModule<RiderModule>('rider');
    if (!rider) return;
    const grinding = rider.state.grinding;
    this.engine.setWind(rider.state.speed, rider.state.airborne, rider.state.surfaceKind);
    this.engine.setBoard(
      rider.state.surfaceKind,
      rider.state.speed,
      rider.state.grounded,
      grinding
    );
  }

  dispose(): void {
    this.engine.dispose();
  }
}
