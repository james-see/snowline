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
    assert.ok(banners.length >= 28);
    assert.ok(fences.length >= 48);
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
    const park = [...rails, ...ramps, ...boxes];
    const early = park.filter((p) => (p.pathT ?? 1) <= 0.2);
    assert.ok(
      early.length >= 4,
      `expected early–mid terrace park in grind/carve frustum, got ${early.length}`
    );
    assert.ok(
      early.some((p) => p.kind === 'rail') &&
        early.some((p) => p.kind === 'box') &&
        early.some((p) => p.kind === 'ramp'),
      'early park must include rail + box + kicker'
    );
    const pos = new THREE.Vector3();
    for (const feature of park) {
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
    assert.ok(belt.length >= 800);
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
      if (closest.t <= 0.28) {
        nearGallery += 1;
        denseWorld.push({ x: tree.position[0], z: tree.position[2] });
      }
      if (closest.distance <= raceHalf + 22) midfieldBelt += 1;
      const s = typeof tree.scale === 'number' ? tree.scale : 1;
      scales += 1;
      scaleMin = Math.min(scaleMin, s);
      scaleMax = Math.max(scaleMax, s);
    }
    // Flank plant — stay outside race strip (curvature can shave a few metres).
    assert.ok(minDist >= raceHalf * 0.85);
    // Shallow multi-row lip wall — not amphitheater skyline loners.
    assert.ok(maxDist <= raceHalf + 26);
    // Front-weighted solid gallery for forest / carve chase frames (first ~40%).
    assert.ok(nearGallery >= belt.length * 0.9);
    // Belt fills midfield depth (rows), not a single lip.
    assert.ok(midfieldBelt >= belt.length * 0.9);
    // Overlapping Kenney scales → continuous canopy wall.
    assert.ok(scales > 0 && scaleMax >= 3.2 && scaleMax - scaleMin >= 1.2);
    // Nearest-neighbour pitch in dense gallery: solid wall, not spaced cones.
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
    assert.ok(nnN > 80);
    assert.ok(sumNN / nnN <= 3.8, `avg NN ${sumNN / nnN} — expect solid canopy wall`);
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
      if (closest.distance <= raceHalf + 20) nearBelt += 1;
      if (closest.t <= 0.28) {
        front += 1;
        denseWorld.push({ x: tree.position[0], z: tree.position[2] });
      }
      const s = typeof tree.scale === 'number' ? tree.scale : 1;
      scaleMax = Math.max(scaleMax, s);
    }
    assert.ok(nearBelt >= belt.length * 0.9);
    assert.ok(front >= belt.length * 0.9);
    assert.ok(scaleMax >= 3.2);
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
    assert.ok(nnN > 80);
    assert.ok(sumNN / nnN <= 4.2, `alpine avg NN ${sumNN / nnN}`);
    assert.ok(props.filter((p) => p.kind === 'banner').length >= 28);
  });

  it('fills forward chase frustum with mid-corridor props (no CAM_CROSS)', () => {
    const path = new SplinePath(ALPINE_FLOW.controlPoints);
    const maxTrees = presetBudgets('high').maxTreeInstances;
    const props = expandCourseProps(ALPINE_FLOW, path, { maxTreeInstances: maxTrees });
    const raceHalf = ALPINE_FLOW.terrain.width * 0.5;
    const pos = new THREE.Vector3();

    const inset = props.filter((p) => p.kind === 'tree' && p.id.startsWith('inset-tree-'));
    assert.ok(inset.length >= 180, `expected dense inset frustum trees, got ${inset.length}`);

    let insetInStrip = 0;
    let insetFront = 0;
    let insetNearFov = 0;
    for (const tree of inset) {
      pos.set(...tree.position);
      const closest = path.closestPoint(pos);
      // Inside FOV cone at chase look-ahead; clear of dead-center fall line.
      assert.ok(closest.distance >= raceHalf * 0.08);
      assert.ok(closest.distance <= raceHalf * 0.6);
      if (closest.distance <= raceHalf * 0.55) insetInStrip += 1;
      if (closest.t <= 0.42) insetFront += 1;
      // Near FOV half-width at ~40 m (~0.42 raceHalf on alpine).
      if (closest.t <= 0.06 && closest.distance <= raceHalf * 0.45) insetNearFov += 1;
    }
    assert.ok(insetInStrip >= inset.length * 0.9);
    assert.ok(insetFront >= inset.length * 0.85);
    assert.ok(
      insetNearFov >= 40,
      `expected near look-ahead inset mass in FOV cone, got ${insetNearFov}`
    );

    const rocks = props.filter((p) => p.kind === 'rock' && p.id.startsWith('frustum-rock-'));
    assert.ok(rocks.length >= 40, `expected forward-frustum rocks, got ${rocks.length}`);
    let rockFrontMid = 0;
    for (const rock of rocks) {
      pos.set(...rock.position);
      const closest = path.closestPoint(pos);
      if (closest.t <= 0.4 && closest.distance <= raceHalf * 0.45) rockFrontMid += 1;
    }
    assert.ok(
      rockFrontMid >= rocks.length * 0.7,
      `expected front mid-corridor rocks in look-ahead, got ${rockFrontMid}/${rocks.length}`
    );

    const midBanners = props.filter((p) => p.id.startsWith('frustum-banner-'));
    assert.ok(midBanners.length >= 28);
    const midFences = props.filter((p) => p.id.startsWith('frustum-fence-'));
    assert.ok(midFences.length >= 36);
    // Fall-line lane stays open for playability.
    for (const p of [...inset, ...rocks, ...midBanners, ...midFences]) {
      pos.set(...p.position);
      const closest = path.closestPoint(pos);
      assert.ok(closest.distance >= raceHalf * 0.08, `${p.id} too close to centerline`);
    }
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
