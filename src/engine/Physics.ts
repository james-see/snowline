import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {
  KinematicBodyDesc,
  PhysicsWorld,
  RaycastHit,
  RaycastOptions,
  RigidBodyHandle,
  SensorHandle,
  ShapeCastHit,
  ShapeCastOptions,
} from '@/types/physics.ts';
import { CollisionGroup } from '@/types/physics.ts';
import type { SurfaceKind } from '@/types/gameplay.ts';

function interactionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

const ALL = 0xffff;
const _shapeDir = new THREE.Vector3();
const _shapeNormal = new THREE.Vector3();
const _shapeQuat = new THREE.Quaternion();

export class RapierPhysics implements PhysicsWorld {
  #world!: RAPIER.World;
  #ready = false;
  #steppedThisTick = false;
  #surfaces = new Map<number, SurfaceKind>();
  #actors = new Map<number, string>();
  #bodies = new Map<number, RAPIER.RigidBody>();
  #nextId = 1;

  get ready(): boolean {
    return this.#ready;
  }

  async init(gravity = new THREE.Vector3(0, -28, 0)): Promise<void> {
    await RAPIER.init();
    this.#world = new RAPIER.World({ x: gravity.x, y: gravity.y, z: gravity.z });
    this.#world.integrationParameters.dt = 1 / 120;
    this.#ready = true;
  }

  beginTick(): void {
    this.#steppedThisTick = false;
  }

  step(dt: number): void {
    if (!this.#ready || this.#steppedThisTick) return;
    this.#steppedThisTick = true;
    this.#world.integrationParameters.dt = dt;
    this.#world.step();
  }

  #classify(collider: RAPIER.Collider): { surface: SurfaceKind; actorId: string | null } {
    return {
      surface: this.#surfaces.get(collider.handle) ?? 'packed',
      actorId: this.#actors.get(collider.handle) ?? null,
    };
  }

