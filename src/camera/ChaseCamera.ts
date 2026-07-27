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
const MIN_CHASE_DIST = 2.2;

/**
 * Alpine / SSX chase snap — fill midfield, not milk sky void:
 * low + tight behind rider; look pinned into near corridor + rising
 * amphitheater mass so mountain wall / trees / midground own the frame
 * (refs: user_ref_ssx_chase / alpine_groom). Harder than fill-midfield-chase.
 */
const SNAP_BACK = 3.45;
const SNAP_HEIGHT = 1.22;
const SNAP_LOOK_AHEAD = 12;
const SNAP_FOV = 43;
/** Metres above sampled terrain at the look point. */
const SNAP_LOOK_TERRAIN_LIFT = 0.1;
/**
 * Max cam→look elevation when aiming above terrain (rad).
 * Negative = pitch into corridor; terrain-pinned mass may exceed this.
 */
const SNAP_MAX_SKY_ELEV = -0.34;
/**
 * Blend look back toward the rider so midfield reads near corridor, not far void.
 * 0 = pure ahead target; higher = rider larger / corridor nearer in frame.
 */
const LOOK_RIDER_BLEND = 0.4;
/** Lateral metres to probe amphitheater walls for midfield mass fill. */
const WALL_PROBE_M = 22;
/** How hard to yaw look toward the taller flanking wall (0–1). */
const WALL_PULL = 0.42;

/** Runtime chase — same language as snap, slightly looser for playability. */
const RUN_BACK = 3.25;
const RUN_HEIGHT = 1.12;
const RUN_LOOK_AHEAD = 9;
const RUN_LOOK_DROP = 0.78;

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
   * Pin look to near-corridor + flanking wall mass. Path aim steers laterally;
   * distance stays clamped to `lookAhead` so we never stare into empty far void.
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
      // Prefer course line so amphitheater corridor stays centered.
      out.x = THREE.MathUtils.lerp(_nearLook.x, out.x, 0.72);
      out.z = THREE.MathUtils.lerp(_nearLook.z, out.z, 0.72);
    } else {
      out.copy(_nearLook);
    }

    // Yaw toward taller flanking wall — fills midfield with mountain mass, not void.
    _right.crossVectors(_up, heading);
    if (_right.lengthSq() > 1e-6) {
      _right.normalize();
      const leftY = terrainHeight(
        physics,
        out.x - _right.x * WALL_PROBE_M,
        out.z - _right.z * WALL_PROBE_M,
        rider.position.y
      );
      const rightY = terrainHeight(
        physics,
        out.x + _right.x * WALL_PROBE_M,
        out.z + _right.z * WALL_PROBE_M,
        rider.position.y
      );
      const bed0 = terrainHeight(physics, out.x, out.z, rider.position.y);
      const centerY = bed0 ?? rider.position.y;
      const leftRise = leftY != null ? leftY - centerY : 0;
      const rightRise = rightY != null ? rightY - centerY : 0;
      if (leftRise > 4 || rightRise > 4) {
        const side = leftRise >= rightRise ? -1 : 1;
        const rise = Math.max(leftRise, rightRise);
        const pull = WALL_PULL * THREE.MathUtils.clamp((rise - 4) / 28, 0, 1);
        out.addScaledVector(_right, side * WALL_PROBE_M * pull);
      }
    }

    const bed = terrainHeight(physics, out.x, out.z, rider.position.y);
    if (bed != null) {
      out.y = bed + SNAP_LOOK_TERRAIN_LIFT;
    } else {
      out.y = rider.position.y + 0.12 - lookAhead * lookDrop;
    }

    // Pull look toward rider so midfield reads near corridor, not distant void.
    out.x = THREE.MathUtils.lerp(out.x, rider.position.x, LOOK_RIDER_BLEND);
    out.z = THREE.MathUtils.lerp(out.z, rider.position.z, LOOK_RIDER_BLEND);
    out.y = THREE.MathUtils.lerp(out.y, rider.position.y + 0.42, LOOK_RIDER_BLEND * 0.55);

    // Sky guard: cut milk-sky aim only. Keep terrain-pinned midground mass.
    _toLook.subVectors(out, this.#pos);
    const horiz = Math.hypot(_toLook.x, _toLook.z);
    if (horiz > 0.01) {
      const elev = Math.atan2(_toLook.y, horiz);
      if (bed != null) {
        const terrainElev = Math.atan2(bed + SNAP_LOOK_TERRAIN_LIFT - this.#pos.y, horiz);
        const maxElev = Math.max(SNAP_MAX_SKY_ELEV, terrainElev);
        if (elev > maxElev) {
          out.y = this.#pos.y + Math.tan(maxElev) * horiz;
        }
      } else if (elev > SNAP_MAX_SKY_ELEV) {
        out.y = this.#pos.y + Math.tan(SNAP_MAX_SKY_ELEV) * horiz;
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
    const back = RUN_BACK + Math.min(1.8, speed * 0.026);
    const height = RUN_HEIGHT + Math.min(0.45, speed * 0.008);
    const lookAhead = RUN_LOOK_AHEAD + Math.min(5, speed * 0.055);

    this.#airBlend = THREE.MathUtils.damp(
      this.#airBlend,
      rider.airborne ? 1 : 0,
      rider.airborne ? 4 : 8,
      dt
    );

    _desired.copy(rider.position);
    _desired.addScaledVector(_heading, -back);
    _desired.y += height + this.#airBlend * 0.65;

    _right.crossVectors(_up, _heading);
    if (_right.lengthSq() > 1e-6) {
      _right.normalize();
      _desired.addScaledVector(_right, look.x * 36);
    }
    _desired.y += look.y * 16;

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
      _look.y += rider.velocity.y * 0.04;
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
      Math.min(baseFov, SNAP_FOV + 1.5) + Math.min(4.5, speed * 0.07) + this.#airBlend * 1.5;
    this.#fov = dt > 0 ? THREE.MathUtils.damp(this.#fov, targetFov, 6, dt) : targetFov;
    camera.fov = this.#fov;
    camera.near = CAM_NEAR;
    camera.far = CAM_FAR;
    camera.updateProjectionMatrix();
  }

  /**
   * Hard-place behind the rider for `run:start` / course load.
   * Rider sits lower-third; look into near corridor / wall mass / path aim.
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
