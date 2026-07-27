import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { SplinePath } from '@/course/SplinePath.ts';
import { ALPINE_FLOW, TIMBERLINE } from '@/course/CourseDefs.ts';
import { expandCourseProps, resolvePathPlacements } from '@/course/props/scatter.ts';
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
    assert.ok(banners.length >= 24);
    assert.ok(fences.length >= 40);
    assert.ok(props.some((p) => p.kind === 'checkpoint_gate'));
  });

  it('authors alpine park features on the path (rails, ramps, boxes)', () => {
    const path = new SplinePath(ALPINE_FLOW.controlPoints);
    const props = expandCourseProps(ALPINE_FLOW, path, {
      maxTreeInstances: presetBudgets('high').maxTreeInstances,
      furniture: false,
    });
    const rails = props.filter((p) => p.kind === 'rail');
    const ramps = props.filter((p) => p.kind === 'ramp');
    const boxes = props.filter((p) => p.kind === 'box');
    assert.ok(rails.length >= 4, `expected several rails, got ${rails.length}`);
    assert.ok(ramps.length >= 4, `expected several ramps, got ${ramps.length}`);
    assert.ok(boxes.length >= 2, `expected park boxes, got ${boxes.length}`);
    const pos = new THREE.Vector3();
    for (const feature of [...rails, ...ramps, ...boxes]) {
      pos.set(...feature.position);
      const closest = path.closestPoint(pos);
      // Path-resolved park stays on/near the run — not apron void.
      assert.ok(closest.distance <= ALPINE_FLOW.terrain.width * 0.55);
    }
  });

  it('keeps timberline corridor clear while packing continuous belts', () => {
    const path = new SplinePath(TIMBERLINE.controlPoints);
    const maxTrees = presetBudgets('high').maxTreeInstances;
    const props = expandCourseProps(TIMBERLINE, path, { maxTreeInstances: maxTrees });
    const trees = props.filter((p) => p.kind === 'tree');
    assert.equal(trees.length, maxTrees);
    const raceHalf = TIMBERLINE.terrain.width * 0.5;
    const pos = new THREE.Vector3();
    const belt = trees.filter((t) => t.id.startsWith('belt-tree-'));
    assert.ok(belt.length >= 400);
    let minDist = Infinity;
    let maxDist = 0;
    let nearGallery = 0;
    let midfieldBelt = 0;
    let scales = 0;
    let scaleMin = Infinity;
    let scaleMax = 0;
    const denseWorld: { x: number; z: number }[] = [];
    for (const tree of belt) {
      pos.set(...tree.position);
      const closest = path.closestPoint(pos);
      minDist = Math.min(minDist, closest.distance);
      maxDist = Math.max(maxDist, closest.distance);
      if (closest.t <= 0.4) {
        nearGallery += 1;
        denseWorld.push({ x: tree.position[0], z: tree.position[2] });
      }
      if (closest.distance <= raceHalf + 26) midfieldBelt += 1;
      const s = typeof tree.scale === 'number' ? tree.scale : 1;
      scales += 1;
      scaleMin = Math.min(scaleMin, s);
      scaleMax = Math.max(scaleMax, s);
    }
    // Flank plant — stay outside race strip (curvature can shave a few metres).
    assert.ok(minDist >= raceHalf * 0.85);
    // Multi-row midfield belt — not amphitheater skyline loners.
    assert.ok(maxDist <= raceHalf + 36);
    // Front-weighted continuous gallery for forest / carve chase frames.
    assert.ok(nearGallery >= belt.length * 0.88);
    // Belt fills midfield depth (rows), not a single lip.
    assert.ok(midfieldBelt >= belt.length * 0.85);
    // Large near canopies + understory variety → overlap read.
    assert.ok(scales > 0 && scaleMax >= 2.0 && scaleMax - scaleMin >= 0.9);
    // Nearest-neighbour pitch in dense gallery: continuous, not spaced cones.
    let sumNN = 0;
    let nnN = 0;
    for (let i = 0; i < denseWorld.length; i++) {
      let best = Infinity;
      const a = denseWorld[i]!;
      for (let j = 0; j < denseWorld.length; j++) {
        if (i === j) continue;
        const b = denseWorld[j]!;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < best) best = d;
      }
      if (Number.isFinite(best)) {
        sumNN += best;
        nnN += 1;
      }
    }
    assert.ok(nnN > 40);
    assert.ok(sumNN / nnN <= 6.5, `avg NN ${sumNN / nnN} — expect continuous canopy`);
    assert.ok(props.filter((p) => p.kind === 'banner').length >= 28);
    assert.ok(props.filter((p) => p.kind === 'fence').length >= 44);
    assert.ok(props.filter((p) => p.kind === 'rail').length >= 2);
    assert.ok(props.some((p) => p.kind === 'ramp'));
    assert.ok(props.some((p) => p.kind === 'box'));
  });

  it('packs alpine continuous belts into chase midfield', () => {
    const path = new SplinePath(ALPINE_FLOW.controlPoints);
    const maxTrees = presetBudgets('high').maxTreeInstances;
    const props = expandCourseProps(ALPINE_FLOW, path, { maxTreeInstances: maxTrees });
    const raceHalf = ALPINE_FLOW.terrain.width * 0.5;
    const pos = new THREE.Vector3();
    const belt = props.filter((p) => p.kind === 'tree' && p.id.startsWith('belt-tree-'));
    let nearBelt = 0;
    let front = 0;
    const denseWorld: { x: number; z: number }[] = [];
    let scaleMax = 0;
    for (const tree of belt) {
      pos.set(...tree.position);
      const closest = path.closestPoint(pos);
      if (closest.distance <= raceHalf + 28) nearBelt += 1;
      if (closest.t <= 0.4) {
        front += 1;
        denseWorld.push({ x: tree.position[0], z: tree.position[2] });
      }
      const s = typeof tree.scale === 'number' ? tree.scale : 1;
      scaleMax = Math.max(scaleMax, s);
    }
    assert.ok(nearBelt >= belt.length * 0.8);
    assert.ok(front >= belt.length * 0.88);
    assert.ok(scaleMax >= 2.0);
    let sumNN = 0;
    let nnN = 0;
    for (let i = 0; i < denseWorld.length; i++) {
      let best = Infinity;
      const a = denseWorld[i]!;
      for (let j = 0; j < denseWorld.length; j++) {
        if (i === j) continue;
        const b = denseWorld[j]!;
        best = Math.min(best, Math.hypot(a.x - b.x, a.z - b.z));
      }
      if (Number.isFinite(best)) {
        sumNN += best;
        nnN += 1;
      }
    }
    assert.ok(nnN > 40);
    assert.ok(sumNN / nnN <= 7.5, `alpine avg NN ${sumNN / nnN}`);
    assert.ok(props.filter((p) => p.kind === 'banner').length >= 24);
  });
});

describe('resolvePathPlacements', () => {
  it('maps pathT/lateral onto spline world XZ', () => {
    const path = new SplinePath(ALPINE_FLOW.controlPoints);
    const [resolved] = resolvePathPlacements(
      [
        {
          id: 'rail-test',
          kind: 'rail',
          position: [0, 0, 0],
          pathT: 0.5,
          lateral: 30,
          length: 12,
          grindable: true,
        },
      ],
      path
    );
    assert.ok(resolved);
    const pos = new THREE.Vector3(...resolved!.position);
    const closest = path.closestPoint(pos);
    assert.ok(Math.abs(closest.t - 0.5) < 0.06);
    assert.ok(Math.abs(closest.distance - 30) < 1.5);
  });
});
