import type { QualityPreset, QualitySettings } from '@/types/settings.ts';

/**
 * Hard render budgets for stable 60 FPS at 1920×1080 (High preset).
 * Consumers clamp runtime work to these values; quality presets scale them.
 */
export interface LodBudgets {
  /** Max tree instances drawn across all variants. */
  maxTreeInstances: number;
  /** Subset of tree instances allowed to cast shadows. */
  maxTreeShadowCasters: number;
  /** Max rock instances drawn. */
  maxRockInstances: number;
  /** Directional shadow camera far plane (metres). */
  shadowDistance: number;
  /** Ortho half-extent for the sun shadow camera (metres). */
  shadowFrustum: number;
  /** Distance past which non-tree props skip castShadow. */
  shadowCasterDistance: number;
  /** Active snowfall particles (draw + integrate). */
  maxSnowParticles: number;
  /** Active spray particles. */
  maxSprayParticles: number;
  /** Procedural albedo edge length (px). */
  textureSize: number;
  /** Max texture anisotropy. */
  anisotropy: number;
}

/** Absolute buffer ceilings — allocate once, draw fewer via budgets. */
export const LOD_BUFFER_CAPS = {
  snow: 4000,
  spray: 400,
  /** Instanced Kenney pines — timberline midfield walls need headroom past apron loners. */
  trees: 560,
  rocks: 128,
} as const;

const PRESET_BUDGETS: Record<QualityPreset, LodBudgets> = {
  low: {
    maxTreeInstances: 32,
    maxTreeShadowCasters: 8,
    maxRockInstances: 16,
    shadowDistance: 70,
    shadowFrustum: 36,
    shadowCasterDistance: 36,
    maxSnowParticles: 700,
    maxSprayParticles: 100,
    textureSize: 128,
    anisotropy: 2,
  },
  medium: {
    maxTreeInstances: 64,
    maxTreeShadowCasters: 16,
    maxRockInstances: 32,
    shadowDistance: 110,
    shadowFrustum: 52,
    shadowCasterDistance: 55,
    maxSnowParticles: 1600,
    maxSprayParticles: 180,
    textureSize: 192,
    anisotropy: 4,
  },
  high: {
    // 400: chase midfield timberline walls; still under buffer / 60fps headroom.
    maxTreeInstances: 400,
    maxTreeShadowCasters: 56,
    maxRockInstances: 48,
    shadowDistance: 140,
    shadowFrustum: 64,
    shadowCasterDistance: 70,
    maxSnowParticles: 2200,
    maxSprayParticles: 260,
    textureSize: 256,
    anisotropy: 8,
  },
  ultra: {
    maxTreeInstances: 560,
    maxTreeShadowCasters: 80,
    maxRockInstances: 80,
    shadowDistance: 200,
    shadowFrustum: 90,
    shadowCasterDistance: 100,
    maxSnowParticles: 4000,
    maxSprayParticles: 400,
    textureSize: 256,
    anisotropy: 16,
  },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Resolve effective LOD budgets from the active quality settings. */
export function resolveLodBudgets(
  settings: Pick<
    QualitySettings,
    'preset' | 'lodBias' | 'maxParticles' | 'shadowDistance' | 'anisotropy'
  >
): LodBudgets {
  const base = PRESET_BUDGETS[settings.preset] ?? PRESET_BUDGETS.high;
  const bias = clamp(settings.lodBias, 0.35, 1.25);

  const scaleCount = (n: number, min: number): number =>
    Math.max(min, Math.round(n * bias));

  return {
    maxTreeInstances: Math.min(
      LOD_BUFFER_CAPS.trees,
      scaleCount(base.maxTreeInstances, 8)
    ),
    maxTreeShadowCasters: Math.min(
      LOD_BUFFER_CAPS.trees,
      scaleCount(base.maxTreeShadowCasters, 4)
    ),
    maxRockInstances: Math.min(
      LOD_BUFFER_CAPS.rocks,
      scaleCount(base.maxRockInstances, 4)
    ),
    shadowDistance: Math.min(settings.shadowDistance, base.shadowDistance),
    shadowFrustum: base.shadowFrustum,
    shadowCasterDistance: base.shadowCasterDistance,
    maxSnowParticles: Math.min(
      LOD_BUFFER_CAPS.snow,
      settings.maxParticles,
      scaleCount(base.maxSnowParticles, 200)
    ),
    maxSprayParticles: Math.min(
      LOD_BUFFER_CAPS.spray,
      scaleCount(base.maxSprayParticles, 40)
    ),
    textureSize: base.textureSize,
    anisotropy: Math.min(settings.anisotropy, base.anisotropy),
  };
}

export function presetBudgets(preset: QualityPreset): LodBudgets {
  return { ...PRESET_BUDGETS[preset] };
}
