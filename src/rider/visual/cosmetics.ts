import { COSMETICS, loadSave, type SaveState } from '@/score/SaveData.ts';

export interface RiderCosmetics {
  boardId: string;
  suitId: string;
  boardColor: number;
  suitColor: number;
}

const DEFAULT_BOARD = 'board-azure';
const DEFAULT_SUIT = 'suit-ivory';

/** Pick the latest unlocked cosmetic of each kind from save unlocks. */
export function resolveCosmetics(save: SaveState = loadSave()): RiderCosmetics {
  let boardId = DEFAULT_BOARD;
  let suitId = DEFAULT_SUIT;

  for (const id of save.unlocks) {
    if (!COSMETICS[id]) continue;
    if (id.startsWith('board-')) boardId = id;
    if (id.startsWith('suit-')) suitId = id;
  }

  return {
    boardId,
    suitId,
    boardColor: COSMETICS[boardId]?.color ?? COSMETICS[DEFAULT_BOARD]!.color,
    suitColor: COSMETICS[suitId]?.color ?? COSMETICS[DEFAULT_SUIT]!.color,
  };
}
