import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RapierPhysics } from './Physics.ts';
import { CollisionGroup } from '@/types/physics.ts';
import { registerPropsPhysics, tagPropRoot } from '@/course/props/physics.ts';
import { BoardPhysics } from '@/rider/BoardPhysics.ts';
import { HAZARD, JUMP } from '@/rider/tuning.ts';
import type { PropPlacement } from '@/types/course.ts';
import type { RiderInput } from '@/types/input.ts';

const idleInput = (): RiderInput => ({
  steer: 0,
  lean: 0,
  accelerate: false,
  brake: false,
  boost: false,
  jump: false,
  jumpPressed: false,
  spinLeft: false,
  spinRight: false,
  flipFront: false,
  flipBack: false,
  grind: false,
});

describe('RapierPhysics sensors', () => {
  const physics = new RapierPhysics();

  before(async () => {
    await physics.init(new THREE.Vector3(0, -9.81, 0));
  });

  after(() => {
    physics.dispose();
  });

  it('solid raycasts ignore checkpoint sensors even when started inside', () => {
    // Flat Terrain-group trimesh (y=0). Static boxes default to Prop membership.
    const verts = new Float32Array([-20, 0, -20, 20, 0, -20, 20, 0, 20, -20, 0, 20]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    physics.createTrimesh(verts, indices, new THREE.Vector3(0, 0, 0), 'packed', 'terrain');

    // Gate-like sensor covering the ride corridor (board origin inside).
    physics.createStaticBox(
      new THREE.Vector3(6.3, 3.5, 2.2),
      new THREE.Vector3(0, 1.225, 0),
      new THREE.Quaternion(),
      'packed',
      'gate-cp1',
      true
    );

    // Broadphase needs a step before casts see new colliders (Rapier 0.19).
    for (let i = 0; i < 2; i++) {
      physics.beginTick();
      physics.step(1 / 60);
    }

    const hit = physics.raycast({
      origin: new THREE.Vector3(0, 0.4, 0),
      direction: new THREE.Vector3(0, -1, 0),
      maxDistance: 3.2,
      // Include Trigger on purpose — EXCLUDE_SENSORS must still skip the gate.
      groups: CollisionGroup.Terrain | CollisionGroup.Trigger | CollisionGroup.Rail,
      solid: true,
    });

    assert.ok(hit, 'expected terrain hit');
    assert.equal(hit.actorId, 'terrain');
    assert.ok(hit.distance > 0.3 && hit.distance < 0.5, `distance=${hit.distance}`);
  });

  it('shapeCast hits Prop rock boxes and ignores sensors', () => {
    physics.createStaticBox(
      new THREE.Vector3(1.2, 0.8, 1.1),
      new THREE.Vector3(3, 0.8, 0),
      new THREE.Quaternion(),
      'rock',
      'frustum-rock-test'
    );
    physics.createStaticBox(
      new THREE.Vector3(6, 3.5, 0.8),
      new THREE.Vector3(1.5, 1.2, 0),
      new THREE.Quaternion(),
      'packed',
      'finish',
      true
    );

    for (let i = 0; i < 2; i++) {
      physics.beginTick();
      physics.step(1 / 60);
    }

    const hit = physics.shapeCast({
      origin: new THREE.Vector3(0, 0.6, 0),
      direction: new THREE.Vector3(1, 0, 0),
      maxDistance: 6,
      radius: 0.4,
      groups: CollisionGroup.Prop,
    });

    assert.ok(hit, 'expected rock hit');
    assert.equal(hit.actorId, 'frustum-rock-test');
    assert.equal(hit.surface, 'rock');
    assert.ok(hit.distance > 0.5 && hit.distance < 3.5, `distance=${hit.distance}`);
    assert.ok(hit.normal.x < -0.5, 'normal should face the cast');
  });
});

describe('prop hazard integration', () => {
  const physics = new RapierPhysics();

  before(async () => {
    await physics.init(new THREE.Vector3(0, -28, 0));
  });

  after(() => {
    physics.dispose();
  });

  it('registerPropsPhysics rock shapeCast hits and BoardPhysics scrubs', () => {
    physics.clearWorld();

    const verts = new Float32Array([-40, 0, -40, 40, 0, -40, 40, 0, 40, -40, 0, 40]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    physics.createTrimesh(verts, indices, new THREE.Vector3(0, 0, 0), 'packed', 'terrain');

    const placement: PropPlacement = {
      id: 'frustum-rock-alpine-0',
      kind: 'rock',
      position: [0, 0, 4],
      scale: 1.5,
      variant: 1,
    };
    const root = new THREE.Group();
    const obj = new THREE.Group();
    obj.position.set(...placement.position);
    tagPropRoot(obj, placement);
    root.add(obj);
    registerPropsPhysics(physics, [placement], root);

    // Finish sensor in the sweep path — must not steal the cast or relaunch.
    physics.createStaticBox(
      new THREE.Vector3(6, 3.5, 0.8),
      new THREE.Vector3(0, 1.2, 2),
      new THREE.Quaternion(),
      'packed',
      'finish',
      true
    );

    for (let i = 0; i < 3; i++) {
      physics.beginTick();
      physics.step(1 / 60);
    }

    const cast = physics.shapeCast({
      origin: new THREE.Vector3(0, HAZARD.castLift, 0),
      direction: new THREE.Vector3(0, 0, 1),
      maxDistance: 6,
      radius: HAZARD.radius,
      groups: CollisionGroup.Prop,
      exclude: ['rider'],
    });
    assert.ok(cast, 'expected registered rock hit');
    assert.equal(cast.actorId, 'frustum-rock-alpine-0');
    assert.equal(cast.surface, 'rock');
    assert.ok(cast.normal.y < HAZARD.rideableNormalY, 'side hit, not rideable top');

    const board = new BoardPhysics();
    board.attachBody(physics);
    board.reset({ position: new THREE.Vector3(0, JUMP.rideHeight, 0), yaw: 0 });
    board.velocity.set(0, 0, 18);

    let scrubbed = false;
    let stunned = false;
    for (let i = 0; i < 90; i++) {
      physics.beginTick();
      physics.step(1 / 60);
      const before = board.velocity.length();
      const frame = board.fixedUpdate(1 / 60, idleInput(), physics);
      if (frame.crashReason === 'obstacle') stunned = true;
      if (board.velocity.length() < before * 0.75) {
        scrubbed = true;
        break;
      }
    }
    assert.ok(scrubbed, 'BoardPhysics must scrub speed on rock contact');
    assert.ok(stunned, 'hard rock slap should stun at speed');
  });
});
