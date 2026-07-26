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
  equippedBoard: string;
  equippedSuit: string;
  tutorialDone: boolean;
  totalScore: number;
  runsCompleted: number;
}

function keyFor(course: CourseId, mode: GameModeId): string {
  return `${course}:${normalizeMode(mode)}`;
}

/** Collapse legacy aliases used by early capture stubs. */
export function normalizeMode(mode: GameModeId): 'freeride' | 'time_trial' | 'trick_attack' {
  if (mode === 'free') return 'freeride';
  if (mode === 'time') return 'time_trial';
  if (mode === 'score') return 'trick_attack';
  return mode;
}

export function isScoreMode(mode: GameModeId): boolean {
  const m = normalizeMode(mode);
  return m === 'trick_attack';
}

export function isTimeMode(mode: GameModeId): boolean {
  const m = normalizeMode(mode);
  return m === 'freeride' || m === 'time_trial';
}

const DEFAULT: SaveState = {
  version: 1,
  bests: {},
  unlocks: ['board-azure', 'suit-ivory'],
  equippedBoard: 'board-azure',
  equippedSuit: 'suit-ivory',
  tutorialDone: false,
  totalScore: 0,
  runsCompleted: 0,
};

/** In-memory fallback when localStorage is missing (node tests / private mode). */
const memoryStore = new Map<string, string>();

const memoryStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem: (k) => memoryStore.get(k) ?? null,
  setItem: (k, v) => {
    memoryStore.set(k, v);
  },
  removeItem: (k) => {
    memoryStore.delete(k);
  },
};

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* ignore */
  }
  return memoryStorage;
}

export function loadSave(): SaveState {
  try {
    const raw = storage().getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    const merged: SaveState = {
      ...structuredClone(DEFAULT),
      ...parsed,
      version: 1,
      bests: { ...DEFAULT.bests, ...(parsed.bests ?? {}) },
      unlocks: Array.isArray(parsed.unlocks) ? [...parsed.unlocks] : [...DEFAULT.unlocks],
    };
    if (!merged.unlocks.includes(merged.equippedBoard)) merged.equippedBoard = 'board-azure';
    if (!merged.unlocks.includes(merged.equippedSuit)) merged.equippedSuit = 'suit-ivory';
    return merged;
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function writeSave(state: SaveState): void {
  storage().setItem(KEY, JSON.stringify(state));
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

export function isUnlocked(state: SaveState, id: string): boolean {
  return state.unlocks.includes(id);
}

export function equipCosmetic(state: SaveState, id: string): SaveState {
  const cosmetic = COSMETICS[id];
  if (!cosmetic || !state.unlocks.includes(id)) return state;
  if (cosmetic.kind === 'board') state.equippedBoard = id;
  else state.equippedSuit = id;
  writeSave(state);
  return state;
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
  state.totalScore += Math.floor(score);
  state.runsCompleted += 1;

  if (medal === 'gold' || medal === 'platinum') {
    unlock(state, `board-${course}`);
  }
  if (state.runsCompleted >= 3) unlock(state, 'suit-ember');
  if (state.runsCompleted >= 6) unlock(state, 'board-carbon');

  writeSave(state);
  return state;
}

export function markTutorialDone(state: SaveState = loadSave()): SaveState {
  state.tutorialDone = true;
  writeSave(state);
  return state;
}

function unlock(state: SaveState, id: string): void {
  if (!state.unlocks.includes(id) && COSMETICS[id]) state.unlocks.push(id);
}

export function medalRank(m: Medal): number {
  return { none: 0, bronze: 1, silver: 2, gold: 3, platinum: 4 }[m];
}

export type CosmeticKind = 'board' | 'suit';

export interface CosmeticDef {
  label: string;
  color: number;
  kind: CosmeticKind;
}

export const COSMETICS: Record<string, CosmeticDef> = {
  'board-azure': { label: 'Azure Deck', color: 0x2a6cb8, kind: 'board' },
  'board-carbon': { label: 'Carbon Edge', color: 0x1a1c1e, kind: 'board' },
  'board-alpine': { label: 'Alpine Stripe', color: 0x3d8bfd, kind: 'board' },
  'board-timberline': { label: 'Timber Fade', color: 0x2f6b4f, kind: 'board' },
  'board-summit': { label: 'Summit Crimson', color: 0xa83232, kind: 'board' },
  'suit-ivory': { label: 'Ivory Shell', color: 0xe8e4dc, kind: 'suit' },
  'suit-ember': { label: 'Ember Softshell', color: 0xc45c26, kind: 'suit' },
};

/** Test helper — clears persisted save. */
export function clearSave(): void {
  storage().removeItem(KEY);
}
