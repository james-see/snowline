import { COSMETICS, loadSave, type SaveState } from '@/score/SaveData.ts';

export interface RiderCosmetics {
  boardId: string;
  suitId: string;
  boardColor: number;
  suitColor: number;
}

const DEFAULT_BOARD = 'board-azure';
const DEFAULT_SUIT = 'suit-ivory';

/**
 * Pale / washed shells disappear on snow. Remap to vivid alpine race kit
 * (ink shell; orange boards) while keeping save IDs intact.
 */
const SUIT_SNOW_CONTRAST: Record<string, number> = {
  'suit-ivory': 0x0a101c,
  'suit-ember': 0x1a0e08,
};

const BOARD_VIVID: Record<string, number> = {
  'board-azure': 0xff5a12,
  'board-carbon': 0xb8ff2e,
  'board-alpine': 0xff6a14,
  'board-timberline': 0xc8ff3a,
  'board-summit': 0xff3d1a,
};

function luminance(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Fallback for any custom pale suit that would disappear on snow. */
function ensureSnowContrast(hex: number): number {
  return luminance(hex) > 0.45 ? 0x0a101c : hex;
}

/** Pick equipped cosmetics from save; force suit/board colors that read on snow. */
export function resolveCosmetics(save: SaveState = loadSave()): RiderCosmetics {
  const boardId = save.unlocks.includes(save.equippedBoard)
    ? save.equippedBoard
    : DEFAULT_BOARD;
  const suitId = save.unlocks.includes(save.equippedSuit) ? save.equippedSuit : DEFAULT_SUIT;

  const rawSuit = COSMETICS[suitId]?.color ?? COSMETICS[DEFAULT_SUIT]!.color;
  const suitColor = SUIT_SNOW_CONTRAST[suitId] ?? ensureSnowContrast(rawSuit);
  const rawBoard = COSMETICS[boardId]?.color ?? COSMETICS[DEFAULT_BOARD]!.color;
  const boardColor = BOARD_VIVID[boardId] ?? rawBoard;

  return {
    boardId,
    suitId,
    boardColor,
    suitColor,
  };
}
