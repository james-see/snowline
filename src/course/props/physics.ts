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

function rockHalfExtents(placement: PropPlacement): THREE.Vector3 {
  const s =
    typeof placement.scale === 'number'
      ? placement.scale
      : placement.scale
        ? (placement.scale[0] + placement.scale[2]) * 0.5
        : 1;
  // Approximate buildRock silhouette (flattened boulder) — Prop-group box, not
  // Terrain trimesh (kinematic board never bounced off rock meshes before).
  const variant = placement.variant ?? 0;
  const plump = 0.9 + (variant % 4) * 0.08;
  return new THREE.Vector3(1.45 * s * plump, 0.72 * s * plump, 1.25 * s * plump);
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
  // Must stay `sensor: true` — a solid box here becomes a launch pad.
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

    // Gates / finish: sensor-only (no solid mesh / trimesh). Course progress
    // also uses AABB triggers; the Rapier sensor must never launch the board.
    if (data.propKind === 'checkpoint_gate' || data.propKind === 'finish_arch') {
      const width = data.gateWidth ?? (data.propKind === 'finish_arch' ? 20 : 14);
      // Thin travel-axis slab — covers the opening without a deep launch volume.
      const half = new THREE.Vector3(width * 0.45, 3.5, 0.8);
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
      case 'box': {
        const len = data.length ?? placement.length ?? 10;
        const half = new THREE.Vector3(len * 0.5 * _scale.x, 0.55 * _scale.y, 1.25 * _scale.z);
        // Rideable wood deck — BoardPhysics never latches grind on `wood`.
        physics.createStaticBox(
          half,
          _pos.clone().add(new THREE.Vector3(0, half.y, 0).applyQuaternion(_quat)),
          _quat.clone(),
          placement.surface ?? 'wood',
          data.propId
        );
        // Thin edge rails only when authored grindable (matches visual coping).
        if (placement.grindable) {
          const railHalfLen = len * 0.48 * _scale.x;
          const railY = half.y * 2 + 0.06;
          const railZ = half.z * 0.96;
          const rot = _quat.clone().multiply(_railAxis);
          for (const side of [-1, 1] as const) {
            const railPos = _pos
              .clone()
              .add(new THREE.Vector3(0, railY, side * railZ).applyQuaternion(_quat));
            physics.createStaticCapsule(
              railHalfLen,
              0.08,
              railPos,
              rot,
              'rail',
              `${data.propId}-rail-${side}`
            );
          }
        }
        break;
      }
      case 'ramp': {
        const lip = data.lip ?? placement.lip ?? 2.4;
        // Always packed — never honor wood/rail overrides (grind would steal launch).
        const half = new THREE.Vector3(3.2 * _scale.x, Math.max(0.6, lip * 0.45), 2.4 * _scale.z);
        physics.createStaticBox(
          half,
          _pos.clone().add(new THREE.Vector3(0, half.y, 0.6).applyQuaternion(_quat)),
          _quat.clone(),
          'packed',
          data.propId
        );
        break;
      }
      case 'rock': {
        const half = rockHalfExtents(placement);
        physics.createStaticBox(
          half,
          _pos.clone().add(new THREE.Vector3(0, half.y, 0).applyQuaternion(_quat)),
          _quat.clone(),
          placement.surface ?? 'rock',
          data.propId
        );
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
