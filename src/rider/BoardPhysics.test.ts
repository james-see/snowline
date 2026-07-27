import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { SurfaceKind } from '@/types/gameplay.ts';
import type { RiderInput } from '@/types/input.ts';
import type {
  KinematicBodyDesc,
  PhysicsWorld,
  RaycastHit,
  RaycastOptions,
  RigidBodyHandle,
  ShapeCastHit,
  ShapeCastOptions,
} from '@/types/physics.ts';
import { CollisionGroup } from '@/types/physics.ts';
import { BoardPhysics } from './BoardPhysics.ts';
import { BOOST, CRASH, HAZARD, JUMP, LANDING, SPEED, VOID } from './tuning.ts';

function idleInput(overrides: Partial<RiderInput> = {}): RiderInput {
  return {
    steer: 0,
    lean: 0,
    jump: false,
    jumpPressed: false,
    brake: false,
    boost: false,
    spinLeft: false,
    spinRight: false,
    flipFront: false,
    flipBack: false,
    grabIndy: false,
    grabMute: false,
    grabMelon: false,
    grabMethod: false,
    ...overrides,
  };
}

/** Flat ground at `groundY` — models trimesh contact under a spawn pose. */
function flatGroundPhysics(groundY = 0, surface: SurfaceKind = 'packed'): PhysicsWorld {
  const handle: RigidBodyHandle = { id: 1, remove() {} };
  return {
    ready: true,
    async init() {},
    beginTick() {},
    step() {},
    raycast(options: RaycastOptions): RaycastHit | null {
      const distance = options.origin.y - groundY;
      if (distance < -0.05 || distance > options.maxDistance) return null;
      return {
        point: new THREE.Vector3(options.origin.x, groundY, options.origin.z),
        normal: new THREE.Vector3(0, 1, 0),
        distance: Math.max(0, distance),
        surface,
        actorId: surface === 'rail' ? 'rail' : surface === 'wood' ? 'box' : 'terrain',
        colliderId: 1,
      };
    },
    shapeCast(_options: ShapeCastOptions): ShapeCastHit | null {
      return null;
    },
    createKinematicBody(_desc: KinematicBodyDesc) {
      return handle;
    },
    createTrimesh() {
      return handle;
    },
    createHeightfield() {
      return handle;
    },
    addHeightfield() {
      return handle;
    },
    createKinematicBox() {
      return handle;
    },
    createStaticBox() {
      return handle;
    },
    createStaticCapsule() {
      return handle;
    },
    setNextKinematicTransform() {},
    removeBody() {},
    clearWorld() {},
    dispose() {},
  };
}

function surfaceGroundPhysics(surface: SurfaceKind, groundY = 0): PhysicsWorld {
  return flatGroundPhysics(groundY, surface);
}

/** Launch from a grounded spawn so `#wasAirborne` is armed. */
function enterAir(board: BoardPhysics, physics: PhysicsWorld, height = 2): void {
  board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
  board.fixedUpdate(1 / 60, idleInput(), physics);
  assert.equal(board.grounded, true);
  board.position.y = height;
  board.velocity.set(6, 2, 0);
  board.fixedUpdate(1 / 60, idleInput(), physics);
  assert.equal(board.grounded, false);
  assert.equal(board.airborne, true);
}

/** Ground plus a checkpoint sensor that returns toi=0 if Trigger is probed. */
function checkpointSensorPhysics(groundY = 0): PhysicsWorld {
  const base = flatGroundPhysics(groundY);
  return {
    ...base,
    raycast(options: RaycastOptions): RaycastHit | null {
      if (options.groups !== undefined && options.groups & CollisionGroup.Trigger) {
        return {
          point: options.origin.clone(),
          normal: new THREE.Vector3(0, 1, 0),
          distance: 0,
          surface: 'packed',
          actorId: 'gate-cp1',
          colliderId: 99,
        };
      }
      return base.raycast(options);
    },
  };
}

