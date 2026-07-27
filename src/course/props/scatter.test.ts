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
    const banners = props.filter((p) => p.kind === 'banner');
    const fences = props.filter((p) => p.kind === 'fence');
    assert.ok(banners.length >= 16);
    assert.ok(fences.length >= 32);
    assert.ok(props.some((p) => p.kind === 'checkpoint_gate'));
  });

  it('keeps timberline corridor clear while packing dense flanks', () => {
    const path = new SplinePath(TIMBERLINE.controlPoints);
    const maxTrees = presetBudgets('high').maxTreeInstances;
    const props = expandCourseProps(TIMBERLINE, path, { maxTreeInstances: maxTrees });
    const trees = props.filter((p) => p.kind === 'tree');
    assert.equal(trees.length, maxTrees);
    const raceHalf = TIMBERLINE.terrain.width * 0.5;
    const pos = new THREE.Vector3();
    const belt = trees.filter((t) => t.id.startsWith('belt-tree-'));
    assert.ok(belt.length >= 200);
    let minDist = Infinity;
    let maxDist = 0;
    let nearGallery = 0;
    for (const tree of belt) {
      pos.set(...tree.position);
      const closest = path.closestPoint(pos);
      minDist = Math.min(minDist, closest.distance);
      maxDist = Math.max(maxDist, closest.distance);
      if (closest.t <= 0.62) nearGallery += 1;
    }
    // Flank plant — stay outside race strip (curvature can shave a few metres).
    assert.ok(minDist >= raceHalf * 0.85);
    // Tight apron wall — not sprayed across the full powder apron.
    assert.ok(maxDist <= raceHalf + 42);
    // Front-weighted belt for forest / start chase frames.
    assert.ok(nearGallery >= belt.length * 0.7);
    assert.ok(props.filter((p) => p.kind === 'banner').length >= 18);
    assert.ok(props.filter((p) => p.kind === 'fence').length >= 36);
  });
});
