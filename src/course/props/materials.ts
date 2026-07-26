import * as THREE from 'three';

export const mats = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 }),
  trunkDark: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.92 }),
  canopy: [
    new THREE.MeshStandardMaterial({ color: 0x1a4a2a, roughness: 0.96 }),
    new THREE.MeshStandardMaterial({ color: 0x245c34, roughness: 0.94 }),
    new THREE.MeshStandardMaterial({ color: 0x2f6840, roughness: 0.93 }),
    new THREE.MeshStandardMaterial({ color: 0x173d24, roughness: 0.97 }),
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
};

export function disposeSharedMaterials(): void {
  for (const value of Object.values(mats)) {
    if (Array.isArray(value)) value.forEach((m) => m.dispose());
    else value.dispose();
  }
}