  #makeHandle(body: RAPIER.RigidBody): RigidBodyHandle {
    const id = this.#nextId++;
    this.#bodies.set(id, body);
    return {
      id,
      remove: () => {
        const b = this.#bodies.get(id);
        if (b) {
          this.#world.removeRigidBody(b);
          this.#bodies.delete(id);
        }
      },
    };
  }

  raycast(options: RaycastOptions): RaycastHit | null {
    if (!this.#ready) return null;
    const { origin, direction, maxDistance, groups = ALL, exclude, solid = true } = options;
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
    const filter = interactionGroups(ALL, groups);
    const predicate = exclude?.length
      ? (collider: RAPIER.Collider): boolean => {
          const actorId = this.#actors.get(collider.handle);
          return actorId === undefined || !exclude.includes(actorId);
        }
      : undefined;

    // Rapier 0.19 returns toi=0 for rays that start inside sensors even when
    // `solid=true`. That turns checkpoint/finish volumes into launch pads for
    // board ground probes — always exclude sensors on solid casts.
    const filterFlags = solid ? RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : undefined;

    const hit = this.#world.castRayAndGetNormal(
      ray,
      maxDistance,
      solid,
      filterFlags,
      filter,
      undefined,
      undefined,
      predicate
    );
    if (!hit) return null;
    const { surface, actorId } = this.#classify(hit.collider);
    const distance = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(
        origin.x + direction.x * distance,
        origin.y + direction.y * distance,
        origin.z + direction.z * distance
      ),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance,
      surface,
      actorId,
      colliderId: hit.collider.handle,
    };
  }

  shapeCast(options: ShapeCastOptions): ShapeCastHit | null {
    if (!this.#ready) return null;
    const { origin, maxDistance, radius, groups = CollisionGroup.Prop, exclude } = options;
    if (maxDistance <= 0 || radius <= 0) return null;

    _shapeDir.copy(options.direction);
    const dirLen = _shapeDir.length();
    if (dirLen < 1e-8) return null;
    _shapeDir.multiplyScalar(1 / dirLen);

    const predicate = exclude?.length
      ? (collider: RAPIER.Collider): boolean => {
          const actorId = this.#actors.get(collider.handle);
          return actorId === undefined || !exclude.includes(actorId);
        }
      : undefined;

    const hit = this.#world.castShape(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: _shapeDir.x, y: _shapeDir.y, z: _shapeDir.z },
      new RAPIER.Ball(radius),
      0,
      maxDistance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      interactionGroups(ALL, groups),
      undefined,
      undefined,
      predicate
    );
    if (!hit) return null;

    const { surface, actorId } = this.#classify(hit.collider);
    const rot = hit.collider.rotation();
    _shapeQuat.set(rot.x, rot.y, rot.z, rot.w);
    _shapeNormal.set(hit.normal2.x, hit.normal2.y, hit.normal2.z).applyQuaternion(_shapeQuat);
    if (_shapeNormal.lengthSq() < 1e-8) _shapeNormal.set(0, 1, 0);
    else _shapeNormal.normalize();
    // Face the cast origin so kinematic rejection pushes out of the prop.
    if (_shapeNormal.dot(_shapeDir) > 0) _shapeNormal.negate();

    const distance = hit.time_of_impact;
    return {
      point: new THREE.Vector3(
        origin.x + _shapeDir.x * distance,
        origin.y + _shapeDir.y * distance,
        origin.z + _shapeDir.z * distance
      ),
      normal: _shapeNormal.clone(),
      distance,
      surface,
      actorId,
      colliderId: hit.collider.handle,
    };
  }

  createKinematicBody(desc: KinematicBodyDesc): RigidBodyHandle {
    const rot = desc.rotation ?? new THREE.Quaternion();
    const body = this.#world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(desc.position.x, desc.position.y, desc.position.z)
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
    );
    const collider = this.#world.createCollider(
      RAPIER.ColliderDesc.cuboid(desc.halfExtents.x, desc.halfExtents.y, desc.halfExtents.z)
        .setCollisionGroups(
          interactionGroups(
            CollisionGroup.Player,
            CollisionGroup.Terrain | CollisionGroup.Prop | CollisionGroup.Rail | CollisionGroup.Trigger
          )
        )
        .setFriction(0.4),
      body
    );
    this.#actors.set(collider.handle, desc.actorId ?? 'rider');
    return this.#makeHandle(body);
  }

  createTrimesh(
    vertices: Float32Array,
    indices: Uint32Array,
    position: THREE.Vector3,
    surface: SurfaceKind,
    actorId = 'terrain'
  ): RigidBodyHandle {
    const body = this.#world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    );
    const collider = this.#world.createCollider(
      RAPIER.ColliderDesc.trimesh(vertices, indices)
        .setCollisionGroups(interactionGroups(CollisionGroup.Terrain, ALL))
        .setFriction(0.8)
        .setRestitution(0.02),
      body
    );
    this.#surfaces.set(collider.handle, surface);
    this.#actors.set(collider.handle, actorId);
    return this.#makeHandle(body);
  }

  createHeightfield(
    nrows: number,
    ncols: number,
    heights: Float32Array,
    scale: THREE.Vector3,
    position: THREE.Vector3,
    surface: SurfaceKind,
    actorId = 'terrain'
  ): RigidBodyHandle {
    const body = this.#world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)
    );
    const collider = this.#world.createCollider(
      RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, {
        x: scale.x,
        y: scale.y,
        z: scale.z,
      })
        .setCollisionGroups(interactionGroups(CollisionGroup.Terrain, ALL))
        .setFriction(0.85),
      body
    );
    this.#surfaces.set(collider.handle, surface);
    this.#actors.set(collider.handle, actorId);
    return this.#makeHandle(body);
  }

  addHeightfield(
    nrows: number,
    ncols: number,
    heights: Float32Array,
    scale: THREE.Vector3,
    position: THREE.Vector3,
    surface: SurfaceKind,
    actorId = 'terrain'
  ): RigidBodyHandle {
    return this.createHeightfield(nrows, ncols, heights, scale, position, surface, actorId);
  }

  createKinematicBox(
    halfExtents: THREE.Vector3,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    actorId: string
  ): RigidBodyHandle {
    return this.createKinematicBody({ position, rotation, halfExtents, actorId });
  }

  createStaticBox(
    halfExtents: THREE.Vector3,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    surface: SurfaceKind,
    actorId = 'prop',
    sensor = false
  ): RigidBodyHandle | SensorHandle {
    const group =
      surface === 'rail'
        ? CollisionGroup.Rail
        : sensor
          ? CollisionGroup.Trigger
          : CollisionGroup.Prop;
    const body = this.#world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
    );
    const collider = this.#world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setCollisionGroups(interactionGroups(group, ALL))
        .setSensor(sensor)
        .setFriction(surface === 'ice' ? 0.15 : 0.7),
      body
    );
    this.#surfaces.set(collider.handle, surface);
    this.#actors.set(collider.handle, actorId);
    return this.#makeHandle(body);
  }

  createStaticCapsule(
    halfHeight: number,
    radius: number,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    surface: SurfaceKind,
    actorId = 'rail',
    sensor = false
  ): RigidBodyHandle {
    const body = this.#world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
    );
    const collider = this.#world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius)
        .setCollisionGroups(
          interactionGroups(surface === 'rail' ? CollisionGroup.Rail : CollisionGroup.Prop, ALL)
        )
        .setSensor(sensor)
        .setFriction(0.3),
      body
    );
    this.#surfaces.set(collider.handle, surface);
    this.#actors.set(collider.handle, actorId);
    return this.#makeHandle(body);
  }

  setNextKinematicTransform(
    handle: RigidBodyHandle,
    position: THREE.Vector3,
    rotation: THREE.Quaternion
  ): void {
    const body = this.#bodies.get(handle.id);
    if (!body) return;
    body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
    body.setNextKinematicRotation({
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    });
  }

  removeBody(handle: RigidBodyHandle): void {
    handle.remove();
  }

  clearWorld(): void {
    if (!this.#ready) return;
    for (const body of this.#bodies.values()) this.#world.removeRigidBody(body);
    this.#bodies.clear();
    this.#surfaces.clear();
    this.#actors.clear();
    const g = this.#world.gravity;
    this.#world.free();
    this.#world = new RAPIER.World(g);
    this.#world.integrationParameters.dt = 1 / 120;
  }

  dispose(): void {
    if (!this.#ready) return;
    this.#world.free();
    this.#ready = false;
  }
}
