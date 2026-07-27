import * as THREE from 'three';
import type { RiderState } from '@/types/gameplay.ts';
import type { PhysicsWorld } from '@/types/physics.ts';
import { CollisionGroup } from '@/types/physics.ts';

const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _heading = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _shake = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _toLook = new THREE.Vector3();

/** Mountain-scale clip planes (spawn ~y=100–400, runs span hundreds of metres). */
const CAM_NEAR = 0.45;
const CAM_FAR = 8000;
const MIN_CHASE_DIST = 3.2;

/**
 * Alpine chase snap — fill frame like SSX / alpine refs:
 * rider in the lower third, look pinned far ahead onto fall-line terrain so
 * peaks / forest belt occupy mid+upper frame instead of empty sky/midfield.
 */
const SNAP_BACK = 5.6;
const SNAP_HEIGHT = 2.95;
const SNAP_LOOK_AHEAD = 48;
const SNAP_FOV = 52;
/** Metres above sampled terrain at the look point. */
const SNAP_LOOK_TERRAIN_LIFT = 0.7;
/** Max camera→look elevation (rad). Negative = look below horizon, cuts sky. */
const SNAP_MAX_LOOK_ELEV = -0.16;

/** Runtime chase (playable, still sells mountain/forest ahead). */
const RUN_BACK = 5.4;
const RUN_HEIGHT = 2.8;
const RUN_LOOK_AHEAD = 28;
const RUN_LOOK_DROP = 0.34;

/** Match BoardPhysics forwardFromYaw: (sin(yaw), 0, cos(yaw)). */
function headingFromYaw(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}

function terrainHeight(
  physics: PhysicsWorld,
  x: number,
  z: number,
  fromY: number
): number | null {
  _probe.set(x, fromY + 80, z);
  const hit = physics.raycast({
    origin: _probe,
    direction: _down,
    maxDistance: 400,
    groups: CollisionGroup.Terrain,
  });
  return hit ? hit.point.y : null;
}

export class ChaseCamera {
  #pos = new THREE.Vector3(0, 4, -8);
  #lookAt = new THREE.Vector3();
  #fov = SNAP_FOV;
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

  /**
   * Horizontal chase heading: travel velocity when moving, otherwise board yaw
   * flipped to the fall line so we always look downhill on the mountain.
   */
  #resolveHeading(rider: RiderState, physics: PhysicsWorld, out: THREE.Vector3): void {
    out.copy(rider.velocity);
    out.y = 0;
    if (out.lengthSq() >= 0.25) {
      out.normalize();
      return;
    }

