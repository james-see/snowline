import * as THREE from 'three';
import type {
  CheckpointDef,
  PropKind,
  PropPlacement,
  TerrainBuildResult,
} from '@/types/course.ts';
import type { SplinePath } from '@/course/SplinePath.ts';
import { lateralToU, sampleTerrainAt } from '@/course/TerrainGenerator.ts';
import { presetBudgets, type LodBudgets } from '@/engine/Lod.ts';
import {
  buildCheckpointGate,
  buildFinishArch,
  buildFlag,
  buildRail,
  buildRamp,
  buildRock,
  buildTree,
  buildTunnel,
} from '@/course/props/builders.ts';
import {
  registerPropsPhysics,
  tagPropRoot,
  type PropUserData,
} from '@/course/props/physics.ts';

export type { PropUserData } from '@/course/props/physics.ts';
export { registerPropsPhysics };

const _snapPos = new THREE.Vector3();
const _snapQuat = new THREE.Quaternion();
const _snapScale = new THREE.Vector3();
const _snapBed = new THREE.Vector3();
const _snapComposed = new THREE.Matrix4();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3(0, -1, 0);
const _raycaster = new THREE.Raycaster();

/** World transform for one instanced tree before part-local bake. */
export interface TreeInstanceBase {
  id: string;
  variant: number;
  matrix: THREE.Matrix4;
}

/** Prop kinds this module can author + register. */
export const SUPPORTED_PROP_KINDS: readonly PropKind[] = [
  'rail',
  'ramp',
  'tree',
  'rock',
  'flag',
  'checkpoint_gate',
  'finish_arch',
  'tunnel',
] as const;

export interface PropTrigger {
  id: string;
  kind: 'checkpoint' | 'finish';
  checkpointIndex?: number;
  bounds: THREE.Box3;
}

export interface PropsBuildResult {
  root: THREE.Group;
  triggers: PropTrigger[];
  /** World matrices for instanced trees (before part-local bake). */
  treeBases: TreeInstanceBase[];
  dispose(): void;
}

function yawQuat(yaw: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}

function applyTransform(object: THREE.Object3D, placement: PropPlacement): void {
  object.position.set(...placement.position);
  if (placement.rotationY !== undefined) {
    object.quaternion.copy(yawQuat(placement.rotationY));
  }
  if (placement.scale !== undefined) {
    if (typeof placement.scale === 'number') object.scale.setScalar(placement.scale);
    else object.scale.set(...placement.scale);
  }
}

function orientedTriggerBounds(
  object: THREE.Object3D,
  width: number,
  depth = 4,
  height = 8
): THREE.Box3 {
  // Axis-aligned bounds that cover the gate opening after yaw.
  object.updateWorldMatrix(true, false);
  const box = new THREE.Box3();
  const halfW = width * 0.55;
  const corners = [
    new THREE.Vector3(-halfW, -1, -depth * 0.5),
    new THREE.Vector3(halfW, -1, -depth * 0.5),
    new THREE.Vector3(-halfW, height, -depth * 0.5),
    new THREE.Vector3(halfW, height, depth * 0.5),
    new THREE.Vector3(-halfW, -1, depth * 0.5),
    new THREE.Vector3(halfW, -1, depth * 0.5),
    new THREE.Vector3(-halfW, height, depth * 0.5),
    new THREE.Vector3(halfW, height, -depth * 0.5),
  ];
  for (const c of corners) {
    c.applyMatrix4(object.matrixWorld);
    box.expandByPoint(c);
  }
  return box;
}

function buildPropObject(placement: PropPlacement): THREE.Object3D | null {
  switch (placement.kind) {
    case 'rock':
      return buildRock(
        placement.variant ?? 0,
        typeof placement.scale === 'number' ? placement.scale : 1
      );
    case 'rail':
      return buildRail(placement.length ?? 12);
    case 'ramp':
      return buildRamp(placement.lip ?? 2.4);
    case 'checkpoint_gate':
      return buildCheckpointGate(14);
    case 'finish_arch':
      return buildFinishArch(20);
    case 'flag':
      return buildFlag();
    case 'tunnel': {
      const s = typeof placement.scale === 'number' ? placement.scale : 1;
      return buildTunnel(s);
    }
    default:
      return null;
  }
}

/**
 * Sample terrain bed Y under world XZ by raycasting the visual mesh.
 * Path (t,u) sampling drifts on apron / curved runs and floats forest props.
 */
