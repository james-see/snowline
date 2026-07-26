import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { RiderInput } from '@/types/input.ts';
import type {
  KinematicBodyDesc,
  PhysicsWorld,
  RaycastHit,
  RaycastOptions,
  RigidBodyHandle,
} from '@/types/physics.ts';
import { BoardPhysics } from './BoardPhysics.ts';
import { BOOST, CRASH, JUMP, LANDING, SPEED } from './tuning.ts';

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
function flatGroundPhysics(groundY = 0): PhysicsWorld {
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
        surface: 'packed',
        actorId: 'terrain',
        colliderId: 1,
      };
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

describe('BoardPhysics', () => {
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

    const bailImpact = landWith(0, -(LANDING.hardImpact + 1));
    assert.equal(bailImpact.grade, 'bail');
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
