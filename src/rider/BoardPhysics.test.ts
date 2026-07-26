import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BoardPhysics } from './BoardPhysics.ts';
import { SPEED } from './tuning.ts';

describe('BoardPhysics', () => {
  it('resets to spawn pose', () => {
    const board = new BoardPhysics();
    const spawn = { position: new THREE.Vector3(1, 2, 3), yaw: Math.PI / 2 };
    board.reset(spawn);
    assert.equal(board.position.x, 1);
    assert.equal(board.position.y, 2);
    assert.equal(board.position.z, 3);
    assert.equal(board.boardYaw, Math.PI / 2);
    assert.equal(board.crashed, false);
    assert.ok(board.boostMeter > 0);
  });

  it('exposes speed limits from tuning', () => {
    assert.ok(SPEED.max > SPEED.minSteer);
    assert.ok(SPEED.boostMax > SPEED.max);
  });
});
