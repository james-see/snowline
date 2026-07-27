import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mats } from '@/course/props/materials.ts';

export interface TreeModelManifestEntry {
  id: string;
  url: string;
  kind?: string;
  variant?: number;
  scale?: number;
}

/** Kenney pines are ~1.55 m; match procedural ~7–8 m canopy height. */
export const DEFAULT_TREE_SCALE = 5.5;

const prototypes = new Map<number, THREE.Group>();
let loaded = false;

export function hasTreePrototypes(): boolean {
  return loaded && prototypes.size > 0;
}

export function getTreePrototype(variant: number): THREE.Group | null {
  if (prototypes.size === 0) return null;
  const keys = [...prototypes.keys()].sort((a, b) => a - b);
  const key = keys[variant % keys.length];
  return key === undefined ? null : (prototypes.get(key) ?? null);
}

/**
 * Load Kenney pine GLBs from the asset manifest. Safe to call multiple times;
 * no-ops when already loaded. Missing / failed loads leave the map empty so
 * `buildTree` falls back to procedural cones.
 */
export async function loadTreePrototypes(
  entries: readonly TreeModelManifestEntry[],
  onProgress?: (loaded: number, total: number, id: string) => void
): Promise<number> {
  if (loaded) return prototypes.size;
  loaded = true;

  const trees = entries.filter((e) => (e.kind ?? 'tree') === 'tree' && e.url);
  if (trees.length === 0) return 0;

  const loader = new GLTFLoader();
  let ok = 0;
  const total = trees.length;
  for (let i = 0; i < trees.length; i++) {
    const entry = trees[i]!;
    onProgress?.(i, total, entry.id);
    try {
      const gltf = await loader.loadAsync(entry.url);
      const variant = entry.variant ?? ok;
      const scale = entry.scale ?? DEFAULT_TREE_SCALE;
      const proto = flattenTreeGroup(gltf.scene, variant, scale);
      prototypes.set(variant, proto);
      ok++;
    } catch (err) {
      console.warn(`[trees] failed to load ${entry.id} (${entry.url}):`, err);
    }
  }
  onProgress?.(total, total, 'trees');
  return ok;
}

/** Clone a prototype into a flat group of Meshes (geometries shared with prototype). */
export function cloneTreePrototype(variant: number): THREE.Group | null {
  const proto = getTreePrototype(variant);
  if (!proto) return null;

  const g = new THREE.Group();
  g.name = 'tree-proto';
  g.userData.authoredTree = true;
  g.userData.treeScale = proto.userData.treeScale ?? DEFAULT_TREE_SCALE;

  for (const child of proto.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) continue;
    const clone = new THREE.Mesh(mesh.geometry, mesh.material);
    clone.name = mesh.name;
    clone.position.copy(mesh.position);
    clone.quaternion.copy(mesh.quaternion);
    clone.scale.copy(mesh.scale);
    clone.castShadow = true;
    clone.receiveShadow = true;
    g.add(clone);
  }
  return g;
}

function flattenTreeGroup(scene: THREE.Object3D, variant: number, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `tree-proto-v${variant}`;
  g.userData.treeScale = scale;
  g.userData.authoredTree = true;

  const canopyMat = mats.canopy[variant % mats.canopy.length]!;
  const barkMat = variant % 2 === 0 ? mats.trunk : mats.trunkDark;

  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    // Bake world transform then apply Kenney→world scale (~5.5×).
    const baked = mesh.geometry.clone();
    baked.applyMatrix4(mesh.matrixWorld);
    baked.scale(scale, scale, scale);
    baked.computeVertexNormals();
    if (!baked.getAttribute('uv2')) {
      const uv = baked.getAttribute('uv');
      if (uv) baked.setAttribute('uv2', uv.clone());
    }

    const key = `${mesh.name} ${materialName(mesh)}`.toLowerCase();
    const isBark = /bark|wood|trunk/.test(key);
    const mat = isBark ? barkMat : canopyMat;

    const part = new THREE.Mesh(baked, mat);
    part.name = isBark ? `bark-${variant}` : `leafs-${variant}`;
    part.castShadow = true;
    part.receiveShadow = true;
    g.add(part);
  });

  return g;
}

function materialName(mesh: THREE.Mesh): string {
  const m = mesh.material;
  if (Array.isArray(m)) return m.map((x) => x.name || '').join(' ');
  return m?.name || '';
}

export function disposeTreePrototypes(): void {
  for (const proto of prototypes.values()) {
    proto.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
  prototypes.clear();
  loaded = false;
}
