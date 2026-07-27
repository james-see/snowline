import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { PropPlacement } from '@/types/course.ts';
import type { SurfaceKind } from '@/types/gameplay.ts';
import type {
  KinematicBodyDesc,
  PhysicsWorld,
  RaycastHit,
  RaycastOptions,
  RigidBodyHandle,
  ShapeCastHit,
  ShapeCastOptions,
} from '@/types/physics.ts';
import { registerPropsPhysics, tagPropRoot } from './physics.ts';

interface BoxCall {
  surface: SurfaceKind;
  actorId: string;
  half: { x: number; y: number; z: number };
}

interface CapsuleCall {
  surface: SurfaceKind;
  actorId: string;
  radius: number;
}

function recordingPhysics(): PhysicsWorld & { boxes: BoxCall[]; capsules: CapsuleCall[] } {
  const handle: RigidBodyHandle = { id: 1, remove() {} };
  const boxes: BoxCall[] = [];
  const capsules: CapsuleCall[] = [];
  return {
    boxes,
    capsules,
    ready: true,
    async init() {},
    beginTick() {},
    step() {},
    raycast(_options: RaycastOptions): RaycastHit | null {
      return null;
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
    createStaticBox(half, _p, _r, surface, actorId = 'prop') {
      boxes.push({
        surface,
        actorId,
        half: { x: half.x, y: half.y, z: half.z },
      });
      return handle;
    },
    createStaticCapsule(_hh, radius, _p, _r, surface, actorId = 'rail') {
      capsules.push({ surface, actorId, radius });
      return handle;
    },
    setNextKinematicTransform() {},
    removeBody() {},
    clearWorld() {},
    dispose() {},
  };
}

function placeRoot(placement: PropPlacement): THREE.Group {
  const root = new THREE.Group();
  const obj = new THREE.Group();
  obj.position.set(...placement.position);
  tagPropRoot(obj, placement);
  root.add(obj);
  return root;
}

describe('registerPropsPhysics', () => {
  it('registers ramps as packed rideable decks (never wood/rail grind)', () => {
    const physics = recordingPhysics();
    const placement: PropPlacement = {
      id: 'ramp-test',
      kind: 'ramp',
      position: [0, 0, 0],
      lip: 2.4,
      // Mis-tag that must be ignored — ramps launch, they do not grind.
      surface: 'wood',
      grindable: true,
    };
    registerPropsPhysics(physics, [placement], placeRoot(placement));

    assert.equal(physics.boxes.length, 1);
    assert.equal(physics.boxes[0]!.surface, 'packed');
    assert.equal(physics.boxes[0]!.actorId, 'ramp-test');
    assert.equal(physics.capsules.length, 0);
  });

  it('keeps box decks wood and adds thin rail capsules when grindable', () => {
    const physics = recordingPhysics();
    const placement: PropPlacement = {
      id: 'box-test',
      kind: 'box',
      position: [0, 0, 0],
      length: 10,
      grindable: true,
      surface: 'wood',
    };
    registerPropsPhysics(physics, [placement], placeRoot(placement));

    assert.equal(physics.boxes.length, 1);
    assert.equal(physics.boxes[0]!.surface, 'wood');
    assert.equal(physics.capsules.length, 2);
    for (const cap of physics.capsules) {
      assert.equal(cap.surface, 'rail');
      assert.ok(cap.radius <= 0.1);
      assert.ok(cap.actorId.startsWith('box-test-rail-'));
    }
  });

  it('does not add rail capsules on non-grindable boxes', () => {
    const physics = recordingPhysics();
    const placement: PropPlacement = {
      id: 'box-ride',
      kind: 'box',
      position: [0, 0, 0],
      length: 8,
      surface: 'wood',
    };
    registerPropsPhysics(physics, [placement], placeRoot(placement));

    assert.equal(physics.boxes.length, 1);
    assert.equal(physics.boxes[0]!.surface, 'wood');
    assert.equal(physics.capsules.length, 0);
  });

  it('registers rocks as Prop-group solid boxes (not pass-through scenery)', () => {
    const physics = recordingPhysics();
    const placement: PropPlacement = {
      id: 'frustum-rock-alpine-0',
      kind: 'rock',
      position: [4, 10, 20],
      scale: 1.4,
      variant: 2,
    };
    registerPropsPhysics(physics, [placement], placeRoot(placement));

    assert.equal(physics.boxes.length, 1);
    assert.equal(physics.boxes[0]!.surface, 'rock');
    assert.equal(physics.boxes[0]!.actorId, 'frustum-rock-alpine-0');
    assert.ok(physics.boxes[0]!.half.x > 1);
    assert.ok(physics.boxes[0]!.half.y > 0.4);
    assert.equal(physics.capsules.length, 0);
  });

  it('skips solid colliders for recovery-tagged rocks', () => {
    const physics = recordingPhysics();
    const placement: PropPlacement = {
      id: 'rock-guard-1',
      kind: 'rock',
      position: [0, 0, 0],
      scale: 1.6,
      recovery: true,
    };
    registerPropsPhysics(physics, [placement], placeRoot(placement));
    assert.equal(physics.boxes.length, 0);
  });

  it('keeps tree trunk boxes for light scrub', () => {
    const physics = recordingPhysics();
    const placement: PropPlacement = {
      id: 'belt-tree-alpine-1',
      kind: 'tree',
      position: [3, 5, 8],
      scale: 2.4,
    };
    // Trees are instanced — physics registers from placements, not scene roots.
    registerPropsPhysics(physics, [placement], new THREE.Group());
    assert.equal(physics.boxes.length, 1);
    assert.equal(physics.boxes[0]!.actorId, 'belt-tree-alpine-1');
    assert.equal(physics.boxes[0]!.surface, 'wood');
    // Scaled trunks — thin fixed boxes miss inset/lip pines.
    assert.ok(physics.boxes[0]!.half.x >= 0.9, `trunk half=${physics.boxes[0]!.half.x}`);
  });
});
