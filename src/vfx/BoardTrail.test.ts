import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { BoardTrail } from '@/vfx/BoardTrail.ts';

describe('BoardTrail', () => {
  it('builds a ribbon mesh (not a Line) while carving', () => {
    const trail = new BoardTrail();
    assert.ok(trail.object instanceof THREE.Mesh);
    const pos = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 8; i++) {
      pos.z -= 0.4;
      trail.push(pos, 0, 0.4, true, 18);
    }
    const range = trail.object.geometry.drawRange;
    assert.ok(range.count > 0, 'expected triangle indices after samples');
    trail.clear();
    assert.equal(trail.object.geometry.drawRange.count, 0);
    trail.dispose();
  });

  it('fades when airborne / slow', () => {
    const trail = new BoardTrail();
    const pos = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 6; i++) {
      pos.z -= 0.3;
      trail.push(pos, 0, 0.2, true, 20);
    }
    assert.ok(trail.object.geometry.drawRange.count > 0);
    for (let i = 0; i < 20; i++) trail.push(pos, 0, 0, false, 20);
    assert.equal(trail.object.geometry.drawRange.count, 0);
    trail.dispose();
  });
});
