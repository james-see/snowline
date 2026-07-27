import * as THREE from 'three';
import type { MaterialLibrary } from '@/render/materials/MaterialLibrary.ts';

export const mats = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 }),
  trunkDark: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.92 }),
  canopy: [
    new THREE.MeshStandardMaterial({ color: 0x1a4a2a, roughness: 0.96, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x245c34, roughness: 0.94, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x2f6840, roughness: 0.93, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x173d24, roughness: 0.97, side: THREE.DoubleSide }),
  ],
  snowCap: new THREE.MeshStandardMaterial({
    color: 0xf2f6fa,
    roughness: 0.88,
    metalness: 0.02,
  }),
  rail: new THREE.MeshStandardMaterial({
    color: 0xc5d0da,
    metalness: 0.88,
    roughness: 0.22,
  }),
  railDark: new THREE.MeshStandardMaterial({
    color: 0x6a7380,
    metalness: 0.75,
    roughness: 0.4,
  }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.92 }),
  snowDeck: new THREE.MeshStandardMaterial({
    color: 0xe8eef5,
    roughness: 0.78,
    metalness: 0.04,
  }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.88 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 }),
  rock: [
    new THREE.MeshStandardMaterial({ color: 0x6a6764, roughness: 0.94 }),
    new THREE.MeshStandardMaterial({ color: 0x5c5956, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x787572, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x4f4c49, roughness: 0.96 }),
  ],
  gate: new THREE.MeshStandardMaterial({
    color: 0xff4a2e,
    roughness: 0.48,
    emissive: 0x3a1208,
    emissiveIntensity: 0.55,
  }),
  gateAccent: new THREE.MeshStandardMaterial({
    color: 0xffcc33,
    roughness: 0.55,
    emissive: 0x442200,
    emissiveIntensity: 0.35,
  }),
  finish: new THREE.MeshStandardMaterial({
    color: 0x33c8ff,
    roughness: 0.42,
    emissive: 0x003344,
    emissiveIntensity: 0.65,
  }),
  finishBanner: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    side: THREE.DoubleSide,
  }),
  flag: new THREE.MeshStandardMaterial({
    color: 0xffe14a,
    roughness: 0.55,
    side: THREE.DoubleSide,
  }),
  tunnel: new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 }),
  tunnelSnow: new THREE.MeshStandardMaterial({ color: 0xe4ebf2, roughness: 0.86 }),
  bannerBoard: new THREE.MeshStandardMaterial({
    color: 0xf2f4f7,
    roughness: 0.72,
    side: THREE.DoubleSide,
  }),
  bannerFrame: new THREE.MeshStandardMaterial({
    color: 0xc01820,
    roughness: 0.55,
    emissive: 0x3a0808,
    emissiveIntensity: 0.25,
  }),
  fencePost: new THREE.MeshStandardMaterial({ color: 0x6a7180, metalness: 0.55, roughness: 0.45 }),
  fenceRail: new THREE.MeshStandardMaterial({ color: 0x8a92a0, metalness: 0.4, roughness: 0.5 }),
  fenceNet: new THREE.MeshStandardMaterial({
    color: 0xd8dee8,
    roughness: 0.85,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
};

/** Alpine canopy tints — multiply over needle albedo for forest density read. */
const CANOPY_TINTS = [0x1a4a2a, 0x245c34, 0x2f6840, 0x173d24] as const;

/**
 * Copy bark / plank / fabric / foliage PBR from MaterialLibrary onto shared course mats.
 * Call after `resources.preload()` has bound vendored CC0 sets.
 */
export function bindAuthoredPropMaps(library: MaterialLibrary): void {
  const bark = library.prop('wood');
  const plank = library.prop('plank');
  const fabric = library.prop('fabric');
  const foliage = library.prop('foliage');

  copyMaps(bark, mats.trunk, 0x8a6240);
  copyMaps(bark, mats.trunkDark, 0x6a4a30);
  copyMaps(bark, mats.tunnel, 0x6a4a30);
  copyMaps(plank, mats.wood, 0x9a6a3c);
  copyMaps(plank, mats.woodDark, 0x5a3a20);
  copyMaps(fabric, mats.finishBanner, 0xf2ebe0);
  copyMaps(fabric, mats.flag, 0xffe14a);
  mats.flag.normalScale.set(0.8, 0.8);

  // Kenney leaf meshes + procedural cones share mats.canopy (instancing-safe).
  for (let i = 0; i < mats.canopy.length; i++) {
    const canopy = mats.canopy[i]!;
    copyMaps(foliage, canopy, CANOPY_TINTS[i % CANOPY_TINTS.length]!);
    canopy.side = THREE.DoubleSide;
    canopy.roughness = 0.96;
    canopy.metalness = 0;
    // Soft normals — Kenney facets read less cubic under alpine key light.
    canopy.normalScale.set(0.28, 0.28);
    canopy.envMapIntensity = 0.28;
    canopy.flatShading = false;
  }
}

function copyMaps(
  src: THREE.MeshStandardMaterial,
  dest: THREE.MeshStandardMaterial,
  tint: number
): void {
  if (!src.map) return;
  dest.map = src.map.clone();
  if (src.normalMap) dest.normalMap = src.normalMap.clone();
  if (src.aoMap) dest.aoMap = src.aoMap.clone();
  if (src.roughnessMap) dest.roughnessMap = src.roughnessMap.clone();
  if (src.metalnessMap) dest.metalnessMap = src.metalnessMap.clone();
  dest.normalScale.copy(src.normalScale);
  dest.aoMapIntensity = src.aoMapIntensity;
  dest.color.setHex(tint);
  dest.roughness = src.roughness;
  dest.metalness = src.metalness;
  dest.needsUpdate = true;
}

export function disposeSharedMaterials(): void {
  for (const value of Object.values(mats)) {
    if (Array.isArray(value)) value.forEach((m) => m.dispose());
    else value.dispose();
  }
}
