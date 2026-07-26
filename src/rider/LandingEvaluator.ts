/**
 * Landing grade evaluation with documented thresholds.
 *
 * Grades: perfect → good → sketchy → bail.
 * Alignment is board-up · ground-normal (1 = flat base). Impact is downward
 * contact speed in m/s.
 */

import type { LandingGrade, LandingResult, SurfaceKind } from '@/types/gameplay.ts';
import { LANDING } from './tuning.ts';

/** Public thresholds used by HUD copy, assist, and tests. */
export const LANDING_THRESHOLDS = {
  /** Impact (m/s) at or below this may still be perfect when alignment is high. */
  softImpact: LANDING.softImpact,
  /** Impact (m/s) at or above this always bails. */
  hardImpact: LANDING.hardImpact,
  /** Alignment ≥ this → perfect (with soft impact). */
  perfectAlign: LANDING.perfectAlign,
  /** Alignment ≥ this → good. */
  goodAlign: LANDING.goodAlign,
  /** Alignment ≥ this → sketchy; below → bail. */
  sketchyAlign: LANDING.sketchyAlign,
  /** Assist relaxes align/impact gates by this fraction of the gap. */
  assistAlignBonus: 0.08,
  assistImpactBonus: 3,
} as const;

export interface LandingEvalInput {
  /** Board-up · ground-normal, typically in [-1, 1]. */
  alignment: number;
  /** Downward impact speed at contact, m/s. */
  impactSpeed: number;
  /** Horizontal speed retained after contact, m/s (pass-through). */
  speed?: number;
  surface?: SurfaceKind;
  /** When true, widen perfect/good/sketchy windows slightly. */
  assist?: boolean;
}

/**
 * Grade a landing from orientation and impact. Pure; no side effects.
 *
 * | Grade    | Alignment (no assist) | Impact                          |
 * |----------|-----------------------|---------------------------------|
 * | perfect  | ≥ 0.92                | ≤ 6 m/s                         |
 * | good     | ≥ 0.78                | < 18 m/s                        |
 * | sketchy  | ≥ 0.55                | < 18 m/s                        |
 * | bail     | < 0.55 or hard impact | ≥ 18 m/s forces bail            |
 */
export function evaluateLanding(input: LandingEvalInput): LandingResult {
  const assist = input.assist === true;
  const perfectAlign = LANDING_THRESHOLDS.perfectAlign - (assist ? LANDING_THRESHOLDS.assistAlignBonus : 0);
  const goodAlign = LANDING_THRESHOLDS.goodAlign - (assist ? LANDING_THRESHOLDS.assistAlignBonus : 0);
  const sketchyAlign = LANDING_THRESHOLDS.sketchyAlign - (assist ? LANDING_THRESHOLDS.assistAlignBonus : 0);
  const softImpact = LANDING_THRESHOLDS.softImpact + (assist ? LANDING_THRESHOLDS.assistImpactBonus : 0);
  const hardImpact = LANDING_THRESHOLDS.hardImpact + (assist ? LANDING_THRESHOLDS.assistImpactBonus : 0);

  const alignment = clamp(input.alignment, -1, 1);
  const impactSpeed = Math.max(0, input.impactSpeed);

  let grade: LandingGrade = 'bail';
  if (impactSpeed >= hardImpact) {
    grade = 'bail';
  } else if (alignment >= perfectAlign && impactSpeed <= softImpact) {
    grade = 'perfect';
  } else if (alignment >= goodAlign) {
    grade = 'good';
  } else if (alignment >= sketchyAlign) {
    grade = 'sketchy';
  }

  return {
    grade,
    alignment,
    impactSpeed,
    speed: input.speed ?? 0,
    surface: input.surface ?? 'packed',
  };
}

/** Score multiplier applied to air tricks for each landing grade. */
export function landingScoreMultiplier(grade: LandingGrade): number {
  switch (grade) {
    case 'perfect':
      return 1.25;
    case 'good':
      return 1;
    case 'sketchy':
      return 0.65;
    case 'bail':
      return 0.25;
  }
}

/** Horizontal speed keep fraction after landing (physics apply separately). */
export function landingSpeedKeep(grade: LandingGrade): number {
  switch (grade) {
    case 'perfect':
      return LANDING.perfectSpeedKeep;
    case 'good':
      return LANDING.goodSpeedKeep;
    case 'sketchy':
      return LANDING.sketchySpeedKeep;
    case 'bail':
      return LANDING.bailSpeedKeep;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
