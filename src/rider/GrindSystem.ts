/**
 * Grind recognition when the board latches a rail/surface contact.
 *
 * Physics owns latch/detach; this module names and scores the grind from
 * duration and board-vs-rail orientation.
 */

import type { SurfaceKind, TrickResult } from '@/types/gameplay.ts';
import { GRIND } from './tuning.ts';

export interface GrindResult {
  name: string;
  score: number;
  duration: number;
  kind: GrindKind;
  surface: SurfaceKind;
}

export type GrindKind = '50-50' | 'boardslide' | 'lipslide' | 'press';

const MIN_SCORE_DURATION = 0.08;
const POINTS_PER_SECOND = 120;

export class GrindSystem {
  #active = false;
  #duration = 0;
  #surface: SurfaceKind = 'rail';
  /** Absolute yaw error between board forward and rail axis, radians. */
  #yawErrorSum = 0;
  #yawSamples = 0;

  get active(): boolean {
    return this.#active;
  }

  get duration(): number {
    return this.#duration;
  }

  /** Latch onto a grindable contact (rail or wood box). */
  begin(surface: SurfaceKind = 'rail'): void {
    this.#active = true;
    this.#duration = 0;
    this.#surface = surface;
    this.#yawErrorSum = 0;
    this.#yawSamples = 0;
  }

  /**
   * Advance an active grind.
   * @param railAxisYaw World yaw of the rail travel direction, radians.
   * @param boardYaw Current board yaw, radians.
   */
  update(dt: number, boardYaw: number, railAxisYaw?: number): void {
    if (!this.#active) return;
    this.#duration += dt;
    if (railAxisYaw !== undefined) {
      const err = absAngleDelta(boardYaw, railAxisYaw);
      this.#yawErrorSum += err;
      this.#yawSamples += 1;
    }
  }

  /** End grind; returns null if too brief to score. */
  end(): GrindResult | null {
    if (!this.#active) return null;
    this.#active = false;
    const duration = this.#duration;
    this.#duration = 0;
    if (duration < MIN_SCORE_DURATION) return null;

    const meanYawError =
      this.#yawSamples > 0 ? this.#yawErrorSum / this.#yawSamples : Math.PI / 4;
    const kind = classifyGrind(meanYawError, duration);
    const name = grindName(kind, this.#surface);
    const score = Math.round(duration * POINTS_PER_SECOND * grindKindMultiplier(kind));

    return {
      name,
      score,
      duration,
      kind,
      surface: this.#surface,
    };
  }

  cancel(): void {
    this.#active = false;
    this.#duration = 0;
    this.#yawSamples = 0;
    this.#yawErrorSum = 0;
  }

  /** Convert a grind into a TrickResult for the shared score pipeline. */
  toTrickResult(grind: GrindResult, landing: TrickResult['landing'] = 'good'): TrickResult {
    return {
      name: grind.name,
      score: grind.score,
      spinDegrees: 0,
      flipDegrees: 0,
      grab: null,
      landing,
      combo: false,
    };
  }
}

/** Minimum latch distance exposed for callers that probe rails. */
export const GRIND_LATCH_DISTANCE = GRIND.latchDistance;

function classifyGrind(meanYawError: number, duration: number): GrindKind {
  // ~0° aligned with rail → 50-50; ~90° across → boardslide/lipslide.
  if (meanYawError < 0.45) return '50-50';
  if (meanYawError > 1.1) {
    return duration >= 0.55 ? 'lipslide' : 'boardslide';
  }
  return 'press';
}

function grindName(kind: GrindKind, surface: SurfaceKind): string {
  const surfaceTag = surface === 'wood' ? 'Box ' : surface === 'rail' ? '' : `${capitalize(surface)} `;
  switch (kind) {
    case '50-50':
      return `${surfaceTag}50-50`.trim();
    case 'boardslide':
      return `${surfaceTag}Boardslide`.trim();
    case 'lipslide':
      return `${surfaceTag}Lipslide`.trim();
    case 'press':
      return `${surfaceTag}Nose Press`.trim();
  }
}

function grindKindMultiplier(kind: GrindKind): number {
  switch (kind) {
    case '50-50':
      return 1;
    case 'boardslide':
      return 1.15;
    case 'lipslide':
      return 1.35;
    case 'press':
      return 0.9;
  }
}

function absAngleDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  // Parallel either way counts as aligned (board facing either rail direction).
  return Math.min(d, Math.PI - d);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
