import type { EngineContext, GameModule } from '@/types/engine.ts';
import type { CourseId, GameModeId, Medal, TrickResult } from '@/types/gameplay.ts';
import type { MedalThresholds } from '@/types/course.ts';
import type { CourseModule } from '@/course/CourseModule.ts';
import type { RiderModule } from '@/rider/RiderModule.ts';
import {
  getBests,
  isScoreMode,
  loadSave,
  normalizeMode,
  recordRun,
  type SaveState,
} from './SaveData.ts';
import { ScoreSystem } from './ScoreSystem.ts';

export class ScoreModule implements GameModule {
  readonly name = 'score';
  readonly order = 30;

  readonly system = new ScoreSystem();
  #runActive = false;
  #courseId: CourseId = 'alpine';
  #mode: GameModeId = 'freeride';
  #runTime = 0;
  #ctx: EngineContext | null = null;
  save: SaveState = loadSave();

  get score(): number {
    return this.system.score;
  }
  get combo(): number {
    return this.system.combo;
  }
  get banked(): number {
    return this.system.banked;
  }

  init(ctx: EngineContext): void {
    this.#ctx = ctx;

    ctx.events.on('run:start', ({ courseId, mode }) => {
      this.#courseId = courseId;
      this.#mode = normalizeMode(mode);
      this.system.reset();
      this.#runActive = true;
      this.#runTime = 0;
      this.save = loadSave();
    });

    ctx.events.on('rider:trick', (trick) => this.#onTrick(ctx, trick));

    ctx.events.on('rider:landing', ({ grade }) => {
      if (!this.#runActive) return;
      const { banked, bonus, boostReward } = this.system.resolveLanding(grade);
      if (banked > 0) {
        ctx.events.emit('score:combo', {
          multiplier: this.system.combo,
          banked: this.system.banked,
        });
        this.#grantBoost(ctx, boostReward);
      }
      if (bonus > 0) {
        ctx.events.emit('score:popup', { text: 'PERFECT', points: bonus });
      }
    });

    ctx.events.on('rider:grind:end', ({ duration }) => {
      if (!this.#runActive) return;
      const pts = this.system.addGrind(duration);
      ctx.events.emit('score:popup', { text: 'GRIND', points: pts });
    });

    ctx.events.on('rider:crash', () => {
      this.system.crash();
    });

    ctx.events.on('course:finish', ({ elapsed }) => {
      if (!this.#runActive) return;
      const banked = this.system.bank();
      if (banked > 0) {
        this.#grantBoost(ctx, this.system.boostRewardForBank());
        ctx.events.emit('score:combo', {
          multiplier: this.system.combo,
          banked: this.system.banked,
        });
      }
      this.#runActive = false;
      this.#runTime = elapsed;
      const medal = this.#computeMedal(elapsed, this.system.score);
      this.save = recordRun(
        this.save,
        this.#courseId,
        this.#mode,
        elapsed,
        this.system.score,
        medal
      );
      ctx.events.emit('run:finish', {
        courseId: this.#courseId,
        mode: this.#mode,
        time: elapsed,
        score: this.system.score,
        medal,
      });
    });
  }

  fixedUpdate(dt: number, ctx: EngineContext): void {
    if (!this.#runActive) return;
    this.#runTime += dt;
    if (!isScoreMode(this.#mode)) return;
    const rider = ctx.getModule<RiderModule>('rider');
    if (
      rider?.state.grounded &&
      Math.abs(rider.state.edgeAngle) > 0.35 &&
      rider.state.speed > 12
    ) {
      this.system.styleTick(dt);
    }
  }

  getHud() {
    return {
      score: Math.floor(this.system.score),
      combo: this.system.combo,
      pending: Math.floor(this.system.pending),
      time: this.#runTime,
      bests: getBests(this.save, this.#courseId, this.#mode),
      mode: this.#mode,
    };
  }

  #onTrick(ctx: EngineContext, trick: TrickResult): void {
    if (!this.#runActive) return;
    // Time Trial still awards style for feel, but medals stay clock-based.
    const pts = this.system.addTrick(trick);
    ctx.events.emit('score:popup', { text: trick.name, points: pts });
    ctx.events.emit('score:combo', {
      multiplier: this.system.combo,
      banked: this.system.banked,
    });
  }

  #grantBoost(ctx: EngineContext, amount: number): void {
    if (amount <= 0) return;
    const rider = ctx.getModule<RiderModule>('rider');
    if (rider) {
      rider.board.boostMeter = Math.min(1, rider.board.boostMeter + amount);
    }
  }

  #computeMedal(time: number, score: number): Medal {
    const course = this.#ctx?.getModule<CourseModule>('course')?.getDefinition();
    if (!course) return 'bronze';
    return computeMedal(this.#mode, time, score, course.medals);
  }
}

export function computeMedal(
  mode: GameModeId,
  time: number,
  score: number,
  m: MedalThresholds
): Medal {
  if (isScoreMode(mode)) {
    if (score >= m.platinumScore) return 'platinum';
    if (score >= m.goldScore) return 'gold';
    if (score >= m.silverScore) return 'silver';
    if (score >= m.bronzeScore) return 'bronze';
    return 'none';
  }
  // Freeride + Time Trial: medals on time
  if (time <= m.platinumTime) return 'platinum';
  if (time <= m.goldTime) return 'gold';
  if (time <= m.silverTime) return 'silver';
  if (time <= m.bronzeTime) return 'bronze';
  return 'none';
}
