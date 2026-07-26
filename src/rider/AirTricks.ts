/**
 * Air trick tracking and scoring.
 *
 * Accumulates spin, flip and grab input while airborne and resolves a named
 * trick with score on landing. Designed for zero allocations in `update`.
 */

import type { GrabKind, LandingGrade, TrickResult } from '@/types/gameplay.ts';
import type { RiderInput } from '@/types/input.ts';
import { AIR } from './tuning.ts';

const TWO_PI = Math.PI * 2;
const DEG = 180 / Math.PI;

const GRAB_NAMES: Readonly<Record<GrabKind, string>> = {
  indy: 'Indy',
  mute: 'Mute',
  melon: 'Melon',
  method: 'Method',
};

const SPIN_THRESHOLDS = [
  { degrees: 720, label: '720', score: 800 },
  { degrees: 540, label: '540', score: 500 },
  { degrees: 360, label: '360', score: 250 },
  { degrees: 180, label: '180', score: 100 },
] as const;

const FLIP_THRESHOLDS = [
  { degrees: 720, label: 'Double', score: 900 },
  { degrees: 360, label: '', score: 200 },
] as const;

export class AirTricks {
  #active = false;
  #spinRadians = 0;
  #flipRadians = 0;
  #grab: GrabKind | null = null;
  #grabHeld = false;
  #airTime = 0;

  /** Called when the rider leaves the ground. */
  beginAir(): void {
    this.#active = true;
    this.#spinRadians = 0;
    this.#flipRadians = 0;
    this.#grab = null;
    this.#grabHeld = false;
    this.#airTime = 0;
  }

  /** Called when the rider touches down without a scored landing. */
  cancelAir(): void {
    this.#active = false;
    this.#airTime = 0;
  }

  get airborneTracking(): boolean {
    return this.#active;
  }

  get airTime(): number {
    return this.#airTime;
  }

  /** Accumulates trick input for one fixed step while airborne. */
  update(dt: number, input: RiderInput): void {
    if (!this.#active) return;
    this.#airTime += dt;

    if (input.spinLeft) this.#spinRadians += AIR.spinRate * dt;
    if (input.spinRight) this.#spinRadians -= AIR.spinRate * dt;
    if (input.flipFront) this.#flipRadians += AIR.flipRate * dt;
    if (input.flipBack) this.#flipRadians -= AIR.flipRate * dt;

    const grab = readGrab(input);
    if (grab) {
      this.#grab = grab;
      this.#grabHeld = true;
    }
  }

  /**
   * Resolves the trick on landing. Returns null when the air was too short or
   * no meaningful rotation/grab occurred.
   */
  resolveLanding(landing: LandingGrade): TrickResult | null {
    if (!this.#active) return null;
    this.#active = false;

    const spinDegrees = snapAngle(this.#spinRadians * DEG, 180);
    const flipDegrees = snapAngle(this.#flipRadians * DEG, 180);
    const absSpin = Math.abs(spinDegrees);
    const absFlip = Math.abs(flipDegrees);

    if (this.#airTime < 0.12 && absSpin < 90 && absFlip < 90 && !this.#grabHeld) {
      return null;
    }

    const parts: string[] = [];
    let score = 0;
    let combo = false;

    const flipPart = classifyFlip(flipDegrees);
    if (flipPart) {
      parts.push(flipPart.label);
      score += flipPart.score;
    }

    const spinPart = classifySpin(spinDegrees);
    if (spinPart) {
      parts.push(spinPart.label);
      score += spinPart.score;
    }

    if (this.#grabHeld && this.#grab) {
      parts.push(GRAB_NAMES[this.#grab]);
      score += 150;
    }

    if (parts.length === 0) {
      if (this.#airTime >= 0.45) {
        parts.push('Air');
        score += 25;
      } else {
        return null;
      }
    }

    combo = parts.length > 1;

    score = Math.round(score * landingMultiplier(landing));

    const name = parts.join(' ');
    return {
      name,
      score,
      spinDegrees,
      flipDegrees,
      grab: this.#grabHeld ? this.#grab : null,
      landing,
      combo,
    };
  }
}

function readGrab(input: RiderInput): GrabKind | null {
  if (input.grabMethod) return 'method';
  if (input.grabMelon) return 'melon';
  if (input.grabMute) return 'mute';
  if (input.grabIndy) return 'indy';
  return null;
}

function snapAngle(degrees: number, step: number): number {
  if (Math.abs(degrees) < step * 0.45) return 0;
  return Math.round(degrees / step) * step;
}

function classifySpin(spinDegrees: number): { label: string; score: number } | null {
  const abs = Math.abs(spinDegrees);
  if (abs < 135) return null;
  for (const tier of SPIN_THRESHOLDS) {
    if (abs >= tier.degrees - 45) {
      const direction = spinDegrees >= 0 ? 'Frontside' : 'Backside';
      if (tier.degrees >= 360) {
        return { label: `${tier.label} ${direction}`, score: tier.score };
      }
      return { label: `${tier.label} ${direction}`, score: tier.score };
    }
  }
  return null;
}

function classifyFlip(flipDegrees: number): { label: string; score: number } | null {
  const abs = Math.abs(flipDegrees);
  if (abs < 135) return null;
  const front = flipDegrees > 0;
  for (const tier of FLIP_THRESHOLDS) {
    if (abs >= tier.degrees - 45) {
      if (tier.degrees >= 720) {
        return {
          label: front ? 'Double Front Flip' : 'Double Back Flip',
          score: tier.score,
        };
      }
      const prefix = tier.label ? `${tier.label} ` : '';
      return {
        label: front ? `${prefix}Front Flip` : `${prefix}Back Flip`,
        score: tier.score,
      };
    }
  }
  return null;
}

function landingMultiplier(landing: LandingGrade): number {
  switch (landing) {
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
