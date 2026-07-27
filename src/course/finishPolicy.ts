/**
 * Pure finish-line policy — when a run should complete.
 * Checkpoints are progress markers; they do not gate the arch.
 */

export interface FinishCheckInput {
  alreadyFinished: boolean;
  /** Rider inside the finish_arch trigger volume. */
  inFinishTrigger: boolean;
  pathT: number;
  finishT: number;
  /** |lateral| from path center at closest point (metres). */
  lateralAbs: number;
  /** Half-width of the finish corridor for path-T fallback. */
  finishHalfWidth: number;
}

/** True when the rider should enter the completed/results flow. */
export function shouldCompleteRun(i: FinishCheckInput): boolean {
  if (i.alreadyFinished) return false;
  if (i.inFinishTrigger) return true;
  // Past the arch along the line, still in the finish corridor.
  return i.pathT >= i.finishT && i.lateralAbs <= i.finishHalfWidth;
}
