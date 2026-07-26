/**
 * Arcade snowboard controller.
 *
 * Kinematic board driven by synthetic slope physics: ground is sensed with
 * downward rays, velocity is integrated on the contact plane, and the pose is
 * written back through `PhysicsWorld` each fixed step. Hot paths reuse scratch
 * vectors to stay allocation-free.
 */

import * as THREE from 'three';
import type { LandingGrade, LandingResult, RiderSpawn, SurfaceKind } from '@/types/gameplay.ts';
import type { RiderInput } from '@/types/input.ts';
import type { PhysicsWorld, RigidBodyHandle } from '@/types/physics.ts';
import { CollisionGroup } from '@/types/physics.ts';
import {
  ACCEL,
  AIR,
  BOARD_COLLIDER,
  BOOST,
  CARVE,
  CRASH,
  GRAVITY,
  GRIND,
  JUMP,
  LANDING,
  SPEED,
  SURFACE,
} from './tuning.ts';

export interface BoardTransform {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

export interface SpraySignal {
  intensity: number;
  surface: SurfaceKind;
  speed: number;
}

export interface RiderPhysicsFrameResult {
  jumped: boolean;
  jumpImpulse: number;
  landed: LandingResult | null;
  crashed: boolean;
  crashReason: 'impact' | 'edge-catch' | 'alignment' | null;
  recovered: boolean;
  spray: SpraySignal | null;
  grindStarted: boolean;
  grindEnded: boolean;
  boostMeter: number;
}

interface GroundSample {
  hit: boolean;
  distance: number;
  normal: THREE.Vector3;
  surface: SurfaceKind;
  point: THREE.Vector3;
}

const WORLD_DOWN = new THREE.Vector3(0, -1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

const _surfaceCounts: Record<SurfaceKind, number> = {
  powder: 0,
  packed: 0,
  ice: 0,
  rail: 0,
  wood: 0,
  rock: 0,
};

const RAY_OFFSETS = [-0.85, -0.42, 0, 0.42, 0.85] as const;

const SURFACE_KINDS: readonly SurfaceKind[] = [
  'powder',
  'packed',
  'ice',
  'rail',
  'wood',
  'rock',
];

export class BoardPhysics {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();

  boardYaw = 0;
  boardPitch = 0;
  boardRoll = 0;
  lean = 0;
  edgeAngle = 0;

  grounded = false;
  airborne = false;
  grinding = false;
  crashed = false;
  surfaceKind: SurfaceKind = 'packed';
  speed = 0;
  boostMeter: number = BOOST.maxMeter;

  #body: RigidBodyHandle | null = null;
  #groundNormal = new THREE.Vector3(0, 1, 0);
  #groundPoint = new THREE.Vector3();
  #targetLean = 0;
  #jumpBuffer = 0;
  #coyote = 0;
  #anticipation = 0;
  #recovery = 0;
  #wasAirborne = false;
  #wasGrinding = false;
  #grindTime = 0;
  #railAxis = new THREE.Vector3(1, 0, 0);
  #quaternion = new THREE.Quaternion();
  #boardUp = new THREE.Vector3(0, 1, 0);
  #samples: GroundSample[] = RAY_OFFSETS.map(() => ({
    hit: false,
    distance: JUMP.rayLength,
    normal: new THREE.Vector3(0, 1, 0),
    surface: 'packed' as SurfaceKind,
    point: new THREE.Vector3(),
  }));

  reset(spawn: RiderSpawn): void {
    this.position.copy(spawn.position);
    this.velocity.set(0, 0, 0);
    this.boardYaw = spawn.yaw;
    this.boardPitch = spawn.pitch ?? 0;
    this.boardRoll = 0;
    this.lean = 0;
    this.edgeAngle = 0;
    this.grounded = true;
    this.airborne = false;
    this.grinding = false;
    this.crashed = false;
    this.surfaceKind = 'packed';
    this.speed = 0;
    this.boostMeter = BOOST.maxMeter;
    this.#jumpBuffer = 0;
    this.#coyote = 0;
    this.#anticipation = 0;
    this.#recovery = 0;
    this.#wasAirborne = false;
    this.#wasGrinding = false;
    this.#grindTime = 0;
    this.#groundNormal.set(0, 1, 0);
    this.#groundPoint.copy(spawn.position);
    this.#composeQuaternion();
  }

  attachBody(physics: PhysicsWorld, position?: THREE.Vector3): RigidBodyHandle {
    if (position) this.position.copy(position);
    this.#composeQuaternion();
    this.#body = physics.createKinematicBody({
      position: this.position,
      rotation: this.#quaternion,
      halfExtents: _v0.set(BOARD_COLLIDER.x, BOARD_COLLIDER.y, BOARD_COLLIDER.z),
      actorId: 'rider',
    });
    return this.#body;
  }

  get recoveryRemaining(): number {
    return this.#recovery;
  }

  getTransform(outPosition = this.position, outQuaternion = this.#quaternion): BoardTransform {
    outQuaternion.copy(this.#quaternion);
    return { position: outPosition, quaternion: outQuaternion };
  }

  fixedUpdate(dt: number, input: RiderInput, physics: PhysicsWorld): RiderPhysicsFrameResult {
    const result: RiderPhysicsFrameResult = {
      jumped: false,
      jumpImpulse: 0,
      landed: null,
      crashed: false,
      crashReason: null,
      recovered: false,
      spray: null,
      grindStarted: false,
      grindEnded: false,
      boostMeter: this.boostMeter,
    };

    if (this.crashed) {
      this.#recovery = Math.max(0, this.#recovery - dt);
      this.velocity.multiplyScalar(Math.max(0, 1 - dt * 3.5));
      this.speed = horizontalSpeed(this.velocity);
      if (this.#recovery <= 0) {
        this.crashed = false;
        this.velocity.set(0, 0, 0);
        this.speed = CRASH.recoverySpeed;
        this.boardPitch = 0;
        this.boardRoll = 0;
        result.recovered = true;
      }
      this.#writeBody(physics);
      result.boostMeter = this.boostMeter;
      return result;
    }

    if (input.jumpPressed) this.#jumpBuffer = JUMP.buffer;
    else this.#jumpBuffer = Math.max(0, this.#jumpBuffer - dt);

    this.#targetLean = input.lean > 0.5 ? input.steer >= 0 ? 1 : -1 : input.steer * CARVE.maxLean;
    this.lean = approach(this.lean, this.#targetLean, CARVE.leanRate * dt);
    this.edgeAngle = this.lean * CARVE.edgePerLean;

    this.#sampleGround(physics);

    const wasGrounded = this.grounded;
    this.grounded = this.#samples[2]?.hit === true && (this.#samples[2]?.distance ?? 999) <= JUMP.groundEpsilon;
    this.airborne = !this.grounded;

    if (wasGrounded) {
      this.#coyote = JUMP.coyote;
      if (input.jump || input.jumpPressed) this.#anticipation = Math.min(0.18, this.#anticipation + dt);
      else this.#anticipation = Math.max(0, this.#anticipation - dt * 4);
    } else {
      this.#coyote = Math.max(0, this.#coyote - dt);
    }

    if (this.grinding) {
      this.#integrateGrind(dt);
    } else if (this.grounded) {
      this.#integrateGround(dt, input, result);
      this.#tryStartGrind();
    } else {
      this.#integrateAir(dt, input);
    }

    if (this.grounded && !wasGrounded && this.#wasAirborne) {
      result.landed = this.#resolveLanding();
      if (result.landed.grade === 'bail') {
        this.crashed = true;
        this.#recovery = CRASH.recoveryTime;
        result.crashed = true;
        result.crashReason = result.landed.impactSpeed >= LANDING.hardImpact ? 'impact' : 'alignment';
      }
    }

    if (!wasGrounded && this.grounded && (this.#jumpBuffer > 0 || this.#coyote > 0)) {
      // Buffered jump on lip — only when we were already airborne from a prior hop.
    }

    if (wasGrounded && !this.grounded && this.velocity.y > 0.5) {
      this.#wasAirborne = true;
    }

    if (this.grinding && !this.#wasGrinding) {
      result.grindStarted = true;
    }
    if (!this.grinding && this.#wasGrinding) {
      result.grindEnded = true;
    }
    this.#wasGrinding = this.grinding;

    this.#composeQuaternion();
    this.#writeBody(physics);

    this.speed = horizontalSpeed(this.velocity);
    result.boostMeter = this.boostMeter;
    return result;
  }

  #integrateGround(dt: number, input: RiderInput, result: RiderPhysicsFrameResult): void {
    const surface = SURFACE[this.surfaceKind] ?? SURFACE.packed;
    const downhill = projectOnPlane(_v0.copy(WORLD_DOWN).multiplyScalar(GRAVITY), this.#groundNormal);
    this.velocity.addScaledVector(downhill, dt * ACCEL.slopeGravity);

    const forward = forwardFromYaw(this.boardYaw, _v1);
    const slopeForward = projectOnPlane(forward, this.#groundNormal).normalize();
    const right = _v2.crossVectors(this.#groundNormal, slopeForward).normalize();

    const forwardSpeed = this.velocity.dot(slopeForward);
    const lateralSpeed = this.velocity.dot(right);

    const boosting =
      input.boost && this.boostMeter >= BOOST.minToUse && forwardSpeed > 2;
    if (boosting) {
      this.velocity.addScaledVector(slopeForward, ACCEL.boost * dt);
      this.boostMeter = Math.max(0, this.boostMeter - BOOST.drainRate * dt);
    } else if (this.grounded) {
      this.boostMeter = Math.min(BOOST.maxMeter, this.boostMeter + BOOST.rechargeRate * dt);
    }

    const steerAuthority = Math.max(0.25, Math.min(1, this.speed / SPEED.minSteer));
    const steerRate =
      (this.edgeAngle * CARVE.steerRate * this.speed + input.steer * CARVE.steerInputRate) *
      steerAuthority;
    this.boardYaw += steerRate * dt;

    const grip = CARVE.baseGrip * surface.grip * (0.35 + Math.abs(this.edgeAngle) * 1.4);
    const lateralDecay = Math.exp(-grip * dt);
    const newLateral = lateralSpeed * lateralDecay;
    this.velocity.addScaledVector(right, newLateral - lateralSpeed);

    const drag = surface.drag * (input.brake ? SPEED.brakeDecel : ACCEL.coast * 0.15);
    const fwd = this.velocity.dot(slopeForward);
    const fwdSign = Math.sign(fwd) || 1;
    let newFwd = fwd;
    if (input.brake) {
      newFwd = fwd - fwdSign * SPEED.brakeDecel * dt;
      if (fwdSign > 0 && newFwd < 0) newFwd = 0;
      if (fwdSign < 0 && newFwd > 0) newFwd = 0;
    } else {
      newFwd = fwd - fwdSign * drag * dt * 0.35;
    }
    this.velocity.addScaledVector(slopeForward, newFwd - fwd);

    const cap = boosting ? SPEED.boostMax : SPEED.max;
    clampHorizontalSpeed(this.velocity, cap);

    this.velocity.addScaledVector(this.#groundNormal, -this.velocity.dot(this.#groundNormal));
    this.velocity.addScaledVector(WORLD_DOWN, -JUMP.groundStick * dt);

    const heightError = (this.#samples[2]?.distance ?? 0) - JUMP.groundEpsilon * 0.5;
    if (heightError > 0) {
      this.position.y -= heightError;
    }

    if ((this.#jumpBuffer > 0 || input.jump) && (this.#coyote > 0 || this.grounded)) {
      let impulse = JUMP.impulse + this.#anticipation * JUMP.anticipationBonus * 5;
      this.velocity.addScaledVector(this.#groundNormal, impulse);
      this.#jumpBuffer = 0;
      this.#coyote = 0;
      this.#anticipation = 0;
      this.grounded = false;
      this.airborne = true;
      result.jumped = true;
      result.jumpImpulse = impulse;
    }

    const sprayIntensity = computeSprayIntensity(this.speed, this.edgeAngle, surface.spray);
    if (sprayIntensity > 0) {
      result.spray = {
        intensity: sprayIntensity,
        surface: this.surfaceKind,
        speed: this.speed,
      };
    }
  }

  #integrateAir(dt: number, input: RiderInput): void {
    this.velocity.y -= GRAVITY * dt;
    this.velocity.multiplyScalar(Math.max(0, 1 - ACCEL.airDrag * dt));

    if (input.spinLeft) this.boardYaw += AIR.spinRate * dt;
    if (input.spinRight) this.boardYaw -= AIR.spinRate * dt;
    if (input.flipFront) this.boardPitch = clamp(this.boardPitch + AIR.flipRate * dt, -AIR.maxPitch, AIR.maxPitch);
    if (input.flipBack) this.boardPitch = clamp(this.boardPitch - AIR.flipRate * dt, -AIR.maxPitch, AIR.maxPitch);

    this.boardRoll = approach(this.boardRoll, this.edgeAngle * 0.85, AIR.edgeRollCarry * dt);

    const forward = forwardFromYaw(this.boardYaw, _v1);
    const alignTarget = projectOnPlane(forward, WORLD_UP).normalize();
    if (alignTarget.lengthSq() > 0.01) {
      const yawTarget = Math.atan2(alignTarget.x, alignTarget.z);
      this.boardYaw = approachAngle(this.boardYaw, yawTarget, AIR.velocityAlignRate * dt * 0.15);
    }

    this.position.addScaledVector(this.velocity, dt);
  }

  #integrateGrind(dt: number): void {
    this.#grindTime += dt;
    this.velocity.copy(this.#railAxis).multiplyScalar(GRIND.railSpeed);
    this.position.addScaledVector(this.velocity, dt);
    this.position.y -= GRIND.stickDown * dt;
    this.boardRoll = approach(this.boardRoll, 0, 6 * dt);
    this.boardPitch = approach(this.boardPitch, 0, 6 * dt);
  }

  #tryStartGrind(): void {
    if (this.surfaceKind !== 'rail') return;
    const center = this.#samples[2];
    if (!center?.hit) return;
    if (center.distance > GRIND.latchDistance) return;

    this.grinding = true;
    this.#grindTime = 0;
    _v0.crossVectors(WORLD_UP, this.#groundNormal);
    if (_v0.lengthSq() < 0.01) {
      forwardFromYaw(this.boardYaw, this.#railAxis);
    } else {
      this.#railAxis.copy(_v0).normalize();
    }
  }

  #resolveLanding(): LandingResult {
    this.#composeBoardUp(this.#boardUp);
    const alignment = clamp(this.#boardUp.dot(this.#groundNormal), -1, 1);
    const impactSpeed = Math.max(0, -this.velocity.y);
    let grade: LandingGrade = 'bail';

    if (impactSpeed >= LANDING.hardImpact) {
      grade = 'bail';
    } else if (alignment >= LANDING.perfectAlign && impactSpeed <= LANDING.softImpact) {
      grade = 'perfect';
    } else if (alignment >= LANDING.goodAlign) {
      grade = 'good';
    } else if (alignment >= LANDING.sketchyAlign) {
      grade = 'sketchy';
    }

    let keep: number = LANDING.bailSpeedKeep;
    switch (grade) {
      case 'perfect':
        keep = LANDING.perfectSpeedKeep;
        break;
      case 'good':
        keep = LANDING.goodSpeedKeep;
        break;
      case 'sketchy':
        keep = LANDING.sketchySpeedKeep;
        break;
      case 'bail':
        keep = LANDING.bailSpeedKeep;
        break;
    }

    clampHorizontalSpeed(this.velocity, SPEED.max * keep);
    this.velocity.y = 0;
    this.boardPitch = approach(this.boardPitch, 0, 8 * 0.016);
    this.boardRoll = approach(this.boardRoll, this.edgeAngle * 0.5, 8 * 0.016);
    this.#wasAirborne = false;

    return {
      grade,
      alignment,
      impactSpeed,
      speed: horizontalSpeed(this.velocity),
      surface: this.surfaceKind,
    };
  }

  #sampleGround(physics: PhysicsWorld): void {
    const forward = forwardFromYaw(this.boardYaw, _v3);
    const right = _v4.crossVectors(WORLD_UP, forward).normalize();
    const normalSum = _v0.set(0, 0, 0);
    let hitCount = 0;
    for (let i = 0; i < SURFACE_KINDS.length; i++) {
      _surfaceCounts[SURFACE_KINDS[i]!] = 0;
    }

    for (let i = 0; i < RAY_OFFSETS.length; i++) {
      const sample = this.#samples[i]!;
      const offset = RAY_OFFSETS[i]!;
      _v1
        .copy(this.position)
        .addScaledVector(forward, offset * JUMP.boardHalfLength)
        .addScaledVector(WORLD_UP, 0.35);

      const hit = physics.raycast({
        origin: _v1,
        direction: WORLD_DOWN,
        maxDistance: JUMP.rayLength,
        groups: CollisionGroup.Terrain | CollisionGroup.Trigger | CollisionGroup.Rail,
      });

      if (hit) {
        sample.hit = true;
        sample.distance = hit.distance;
        sample.normal.copy(hit.normal);
        sample.surface = hit.surface;
        sample.point.copy(hit.point);
        normalSum.add(hit.normal);
        hitCount++;
        _surfaceCounts[hit.surface] += 1;
      } else {
        sample.hit = false;
        sample.distance = JUMP.rayLength;
        sample.normal.set(0, 1, 0);
        sample.surface = 'packed';
      }
    }

    if (hitCount > 0) {
      this.#groundNormal.copy(normalSum).normalize();
      this.#groundPoint.copy(this.#samples[2]?.point ?? this.position);
      this.surfaceKind = majoritySurface(_surfaceCounts, this.#samples[2]?.surface ?? 'packed');
    } else {
      this.#groundNormal.set(0, 1, 0);
      this.surfaceKind = 'packed';
    }

    if (this.grinding && this.surfaceKind !== 'rail') {
      this.grinding = false;
    }

  }

  #composeBoardUp(out: THREE.Vector3): THREE.Vector3 {
    this.#composeQuaternion();
    return out.set(0, 1, 0).applyQuaternion(this.#quaternion);
  }

  #composeQuaternion(): void {
    _euler.set(this.boardPitch, this.boardYaw, this.boardRoll);
    this.#quaternion.setFromEuler(_euler);
  }

  #writeBody(physics: PhysicsWorld): void {
    if (!this.#body) return;
    physics.setNextKinematicTransform(this.#body, this.position, this.#quaternion);
  }
}

function forwardFromYaw(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}

function projectOnPlane(v: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  return v.addScaledVector(normal, -v.dot(normal));
}

function horizontalSpeed(v: THREE.Vector3): number {
  return Math.hypot(v.x, v.z);
}

function clampHorizontalSpeed(v: THREE.Vector3, max: number): void {
  const h = horizontalSpeed(v);
  if (h <= max || h < 1e-5) return;
  const scale = max / h;
  v.x *= scale;
  v.z *= scale;
}

function approach(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(target, current + delta);
  return Math.max(target, current - delta);
}

function approachAngle(current: number, target: number, delta: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= TWO_PI;
  while (diff < -Math.PI) diff += TWO_PI;
  if (Math.abs(diff) <= delta) return target;
  return current + Math.sign(diff) * delta;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const TWO_PI = Math.PI * 2;

function computeSprayIntensity(speed: number, edgeAngle: number, surfaceSpray: number): number {
  if (speed < CARVE.sprayMinSpeed) return 0;
  const edge = clamp(Math.abs(edgeAngle) / CARVE.sprayEdgeThreshold, 0, 1);
  const speedFactor = clamp((speed - CARVE.sprayMinSpeed) / (SPEED.max - CARVE.sprayMinSpeed), 0, 1);
  return edge * speedFactor * surfaceSpray;
}

function majoritySurface(counts: Record<SurfaceKind, number>, fallback: SurfaceKind): SurfaceKind {
  let best = fallback;
  let bestCount = 0;
  for (let i = 0; i < SURFACE_KINDS.length; i++) {
    const kind = SURFACE_KINDS[i]!;
    const count = counts[kind];
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  return best;
}
