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
const MIN_CHASE_DIST = 1.85;

/**
 * Alpine / SSX chase snap — pack midfield with forest/furniture/terrain, not
 * empty corduroy to horizon. Harder than fill-midfield-v3: prop-reach prefers
 * the tree belt over bare mountain rise, always cross-looks into that flank,
 * and keeps look short so trunks/furniture own midframe.
 * (refs: user_ref_ssx_chase / alpine_groom). Props own density; we frame it.
 */
const SNAP_BACK = 2.35;
const SNAP_HEIGHT = 0.82;
const SNAP_LOOK_AHEAD = 4.5;
const SNAP_FOV = 34;
/** Metres above sampled terrain at the look point (tree trunks / banners mid-frame). */
const SNAP_LOOK_TERRAIN_LIFT = 2.4;
/**
 * Max cam→look elevation when aiming above terrain (rad).
 * Negative = pitch into corridor; terrain-pinned mass may exceed this.
 */
const SNAP_MAX_SKY_ELEV = -0.48;
/**
 * Compress look distance toward the rider without erasing forest yaw.
 * Keep low so lateral belt pull survives into the snap.
 */
const LOOK_RIDER_BLEND = 0.16;
/**
 * Lateral metres to probe apron forest / amphitheater walls.
 * Alpine belt starts ~raceHalf+3.2 (≈50m+); probe must reach canopy.
 */
const WALL_PROBE_M = 58;
/** How hard to yaw look toward the denser forest / taller mass (0–1). */
const WALL_PULL = 0.92;
/**
 * Minimum lateral pull even on flat apron — v3 only fired on terrain rise,
 * so carve/start kept staring down empty corduroy.
 */
const FOREST_BASE_PULL = 0.62;
/**
 * Extra metres to aim into the chosen belt once a flank is picked
 * (trees/furniture midfield, not race-strip center).
 */
const FOREST_LOOK_LATERAL_M = 22;
/**
 * Offset camera opposite the forest pull so the frustum looks *across*
 * the strip into the tree belt (SSX midfield pack), not down empty groom.
 */
const CAM_CROSS_M = 6.8;
/**
 * Horizontal prop probe height — hit trunks/banners, not buried colliders.
 */
const PROP_PROBE_Y = 3.2;

/** Runtime chase — same language as snap, slightly looser for playability. */
const RUN_BACK = 2.2;
const RUN_HEIGHT = 0.75;
const RUN_LOOK_AHEAD = 4.0;
const RUN_LOOK_DROP = 1.05;

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

/** Nearest prop along a horizontal ray — trees/furniture fill score. */
function propReach(
  physics: PhysicsWorld,
  origin: THREE.Vector3,
  dirX: number,
  dirZ: number,
  maxDist: number
): number {
  _rayOrigin.copy(origin);
  _rayOrigin.y += PROP_PROBE_Y;
  _rayDir.set(dirX, 0, dirZ);
  if (_rayDir.lengthSq() < 1e-8) return maxDist;
  _rayDir.normalize();
  const hit = physics.raycast({
    origin: _rayOrigin,
    direction: _rayDir,
    maxDistance: maxDist,
    groups: CollisionGroup.Prop,
  });
  return hit ? hit.distance : maxDist;
}

