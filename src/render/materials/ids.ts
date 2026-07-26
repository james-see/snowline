/** Vendored CC0 PBR set ids under `public/assets/textures/`. */
export const PBR_SET_IDS = [
  'snow_powder',
  'snow_groom',
  'rock_face',
  'rock_scree',
  'ice_glass',
  'ice_frost',
] as const;

export type PbrSetId = (typeof PBR_SET_IDS)[number];

/** Gameplay-facing surface materials (powder / packed groom / ice). */
export type SnowVariantId = 'powder' | 'packed' | 'ice';

/** Terrain material groups after vertex-tint classification. */
export type TerrainVariantId = SnowVariantId | 'rock';

/** Shared prop materials exported for `Props.ts`. */
export type PropMaterialId = 'rock' | 'rockScree' | 'wood' | 'metal' | 'ice';

export const SNOW_VARIANT_TO_PBR: Record<SnowVariantId, PbrSetId> = {
  powder: 'snow_powder',
  packed: 'snow_groom',
  ice: 'ice_glass',
};

/**
 * Vertex-colour tints authored by TerrainGenerator (`surfaces.ts`).
 * Must match `SNOW_SURFACES` / `PROP_SURFACES.rock` exactly for classification.
 */
export const SURFACE_TINTS: Record<TerrainVariantId, readonly [number, number, number]> = {
  powder: [0.93, 0.96, 1.0],
  packed: [0.86, 0.9, 0.94],
  ice: [0.76, 0.87, 1.0],
  rock: [0.45, 0.44, 0.42],
};
