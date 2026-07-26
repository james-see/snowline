import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Candidate URLs under public/assets — first successful load wins. */
export const RIDER_GLTF_CANDIDATES = [
  '/assets/rider/rider.glb',
  '/assets/rider/rider.gltf',
  '/assets/models/rider.glb',
  '/assets/models/rider.gltf',
  '/assets/gltf/rider.glb',
] as const;

export interface GltfTintTargets {
  boardMaterials: THREE.MeshStandardMaterial[];
  suitMaterials: THREE.MeshStandardMaterial[];
}

export interface LoadedRiderGltf {
  root: THREE.Group;
  body: THREE.Object3D;
  tints: GltfTintTargets;
  dispose: () => void;
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
    // Some hosts reject HEAD; try a ranged GET.
    if (res.status === 405 || res.status === 501) {
      const get = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      return get.ok || get.status === 206;
    }
    return false;
  } catch {
    return false;
  }
}

function collectTintTargets(root: THREE.Object3D): GltfTintTargets {
  const boardMaterials: THREE.MeshStandardMaterial[] = [];
  const suitMaterials: THREE.MeshStandardMaterial[] = [];

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const key = `${obj.name} ${mat.name}`.toLowerCase();
      if (/(board|deck|snowboard)/.test(key)) boardMaterials.push(mat);
      else if (/(suit|body|jacket|torso|rider)/.test(key)) suitMaterials.push(mat);
    }
  });

  return { boardMaterials, suitMaterials };
}

/**
 * Attempt to load an authored rider glTF from public/assets.
 * Returns null when no candidate exists or load fails.
 */
export async function tryLoadRiderGltf(): Promise<LoadedRiderGltf | null> {
  let url: string | null = null;
  for (const candidate of RIDER_GLTF_CANDIDATES) {
    if (await urlExists(candidate)) {
      url = candidate;
      break;
    }
  }
  if (!url) return null;

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root = new THREE.Group();
    root.name = 'riderGltf';
    root.add(gltf.scene);
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const body =
      gltf.scene.getObjectByName('body') ??
      gltf.scene.getObjectByName('Body') ??
      gltf.scene.getObjectByName('Armature') ??
      gltf.scene;

    const geos: THREE.BufferGeometry[] = [];
    const mats = new Set<THREE.Material>();
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        geos.push(obj.geometry);
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => mats.add(x));
        else mats.add(m);
      }
    });

    return {
      root,
      body,
      tints: collectTintTargets(root),
      dispose: () => {
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
      },
    };
  } catch {
    return null;
  }
}
