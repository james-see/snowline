import * as THREE from 'three';
import type { Rng } from '@/types/rng.ts';
import type { CourseDef, TerrainBuildResult } from '@/types/course.ts';
import type { SurfaceKind } from '@/types/gameplay.ts';
import { getSurfaceParams, SNOW_SURFACES, surfaceKindIndex } from '@/course/surfaces.ts';
import { SplinePath } from '@/course/SplinePath.ts';

const SURFACE_TABLE: SurfaceKind[] = ['powder', 'packed', 'ice'];

const _sample = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tan = new THREE.Vector3();

export interface TerrainGeneratorOptions {
  course: CourseDef;
  path: SplinePath;
  rng: Rng;
}

/** Seeded value noise — deterministic, no allocations in the hot loop. */
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const hash = (a: number, b: number): number => {
    let h = seed + a * 374761393 + b * 668265263;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, ux),
    THREE.MathUtils.lerp(c, d, ux),
    uz
  );
}

function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 991) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / norm;
}

/**
 * Builds a downhill heightfield corridor meshed for rendering and Rapier.
 * Surface regions blend powder / packed / ice from slope, distance to line,
 * and authored overrides.
 */
export function buildTerrain(options: TerrainGeneratorOptions): TerrainBuildResult {
  const { course, path } = options;
  const profile = course.terrain;
  const seed = course.seed;

  const pathSamples = Math.max(
    24,
    Math.round((course.length / 100) * profile.pathSegmentsPer100m)
  );
  const lateralCells = profile.lateralSegments * 2;
  const nrows = pathSamples;
  const ncols = lateralCells + 1;
  const halfWidth = profile.width * 0.5;

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const heights = new Float32Array(nrows * ncols);
  const surfaceIndices = new Uint8Array(nrows * ncols);

  const pitch = THREE.MathUtils.degToRad(profile.pitchDeg);
  const dropPerT = profile.drop;

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  let baseY = Infinity;

  for (let row = 0; row < nrows; row++) {
    const t = row / (nrows - 1);
    path.sample(t, _sample);
    path.tangent(t, _tan);
    path.right(t, _right);

    const corridorCenterY = _sample.y - dropPerT * t;
    const bank = Math.sin(t * Math.PI * 4 + seed * 0.001) * 2.5 * profile.roughness;

    for (let col = 0; col < ncols; col++) {
      const u = col / lateralCells;
      const lateral = (u - 0.5) * 2 * halfWidth;
      const wx = _sample.x + _right.x * lateral;
      const wz = _sample.z + _right.z * lateral;

      minX = Math.min(minX, wx);
      minZ = Math.min(minZ, wz);
      maxX = Math.max(maxX, wx);
      maxZ = Math.max(maxZ, wz);

      const distNorm = Math.abs(lateral) / halfWidth;
      const macro = fbm(wx * 0.018, wz * 0.018, seed, 4) - 0.5;
      const micro = fbm(wx * 0.09, wz * 0.09, seed + 17, 3) - 0.5;
      const rough = (macro * 6 + micro * 2.2) * profile.roughness;

      let y =
        corridorCenterY -
        Math.tan(pitch) * path.distanceAt(t) * 0.015 +
        rough +
        bank * lateral * 0.04;

      // Halfpipe depression.
      if (profile.halfpipe) {
        const { startT, endT, depth, width } = profile.halfpipe;
        if (t >= startT && t <= endT) {
          const pipeU = (t - startT) / (endT - startT);
          const edge = Math.abs(lateral) / (width * 0.5);
          if (edge <= 1) {
            const bowl = (1 - edge * edge) * depth;
            y -= bowl * (0.65 + 0.35 * Math.sin(pipeU * Math.PI));
          }
        }
      }

      // Canyon walls pinch the finish corridor without blocking the line.
      if (profile.canyon) {
        const { startT, endT, depth } = profile.canyon;
        if (t >= startT && t <= endT) {
          const pinch = (t - startT) / (endT - startT);
          const wall = Math.max(0, Math.abs(lateral) - halfWidth * (0.55 - pinch * 0.2));
          y += wall * wall * 0.015 * depth;
        }
      }

      baseY = Math.min(baseY, y);

      const idx = row * ncols + col;
      heights[idx] = y;

      let surface: SurfaceKind = 'packed';
      const slopeProxy = Math.abs(macro) + Math.abs(lateral) * 0.002;
      const powderBias = valueNoise(wx * 0.04, wz * 0.04, seed + 401);
      if (distNorm > 0.55 || powderBias > 0.55 - distNorm * 0.3) {
        surface = 'powder';
      }
      if (slopeProxy > 0.42 && t > 0.35) {
        surface = 'ice';
      }
      if (distNorm < 0.22) {
        surface = 'packed';
      }

      for (const region of course.surfaceRegions ?? []) {
        const dx = wx - region.center[0];
        const dz = wz - region.center[2];
        if (dx * dx + dz * dz <= region.radius * region.radius) {
          surface = region.kind;
        }
      }

      surfaceIndices[idx] = surfaceKindIndex(surface, SURFACE_TABLE);
      const tint = getSurfaceParams(surface).tint;
      colors.push(tint[0], tint[1], tint[2]);
      positions.push(wx, y, wz);
      uvs.push(u, t);
    }
  }

  // Origin for heightfield — snap Y to minimum bed.
  const originX = minX;
  const originZ = minZ;
  const cellSizeX = (maxX - minX) / Math.max(1, ncols - 1);
  const cellSizeZ = (maxZ - minZ) / Math.max(1, nrows - 1);
  const cellSize = Math.max(cellSizeX, cellSizeZ);

  for (let i = 0; i < heights.length; i++) {
    heights[i] -= baseY;
    const vi = i * 3 + 1;
    positions[vi] = heights[i];
  }

  // Indices & normals.
  for (let row = 0; row < nrows - 1; row++) {
    for (let col = 0; col < ncols - 1; col++) {
      const a = row * ncols + col;
      const b = a + 1;
      const c = a + ncols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `terrain-${course.id}`;
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  return {
    mesh,
    heightfield: {
      nrows,
      ncols,
      heights,
      cellSize,
      origin: [originX, baseY, originZ],
    },
    surfaceIndices,
    surfaceKinds: SURFACE_TABLE,
  };
}

export { SURFACE_TABLE, SNOW_SURFACES };
