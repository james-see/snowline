import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mats } from '@/course/props/materials.ts';
import {
  buildFoliageCardGeometry,
  buildLayeredCanopyShells,
  canopyVolumeFromGeometries,
} from '@/course/props/foliageCanopy.ts';

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
  const cardMat = mats.canopyCard[variant % mats.canopyCard.length]!;
  const barkMat = variant % 2 === 0 ? mats.trunk : mats.trunkDark;

  scene.updateMatrixWorld(true);

  const barkBounds = new THREE.Box3();
  let hasBark = false;
  const canopyGeos: THREE.BufferGeometry[] = [];

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    // Bake world transform then apply Kenney→world scale (~5.5×).
    const baked = mesh.geometry.clone();
    baked.applyMatrix4(mesh.matrixWorld);
    baked.scale(scale, scale, scale);

    const key = `${mesh.name} ${materialName(mesh)}`.toLowerCase();
    const isBark = /bark|wood|trunk/.test(key);

    if (isBark) {
      baked.computeBoundingBox();
      const box = baked.boundingBox;
      if (box) {
        if (!hasBark) {
          barkBounds.copy(box);
          hasBark = true;
        } else {
          barkBounds.union(box);
        }
      }
      baked.dispose();
      return;
    }

    softenCanopyGeometry(baked, variant);
    canopyGeos.push(baked);
  });

  // Replace cubic Kenney trunks with tapered cylinders — keeps capsule colliders
  // visually honest without changing physics registration.
  if (hasBark && !barkBounds.isEmpty()) {
    const height = Math.max(0.35, barkBounds.max.y - barkBounds.min.y);
    const midX = (barkBounds.min.x + barkBounds.max.x) * 0.5;
    const midZ = (barkBounds.min.z + barkBounds.max.z) * 0.5;
    const halfX = (barkBounds.max.x - barkBounds.min.x) * 0.5;
    const halfZ = (barkBounds.max.z - barkBounds.min.z) * 0.5;
    const rBase = Math.max(0.12, Math.min(halfX, halfZ) * 0.92);
    const rTop = rBase * (0.55 + (variant % 3) * 0.06);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBase, height, 10, 1, false),
      barkMat
    );
    trunk.name = `bark-${variant}`;
    trunk.position.set(midX, barkBounds.min.y + height * 0.5, midZ);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    ensureUv2(trunk.geometry);
    g.add(trunk);
  }

  const volume = canopyVolumeFromGeometries(canopyGeos);

  // Soft layered shells — denser needle mass than raw Kenney facets alone.
  const shells = buildLayeredCanopyShells(volume, variant);
  const shellMesh = new THREE.Mesh(shells, canopyMat);
  shellMesh.name = `leafs-shell-${variant}`;
  shellMesh.castShadow = true;
  shellMesh.receiveShadow = true;
  g.add(shellMesh);

  // Keep a shrunk Kenney canopy as inner fill (cheap density).
  for (let i = 0; i < canopyGeos.length; i++) {
    const baked = canopyGeos[i]!;
    shrinkCanopyTowardAxis(baked, volume, 0.82);
    const part = new THREE.Mesh(baked, canopyMat);
    part.name = `leafs-core-${variant}`;
    part.castShadow = true;
    part.receiveShadow = true;
    g.add(part);
  }

  // Alpha needle cards — outer silhouette + gaps so forest belts stay playable.
  const cards = buildFoliageCardGeometry(
    {
      ...volume,
      radius: volume.radius * 1.08,
      minY: volume.minY + (volume.maxY - volume.minY) * 0.04,
    },
    variant
  );
  const cardMesh = new THREE.Mesh(cards, cardMat);
  cardMesh.name = `leafs-cards-${variant}`;
  cardMesh.castShadow = true;
  cardMesh.receiveShadow = true;
  g.add(cardMesh);

  return g;
}

/** Break flat Kenney canopy facets + freshen normals for a softer needle read. */
function softenCanopyGeometry(geo: THREE.BufferGeometry, variant: number): void {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  const seed = variant * 17.13 + 3.7;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      Math.sin(x * 2.4 + seed) * 0.045 +
      Math.cos(z * 2.1 - seed * 1.2) * 0.04 +
      Math.sin((x + y) * 1.7 + seed * 0.6) * 0.03;
    // Stronger outward puff on upper canopy — less boxy silhouette.
    const lift = Math.max(0, y) * 0.02;
    pos.setXYZ(i, x * (1 + n * 0.55), y + n * 0.35 + lift, z * (1 + n * 0.55));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  ensureUv2(geo);
}

/** Pull Kenney core inward so layered shells + cards own the silhouette. */
function shrinkCanopyTowardAxis(
  geo: THREE.BufferGeometry,
  volume: { centerX: number; centerZ: number },
  factor: number
): void {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(
      i,
      volume.centerX + (x - volume.centerX) * factor,
      y,
      volume.centerZ + (z - volume.centerZ) * factor
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function ensureUv2(geo: THREE.BufferGeometry): void {
  if (geo.getAttribute('uv2')) return;
  const uv = geo.getAttribute('uv');
  if (uv) geo.setAttribute('uv2', uv.clone());
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
