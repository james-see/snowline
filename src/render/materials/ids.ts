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

/** Shared prop materials exported for `Props.ts`. */
export type PropMaterialId = 'rock' | 'rockScree' | 'wood' | 'metal' | 'ice';

export const SNOW_VARIANT_TO_PBR: Record<SnowVariantId, PbrSetId> = {
  powder: 'snow_powder',
  packed: 'snow_groom',
  ice: 'ice_glass',
};

/** Vertex-colour tints authored by TerrainGenerator (`surfaces.ts`). */
export const SURFACE_TINTS: Record<SnowVariantId, readonly [number, number, number]> = {
  powder: [0.92, 0.95, 1.0],
  packed: [0.86, 0.9, 0.94],
  ice: [0.78, 0.88, 1.0],
};
