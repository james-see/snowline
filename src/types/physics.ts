import type * as THREE from 'three';
import type { SurfaceKind } from './gameplay.ts';

export const CollisionGroup = {
  Terrain: 0x0001,
  Player: 0x0002,
  Prop: 0x0004,
  Trigger: 0x0008,
  Rail: 0x0010,
  All: 0xffff,
} as const;

export type CollisionGroupMask = number;

export interface RaycastOptions {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  maxDistance: number;
  groups?: CollisionGroupMask;
  exclude?: string[];
  solid?: boolean;
}

export interface RaycastHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  surface: SurfaceKind;
  actorId: string | null;
  colliderId: number;
}

export interface ShapeCastOptions {
  origin: THREE.Vector3;
  /** Sweep direction (need not be unit). */
  direction: THREE.Vector3;
  maxDistance: number;
  radius: number;
  groups?: CollisionGroupMask;
  exclude?: string[];
}

export interface ShapeCastHit {
  point: THREE.Vector3;
  /** World-space normal pointing out of the hit collider toward the cast. */
  normal: THREE.Vector3;
  distance: number;
  surface: SurfaceKind;
  actorId: string | null;
  colliderId: number;
}

export interface SphereOverlapOptions {
  origin: THREE.Vector3;
  radius: number;
  groups?: CollisionGroupMask;
  exclude?: string[];
}

/** Result of a sphere vs Prop overlap query used for kinematic depenetration. */
export interface SphereOverlapHit {
  /** World-space unit normal pointing out of the prop (push direction). */
  normal: THREE.Vector3;
  /** Distance to push the sphere center to clear the surface, m. */
  penetration: number;
  /** True when the query origin started inside the collider volume. */
  inside: boolean;
  surface: SurfaceKind;
  actorId: string | null;
  colliderId: number;
}

export interface RigidBodyHandle {
  id: number;
  remove(): void;
}

export interface SensorHandle {
  id: number;
  remove(): void;
}

export interface KinematicBodyDesc {
  position: THREE.Vector3;
  rotation?: THREE.Quaternion;
  halfExtents: THREE.Vector3;
  actorId?: string;
}

export interface PhysicsWorld {
  readonly ready: boolean;
  init(gravity?: THREE.Vector3): Promise<void>;
  beginTick(): void;
  step(dt: number): void;
  /**
   * Optional: step once after collider registration so the query pipeline is
   * live. Needed because Engine runs fixedUpdate before step each tick.
   */
  warmupPipeline?(): void;
  raycast(options: RaycastOptions): RaycastHit | null;
  /** Sphere sweep for kinematic obstacle response (props / hazards). */
  shapeCast(options: ShapeCastOptions): ShapeCastHit | null;
  /**
   * Closest Prop overlap for a sphere at rest. Used to depenetrate when the
   * kinematic board is already wedged inside a trunk/rock (sweep alone misses).
   */
  sphereOverlap(options: SphereOverlapOptions): SphereOverlapHit | null;
  createKinematicBody(desc: KinematicBodyDesc): RigidBodyHandle;
  createTrimesh(
    vertices: Float32Array,
    indices: Uint32Array,
    position: THREE.Vector3,
    surface: SurfaceKind,
    actorId?: string
  ): RigidBodyHandle;
  createHeightfield(
    nrows: number,
    ncols: number,
    heights: Float32Array,
    scale: THREE.Vector3,
    position: THREE.Vector3,
    surface: SurfaceKind,
    actorId?: string
  ): RigidBodyHandle;
  /** Alias used by course module. */
  addHeightfield(
    nrows: number,
    ncols: number,
    heights: Float32Array,
    scale: THREE.Vector3,
    position: THREE.Vector3,
    surface: SurfaceKind,
    actorId?: string
  ): RigidBodyHandle;
  createKinematicBox(
    halfExtents: THREE.Vector3,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    actorId: string
  ): RigidBodyHandle;
  createStaticBox(
    halfExtents: THREE.Vector3,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    surface: SurfaceKind,
    actorId?: string,
    sensor?: boolean
  ): RigidBodyHandle | SensorHandle;
  createStaticCapsule(
    halfHeight: number,
    radius: number,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    surface: SurfaceKind,
    actorId?: string,
    sensor?: boolean
  ): RigidBodyHandle;
  setNextKinematicTransform(
    handle: RigidBodyHandle,
    position: THREE.Vector3,
    rotation: THREE.Quaternion
  ): void;
  removeBody(handle: RigidBodyHandle): void;
  clearWorld(): void;
  dispose(): void;
}
