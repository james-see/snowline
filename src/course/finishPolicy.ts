/**
 * Pure finish-line policy — when a run should complete.
 * Checkpoints are progress markers; they do not gate the arch.
 *
 * Prefer distance-to-arch over spline `lateral`: terrain Y is dropped far
 * below authored control points, so closestPoint lateral near the finish
 * is often tens of metres even on the race centerline.
 */

export interface FinishCheckInput {
  alreadyFinished: boolean;
  /** Rider inside the finish_arch trigger volume. */
  inFinishTrigger: boolean;
  pathT: number;
  finishT: number;
  /** Horizontal (XZ) metres from rider to the finish bed / arch. */
  distanceToFinish: number;
  /** Accept radius around the arch for path/progress fallback (metres). */
  finishRadius: number;
  /**
   * Path-T band before the arch that still counts when inside finishRadius.
   * Covers void-bounce / short approaches that never quite enter the AABB.
   */
  approachT?: number;
}

/** True when the rider should enter the completed/results flow. */
export function shouldCompleteRun(i: FinishCheckInput): boolean {
  if (i.alreadyFinished) return false;
  if (i.inFinishTrigger) return true;
  if (i.distanceToFinish > i.finishRadius) return false;
  const approach = i.approachT ?? i.finishT - 0.05;
  return i.pathT >= approach;
}

/** Horizontal distance between two world positions (ignore Y). */
export function horizontalDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}
