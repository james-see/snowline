import type { MaterialLibrary } from '@/render/materials/MaterialLibrary.ts';
import type { PropMaterialId } from '@/render/materials/ids.ts';
import type * as THREE from 'three';

export type SharedPropMaterials = Record<PropMaterialId, THREE.MeshStandardMaterial>;

/**
 * Rock / wood / metal / ice materials for `Props.ts`.
 * Call after `resources.preload()` — maps come from vendored CC0 sets when present.
 */
export function getSharedPropMaterials(library: MaterialLibrary): SharedPropMaterials {
  return {
    rock: library.prop('rock'),
    rockScree: library.prop('rockScree'),
    wood: library.prop('wood'),
    plank: library.prop('plank'),
    fabric: library.prop('fabric'),
    metal: library.prop('metal'),
    ice: library.prop('ice'),
  };
}