export class ChaseCamera {
  #pos = new THREE.Vector3(0, 4, -8);
  #lookAt = new THREE.Vector3();
  #fov = SNAP_FOV;
  #shakeAmp = 0;
  #landPulse = 0;
  #airBlend = 0;
  /** +1 = look pulled to rider-right flank; drives opposite cam cross-bias. */
  #flankSide = 0;

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
   * Pin look into near corridor + apron forest / furniture. Prop-reach picks
   * the packed flank; terrain rise is fallback. Always cross-pull so midfield
   * is never empty corduroy centered in frame.
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
      // Soft course-line steer only — hard path blend recentered empty strip (B8).
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
      out.x = THREE.MathUtils.lerp(_nearLook.x, out.x, 0.38);
      out.z = THREE.MathUtils.lerp(_nearLook.z, out.z, 0.38);
    } else {
      out.copy(_nearLook);
    }

    this.#flankSide = 0;
    _right.crossVectors(_up, heading);
    if (_right.lengthSq() > 1e-6) {
      _right.normalize();

      // Prop-reach: nearer trees/furniture win over bare mountain rise.
      const leftProp = propReach(physics, out, -_right.x, -_right.z, WALL_PROBE_M);
      const rightProp = propReach(physics, out, _right.x, _right.z, WALL_PROBE_M);
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

      // Score: closer props dominate; terrain rise breaks ties / fills empty apron.
      const leftScore =
        (WALL_PROBE_M - leftProp) * 1.35 + Math.max(0, leftRise) * 0.55;
      const rightScore =
        (WALL_PROBE_M - rightProp) * 1.35 + Math.max(0, rightRise) * 0.55;

      let side = 0;
      if (leftScore > rightScore + 0.5) side = -1;
      else if (rightScore > leftScore + 0.5) side = 1;
      else if (leftRise > 1.2 || rightRise > 1.2) {
        side = leftRise >= rightRise ? -1 : 1;
      } else {
        // Flat empty strip — still bias so midfield isn't centered corduroy.
        side = leftProp <= rightProp ? -1 : 1;
      }

      const rise = side < 0 ? leftRise : rightRise;
      const propDist = side < 0 ? leftProp : rightProp;
      const propPull = THREE.MathUtils.clamp(
        (WALL_PROBE_M - propDist) / (WALL_PROBE_M * 0.55),
        0,
        1
      );
      const risePull = THREE.MathUtils.clamp((rise - 1.2) / 18, 0, 1);
      const pull = Math.max(
        FOREST_BASE_PULL,
        WALL_PULL * Math.max(propPull, risePull)
      );
      out.addScaledVector(_right, side * (FOREST_LOOK_LATERAL_M * pull));
      this.#flankSide = side;
    }

    const bed = terrainHeight(physics, out.x, out.z, rider.position.y);
    if (bed != null) {
      out.y = bed + SNAP_LOOK_TERRAIN_LIFT;
    } else {
      out.y = rider.position.y + 0.35 - lookAhead * lookDrop;
    }

    // Compress look distance toward rider; preserve lateral forest yaw.
    _toLook.subVectors(out, rider.position);
    const latX = _toLook.x - heading.x * (_toLook.x * heading.x + _toLook.z * heading.z);
    const latZ = _toLook.z - heading.z * (_toLook.x * heading.x + _toLook.z * heading.z);
    const aheadDist = _toLook.x * heading.x + _toLook.z * heading.z;
    const nearDist = THREE.MathUtils.lerp(aheadDist, lookAhead * 0.45, LOOK_RIDER_BLEND);
    out.x = rider.position.x + heading.x * nearDist + latX * (1 - LOOK_RIDER_BLEND * 0.12);
    out.z = rider.position.z + heading.z * nearDist + latZ * (1 - LOOK_RIDER_BLEND * 0.12);
    out.y = THREE.MathUtils.lerp(out.y, rider.position.y + 1.15, LOOK_RIDER_BLEND * 0.28);

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
    const back = RUN_BACK + Math.min(0.85, speed * 0.014);
    const height = RUN_HEIGHT + Math.min(0.24, speed * 0.0045);
    const lookAhead = RUN_LOOK_AHEAD + Math.min(2.4, speed * 0.028);

    this.#airBlend = THREE.MathUtils.damp(
      this.#airBlend,
      rider.airborne ? 1 : 0,
      rider.airborne ? 4 : 8,
      dt
    );

    // Forest flank first so this-frame cross-look matches prop/terrain pull.
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
      _look.y += rider.velocity.y * 0.03;
    }
    this.#lookAt.lerp(_look, dt > 0 ? 1 - Math.exp(-dt * 10) : 1);

    _desired.copy(rider.position);
    _desired.addScaledVector(_heading, -back);
    _desired.y += height + this.#airBlend * 0.45;

    _right.crossVectors(_up, _heading);
    if (_right.lengthSq() > 1e-6) {
      _right.normalize();
      _desired.addScaledVector(_right, look.x * 28);
      // Cross-look into forest belt — opposite flank so trees own midfield.
      if (this.#flankSide !== 0) {
        _desired.addScaledVector(_right, -this.#flankSide * CAM_CROSS_M);
      }
    }
    _desired.y += look.y * 12;

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
      Math.min(baseFov, SNAP_FOV + 0.8) + Math.min(2.6, speed * 0.04) + this.#airBlend * 1.0;
    this.#fov = dt > 0 ? THREE.MathUtils.damp(this.#fov, targetFov, 6, dt) : targetFov;
    camera.fov = this.#fov;
    camera.near = CAM_NEAR;
    camera.far = CAM_FAR;
    camera.updateProjectionMatrix();
  }

  /**
   * Hard-place behind the rider for `run:start` / course load.
   * Rider sits lower-third; look into near corridor / apron forest / furniture.
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

    // Cross-look into the pulled flank so snap frames pack midfield like SSX.
    _right.crossVectors(_up, _heading);
    if (this.#flankSide !== 0 && _right.lengthSq() > 1e-6) {
      _right.normalize();
      this.#pos.addScaledVector(_right, -this.#flankSide * CAM_CROSS_M);
    }

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
