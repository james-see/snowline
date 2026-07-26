import type { LandingGrade, TrickResult } from '@/types/gameplay.ts';

export interface ScoreSnapshot {
  score: number;
  combo: number;
  pending: number;
  banked: number;
}

/** Pure combo / banking math — no engine deps. */
export class ScoreSystem {
  score = 0;
  combo = 1;
  banked = 0;
  pending = 0;
  #recentNames: string[] = [];

  reset(): void {
    this.score = 0;
    this.combo = 1;
    this.banked = 0;
    this.pending = 0;
    this.#recentNames = [];
  }

  get snapshot(): ScoreSnapshot {
    return {
      score: this.score,
      combo: this.combo,
      pending: this.pending,
      banked: this.banked,
    };
  }

  /** Queue trick points; applies repetition penalty and grows combo. */
  addTrick(trick: TrickResult): number {
    let mult = this.combo;
    const repeats = this.#recentNames.filter((n) => n === trick.name).length;
    if (repeats > 0) mult *= Math.max(0.35, 1 - repeats * 0.25);
    const pts = Math.floor(trick.score * mult);
    this.pending += pts;
    this.#recentNames.push(trick.name);
    if (this.#recentNames.length > 8) this.#recentNames.shift();
    this.combo = Math.min(8, this.combo + (trick.combo ? 0.75 : 0.35));
    return pts;
  }

  addGrind(duration: number): number {
    const pts = Math.floor(duration * 120 * this.combo);
    this.pending += pts;
    return pts;
  }

  /**
   * Resolve a landing. Returns banked amount (0 if bail / nothing pending)
   * and an optional immediate bonus (perfect landing).
   */
  resolveLanding(grade: LandingGrade): { banked: number; bonus: number; boostReward: number } {
    if (grade === 'bail') {
      this.combo = 1;
      this.pending = 0;
      return { banked: 0, bonus: 0, boostReward: 0 };
    }

    const banked = this.bank();
    let bonus = 0;
    if (grade === 'perfect') {
      this.combo = Math.min(8, this.combo + 0.5);
      bonus = 250;
      this.score += bonus;
    } else if (grade === 'sketchy') {
      this.combo = Math.max(1, this.combo * 0.75);
    }
    const boostReward = banked > 0 ? 0.12 + this.combo * 0.03 : 0;
    return { banked, bonus, boostReward };
  }

  crash(): void {
    this.combo = 1;
    this.pending = 0;
  }

  /** Bank pending into score. Returns amount banked and boost meter reward. */
  bank(): number {
    if (this.pending <= 0) return 0;
    const amount = this.pending;
    this.score += amount;
    this.banked += amount;
    this.pending = 0;
    return amount;
  }

  boostRewardForBank(): number {
    return 0.12 + this.combo * 0.03;
  }

  /** Trick Attack carve style ticks while edged at speed. */
  styleTick(dt: number): number {
    const pts = dt * 8 * this.combo;
    this.score += pts;
    return pts;
  }
}