describe('BoardPhysics', () => {
  it('does not launch when riding through a checkpoint sensor volume', () => {
    const physics = checkpointSensorPhysics(0);
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    // Forward is +Z at yaw 0 — keep travel on the board axis.
    board.velocity.set(0, 0, 14);

    const y0 = board.position.y;
    for (let i = 0; i < 20; i++) {
      board.fixedUpdate(1 / 60, idleInput(), physics);
    }

    assert.equal(board.grounded, true);
    assert.equal(board.airborne, false);
    assert.ok(board.position.y < y0 + 0.35, `launched to y=${board.position.y}`);
    assert.ok(board.speed > 10, `speed collapsed to ${board.speed}`);
  });

  it('resets to spawn pose and clears jump buffer / crash state', () => {
    const board = new BoardPhysics();
    const physics = flatGroundPhysics(0);
    board.reset({ position: new THREE.Vector3(1, 2, 3), yaw: Math.PI / 2 });
    board.fixedUpdate(1 / 60, idleInput({ jumpPressed: true }), physics);
    assert.ok(board.jumpBufferRemaining > 0);

    board.reset({ position: new THREE.Vector3(1, 0.05, 3), yaw: Math.PI / 2 });
    assert.equal(board.position.x, 1);
    assert.equal(board.position.y, 0.05);
    assert.equal(board.position.z, 3);
    assert.equal(board.boardYaw, Math.PI / 2);
    assert.equal(board.crashed, false);
    assert.equal(board.grounded, true);
    assert.equal(board.airborne, false);
    assert.equal(board.jumpBufferRemaining, 0);
    assert.equal(board.recoveryRemaining, 0);
    assert.equal(board.boostMeter, BOOST.maxMeter);
    assert.ok(board.boostMeter > 0);
  });

  it('stays grounded when spawned on flat trimesh-like terrain', () => {
    const groundY = 0;
    const physics = flatGroundPhysics(groundY);
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });

    for (let i = 0; i < 45; i++) {
      board.fixedUpdate(1 / 60, idleInput(), physics);
    }

    assert.equal(board.grounded, true);
    assert.equal(board.airborne, false);
    assert.ok(board.position.y > groundY - 0.05);
    assert.ok(board.position.y < groundY + JUMP.groundEpsilon + JUMP.rideHeight);
  });

  it('remains grounded when center probe would miss but side probes hit', () => {
    const groundY = 0;
    const handle: RigidBodyHandle = { id: 1, remove() {} };
    let cast = 0;
    const physics: PhysicsWorld = {
      ...flatGroundPhysics(groundY),
      raycast(options: RaycastOptions): RaycastHit | null {
        cast++;
        // Drop every centerline probe (lat offset ~0) to emulate trimesh holes.
        const isCenterline = Math.abs(options.origin.x) < 1e-6;
        if (isCenterline) return null;
        const distance = options.origin.y - groundY;
        if (distance < 0 || distance > options.maxDistance) return null;
        return {
          point: new THREE.Vector3(options.origin.x, groundY, options.origin.z),
          normal: new THREE.Vector3(0, 1, 0),
          distance,
          surface: 'packed',
          actorId: 'terrain',
          colliderId: 1,
        };
      },
      createKinematicBody() {
        return handle;
      },
    };

    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.fixedUpdate(1 / 60, idleInput(), physics);
    assert.ok(cast > 5);
    assert.equal(board.grounded, true);
  });

  it('grounded A/jump leaves the snow with a readable ollie', () => {
    const physics = flatGroundPhysics(0);
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.velocity.set(0, 0, 14);
    for (let i = 0; i < 5; i++) {
      board.fixedUpdate(1 / 60, idleInput(), physics);
    }
    assert.equal(board.grounded, true);
    const y0 = board.position.y;

    const jumpFrame = board.fixedUpdate(1 / 60, idleInput({ jumpPressed: true, jump: true }), physics);
    assert.equal(jumpFrame.jumped, true);
    assert.ok(jumpFrame.jumpImpulse >= JUMP.impulse);
    assert.equal(board.grounded, false);
    assert.equal(board.airborne, true);
    assert.ok(board.velocity.y > JUMP.leaveNormalSpeed);

    let peakY = board.position.y;
    let stayedAirborne = 0;
    for (let i = 0; i < 45; i++) {
      board.fixedUpdate(1 / 60, idleInput(), physics);
      peakY = Math.max(peakY, board.position.y);
      if (board.airborne) stayedAirborne++;
    }

    assert.ok(peakY > y0 + 0.85, `ollie peak too low: ${peakY - y0}`);
    assert.ok(stayedAirborne >= 12, `air time too short: ${stayedAirborne} frames`);
    // Must be able to land again after the ollie — sticky leave must not soft-lock air.
    assert.equal(board.grounded, true);
    assert.equal(board.airborne, false);
  });

  it('buffers a jump pressed in air and fires on landing', () => {
    const physics = flatGroundPhysics(0);
    const board = new BoardPhysics();
    enterAir(board, physics, 2.5);

    // Place just above the contact band, tap jump, then land within buffer window.
    board.position.y = JUMP.rideHeight + JUMP.groundEpsilon + 0.08;
    board.velocity.set(4, -1.5, 0);
    assert.equal(board.grounded, false);
    board.fixedUpdate(1 / 60, idleInput({ jumpPressed: true }), physics);
    assert.ok(board.jumpBufferRemaining > 0);
    assert.equal(board.grounded, false);

    let sawBufferedJump = false;
    for (let i = 0; i < 20; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
      if (frame.jumped) {
        sawBufferedJump = true;
        assert.ok(frame.jumpImpulse > 0);
        break;
      }
    }
    assert.equal(sawBufferedJump, true);
  });

  it('grades perfect / good / sketchy / bail landings', () => {
    const physics = flatGroundPhysics(0);

    const landWith = (pitch: number, impactVy: number) => {
      const board = new BoardPhysics();
      enterAir(board, physics, 1.8);
      board.boardPitch = pitch;
      board.boardRoll = 0;
      board.velocity.set(8, impactVy, 0);
      board.position.y = JUMP.rideHeight + 0.04;

      let landed = null as ReturnType<BoardPhysics['fixedUpdate']>['landed'];
      for (let i = 0; i < 10; i++) {
        const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
        if (frame.landed) {
          landed = frame.landed;
          break;
        }
        // Keep driving into the surface if the first contact missed a grade.
        board.position.y = JUMP.rideHeight + 0.02;
        board.velocity.y = impactVy;
        board.boardPitch = pitch;
      }
      assert.ok(landed, 'expected a landing result');
      return landed;
    };

    const perfect = landWith(0, -3);
    assert.equal(perfect.grade, 'perfect');
    assert.ok(perfect.alignment >= LANDING.perfectAlign);

    const good = landWith(0.55, -8);
    assert.equal(good.grade, 'good');

    const sketchy = landWith(0.95, -8);
    assert.equal(sketchy.grade, 'sketchy');

    const bailAlign = landWith(1.35, -8);
    assert.equal(bailAlign.grade, 'bail');

    const upsideDown = landWith(Math.PI, -4);
    assert.equal(upsideDown.grade, 'bail');
    assert.ok(upsideDown.alignment < LANDING.uprightMin);

    const bailImpact = landWith(0, -(LANDING.hardImpact + 1));
    assert.equal(bailImpact.grade, 'bail');
  });

  it('preserves speed on clean landings after bigger air', () => {
    const physics = flatGroundPhysics(0);
    const board = new BoardPhysics();
    enterAir(board, physics, 3.5);
    board.boardPitch = 0;
    board.boardRoll = 0;
    const carry = 22;
    // Firm but under hardImpact — previously hard-braked / bailed clean air.
    board.velocity.set(carry, -16, 0);
    board.position.y = JUMP.rideHeight + 0.04;

    let landed = null as ReturnType<BoardPhysics['fixedUpdate']>['landed'];
    for (let i = 0; i < 12; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
      if (frame.landed) {
        landed = frame.landed;
        break;
      }
      board.position.y = JUMP.rideHeight + 0.02;
      board.velocity.set(carry, -16, 0);
      board.boardPitch = 0;
    }
    assert.ok(landed, 'expected a landing result');
    assert.notEqual(landed.grade, 'bail');
    assert.ok(
      landed.grade === 'perfect' || landed.grade === 'good',
      `expected clean grade, got ${landed.grade}`,
    );
    const speed = Math.hypot(board.velocity.x, board.velocity.z);
    assert.ok(speed > carry * 0.85, `speed dump too hard: ${speed} from ${carry}`);
    assert.equal(board.crashed, false);
  });

  it('allows a held flip to complete a full 360° rotation', () => {
    const physics = flatGroundPhysics(0);
    const board = new BoardPhysics();
    enterAir(board, physics, 6);
    board.velocity.set(8, 10, 0);
    board.boardPitch = 0;

    let peakPitch = 0;
    for (let i = 0; i < 90; i++) {
      board.fixedUpdate(1 / 60, idleInput({ flipFront: true }), physics);
      peakPitch = Math.max(peakPitch, Math.abs(board.boardPitch));
      if (board.grounded) break;
    }
    assert.ok(
      peakPitch >= Math.PI * 2 - 0.05,
      `flip stalled below 360°: ${(peakPitch * 180) / Math.PI}°`,
    );
  });

  it('recovers from crash after recoveryTime', () => {
    const physics = flatGroundPhysics(0);
    const board = new BoardPhysics();
    enterAir(board, physics, 1.5);
    board.position.y = JUMP.rideHeight + 0.04;
    board.velocity.set(10, -(LANDING.hardImpact + 2), 0);
    board.boardPitch = 0;

    let crashed = false;
    for (let i = 0; i < 12; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
      if (frame.crashed) {
        crashed = true;
        break;
      }
      board.position.y = JUMP.rideHeight + 0.02;
      board.velocity.y = -(LANDING.hardImpact + 2);
    }
    assert.equal(crashed, true);
    assert.equal(board.crashed, true);

    let recovered = false;
    const steps = Math.ceil(CRASH.recoveryTime / (1 / 60)) + 2;
    for (let i = 0; i < steps; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
      if (frame.recovered) {
        recovered = true;
        break;
      }
    }
    assert.equal(recovered, true);
    assert.equal(board.crashed, false);
    assert.equal(board.speed, CRASH.recoverySpeed);
  });

  it('recovers from off-mesh void freefall after freefallTime', () => {
    const ground = flatGroundPhysics(0);
    const voidWorld: PhysicsWorld = {
      ...ground,
      raycast() {
        return null;
      },
    };
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(2, JUMP.rideHeight, -1), yaw: 0.4 });
    board.fixedUpdate(1 / 60, idleInput(), ground);
    assert.equal(board.grounded, true);
    const anchored = board.position.clone();

    let voidCrash = false;
    const fallSteps = Math.ceil(VOID.freefallTime / (1 / 60)) + 8;
    for (let i = 0; i < fallSteps; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput(), voidWorld);
      if (frame.crashed && frame.crashReason === 'void') {
        voidCrash = true;
        break;
      }
    }
    assert.equal(voidCrash, true);
    assert.equal(board.crashed, true);
    assert.equal(board.voidRecovering, true);

    let recovered = false;
    const recoverSteps = Math.ceil((VOID.wallowTime + VOID.recoverStun) / (1 / 60)) + 6;
    for (let i = 0; i < recoverSteps; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput(), voidWorld);
      if (frame.recovered) {
        recovered = true;
        break;
      }
    }
    assert.equal(recovered, true);
    assert.equal(board.crashed, false);
    assert.equal(board.voidRecovering, false);
    assert.ok(board.position.distanceTo(anchored) < 0.35);
    assert.ok(Math.abs(board.boardYaw - 0.4) < 1e-3);
  });

  it('recovers when falling past the world kill plane', () => {
    const physics = flatGroundPhysics(0);
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.fixedUpdate(1 / 60, idleInput(), physics);
    assert.equal(board.grounded, true);

    board.position.y = VOID.killPlaneY - 2;
    board.velocity.set(3, -30, 0);
    const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
    assert.equal(frame.crashed, true);
    assert.equal(frame.crashReason, 'void');

    let recovered = false;
    const steps = Math.ceil((VOID.wallowTime + VOID.recoverStun) / (1 / 60)) + 6;
    for (let i = 0; i < steps; i++) {
      const next = board.fixedUpdate(1 / 60, idleInput(), physics);
      if (next.recovered) {
        recovered = true;
        break;
      }
    }
    assert.equal(recovered, true);
    assert.ok(board.position.y > VOID.killPlaneY + 10);
  });

  it('does not void-wallow while riding deep playable snow below sea level', () => {
    // Alpine/Summit beds reach Y≈−100…−380. Legacy killPlane −48 soft-locked the
    // run before the last checkpoint; on-mesh contact must stay rideable.
    const deepY = -120;
    const physics = flatGroundPhysics(deepY);
    const board = new BoardPhysics();
    board.reset({
      position: new THREE.Vector3(0, deepY + JUMP.rideHeight, 0),
      yaw: 0,
    });
    for (let i = 0; i < 45; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput({ boost: true }), physics);
      assert.equal(frame.crashReason, null, `void at step ${i} y=${board.position.y}`);
      assert.equal(board.voidRecovering, false);
      assert.equal(board.crashed, false);
      assert.ok(board.grounded, `should stay grounded on deep snow at step ${i}`);
    }
    assert.ok(board.position.y < -48, 'regression: riding below the old −48 kill plane');
  });

  it('keeps voidRecovering true through wallow and recover stun', () => {
    const ground = flatGroundPhysics(0);
    const voidWorld: PhysicsWorld = {
      ...ground,
      raycast() {
        return null;
      },
    };
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.fixedUpdate(1 / 60, idleInput(), ground);

    const fallSteps = Math.ceil(VOID.freefallTime / (1 / 60)) + 8;
    for (let i = 0; i < fallSteps; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput(), voidWorld);
      if (frame.crashReason === 'void') break;
    }
    assert.equal(board.voidRecovering, true);

    // Past wallow into stun — finish soft-complete still needs the flag.
    const pastWallow = Math.ceil(VOID.wallowTime / (1 / 60)) + 2;
    for (let i = 0; i < pastWallow; i++) board.fixedUpdate(1 / 60, idleInput(), voidWorld);
    assert.equal(board.crashed, true);
    assert.equal(board.voidRecovering, true);
  });

  it('recovers when dropped far below last grounded Y', () => {
    const physics = flatGroundPhysics(0);
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(1, JUMP.rideHeight, 2), yaw: -0.2 });
    board.fixedUpdate(1 / 60, idleInput(), physics);
    const lastY = board.position.y;

    board.position.y = lastY - VOID.maxDrop - 1.5;
    board.velocity.set(0, -12, 5);
    const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
    assert.equal(frame.crashed, true);
    assert.equal(frame.crashReason, 'void');

    const steps = Math.ceil((VOID.wallowTime + VOID.recoverStun) / (1 / 60)) + 6;
    let recovered = false;
    for (let i = 0; i < steps; i++) {
      if (board.fixedUpdate(1 / 60, idleInput(), physics).recovered) {
        recovered = true;
        break;
      }
    }
    assert.equal(recovered, true);
    assert.ok(Math.abs(board.position.y - lastY) < 0.35);
  });

  it('does not latch grind on wood decks or packed ramps', () => {
    const wood = surfaceGroundPhysics('wood');
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.velocity.set(0, 0, 14);

    let grindStarted = false;
    for (let i = 0; i < 30; i++) {
      const frame = board.fixedUpdate(1 / 60, idleInput(), wood);
      if (frame.grindStarted) grindStarted = true;
    }
    assert.equal(grindStarted, false);
    assert.equal(board.grinding, false);
    assert.equal(board.surfaceKind, 'wood');
    assert.equal(board.grounded, true);
  });

  it('latches grind on thin rail colliders', () => {
    const rail = surfaceGroundPhysics('rail');
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.velocity.set(0, 0, 14);

    // Latch is immediate; stickDown sinks the kinematic board on a flat mock,
    // so only assert the start edge (not multi-frame hold on a fake infinite plane).
    const frame = board.fixedUpdate(1 / 60, idleInput(), rail);
    assert.equal(frame.grindStarted, true);
    assert.equal(board.grinding, true);
    assert.equal(board.surfaceKind, 'rail');
  });

  it('scrubs speed on a rock side-hit without soft-locking', () => {
    const ground = flatGroundPhysics(0);
    const physics: PhysicsWorld = {
      ...ground,
      shapeCast(options: ShapeCastOptions): ShapeCastHit | null {
        if (!(options.groups === undefined || options.groups & CollisionGroup.Prop)) return null;
        return {
          point: options.origin.clone().addScaledVector(options.direction, 0.2),
          normal: new THREE.Vector3(-1, 0.1, 0).normalize(),
          distance: 0.2,
          surface: 'rock',
          actorId: 'frustum-rock-alpine-0',
          colliderId: 7,
        };
      },
    };
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    // Below rockStunSpeed so we only scrub (no stun soft-lock).
    board.velocity.set(HAZARD.rockStunSpeed - 3, 0, 2);
    const before = board.velocity.length();
    const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
    assert.ok(board.velocity.length() < before * 0.75, 'expected rock scrub');
    assert.ok(board.position.x < 0.3, 'should not tunnel through the rock');
    assert.equal(frame.crashed, false);
  });

  it('stuns on a hard rock slap and dings via obstacle crash', () => {
    const ground = flatGroundPhysics(0);
    const physics: PhysicsWorld = {
      ...ground,
      shapeCast(_options: ShapeCastOptions): ShapeCastHit | null {
        return {
          point: new THREE.Vector3(0.2, HAZARD.castLift, 0),
          normal: new THREE.Vector3(-1, 0.05, 0).normalize(),
          distance: 0.15,
          surface: 'rock',
          actorId: 'rock-1',
          colliderId: 8,
        };
      },
    };
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.velocity.set(HAZARD.rockStunSpeed + 6, 0, 0);
    const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
    assert.equal(frame.crashed, true);
    assert.equal(frame.crashReason, 'obstacle');
  });

  it('light-scrubs trees without a stun crash', () => {
    const ground = flatGroundPhysics(0);
    const physics: PhysicsWorld = {
      ...ground,
      shapeCast(_options: ShapeCastOptions): ShapeCastHit | null {
        return {
          point: new THREE.Vector3(0.2, HAZARD.castLift, 0),
          normal: new THREE.Vector3(-1, 0.05, 0).normalize(),
          distance: 0.15,
          surface: 'wood',
          actorId: 'belt-tree-alpine-3',
          colliderId: 9,
        };
      },
    };
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.velocity.set(22, 0, 2);
    const before = board.velocity.length();
    const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
    assert.ok(board.velocity.length() < before, 'expected tree scrub');
    assert.equal(frame.crashed, false, 'trees must not stun / soft-lock');
  });

  it('ignores rideable prop tops during obstacle sweeps', () => {
    const ground = flatGroundPhysics(0);
    const physics: PhysicsWorld = {
      ...ground,
      shapeCast(_options: ShapeCastOptions): ShapeCastHit | null {
        return {
          point: new THREE.Vector3(0, 0.2, 0.2),
          normal: new THREE.Vector3(0, 1, 0),
          distance: 0.1,
          surface: 'wood',
          actorId: 'box-ride',
          colliderId: 10,
        };
      },
    };
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.velocity.set(0, 0, 16);
    const before = board.velocity.length();
    const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
    assert.ok(Math.abs(board.velocity.length() - before) < 1.5);
    assert.equal(frame.crashed, false);
  });

  it('exposes speed limits from tuning', () => {
    assert.ok(SPEED.max > SPEED.minSteer);
    assert.ok(SPEED.boostMax > SPEED.max);
  });

  it('carves and brakes change yaw / bleed speed', () => {
    const physics = flatGroundPhysics(0);
    const board = new BoardPhysics();
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.velocity.set(0, 0, 20);

    const yaw0 = board.boardYaw;
    for (let i = 0; i < 30; i++) {
      board.fixedUpdate(1 / 60, idleInput({ steer: 1, lean: 1 }), physics);
    }
    assert.ok(board.boardYaw > yaw0);
    assert.ok(Math.abs(board.edgeAngle) > 0.2);

    const speedBeforeBrake = board.speed;
    for (let i = 0; i < 20; i++) {
      board.fixedUpdate(1 / 60, idleInput({ brake: true }), physics);
    }
    assert.ok(board.speed < speedBeforeBrake);
  });
});
