import * as THREE from 'three';
import type { PropKind, PropPlacement } from '@/types/course.ts';
import type { SurfaceKind } from '@/types/gameplay.ts';
import type { PhysicsWorld } from '@/types/physics.ts';

export interface PropUserData {
  propId: string;
  propKind: PropKind;
  recovery?: boolean;
  length?: number;
  lip?: number;
  surface?: SurfaceKind;
  gateWidth?: number;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _railAxis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

function yawQuat(yaw: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}

function tagProp(object: THREE.Object3D, data: PropUserData): void {
  object.userData.prop = data;
  object.name = data.propId;
}

export function tagPropRoot(object: THREE.Object3D, placement: PropPlacement, gateWidth?: number): void {
  tagProp(object, {
    propId: placement.id,
    propKind: placement.kind,
    recovery: placement.recovery,
    length: placement.length,
    lip: placement.lip,
    surface: placement.surface,
    gateWidth,
  });
}

function registerMeshCollider(
  physics: PhysicsWorld,
  mesh: THREE.Mesh,
  surface: SurfaceKind,
  actorId: string
): void {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const position = geometry.getAttribute('position');
  const vertices = new Float32Array(position.array);
  const index = geometry.getIndex();
  const indices = index
    ? new Uint32Array(index.array)
    : new Uint32Array(Array.from({ length: position.count }, (_, i) => i));
  physics.createTrimesh(vertices, indices, new THREE.Vector3(0, 0, 0), surface, actorId);
  geometry.dispose();
}

function registerSensorVolume(
  physics: PhysicsWorld,
  object: THREE.Object3D,
  halfExtents: THREE.Vector3,
  actorId: string
): void {
  object.getWorldPosition(_pos);
  object.getWorldQuaternion(_quat);
  // Lift sensor so the ride corridor is covered, not buried in snow.
  _pos.y += halfExtents.y * 0.35;
  physics.createStaticBox(halfExtents, _pos.clone(), _quat.clone(), 'packed', actorId, true);
}

/**
 * Register solid colliders / trigger sensors for authored props.
 * Recovery-tagged props skip solid collision so bailout lines stay fair.
 */
export function registerPropsPhysics(
  physics: PhysicsWorld,
  placements: readonly PropPlacement[],
  root: THREE.Group
): void {
  if (!physics.ready) return;
  root.updateMatrixWorld(true);

  const byId = new Map(placements.map((p) => [p.id, p]));

  for (const child of root.children) {
    const data = child.userData.prop as PropUserData | undefined;
    if (!data) continue;
    const placement = byId.get(data.propId);
    if (!placement) continue;

    // Gates / finish always get sensors (progress), never solid blocking volumes.
    if (data.propKind === 'checkpoint_gate' || data.propKind === 'finish_arch') {
      const width = data.gateWidth ?? (data.propKind === 'finish_arch' ? 20 : 14);
      const half = new THREE.Vector3(width * 0.45, 3.5, 2.2);
      registerSensorVolume(physics, child, half, data.propId);
      continue;
    }

    if (data.recovery || placement.recovery) continue;

    child.getWorldPosition(_pos);
    child.getWorldQuaternion(_quat);
    child.getWorldScale(_scale);

    switch (data.propKind) {
      case 'rail': {
        const len = data.length ?? placement.length ?? 12;
        // Capsule is Y-aligned; rotate onto local X (rail axis).
        const rot = _quat.clone().multiply(_railAxis);
        physics.createStaticCapsule(
          len * 0.5,
          0.1,
          _pos.clone().add(new THREE.Vector3(0, 0.9, 0).applyQuaternion(_quat)),
          rot,
          placement.surface ?? 'rail',
          data.propId
        );
        break;
      }
      case 'ramp': {
        const lip = data.lip ?? placement.lip ?? 2.4;
        const half = new THREE.Vector3(3.2 * _scale.x, Math.max(0.6, lip * 0.45), 2.4 * _scale.z);
        physics.createStaticBox(
          half,
          _pos.clone().add(new THREE.Vector3(0, half.y, 0.6).applyQuaternion(_quat)),
          _quat.clone(),
          placement.surface ?? 'packed',
          data.propId
        );
        break;
      }
      case 'rock': {
        const mesh = child.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
        if (mesh) {
          registerMeshCollider(physics, mesh, placement.surface ?? 'rock', data.propId);
        } else {
          physics.createStaticBox(
            new THREE.Vector3(1.1 * _scale.x, 0.7 * _scale.y, 1.0 * _scale.z),
            _pos.clone().add(new THREE.Vector3(0, 0.5 * _scale.y, 0)),
            _quat.clone(),
            placement.surface ?? 'rock',
            data.propId
          );
        }
        break;
      }
      case 'tunnel': {
        // Side walls only — keep the ride corridor open.
        const wallHalf = new THREE.Vector3(0.35, 1.8, 4.0);
        for (const side of [-1, 1] as const) {
          const wallPos = _pos
            .clone()
            .add(new THREE.Vector3(side * 3.1, 1.6, -4.2).applyQuaternion(_quat));
          physics.createStaticBox(
            wallHalf,
            wallPos,
            _quat.clone(),
            placement.surface ?? 'wood',
            `${data.propId}-wall-${side}`
          );
        }
        break;
      }
      case 'flag':
      case 'banner':
      case 'fence':
        // Decorative race furniture — no solid collider.
        break;
      default:
        break;
    }
  }

  // Instanced trees: trunk boxes from placements (skip recovery).
  for (const placement of placements) {
    if (placement.kind !== 'tree' || placement.recovery) continue;
    physics.createStaticBox(
      new THREE.Vector3(0.45, 2.1, 0.45),
      new THREE.Vector3(...placement.position).add(new THREE.Vector3(0, 2.1, 0)),
      yawQuat(placement.rotationY ?? 0),
      placement.surface ?? 'wood',
      placement.id
    );
  }
}
