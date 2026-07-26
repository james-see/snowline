/**
 * Air trick tracking and scoring from actual board motion.
 *
 * Accumulates yaw (spin) and pitch (flip) deltas while airborne, records
 * grabs, and resolves a named combo with score on landing.
 */

import type { GrabKind, LandingGrade, TrickResult } from '@/types/gameplay.ts';
import type { RiderInput } from '@/types/input.ts';
import { landingScoreMultiplier } from './LandingEvaluator.ts';
import { AIR } from './tuning.ts';

const DEG = 180 / Math.PI;

const GRAB_NAMES: Readonly<Record<GrabKind, string>> = {
  indy: 'Indy',
  mute: 'Mute',
  melon: 'Melon',
  method: 'Method',
};

/** Snap windows for multi-rotation spins (degrees, absolute). */
const SPIN_THRESHOLDS = [
  { degrees: 1080, label: '1080', score: 1400 },
  { degrees: 900, label: '900', score: 1100 },
  { degrees: 720, label: '720', score: 800 },
  { degrees: 540, label: '540', score: 500 },
  { degrees: 360, label: '360', score: 250 },
  { degrees: 180, label: '180', score: 100 },
] as const;

/** Snap windows for flips (degrees, absolute). */
const FLIP_THRESHOLDS = [
  { degrees: 1080, label: 'Triple', score: 1400 },
  { degrees: 720, label: 'Double', score: 900 },
  { degrees: 360, label: '', score: 200 },
] as const;

const MIN_AIR_TIME = 0.12;
const MIN_MEANINGFUL_AIR = 0.45;
const GRAB_BASE_SCORE = 150;
const GRAB_HOLD_BONUS_PER_S = 80;

export interface AirMotionSample {
  /** Board yaw this step, radians. */
  boardYaw: number;
  /** Board pitch this step, radians. */
  boardPitch: number;
}

export class AirTricks {
  #active = false;
  #spinRadians = 0;
  #flipRadians = 0;
  #grab: GrabKind | null = null;
  #grabHeld = false;
  #grabTime = 0;
  #airTime = 0;
  #prevYaw = 0;
  #prevPitch = 0;
  #hasPrevPose = false;
  #grabChanged: GrabKind | null = null;

  /** Called when the rider leaves the ground. */
  beginAir(pose?: AirMotionSample): void {
    this.#active = true;
    this.#spinRadians = 0;
    this.#flipRadians = 0;
    this.#grab = null;
    this.#grabHeld = false;
    this.#grabTime = 0;
    this.#airTime = 0;
    this.#grabChanged = null;
    this.#hasPrevPose = pose !== undefined;
    if (pose) {
      this.#prevYaw = pose.boardYaw;
      this.#prevPitch = pose.boardPitch;
    }
  }

  /** Called when the rider touches down without a scored landing. */
  cancelAir(): void {
    this.#active = false;
    this.#airTime = 0;
    this.#hasPrevPose = false;
    this.#grabChanged = null;
  }

  get airborneTracking(): boolean {
    return this.#active;
  }

  get airTime(): number {
    return this.#airTime;
  }

  /** Grab that became active this update, if any (for `rider:grab` events). */
  consumeGrabChanged(): GrabKind | null {
    const g = this.#grabChanged;
    this.#grabChanged = null;
    return g;
  }

  /**
   * Accumulates trick motion for one fixed step while airborne.
   * Prefer board yaw/pitch deltas; fall back to held spin/flip input.
   */
  update(dt: number, input: RiderInput, motion?: AirMotionSample): void {
    if (!this.#active) return;
    this.#airTime += dt;

    if (motion) {
      if (this.#hasPrevPose) {
        this.#spinRadians += shortestAngleDelta(this.#prevYaw, motion.boardYaw);
        this.#flipRadians += shortestAngleDelta(this.#prevPitch, motion.boardPitch);
      }
      this.#prevYaw = motion.boardYaw;
      this.#prevPitch = motion.boardPitch;
      this.#hasPrevPose = true;
    } else {
      // Fallback when caller has not wired board pose yet.
      if (input.spinLeft) this.#spinRadians += AIR.spinRate * dt;
      if (input.spinRight) this.#spinRadians -= AIR.spinRate * dt;
      if (input.flipFront) this.#flipRadians += AIR.flipRate * dt;
      if (input.flipBack) this.#flipRadians -= AIR.flipRate * dt;
    }

    const grab = readGrab(input);
    if (grab) {
      if (!this.#grabHeld || this.#grab !== grab) {
        this.#grabChanged = grab;
      }
      this.#grab = grab;
      this.#grabHeld = true;
      this.#grabTime += dt;
    }
  }

  /**
   * Resolves the trick on landing. Returns null when the air was too short or
   * no meaningful rotation/grab occurred.
   */
  resolveLanding(landing: LandingGrade): TrickResult | null {
    if (!this.#active) return null;
    this.#active = false;
    this.#hasPrevPose = false;

    const spinDegrees = snapAngle(this.#spinRadians * DEG, 180);
    const flipDegrees = snapAngle(this.#flipRadians * DEG, 180);
    const absSpin = Math.abs(spinDegrees);
    const absFlip = Math.abs(flipDegrees);

    if (this.#airTime < MIN_AIR_TIME && absSpin < 90 && absFlip < 90 && !this.#grabHeld) {
      return null;
    }

    const parts: string[] = [];
    let score = 0;

    const spinPart = classifySpin(spinDegrees);
    if (spinPart) {
      parts.push(spinPart.label);
      score += spinPart.score;
    }

    const flipPart = classifyFlip(flipDegrees);
    if (flipPart) {
      parts.push(flipPart.label);
      score += flipPart.score;
    }

    if (this.#grabHeld && this.#grab) {
      parts.push(GRAB_NAMES[this.#grab]);
      score += GRAB_BASE_SCORE + Math.round(this.#grabTime * GRAB_HOLD_BONUS_PER_S);
    }

    if (parts.length === 0) {
      if (this.#airTime >= MIN_MEANINGFUL_AIR) {
        parts.push('Air');
        score += 25;
      } else {
        return null;
      }
    }

    const combo = parts.length > 1;
    if (combo) score = Math.round(score * 1.15);

    score = Math.round(score * landingScoreMultiplier(landing));

    return {
      name: parts.join(' '),
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

/** Shortest signed delta from `from` → `to` in radians. */
function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
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
      // Positive yaw accumulation = spin left (counter-clockwise from above).
      const direction = spinDegrees >= 0 ? 'Left' : 'Right';
      return { label: `${direction} ${tier.label}`, score: tier.score };
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
      if (tier.label) {
        return {
          label: front ? `${tier.label} Front Flip` : `${tier.label} Back Flip`,
          score: tier.score,
        };
      }
      return {
        label: front ? 'Front Flip' : 'Back Flip',
        score: tier.score,
      };
    }
  }
  return null;
}
