import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RapierPhysics } from './Physics.ts';
import { CollisionGroup } from '@/types/physics.ts';

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
