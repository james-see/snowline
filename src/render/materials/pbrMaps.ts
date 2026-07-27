import * as THREE from 'three';
import type { PbrSetId } from '@/render/materials/ids.ts';

export interface PbrMaps {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
  tileScale: number;
}

export interface ManifestMaterialEntry {
  id: string;
  albedo: string;
  normal: string;
  orm: string;
  tileScale: number;
  source?: {
    name?: string;
    author?: string;
    license?: string;
    url?: string | null;
  };
}

/** Default metres-per-repeat when manifest omits tileScale. Larger = smoother wide fields. */
export const DEFAULT_TILE_SCALE: Record<PbrSetId, number> = {
  /** Soft powder sheets — avoid dense wallpaper on aprons. */
  snow_powder: 22,
  /** Groom/corduroy readable at chase distance without bathroom-tile repeats. */
  snow_groom: 16,
  rock_face: 4,
  rock_scree: 3,
  ice_glass: 10,
  ice_frost: 12,
  wood_bark: 2,
  /** Dense needle microdetail on low-poly Kenney / cone canopies. */
  foliage_pine: 1.25,
  wood_plank: 2,
  fabric_banner: 1.5,
};

export function configureColorMap(tex: THREE.Texture, anisotropy: number): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
}

export function configureDataMap(tex: THREE.Texture, anisotropy: number): void {
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
}

export function cloneMaps(maps: PbrMaps): PbrMaps {
  return {
    albedo: maps.albedo.clone(),
    normal: maps.normal.clone(),
    orm: maps.orm.clone(),
    tileScale: maps.tileScale,
  };
}

export function setMapRepeat(maps: PbrMaps, repeatU: number, repeatV: number): void {
  for (const t of [maps.albedo, maps.normal, maps.orm]) {
    t.repeat.set(repeatU, repeatV);
    t.needsUpdate = true;
  }
}

/**
 * Bind albedo / normal / ORM (ao=R, rough=G, metal=B) onto a standard/physical material.
 * Ensures `uv2` exists when an AO map is present (Three requires a second UV set).
 */
export function applyPbrMaps(
  material: THREE.MeshStandardMaterial,
  maps: PbrMaps,
  opts: { repeatU?: number; repeatV?: number } = {}
): void {
  const repeatU = opts.repeatU ?? 1;
  const repeatV = opts.repeatV ?? 1;
  setMapRepeat(maps, repeatU, repeatV);

  material.map = maps.albedo;
  material.normalMap = maps.normal;
  material.normalScale.set(1, 1);
  material.aoMap = maps.orm;
  material.aoMapIntensity = 0.85;
  material.roughnessMap = maps.orm;
  material.metalnessMap = maps.orm;
  material.needsUpdate = true;
}

export function ensureUv2(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute('uv2')) return;
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  geometry.setAttribute('uv2', uv.clone());
}
