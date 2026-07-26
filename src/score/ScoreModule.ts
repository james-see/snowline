import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { CourseId, GameModeId, Medal, TrickResult } from '@/types/gameplay.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import { getBests, loadSave, recordRun, type SaveState } from './SaveData.ts';

export class ScoreModule implements GameModule {
  readonly name = 'score';
  readonly order = 30;

  score = 0;
  combo = 1;
  banked = 0;
  #pending = 0;
  #recentNames: string[] = [];
  #runActive = false;
  #courseId: CourseId = 'alpine';
  #mode: GameModeId = 'freeride';
  #runTime = 0;
  #ctx: EngineContext | null = null;
  save: SaveState = loadSave();

  init(ctx: EngineContext): void {
    this.#ctx = ctx;

    ctx.events.on('run:start', ({ courseId, mode }) => {
      this.#courseId = courseId;
      this.#mode = mode;
      this.score = 0;
      this.combo = 1;
      this.banked = 0;
      this.#pending = 0;
      this.#recentNames = [];
      this.#runActive = true;
      this.#runTime = 0;
    });

    ctx.events.on('rider:trick', (trick) => this.#onTrick(ctx, trick));

    ctx.events.on('rider:landing', ({ grade }) => {
      if (grade === 'perfect' || grade === 'good') {
        this.#bank(ctx);
        if (grade === 'perfect') {
          this.combo = Math.min(8, this.combo + 0.5);
          ctx.events.emit('score:popup', { text: 'PERFECT', points: 250 });
          this.score += 250;
        }
      } else if (grade === 'bail') {
        this.combo = 1;
        this.#pending = 0;
      } else {
        this.#bank(ctx);
        this.combo = Math.max(1, this.combo * 0.75);
      }
    });

    ctx.events.on('rider:grind:end', ({ duration }) => {
      const pts = Math.floor(duration * 120 * this.combo);
      this.#pending += pts;
      ctx.events.emit('score:popup', { text: 'GRIND', points: pts });
    });

    ctx.events.on('rider:crash', () => {
      this.combo = 1;
      this.#pending = 0;
    });

    ctx.events.on('course:finish', ({ elapsed }) => {
      if (!this.#runActive) return;
      this.#bank(ctx);
      this.#runActive = false;
      this.#runTime = elapsed;
      const medal = this.#computeMedal(elapsed, this.score);
      this.save = recordRun(this.save, this.#courseId, this.#mode, elapsed, this.score, medal);
      ctx.events.emit('run:finish', {
        courseId: this.#courseId,
        mode: this.#mode,
        time: elapsed,
        score: this.score,
        medal,
      });
    });
  }

  fixedUpdate(dt: number, ctx: EngineContext): void {
    if (!this.#runActive) return;
    this.#runTime += dt;
    if (this.#mode === 'trick_attack' || this.#mode === 'score') {
      const rider = ctx.getModule<RiderModule>('rider');
      if (
        rider?.state.grounded &&
        Math.abs(rider.state.edgeAngle) > 0.35 &&
        rider.state.speed > 12
      ) {
        this.score += dt * 8 * this.combo;
      }
    }
  }

  getHud() {
    return {
      score: Math.floor(this.score),
      combo: this.combo,
      pending: Math.floor(this.#pending),
      time: this.#runTime,
      bests: getBests(this.save, this.#courseId, this.#mode),
    };
  }

  #onTrick(ctx: EngineContext, trick: TrickResult): void {
    let mult = this.combo;
    const repeats = this.#recentNames.filter((n) => n === trick.name).length;
    if (repeats > 0) mult *= Math.max(0.35, 1 - repeats * 0.25);
    const pts = Math.floor(trick.score * mult);
    this.#pending += pts;
    this.#recentNames.push(trick.name);
    if (this.#recentNames.length > 8) this.#recentNames.shift();
    this.combo = Math.min(8, this.combo + (trick.combo ? 0.75 : 0.35));
    ctx.events.emit('score:popup', { text: trick.name, points: pts });
    ctx.events.emit('score:combo', { multiplier: this.combo, banked: this.banked });
  }

  #bank(ctx: EngineContext): void {
    if (this.#pending <= 0) return;
    this.score += this.#pending;
    this.banked += this.#pending;
    ctx.events.emit('score:combo', { multiplier: this.combo, banked: this.banked });
    const rider = ctx.getModule<RiderModule>('rider');
    if (rider) {
      rider.board.boostMeter = Math.min(1, rider.board.boostMeter + 0.12 + this.combo * 0.03);
    }
    this.#pending = 0;
  }

  #computeMedal(time: number, score: number): Medal {
    const course = this.#ctx?.getModule<CourseModule>('course')?.getDefinition();
    if (!course) return 'bronze';
    const m = course.medals;
    if (this.#mode === 'trick_attack' || this.#mode === 'score') {
      if (score >= m.platinumScore) return 'platinum';
      if (score >= m.goldScore) return 'gold';
      if (score >= m.silverScore) return 'silver';
      if (score >= m.bronzeScore) return 'bronze';
      return 'none';
    }
    if (time <= m.platinumTime) return 'platinum';
    if (time <= m.goldTime) return 'gold';
    if (time <= m.silverTime) return 'silver';
    if (time <= m.bronzeTime) return 'bronze';
    return 'none';
  }
}
