import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { SplinePath } from '@/course/SplinePath.ts';
import { pathCenterPose, RESET_HOVER } from '@/course/CourseModule.ts';
import type { TerrainBuildResult } from '@/types/course.ts';

function stubTerrain(nrows: number, ncols: number, yAt: (r: number, c: number) => number): TerrainBuildResult {
  const positions = new Float32Array(nrows * ncols * 3);
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const i = (r * ncols + c) * 3;
      const u = c / (ncols - 1);
      const t = r / (nrows - 1);
      positions[i] = (u - 0.5) * 40;
      positions[i + 1] = yAt(r, c);
      positions[i + 2] = -t * 200;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(geo);
  return {
    mesh,
    meshWidth: 40,
    apronT: 0,
    heightfield: { nrows, ncols, heights: new Float32Array(nrows * ncols) },
    backdrop: new THREE.Group(),
  } as unknown as TerrainBuildResult;
}

describe('pathCenterPose', () => {
  it('places rider on centerline with safe hover and downhill yaw', () => {
    const path = new SplinePath([
      [0, 100, 0],
      [0, 80, -100],
      [0, 60, -200],
    ]);
    const terrain = stubTerrain(17, 9, (r) => 100 - r * 2.5);
    const pose = pathCenterPose(path, terrain, 0.5);

    assert.ok(Math.abs(pose.position.x) < 0.5, `expected near x=0, got ${pose.position.x}`);
    assert.ok(pose.position.y > 50, 'expected terrain bed + hover');
    // Hover sits above mesh sample.
    const bedY = pose.position.y - RESET_HOVER;
    assert.ok(Number.isFinite(bedY));
    // Path runs −Z; spawn yaw faces downhill (−Z → yaw ≈ π).
    const forwardZ = -Math.cos(pose.yaw);
    assert.ok(forwardZ < -0.5, `expected downhill −Z facing, yaw=${pose.yaw}`);
  });

  it('clamps t and never needs physics', () => {
    const path = new SplinePath([
      [0, 10, 0],
      [5, 8, -50],
      [10, 6, -100],
    ]);
    const terrain = stubTerrain(9, 5, () => 12);
    const a = pathCenterPose(path, terrain, -1);
    const b = pathCenterPose(path, terrain, 2);
    assert.ok(Number.isFinite(a.position.y));
    assert.ok(Number.isFinite(b.position.y));
    assert.equal(a.position.y, 12 + RESET_HOVER);
  });
});