function terrainBedY(
  terrain: TerrainBuildResult,
  path: SplinePath,
  meshWidth: number,
  x: number,
  y: number,
  z: number
): number {
  const mesh = terrain.mesh;
  mesh.updateMatrixWorld(true);
  const top = Math.max(y + 400, 800);
  _rayOrigin.set(x, top, z);
  _raycaster.set(_rayOrigin, _rayDir);
  const hits = _raycaster.intersectObject(mesh, false);
  if (hits.length > 0 && hits[0]) return hits[0].point.y;

  // Fallback: path sample (gates / offline meshes).
  _snapPos.set(x, y, z);
  const { t, lateral } = path.closestPoint(_snapPos);
  const u = lateralToU(lateral, meshWidth);
  return sampleTerrainAt(terrain, t, u, _snapBed).y;
}

/**
 * Snap authored props onto the generated terrain mesh.
 * Updates visual transforms, instanced tree matrices, and placement Y
 * (so physics registered afterward matches). Gates/finish are left to CourseModule.
 */
export function snapPropsToTerrain(
  props: PropsBuildResult,
  terrain: TerrainBuildResult,
  path: SplinePath,
  corridorWidth: number,
  placements: PropPlacement[] = []
): void {
  const byId = new Map(placements.map((p) => [p.id, p]));

  for (const child of props.root.children) {
    const data = child.userData.prop as PropUserData | undefined;
    if (!data) continue;
    if (data.propKind === 'checkpoint_gate' || data.propKind === 'finish_arch') continue;

    const y = terrainBedY(
      terrain,
      path,
      corridorWidth,
      child.position.x,
      child.position.y,
      child.position.z
    );
    child.position.y = y;
    const placement = byId.get(data.propId);
    if (placement) placement.position[1] = y;
  }

  if (props.treeBases.length === 0) return;

  for (const base of props.treeBases) {
    base.matrix.decompose(_snapPos, _snapQuat, _snapScale);
    const y = terrainBedY(terrain, path, corridorWidth, _snapPos.x, _snapPos.y, _snapPos.z);
    _snapPos.y = y;
    base.matrix.compose(_snapPos, _snapQuat, _snapScale);
    const placement = byId.get(base.id);
    if (placement) placement.position[1] = y;
  }

  const basesByVariant = new Map<number, THREE.Matrix4[]>();
  for (const base of props.treeBases) {
    let list = basesByVariant.get(base.variant);
    if (!list) {
      list = [];
      basesByVariant.set(base.variant, list);
    }
    list.push(base.matrix);
  }

  for (const child of props.root.children) {
    const inst = child as THREE.InstancedMesh;
    if (!inst.isInstancedMesh) continue;
    const local = inst.userData.treePartLocal as THREE.Matrix4 | undefined;
    const variant = inst.userData.treeVariant as number | undefined;
    if (!local || variant === undefined) continue;
    const matrices = basesByVariant.get(variant);
    if (!matrices) continue;
    for (let i = 0; i < matrices.length; i++) {
      _snapComposed.multiplyMatrices(matrices[i]!, local);
      inst.setMatrixAt(i, _snapComposed);
    }
    inst.instanceMatrix.needsUpdate = true;
  }
}

