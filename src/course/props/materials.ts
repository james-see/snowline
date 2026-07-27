import * as THREE from 'three';
import type { MaterialLibrary } from '@/render/materials/MaterialLibrary.ts';
import {
  disposeNeedleCardTextures,
  getNeedleCardTextures,
} from '@/course/props/foliageCanopy.ts';

/** Alpine canopy tints — multiply over needle albedo for forest density read. */
const CANOPY_TINTS = [0x1a4a2a, 0x245c34, 0x2f6840, 0x173d24] as const;

function makeCanopyMat(tint: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
    // Soft green sheen ≈ cheap subsurface on needle mass under alpine key.
    sheen: 0.42,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0x6aab68),
    emissive: new THREE.Color(0x0a1a0c),
    emissiveIntensity: 0.12,
    envMapIntensity: 0.32,
    flatShading: false,
  });
}

function makeCanopyCardMat(tint: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    sheen: 0.5,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color(0x7cbc70),
    emissive: new THREE.Color(0x081408),
    emissiveIntensity: 0.1,
    envMapIntensity: 0.28,
    alphaTest: 0.38,
    depthWrite: true,
    flatShading: false,
  });
}

export const mats = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 }),
  trunkDark: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.92 }),
  /** Soft volume fill (Kenney shells / layered cones). */
  canopy: CANOPY_TINTS.map((t) => makeCanopyMat(t)),
  /** Alpha-tested needle cards — outer silhouette + see-through gaps. */
  canopyCard: CANOPY_TINTS.map((t) => makeCanopyCardMat(t)),
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
  // Jump / kicker decks — cooler packed snow with enough roughness contrast for lip form.
  snowDeck: new THREE.MeshStandardMaterial({
    color: 0xe4ecf4,
    roughness: 0.62,
    metalness: 0.03,
    envMapIntensity: 0.85,
  }),
  snowDeckShade: new THREE.MeshStandardMaterial({
    color: 0xb8c4d0,
    roughness: 0.78,
    metalness: 0.02,
    envMapIntensity: 0.55,
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

/**
 * Copy bark / plank / fabric / foliage PBR from MaterialLibrary onto shared course mats.
 * Call after `resources.preload()` has bound vendored CC0 sets.
 */
export function bindAuthoredPropMaps(library: MaterialLibrary): void {
  const bark = library.prop('wood');
  const plank = library.prop('plank');
  const fabric = library.prop('fabric');
  const foliage = library.prop('foliage');
  const packed = library.snow('packed');

  copyMaps(bark, mats.trunk, 0x8a6240);
  copyMaps(bark, mats.trunkDark, 0x6a4a30);
  copyMaps(bark, mats.tunnel, 0x6a4a30);
  copyMaps(plank, mats.wood, 0x9a6a3c);
  copyMaps(plank, mats.woodDark, 0x5a3a20);
  copyMaps(fabric, mats.finishBanner, 0xf2ebe0);
  copyMaps(fabric, mats.flag, 0xffe14a);
  mats.flag.normalScale.set(0.8, 0.8);

  // Kickers share packed groom maps so jump faces get corduroy + sun form.
  copyMaps(packed, mats.snowDeck, 0xe4ecf4);
  copyMaps(packed, mats.snowDeckShade, 0xb8c4d0);
  mats.snowDeck.roughness = 0.58;
  mats.snowDeck.normalScale.set(1.6, 1.6);
  mats.snowDeckShade.roughness = 0.74;
  mats.snowDeckShade.normalScale.set(1.4, 1.4);
  mats.snowDeck.envMapIntensity = 0.9;
  mats.snowDeckShade.envMapIntensity = 0.55;

  const needles = getNeedleCardTextures();

  // Volume canopies — Poly Haven needle litter + soft sheen.
  for (let i = 0; i < mats.canopy.length; i++) {
    const canopy = mats.canopy[i]!;
    copyMaps(foliage, canopy, CANOPY_TINTS[i % CANOPY_TINTS.length]!);
    canopy.side = THREE.DoubleSide;
    canopy.roughness = 0.92;
    canopy.metalness = 0;
    canopy.normalScale.set(0.55, 0.55);
    canopy.envMapIntensity = 0.32;
    canopy.sheen = 0.42;
    canopy.sheenRoughness = 0.72;
    canopy.sheenColor.setHex(0x6aab68);
    canopy.emissive.setHex(0x0a1a0c);
    canopy.emissiveIntensity = 0.12;
    canopy.flatShading = false;
  }

  // Needle cards — frayed alpha silhouette; albedo prefers CC0 litter when present.
  for (let i = 0; i < mats.canopyCard.length; i++) {
    const card = mats.canopyCard[i]!;
    const tint = CANOPY_TINTS[i % CANOPY_TINTS.length]!;
    if (foliage.map) {
      copyMaps(foliage, card, tint);
      // Keep litter grain but punch with procedural needle alpha.
      card.alphaMap = needles.alphaMap;
    } else {
      card.map = needles.map;
      card.alphaMap = needles.alphaMap;
      card.color.setHex(tint);
    }
    card.side = THREE.DoubleSide;
    card.roughness = 0.9;
    card.metalness = 0;
    card.normalScale.set(0.4, 0.4);
    card.envMapIntensity = 0.28;
    card.alphaTest = 0.38;
    card.depthWrite = true;
    card.sheen = 0.5;
    card.sheenRoughness = 0.65;
    card.sheenColor.setHex(0x7cbc70);
    card.emissive.setHex(0x081408);
    card.emissiveIntensity = 0.1;
    card.flatShading = false;
    // Mild wind-lite sway — uniforms ticked from RenderModule.
    attachCanopyWind(card, 0.045 + i * 0.004);
    card.needsUpdate = true;
  }

  for (const canopy of mats.canopy) {
    attachCanopyWind(canopy, 0.018);
  }
}

const canopyWindTime = { value: 0 };

function attachCanopyWind(mat: THREE.MeshPhysicalMaterial, amount: number): void {
  const key = `canopy-wind-${amount.toFixed(3)}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.canopyWindTime = canopyWindTime;
    shader.uniforms.canopyWindAmt = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float canopyWindTime;
uniform float canopyWindAmt;`
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
{
  float h = max( transformed.y, 0.0 );
  float w = canopyWindAmt * h * 0.12;
  transformed.x += sin( canopyWindTime * 1.1 + transformed.z * 0.35 + h * 0.4 ) * w;
  transformed.z += cos( canopyWindTime * 0.9 + transformed.x * 0.3 ) * w * 0.65;
}`
      );
  };
}

/** Advance shared canopy wind phase (call once per frame). */
export function tickCanopyWind(timeSec: number): void {
  canopyWindTime.value = timeSec;
}

function copyMaps(
  src: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  dest: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
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
  disposeNeedleCardTextures();
  canopyWindTime.value = 0;
  for (const value of Object.values(mats)) {
    if (Array.isArray(value)) value.forEach((m) => m.dispose());
    else value.dispose();
  }
}
