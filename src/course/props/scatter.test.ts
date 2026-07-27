import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { SplinePath } from '@/course/SplinePath.ts';
import { ALPINE_FLOW, TIMBERLINE } from '@/course/CourseDefs.ts';
import { expandCourseProps } from '@/course/props/scatter.ts';
import { presetBudgets } from '@/engine/Lod.ts';

describe('expandCourseProps', () => {
  it('fills alpine apron belts up to high Lod tree budget', () => {
    const path = new SplinePath(ALPINE_FLOW.controlPoints);
    const maxTrees = presetBudgets('high').maxTreeInstances;
    const props = expandCourseProps(ALPINE_FLOW, path, { maxTreeInstances: maxTrees });
    const trees = props.filter((p) => p.kind === 'tree');
    assert.equal(trees.length, maxTrees);
    assert.ok(props.some((p) => p.kind === 'banner'));
    assert.ok(props.some((p) => p.kind === 'fence'));
    assert.ok(props.some((p) => p.kind === 'checkpoint_gate'));
  });

  it('keeps timberline corridor clear while packing flanks', () => {
    const path = new SplinePath(TIMBERLINE.controlPoints);
    const maxTrees = presetBudgets('high').maxTreeInstances;
    const props = expandCourseProps(TIMBERLINE, path, { maxTreeInstances: maxTrees });
    const trees = props.filter((p) => p.kind === 'tree');
    assert.equal(trees.length, maxTrees);
    const raceHalf = TIMBERLINE.terrain.width * 0.5;
    const pos = new THREE.Vector3();
    const belt = trees.filter((t) => t.id.startsWith('belt-tree-'));
    assert.ok(belt.length >= 40);
    let minAbsLat = Infinity;
    for (const tree of belt) {
      pos.set(...tree.position);
      const closest = path.closestPoint(pos);
      minAbsLat = Math.min(minAbsLat, Math.abs(closest.lateral));
    }
    // Flank plant — stay outside race strip (curvature can shave a few metres).
    assert.ok(minAbsLat >= raceHalf * 0.85);
  });
});