export function buildCourseProps(
  placements: readonly PropPlacement[],
  path: SplinePath,
  checkpointDefs: readonly CheckpointDef[],
  budgets: LodBudgets = presetBudgets('high')
): PropsBuildResult {
  const root = new THREE.Group();
  root.name = 'course-props';
  const triggers: PropTrigger[] = [];
  const treeBases: TreeInstanceBase[] = [];
  const disposables: THREE.BufferGeometry[] = [];
  const extraMats: THREE.Material[] = [];
  let rockCount = 0;

  for (const placement of placements) {
    if (placement.kind === 'tree') {
      if (treeBases.length >= budgets.maxTreeInstances) continue;
      const scale =
        typeof placement.scale === 'number'
          ? new THREE.Vector3(placement.scale, placement.scale, placement.scale)
          : placement.scale
            ? new THREE.Vector3(...placement.scale)
            : new THREE.Vector3(1, 1, 1);
      treeBases.push({
        id: placement.id,
        variant: placement.variant ?? 0,
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(...placement.position),
          yawQuat(placement.rotationY ?? 0),
          scale
        ),
      });
      continue;
    }

    if (placement.kind === 'rock') {
      if (rockCount >= budgets.maxRockInstances) continue;
      rockCount++;
    }

    const object = buildPropObject(placement);
    if (!object) continue;

    const gateWidth =
      placement.kind === 'checkpoint_gate' ? 14 : placement.kind === 'finish_arch' ? 20 : undefined;
    tagPropRoot(object, placement, gateWidth);
    applyTransform(object, placement);
    // Rocks already baked scale into mesh; avoid double-scaling when scale was numeric.
    if (placement.kind === 'rock' && typeof placement.scale === 'number') {
      object.scale.set(1, 1, 1);
    }
    if (placement.kind === 'tunnel' && typeof placement.scale === 'number') {
      object.scale.set(1, 1, 1);
    }

    root.add(object);

    if (object.userData.checkerMat) {
      extraMats.push(object.userData.checkerMat as THREE.Material);
    }

    if (placement.kind === 'checkpoint_gate') {
      const cpIndex = checkpointDefs.findIndex((cp) => placement.id === `gate-${cp.id}`);
      triggers.push({
        id: placement.id,
        kind: 'checkpoint',
        checkpointIndex:
          cpIndex >= 0 ? cpIndex : triggers.filter((t) => t.kind === 'checkpoint').length,
        bounds: orientedTriggerBounds(object, gateWidth ?? 14, 5, 9),
      });
    }
    if (placement.kind === 'finish_arch') {
      triggers.push({
        id: placement.id,
        kind: 'finish',
        bounds: orientedTriggerBounds(object, gateWidth ?? 20, 6, 10),
      });
    }
  }

  // Instanced trees — bake each part's local transform into the instance matrix.
  const byVariant = new Map<number, THREE.Matrix4[]>();
  for (const t of treeBases) {
    let list = byVariant.get(t.variant);
    if (!list) {
      list = [];
      byVariant.set(t.variant, list);
    }
    list.push(t.matrix);
  }

  let treeShadowLeft = budgets.maxTreeShadowCasters;
  for (const [variant, matrices] of byVariant) {
    const proto = buildTree(variant);
    proto.updateMatrixWorld(true);
    for (const part of proto.children) {
      const mesh = part as THREE.Mesh;
      if (!mesh.isMesh) continue;
      mesh.updateMatrix();
      const local = mesh.matrix.clone();
      const inst = new THREE.InstancedMesh(
        mesh.geometry,
        mesh.material as THREE.Material,
        matrices.length
      );
      const cast = treeShadowLeft > 0;
      if (cast) treeShadowLeft = Math.max(0, treeShadowLeft - matrices.length);
      inst.castShadow = cast;
      inst.receiveShadow = true;
      inst.name = `trees-v${variant}-${mesh.uuid.slice(0, 6)}`;
      inst.userData.treePartLocal = local;
      inst.userData.treeVariant = variant;
      const composed = new THREE.Matrix4();
      for (let i = 0; i < matrices.length; i++) {
        composed.multiplyMatrices(matrices[i]!, local);
        inst.setMatrixAt(i, composed);
      }
      inst.instanceMatrix.needsUpdate = true;
      root.add(inst);
    }
    proto.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) disposables.push(m.geometry);
    });
  }

  // Fallback triggers from checkpoint defs when no gate prop was authored.
  for (let i = 0; i < checkpointDefs.length; i++) {
    const cp = checkpointDefs[i]!;
    if (triggers.some((t) => t.kind === 'checkpoint' && t.checkpointIndex === i)) continue;
    const pose = path.checkpointPose(cp);
    triggers.push({
      id: `trigger-${cp.id}`,
      kind: 'checkpoint',
      checkpointIndex: i,
      bounds: new THREE.Box3(
        new THREE.Vector3(pose.position.x - pose.width / 2, pose.position.y - 2, pose.position.z - 3),
        new THREE.Vector3(pose.position.x + pose.width / 2, pose.position.y + 8, pose.position.z + 3)
      ),
    });
  }

  return {
    root,
    triggers,
    treeBases,
    dispose() {
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
          mesh.geometry.dispose();
        }
        const inst = child as THREE.InstancedMesh;
        if (inst.isInstancedMesh) inst.dispose();
      });
      for (const geo of disposables) geo.dispose();
      for (const mat of extraMats) mat.dispose();
      root.removeFromParent();
    },
  };
}
