import type { SurfaceKind } from '@/types/gameplay.ts';

export interface SnowSurfaceParams {
  kind: SurfaceKind;
  /** Kinetic friction coefficient used by board physics. */
  friction: number;
  /** Multiplier on carve/edge grip. */
  gripScale: number;
  /** Speed damping from snow drag. */
  drag: number;
  /** Landing forgiveness multiplier (>1 = softer). */
  landingScale: number;
  /** Visual tint for debug / vertex colour fallback. */
  tint: [number, number, number];
}

/** Snow kinds used by terrain vertex paint and board grip. */
export const SNOW_SURFACES: Record<'powder' | 'packed' | 'ice', SnowSurfaceParams> = {
  powder: {
    kind: 'powder',
    friction: 0.035,
    gripScale: 0.7,
    drag: 0.2,
    landingScale: 1.18,
    tint: [0.93, 0.96, 1.0],
  },
  packed: {
    kind: 'packed',
    friction: 0.09,
    gripScale: 1.0,
    drag: 0.075,
    landingScale: 1.0,
    tint: [0.86, 0.9, 0.94],
  },
  ice: {
    kind: 'ice',
    friction: 0.018,
    gripScale: 0.42,
    drag: 0.035,
    landingScale: 0.8,
    tint: [0.76, 0.87, 1.0],
  },
};

export const PROP_SURFACES: Partial<Record<SurfaceKind, SnowSurfaceParams>> = {
  rail: {
    kind: 'rail',
    friction: 0.015,
    gripScale: 0.35,
    drag: 0.02,
    landingScale: 0.95,
    tint: [0.75, 0.78, 0.82],
  },
  wood: {
    kind: 'wood',
    friction: 0.12,
    gripScale: 0.9,
    drag: 0.06,
    landingScale: 0.9,
    tint: [0.55, 0.42, 0.28],
  },
  rock: {
    kind: 'rock',
    friction: 0.22,
    gripScale: 0.25,
    drag: 0.35,
    landingScale: 0.55,
    tint: [0.45, 0.44, 0.42],
  },
};

export function getSurfaceParams(kind: SurfaceKind): SnowSurfaceParams {
  if (kind === 'powder' || kind === 'packed' || kind === 'ice') {
    return SNOW_SURFACES[kind];
  }
  return (
    PROP_SURFACES[kind] ?? {
      kind,
      friction: 0.1,
      gripScale: 0.8,
      drag: 0.1,
      landingScale: 1.0,
      tint: [0.8, 0.8, 0.8],
    }
  );
}

export function surfaceKindIndex(kind: SurfaceKind, table: readonly SurfaceKind[]): number {
  const idx = table.indexOf(kind);
  return idx >= 0 ? idx : 0;
}
