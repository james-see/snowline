/**
 * Pure finish-line policy — when a run should complete.
 * Checkpoints are progress markers; they do not gate the arch.
 *
 * Terrain Y is dropped far below authored control points, so spline
 * closestPoint `lateral` near the finish is often tens of metres on the
 * race centerline. Prefer pathT + XZ distance-to-arch instead.
 *
 * End-zone void: riders often fall off the mesh / apron lip short of the
 * arch (pathT ~0.88–0.94, 100–180 m out). Void recovery then wallows forever
 * because peakPathT never reaches finish.t and plaza radius never covers.
 * Soft-complete there — freeride and race alike — instead of infinite bounce.
 */

export interface FinishCheckInput {
  alreadyFinished: boolean;
  /** Rider inside the finish_arch trigger volume. */
  inFinishTrigger: boolean;
  pathT: number;
  finishT: number;
  /** Horizontal (XZ) metres from rider to the finish bed / arch. */
  distanceToFinish: number;
  /** Accept radius around the arch for the approach band (metres). */
  finishRadius: number;
  /**
   * Path-T band before the arch that still counts when inside finishRadius.
   * Covers void-bounce / short approaches that never quite enter the AABB.
   */
  approachT?: number;
  /**
   * Soft-complete when recovering from off-mesh void past this pathT
   * (typically last checkpoint or finish.t − ~0.12).
   */
  endZoneT?: number;
  /** True while BoardPhysics is in void wallow / void crash recovery. */
  inEndZoneVoid?: boolean;
}

/** True when the rider should enter the completed/results flow. */
export function shouldCompleteRun(i: FinishCheckInput): boolean {
  if (i.alreadyFinished) return false;
  if (i.inFinishTrigger) return true;
  // Past the finish parameter: always complete — even off-mesh / void wallow
  // where XZ distance to the arch can exceed the plaza radius.
  if (i.pathT >= i.finishT) return true;
  const endZone = i.endZoneT ?? i.finishT - 0.12;
  if (i.inEndZoneVoid && i.pathT >= endZone) return true;
  const approach = i.approachT ?? i.finishT - 0.06;
  return i.pathT >= approach && i.distanceToFinish <= i.finishRadius;
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
