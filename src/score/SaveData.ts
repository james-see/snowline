import type { CourseId, GameModeId, Medal } from '@/types/gameplay.ts';

const KEY = 'snowline.save.v1';

export interface CourseBests {
  bestTime: number | null;
  bestScore: number | null;
  medal: Medal;
}

export interface SaveState {
  version: 1;
  bests: Record<string, CourseBests>;
  unlocks: string[];
  tutorialDone: boolean;
  totalScore: number;
  runsCompleted: number;
}

function keyFor(course: CourseId, mode: GameModeId): string {
  return `${course}:${mode}`;
}

const DEFAULT: SaveState = {
  version: 1,
  bests: {},
  unlocks: ['board-azure', 'suit-ivory'],
  tutorialDone: false,
  totalScore: 0,
  runsCompleted: 0,
};

export function loadSave(): SaveState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return { ...DEFAULT, ...(JSON.parse(raw) as SaveState) };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function writeSave(state: SaveState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getBests(state: SaveState, course: CourseId, mode: GameModeId): CourseBests {
  return (
    state.bests[keyFor(course, mode)] ?? {
      bestTime: null,
      bestScore: null,
      medal: 'none',
    }
  );
}

export function recordRun(
  state: SaveState,
  course: CourseId,
  mode: GameModeId,
  time: number,
  score: number,
  medal: Medal
): SaveState {
  const k = keyFor(course, mode);
  const prev = getBests(state, course, mode);
  const next: CourseBests = {
    bestTime: prev.bestTime === null ? time : Math.min(prev.bestTime, time),
    bestScore: prev.bestScore === null ? score : Math.max(prev.bestScore, score),
    medal: medalRank(medal) > medalRank(prev.medal) ? medal : prev.medal,
  };
  state.bests[k] = next;
  state.totalScore += score;
  state.runsCompleted += 1;

  if (medal === 'gold' || medal === 'platinum') {
    unlock(state, `board-${course}`);
  }
  if (state.runsCompleted >= 3) unlock(state, 'suit-ember');
  if (state.runsCompleted >= 6) unlock(state, 'board-carbon');

  writeSave(state);
  return state;
}

function unlock(state: SaveState, id: string): void {
  if (!state.unlocks.includes(id)) state.unlocks.push(id);
}

function medalRank(m: Medal): number {
  return { none: 0, bronze: 1, silver: 2, gold: 3, platinum: 4 }[m];
}

export const COSMETICS: Record<string, { label: string; color: number }> = {
  'board-azure': { label: 'Azure Deck', color: 0x2a6cb8 },
  'board-carbon': { label: 'Carbon Edge', color: 0x1a1c1e },
  [`board-alpine`]: { label: 'Alpine Stripe', color: 0x3d8bfd },
  [`board-timberline`]: { label: 'Timber Fade', color: 0x2f6b4f },
  [`board-summit`]: { label: 'Summit Crimson', color: 0xa83232 },
  'suit-ivory': { label: 'Ivory Shell', color: 0xe8e4dc },
  'suit-ember': { label: 'Ember Softshell', color: 0xc45c26 },
};
