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
 * Ivory / pale shells wash out on snow. Visual remap keeps save IDs intact
 * while ensuring a readable dark silhouette in gameplay frames.
 */
const SUIT_SNOW_CONTRAST: Record<string, number> = {
  'suit-ivory': 0x2a3344,
};

function luminance(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Fallback for any custom pale suit that would disappear on snow. */
function ensureSnowContrast(hex: number): number {
  return luminance(hex) > 0.55 ? 0x2a3344 : hex;
}

/** Pick equipped cosmetics from save; force suit colors that read on snow. */
export function resolveCosmetics(save: SaveState = loadSave()): RiderCosmetics {
  const boardId = save.unlocks.includes(save.equippedBoard)
    ? save.equippedBoard
    : DEFAULT_BOARD;
  const suitId = save.unlocks.includes(save.equippedSuit) ? save.equippedSuit : DEFAULT_SUIT;

  const rawSuit = COSMETICS[suitId]?.color ?? COSMETICS[DEFAULT_SUIT]!.color;
  const suitColor = SUIT_SNOW_CONTRAST[suitId] ?? ensureSnowContrast(rawSuit);

  return {
    boardId,
    suitId,
    boardColor: COSMETICS[boardId]?.color ?? COSMETICS[DEFAULT_BOARD]!.color,
    suitColor,
  };
}
