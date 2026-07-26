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

export const SNOW_SURFACES: Record<'powder' | 'packed' | 'ice', SnowSurfaceParams> = {
  powder: {
    kind: 'powder',
    friction: 0.04,
    gripScale: 0.72,
    drag: 0.18,
    landingScale: 1.15,
    tint: [0.92, 0.95, 1.0],
  },
  packed: {
    kind: 'packed',
    friction: 0.09,
    gripScale: 1.0,
    drag: 0.08,
    landingScale: 1.0,
    tint: [0.86, 0.9, 0.94],
  },
  ice: {
    kind: 'ice',
    friction: 0.02,
    gripScale: 0.45,
    drag: 0.04,
    landingScale: 0.82,
    tint: [0.78, 0.88, 1.0],
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
