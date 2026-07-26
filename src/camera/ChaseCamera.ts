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

export class ChaseCamera {
  #pos = new THREE.Vector3(0, 4, -8);
  #lookAt = new THREE.Vector3();
  #fov = 62;
  #shakeAmp = 0;
  #landPulse = 0;
  #airBlend = 0;

  impulse(amount: number): void {
    this.#shakeAmp = Math.min(1.2, this.#shakeAmp + amount);
  }

  onLanding(impact: number): void {
    this.#landPulse = Math.min(1, impact / 18);
    this.impulse(0.08 + this.#landPulse * 0.25);
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
    const speed = rider.speed;
    _velDir.copy(rider.velocity);
    _velDir.y = 0;
    if (_velDir.lengthSq() < 0.01) {
      _velDir.set(-Math.sin(rider.boardYaw), 0, -Math.cos(rider.boardYaw));
    } else {
      _velDir.normalize();
    }

    const back = 5.5 + Math.min(6, speed * 0.08);
    const height = 2.2 + Math.min(2.5, speed * 0.03);
    const lookAhead = 4 + Math.min(10, speed * 0.12);

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
    _right.crossVectors(_up, _velDir).normalize();
    _desired.addScaledVector(_right, look.x * 40);
    _desired.y += look.y * 20;

    // Terrain collision — pull camera in if occluded
    _rayOrigin.copy(rider.position).add(new THREE.Vector3(0, 1.2, 0));
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
        _desired.copy(hit.point).addScaledVector(hit.normal, 0.45);
      }
    }

    this.#pos.lerp(_desired, 1 - Math.exp(-dt * 8));

    _look.copy(rider.position);
    _look.addScaledVector(_velDir, lookAhead);
    _look.y += 0.9 + this.#airBlend * 0.6;
    this.#lookAt.lerp(_look, 1 - Math.exp(-dt * 10));

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
    this.#fov = THREE.MathUtils.damp(this.#fov, targetFov, 6, dt);
    camera.fov = this.#fov;
    camera.updateProjectionMatrix();
  }

  snap(rider: RiderState): void {
    _velDir.set(-Math.sin(rider.boardYaw), 0, -Math.cos(rider.boardYaw));
    this.#pos.copy(rider.position).addScaledVector(_velDir, -7).add(new THREE.Vector3(0, 3, 0));
    this.#lookAt.copy(rider.position).addScaledVector(_velDir, 6);
  }
}
