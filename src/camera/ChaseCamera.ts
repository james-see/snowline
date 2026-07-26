import * as THREE from 'three';
import type { RiderState } from '@/types/gameplay.ts';
import type { PhysicsWorld } from '@/types/physics.ts';
import { CollisionGroup } from '@/types/physics.ts';

const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _shake = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

/** Match BoardPhysics `forwardFromYaw` — +Z at yaw 0. */
function facingFromYaw(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}

/** Placeholder spawn before a run — do not chase this aggressively. */
function isIdleSpawn(rider: RiderState): boolean {
  const p = rider.position;
  const dx = p.x;
  const dy = p.y - 2;
  const dz = p.z;
  return dx * dx + dy * dy + dz * dz < 36;
}

/** Mountain-scale clip planes (spawn ~y=100–400, runs span hundreds of meters). */
const CAM_NEAR = 0.45;
const CAM_FAR = 8000;
const MIN_CHASE_DIST = 3.2;

export class ChaseCamera {
  #pos = new THREE.Vector3(0, 5, -7);
  #lookAt = new THREE.Vector3(0, 2, 6);
  #fov = 62;
  #shakeAmp = 0;
  #landPulse = 0;
  #airBlend = 0;
  /** False until `run:start` snap — avoids chasing the origin placeholder. */
  #active = false;

  get active(): boolean {
    return this.#active;
  }

  impulse(amount: number): void {
    this.#shakeAmp = Math.min(1.2, this.#shakeAmp + amount);
  }

  onLanding(impact: number): void {
    this.#landPulse = Math.min(1, impact / 18);
    this.impulse(0.08 + this.#landPulse * 0.25);
  }

  /**
   * Static title / menu framing. Does not arm chase follow.
   * Call once before a run so the boot camera is not left at the origin.
   */
  frameIdle(camera: THREE.PerspectiveCamera): void {
    this.#pos.set(0, 5, -7);
    this.#lookAt.set(0, 2, 6);
    this.#active = false;
    camera.position.copy(this.#pos);
    camera.near = CAM_NEAR;
    camera.far = CAM_FAR;
    camera.fov = this.#fov;
    camera.lookAt(this.#lookAt);
    camera.updateProjectionMatrix();
  }

  /** Hard-place the rig behind the rider looking along facing / travel. */
  snap(rider: RiderState, camera?: THREE.PerspectiveCamera): void {
    if (isIdleSpawn(rider)) {
      this.#active = false;
      return;
    }

    this.#resolveFacing(rider);
    this.#pos.copy(rider.position).addScaledVector(_velDir, -7);
    this.#pos.y += 3.2;
    this.#lookAt.copy(rider.position).addScaledVector(_velDir, 8);
    // Nose-down pitch / fall line — keep look on terrain, not empty sky.
    this.#lookAt.y += 0.55 + Math.sin(rider.boardPitch) * 8;
    this.#airBlend = rider.airborne ? 1 : 0;
    this.#fov = 62;
    this.#active = true;

    if (camera) {
      this.#apply(camera);
    }
  }

  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    rider: RiderState,
    physics: PhysicsWorld,
    baseFov: number,
    shakeScale: number,
    look: { x: number; y: number }
  ): void {
    if (!this.#active || isIdleSpawn(rider)) {
      return;
    }

    const speed = rider.speed;
    this.#resolveFacing(rider);

    const back = 5.5 + Math.min(6, speed * 0.08);
    const height = 2.4 + Math.min(2.5, speed * 0.03);
    const lookAhead = 5 + Math.min(10, speed * 0.12);

    this.#airBlend = THREE.MathUtils.damp(
      this.#airBlend,
      rider.airborne ? 1 : 0,
      rider.airborne ? 4 : 8,
      dt
    );

    _desired.copy(rider.position);
    _desired.addScaledVector(_velDir, -back);
    _desired.y += height + this.#airBlend * 1.4;

    // Manual look offset
    _right.crossVectors(_up, _velDir);
    if (_right.lengthSq() > 1e-6) {
      _right.normalize();
      _desired.addScaledVector(_right, look.x * 40);
    }
    _desired.y += look.y * 20;

    // Terrain collision — pull camera in if occluded, but keep a min chase distance
    // so the near plane does not turn the board into a clipped crescent.
    _rayOrigin.copy(rider.position);
    _rayOrigin.y += 1.2;
    _rayDir.subVectors(_desired, _rayOrigin);
    const dist = _rayDir.length();
    if (dist > 0.01) {
      _rayDir.multiplyScalar(1 / dist);
      const hit = physics.raycast({
        origin: _rayOrigin,
        direction: _rayDir,
        maxDistance: dist,
        groups: CollisionGroup.Terrain | CollisionGroup.Prop,
        exclude: ['rider'],
      });
      if (hit && hit.distance < dist - 0.4) {
        const useDist = Math.max(MIN_CHASE_DIST, hit.distance - 0.45);
        _desired.copy(_rayOrigin).addScaledVector(_rayDir, useDist);
      }
    }

    // dt=0 (capture converge): hard-sync so the rig settles immediately after snap.
    const follow = dt > 0 ? 1 - Math.exp(-dt * 8) : 1;
    const lookFollow = dt > 0 ? 1 - Math.exp(-dt * 10) : 1;
    this.#pos.lerp(_desired, follow);

    _look.copy(rider.position);
    _look.addScaledVector(_velDir, lookAhead);
    // Bias look down the board pitch / fall line so the frame holds terrain.
    _look.y += 0.55 + this.#airBlend * 0.5 + Math.sin(rider.boardPitch) * lookAhead;
    if (rider.velocity.y < -0.5) {
      _look.y += rider.velocity.y * 0.08;
    }
    this.#lookAt.lerp(_look, lookFollow);

    this.#shakeAmp = Math.max(0, this.#shakeAmp - dt * 3.5);
    this.#landPulse = Math.max(0, this.#landPulse - dt * 4);
    if (this.#shakeAmp > 0.001) {
      _shake.set(
        (Math.random() - 0.5) * this.#shakeAmp * shakeScale,
        (Math.random() - 0.5) * this.#shakeAmp * 0.6 * shakeScale,
        (Math.random() - 0.5) * this.#shakeAmp * shakeScale
      );
    } else {
      _shake.set(0, 0, 0);
    }

    camera.position.copy(this.#pos).add(_shake);
    camera.lookAt(this.#lookAt);

    const targetFov = baseFov + Math.min(18, speed * 0.22) + this.#airBlend * 4;
    this.#fov = dt > 0 ? THREE.MathUtils.damp(this.#fov, targetFov, 6, dt) : targetFov;
    camera.fov = this.#fov;
    camera.near = CAM_NEAR;
    camera.far = CAM_FAR;
    camera.updateProjectionMatrix();
  }

  #resolveFacing(rider: RiderState): void {
    _velDir.copy(rider.velocity);
    _velDir.y = 0;
    if (_velDir.lengthSq() < 0.25) {
      facingFromYaw(rider.boardYaw, _velDir);
    } else {
      _velDir.normalize();
    }
  }

  #apply(camera: THREE.PerspectiveCamera): void {
    camera.position.copy(this.#pos);
    camera.near = CAM_NEAR;
    camera.far = CAM_FAR;
    camera.fov = this.#fov;
    camera.lookAt(this.#lookAt);
    camera.updateProjectionMatrix();
  }
}