    headingFromYaw(rider.boardYaw, out);
    const fromY = rider.position.y;
    const ahead = terrainHeight(
      physics,
      rider.position.x + out.x * 40,
      rider.position.z + out.z * 40,
      fromY
    );
    const behind = terrainHeight(
      physics,
      rider.position.x - out.x * 40,
      rider.position.z - out.z * 40,
      fromY
    );
    // If board forward climbs, chase the opposite way (downhill).
    if (ahead != null && behind != null && ahead > behind + 1.5) {
      out.negate();
    } else if (ahead != null && behind == null) {
      if (ahead > fromY + 1) out.negate();
    }
  }

  /**
   * Pin look.y to terrain ahead; if the look ray aims at sky, bias further down.
   * Optional `pathAim` (course sample ahead) pulls framing onto the upcoming line.
   */
  #frameLookAlongTerrain(
    rider: RiderState,
    physics: PhysicsWorld,
    heading: THREE.Vector3,
    lookAhead: number,
    lookDrop: number,
    pathAim: THREE.Vector3 | null,
    out: THREE.Vector3
  ): void {
    if (pathAim) {
      out.copy(pathAim);
    } else {
      out.copy(rider.position).addScaledVector(heading, lookAhead);
    }

    const bed = terrainHeight(physics, out.x, out.z, rider.position.y);
    if (bed != null) {
      out.y = bed + SNAP_LOOK_TERRAIN_LIFT;
    } else {
      out.y = rider.position.y + 0.35 - lookAhead * lookDrop;
    }

    // Sky guard: if cam→look elevation is too high, pull look down onto terrain.
    _toLook.subVectors(out, this.#pos);
    const horiz = Math.hypot(_toLook.x, _toLook.z);
    if (horiz > 0.01) {
      const elev = Math.atan2(_toLook.y, horiz);
      if (elev > SNAP_MAX_LOOK_ELEV) {
        const targetY = this.#pos.y + Math.tan(SNAP_MAX_LOOK_ELEV) * horiz;
        out.y = Math.min(out.y, targetY);
        const bed2 = terrainHeight(physics, out.x, out.z, rider.position.y);
        if (bed2 != null) {
          out.y = Math.min(out.y, bed2 + SNAP_LOOK_TERRAIN_LIFT);
        }
      }
    }
  }

  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    rider: RiderState,
    physics: PhysicsWorld,
    baseFov: number,
    shakeScale: number,
    look: { x: number; y: number },
    pathAim: THREE.Vector3 | null = null
  ): void {
    const speed = rider.speed;
    this.#resolveHeading(rider, physics, _heading);

    const back = RUN_BACK + Math.min(5.5, speed * 0.07);
    const height = RUN_HEIGHT + Math.min(1.6, speed * 0.022);
    const lookAhead = RUN_LOOK_AHEAD + Math.min(24, speed * 0.2);

    this.#airBlend = THREE.MathUtils.damp(
      this.#airBlend,
      rider.airborne ? 1 : 0,
      rider.airborne ? 4 : 8,
      dt
    );

    _desired.copy(rider.position);
    _desired.addScaledVector(_heading, -back);
    _desired.y += height + this.#airBlend * 1.15;

    _right.crossVectors(_up, _heading);
    if (_right.lengthSq() > 1e-6) {
      _right.normalize();
      _desired.addScaledVector(_right, look.x * 40);
    }
    _desired.y += look.y * 20;

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

    // dt==0 (capture converge): hard-follow so frozen frames stay correct after snap.
    const follow = dt > 0 ? 1 - Math.exp(-dt * 8) : 1;
    this.#pos.lerp(_desired, follow);

    this.#frameLookAlongTerrain(
      rider,
      physics,
      _heading,
      lookAhead,
      RUN_LOOK_DROP,
      pathAim,
      _look
    );
    if (rider.velocity.y < -0.5) {
      _look.y += rider.velocity.y * 0.06;
    }
    this.#lookAt.lerp(_look, dt > 0 ? 1 - Math.exp(-dt * 10) : 1);

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

    const targetFov =
      Math.min(baseFov, SNAP_FOV + 3) + Math.min(10, speed * 0.14) + this.#airBlend * 2.5;
    this.#fov = dt > 0 ? THREE.MathUtils.damp(this.#fov, targetFov, 6, dt) : targetFov;
    camera.fov = this.#fov;
    camera.near = CAM_NEAR;
    camera.far = CAM_FAR;
    camera.updateProjectionMatrix();
  }

  /**
   * Hard-place behind the rider for `run:start` / course load.
   * Rider sits lower-third; look follows board forward / optional path aim onto terrain.
   */
  snap(
    rider: RiderState,
    physics: PhysicsWorld,
    camera?: THREE.PerspectiveCamera,
    pathAim?: THREE.Vector3 | null
  ): void {
    this.#resolveHeading(rider, physics, _heading);
    this.#airBlend = rider.airborne ? 1 : 0;
    this.#fov = SNAP_FOV;

    this.#pos.copy(rider.position).addScaledVector(_heading, -SNAP_BACK);
    this.#pos.y += SNAP_HEIGHT;

    this.#frameLookAlongTerrain(
      rider,
      physics,
      _heading,
      SNAP_LOOK_AHEAD,
      RUN_LOOK_DROP,
      pathAim ?? null,
      this.#lookAt
    );

    if (camera) {
      this.#apply(camera);
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
