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
const _nearLook = new THREE.Vector3();

/** Mountain-scale clip planes (spawn ~y=100–400, runs span hundreds of metres). */
const CAM_NEAR = 0.45;
const CAM_FAR = 8000;
const MIN_CHASE_DIST = 2.6;

/**
 * Alpine / SSX chase snap — fill midfield, not sky void:
 * low + close behind rider, look pinned into the near corridor so mountain
 * wall + trees + props read in-frame (refs: user_ref_ssx_chase / alpine_groom).
 */
const SNAP_BACK = 4.35;
const SNAP_HEIGHT = 1.72;
const SNAP_LOOK_AHEAD = 20;
const SNAP_FOV = 48;
/** Metres above sampled terrain at the look point. */
const SNAP_LOOK_TERRAIN_LIFT = 0.28;
/** Max camera→look elevation (rad). Negative = pitch into snow, cuts sky void. */
const SNAP_MAX_LOOK_ELEV = -0.26;
/**
 * Blend look back toward the rider so the midfield isn't a far empty plane.
 * 0 = pure ahead target; higher = rider larger / corridor nearer in frame.
 */
const LOOK_RIDER_BLEND = 0.22;

/** Runtime chase — same language as snap, slightly looser for playability. */
const RUN_BACK = 4.15;
const RUN_HEIGHT = 1.62;
const RUN_LOOK_AHEAD = 14;
const RUN_LOOK_DROP = 0.48;

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
   * Pin look.y to near-corridor terrain. Path aim only steers laterally —
   * distance is clamped to `lookAhead` so we never stare into empty far midfield.
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
    _nearLook.copy(rider.position).addScaledVector(heading, lookAhead);

    if (pathAim) {
      // Lateral course-line pull, distance capped to lookAhead (B8 midfield fill).
      out.copy(pathAim);
      const dx = out.x - rider.position.x;
      const dz = out.z - rider.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-3) {
        const use = Math.min(dist, lookAhead);
        const s = use / dist;
        out.x = rider.position.x + dx * s;
        out.z = rider.position.z + dz * s;
      } else {
        out.copy(_nearLook);
      }
      // Keep some heading-forward bias so we don't yaw off the fall line.
      out.x = THREE.MathUtils.lerp(_nearLook.x, out.x, 0.55);
      out.z = THREE.MathUtils.lerp(_nearLook.z, out.z, 0.55);
    } else {
      out.copy(_nearLook);
    }

    const bed = terrainHeight(physics, out.x, out.z, rider.position.y);
    if (bed != null) {
      out.y = bed + SNAP_LOOK_TERRAIN_LIFT;
    } else {
      out.y = rider.position.y + 0.2 - lookAhead * lookDrop;
    }

    // Pull look toward rider so midfield reads near corridor, not distant void.
    out.x = THREE.MathUtils.lerp(out.x, rider.position.x, LOOK_RIDER_BLEND);
    out.z = THREE.MathUtils.lerp(out.z, rider.position.z, LOOK_RIDER_BLEND);
    out.y = THREE.MathUtils.lerp(out.y, rider.position.y + 0.55, LOOK_RIDER_BLEND * 0.65);

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

    // Keep chase compact at speed — long pull-back opens empty midfield.
    const back = RUN_BACK + Math.min(3.2, speed * 0.045);
    const height = RUN_HEIGHT + Math.min(0.95, speed * 0.014);
    const lookAhead = RUN_LOOK_AHEAD + Math.min(12, speed * 0.12);

    this.#airBlend = THREE.MathUtils.damp(
      this.#airBlend,
      rider.airborne ? 1 : 0,
      rider.airborne ? 4 : 8,
      dt
    );

    _desired.copy(rider.position);
    _desired.addScaledVector(_heading, -back);
    _desired.y += height + this.#airBlend * 0.85;

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
      _look.y += rider.velocity.y * 0.05;
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
      Math.min(baseFov, SNAP_FOV + 2) + Math.min(6, speed * 0.09) + this.#airBlend * 2;
    this.#fov = dt > 0 ? THREE.MathUtils.damp(this.#fov, targetFov, 6, dt) : targetFov;
    camera.fov = this.#fov;
    camera.near = CAM_NEAR;
    camera.far = CAM_FAR;
    camera.updateProjectionMatrix();
  }

  /**
   * Hard-place behind the rider for `run:start` / course load.
   * Rider sits lower-third; look into near corridor / optional path aim on terrain.
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
