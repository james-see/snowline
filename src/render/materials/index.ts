export {
  PBR_SET_IDS,
  SNOW_VARIANT_TO_PBR,
  SURFACE_TINTS,
  type PbrSetId,
  type PropMaterialId,
  type SnowVariantId,
} from '@/render/materials/ids.ts';

export {
  applyPbrMaps,
  cloneMaps,
  configureColorMap,
  configureDataMap,
  DEFAULT_TILE_SCALE,
  ensureUv2,
  setMapRepeat,
  type ManifestMaterialEntry,
  type PbrMaps,
} from '@/render/materials/pbrMaps.ts';

export {
  MaterialLibrary,
  createMaterialLibrary,
  listPbrSetIds,
  type TerrainApplyOptions,
} from '@/render/materials/MaterialLibrary.ts';

export {
  getSharedPropMaterials,
  type SharedPropMaterials,
} from '@/render/materials/props.ts';
