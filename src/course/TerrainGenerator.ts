import * as THREE from 'three';
import type { Rng } from '@/types/rng.ts';
import type { CourseDef, TerrainBuildResult } from '@/types/course.ts';
import type { SurfaceKind } from '@/types/gameplay.ts';
import { getSurfaceParams, SNOW_SURFACES, surfaceKindIndex } from '@/course/surfaces.ts';
import { SplinePath } from '@/course/SplinePath.ts';

const SURFACE_TABLE: SurfaceKind[] = ['powder', 'packed', 'ice'];

/** Default flank width beyond each side of the race corridor (metres). */
const DEFAULT_APRON_WIDTH = 120;
/** Default path-t apron beyond each end of the run. */
const DEFAULT_APRON_T = 0.1;

const _sample = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

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

function envelope01(t: number, start: number, end: number): number {
  const span = Math.max(1e-4, end - start);
  const u = (t - start) / span;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

/** Alpine silhouette: discrete peaks + ridgeline noise. */
function ridgeSilhouette(u: number, seed: number, peakCount: number, jagged: number): number {
  const phase = valueNoise(u * 3.1, seed * 0.001, seed + 7) * Math.PI * 2;
  const wave = Math.sin(u * Math.PI * peakCount + phase);
  const peak = Math.pow(Math.max(0, wave), jagged);
  const secondary = Math.pow(Math.max(0, Math.sin(u * Math.PI * (peakCount * 1.7) - phase)), jagged * 1.2);
  const rumble = fbm(u * 6.5, seed * 0.02, seed + 41, 3);
  return peak * 0.72 + secondary * 0.28 + (rumble - 0.5) * 0.22;
}

interface RidgelineLayer {
  name: string;
  /** Metres beyond race+apron half-width. */
  lateralPad: number;
  /** Depth of the mountain mass outward, metres. */
  massDepth: number;
  /** Peak rise above local path Y, metres. */
  peakHeight: number;
  /** Soft foothill pedestal under peaks, metres. */
  foothill: number;
  peakCount: number;
  jagged: number;
  tint: [number, number, number];
  roughness: number;
  alongSamples: number;
  depthSamples: number;
  /** Path-t span for the strip (can extend past [0,1]). */
  t0: number;
  t1: number;
  /** +1 = rider right, -1 = rider left. */
  side: 1 | -1;
}

/**
 * Visual-only multi-layer alpine peaks / ridgelines.
 * Sits outside the playable apron so the horizon reads as mountains, not empty sky.
 * Never included in the Rapier trimesh.
 */
export function buildAlpineBackdrop(
  path: SplinePath,
  meshHalfWidth: number,
  seed: number,
  backdrop?: CourseDef['terrain']['backdrop']
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'alpine-backdrop';
  if (backdrop?.enabled === false) return root;

  const peakHeight = backdrop?.peakHeight ?? 280;
  const nearOffset = backdrop?.nearOffset ?? 40;
  const farOffset = backdrop?.farOffset ?? 220;

  const layers: RidgelineLayer[] = [
    {
      name: 'foothill-right',
      lateralPad: nearOffset,
      massDepth: 90,
      peakHeight: peakHeight * 0.28,
      foothill: 18,
      peakCount: 5,
      jagged: 1.6,
      tint: [0.86, 0.9, 0.94],
      roughness: 0.94,
      alongSamples: 48,
      depthSamples: 5,
      t0: -0.08,
      t1: 1.12,
      side: 1,
    },
    {
      name: 'foothill-left',
      lateralPad: nearOffset,
      massDepth: 90,
      peakHeight: peakHeight * 0.3,
      foothill: 20,
      peakCount: 5,
      jagged: 1.55,
      tint: [0.84, 0.89, 0.93],
      roughness: 0.94,
      alongSamples: 48,
      depthSamples: 5,
      t0: -0.08,
      t1: 1.12,
      side: -1,
    },
    {
      name: 'mid-ridge-right',
      lateralPad: farOffset * 0.55,
      massDepth: 160,
      peakHeight: peakHeight * 0.62,
      foothill: 40,
      peakCount: 4,
      jagged: 2.1,
      tint: [0.78, 0.84, 0.9],
      roughness: 0.96,
      alongSamples: 40,
      depthSamples: 4,
      t0: -0.05,
      t1: 1.18,
      side: 1,
    },
    {
      name: 'mid-ridge-left',
      lateralPad: farOffset * 0.55,
      massDepth: 160,
      peakHeight: peakHeight * 0.66,
      foothill: 42,
      peakCount: 4,
      jagged: 2.2,
      tint: [0.76, 0.82, 0.89],
      roughness: 0.96,
      alongSamples: 40,
      depthSamples: 4,
      t0: -0.05,
      t1: 1.18,
      side: -1,
    },
    {
      name: 'far-peaks-right',
      lateralPad: farOffset,
      massDepth: 260,
      peakHeight,
      foothill: 55,
      peakCount: 3,
      jagged: 2.8,
      tint: [0.68, 0.76, 0.86],
      roughness: 0.98,
      alongSamples: 36,
      depthSamples: 4,
      t0: 0.05,
      t1: 1.25,
      side: 1,
    },
    {
      name: 'far-peaks-left',
      lateralPad: farOffset,
      massDepth: 260,
      peakHeight: peakHeight * 1.05,
      foothill: 58,
      peakCount: 3,
      jagged: 2.9,
      tint: [0.66, 0.74, 0.85],
      roughness: 0.98,
      alongSamples: 36,
      depthSamples: 4,
      t0: 0.05,
      t1: 1.25,
      side: -1,
    },
  ];

  // Horizon wall ahead of the finish — fills empty sky when looking downhill.
  root.add(
    buildHorizonPeakWall(path, seed, {
      peakHeight: peakHeight * 1.15,
      lateralSpan: meshHalfWidth + farOffset + 420,
      depth: 220,
      tint: [0.62, 0.72, 0.84],
      aheadT: 1.18,
    })
  );

  for (const layer of layers) {
    root.add(buildRidgelineStrip(path, meshHalfWidth, seed, layer));
  }

  return root;
}

function buildRidgelineStrip(
  path: SplinePath,
  meshHalfWidth: number,
  seed: number,
  layer: RidgelineLayer
): THREE.Mesh {
  const alongN = layer.alongSamples;
  const depthN = layer.depthSamples;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const [cr, cg, cb] = layer.tint;

  for (let i = 0; i < alongN; i++) {
    const u = i / (alongN - 1);
    const pathT = THREE.MathUtils.lerp(layer.t0, layer.t1, u);
    const featureT = THREE.MathUtils.clamp(pathT, 0, 1);
    path.sampleExtended(pathT, _sample);
    path.right(featureT, _right);

    const sil = ridgeSilhouette(u, seed + layer.side * 97, layer.peakCount, layer.jagged);
    const pathY = _sample.y;

    for (let d = 0; d < depthN; d++) {
      const du = d / Math.max(1, depthN - 1);
      const outward = layer.lateralPad + du * layer.massDepth;
      const lateral = layer.side * (meshHalfWidth + outward);
      const wx = _sample.x + _right.x * lateral;
      const wz = _sample.z + _right.z * lateral;

      // Rise toward the outer crest, then soft backslope so silhouettes read as mass.
      const crest = Math.sin(du * Math.PI);
      const back = du > 0.55 ? (du - 0.55) / 0.45 : 0;
      const rise =
        layer.foothill * (0.35 + 0.65 * crest) +
        layer.peakHeight * sil * (0.45 + 0.55 * crest) -
        back * back * layer.peakHeight * 0.22;

      const micro = (fbm(wx * 0.012, wz * 0.012, seed + 211, 3) - 0.5) * layer.peakHeight * 0.08;
      const y = pathY + rise + micro;

      positions.push(wx, y, wz);
      // Cooler / mistier toward outer mass for aerial perspective.
      const mist = 0.08 + du * 0.14;
      colors.push(cr * (1 - mist) + 0.55 * mist, cg * (1 - mist) + 0.62 * mist, cb * (1 - mist) + 0.72 * mist);
    }
  }

  for (let i = 0; i < alongN - 1; i++) {
    for (let d = 0; d < depthN - 1; d++) {
      const a = i * depthN + d;
      const b = a + 1;
      const c = a + depthN;
      const e = c + 1;
      // Wind outward so both flanks face the corridor.
      if (layer.side > 0) indices.push(a, c, b, b, c, e);
      else indices.push(a, b, c, b, e, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: layer.roughness,
    metalness: 0.01,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `backdrop-${layer.name}`;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = true;
  return mesh;
}

/** Far downhill peak wall — fills horizon when chase looks along the fall line. */
function buildHorizonPeakWall(
  path: SplinePath,
  seed: number,
  opts: {
    peakHeight: number;
    lateralSpan: number;
    depth: number;
    tint: [number, number, number];
    aheadT: number;
  }
): THREE.Mesh {
  const acrossN = 56;
  const depthN = 5;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const [cr, cg, cb] = opts.tint;

  path.sampleExtended(opts.aheadT, _sample);
  path.tangent(1, _tan);
  path.right(1, _right);

  for (let i = 0; i < acrossN; i++) {
    const u = i / (acrossN - 1);
    const lateral = (u - 0.5) * 2 * opts.lateralSpan;
    const sil = ridgeSilhouette(u, seed + 503, 5, 2.6);
    // Emphasize a few dominant summits like the alpine groom ref.
    const hero = Math.pow(Math.max(0, Math.sin(u * Math.PI * 2.2 + 0.4)), 3.2);

    for (let d = 0; d < depthN; d++) {
      const du = d / Math.max(1, depthN - 1);
      const ahead = du * opts.depth;
      const wx = _sample.x + _right.x * lateral + _tan.x * ahead;
      const wz = _sample.z + _right.z * lateral + _tan.z * ahead;
      const crest = Math.sin(Math.min(1, du * 1.15) * Math.PI);
      const y =
        _sample.y +
        35 +
        opts.peakHeight * (sil * 0.7 + hero * 0.55) * (0.4 + 0.6 * crest) +
        (fbm(wx * 0.01, wz * 0.01, seed + 77, 3) - 0.5) * opts.peakHeight * 0.1;

      positions.push(wx, y, wz);
      const mist = 0.12 + du * 0.18;
      colors.push(cr * (1 - mist) + 0.58 * mist, cg * (1 - mist) + 0.66 * mist, cb * (1 - mist) + 0.78 * mist);
    }
  }

  for (let i = 0; i < acrossN - 1; i++) {
    for (let d = 0; d < depthN - 1; d++) {
      const a = i * depthN + d;
      const b = a + 1;
      const c = a + depthN;
      const e = c + 1;
      indices.push(a, b, c, b, e, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.01,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'backdrop-horizon-peaks';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/**
 * Builds a downhill mountain meshed for rendering and Rapier trimesh.
 * Race corridor stays centered; wide powder flanks + nose/tail aprons keep
 * off-piste riding on snow instead of falling into the void.
 *
 * Visual mesh stays in world Y so spawn/props/path samples share one space.
 * The heightfield array is still origin-relative for the legacy API shape.
 * Distant peak silhouettes live on a separate visual-only backdrop group.
 */
export function buildTerrain(options: TerrainGeneratorOptions): TerrainBuildResult {
  const { course, path } = options;
  const profile = course.terrain;
  const seed = course.seed;

  const corridorWidth = profile.width;
  const raceHalf = corridorWidth * 0.5;
  const apronWidth = profile.apronWidth ?? Math.max(DEFAULT_APRON_WIDTH, corridorWidth * 1.4);
  const apronT = profile.apronT ?? DEFAULT_APRON_T;
  const meshHalfWidth = raceHalf + apronWidth;
  const meshWidth = meshHalfWidth * 2;
  const tSpan = 1 + 2 * apronT;
  const reliefScale = profile.reliefScale ?? 1;

  const pathSamples = Math.max(
    32,
    Math.round((course.length / 100) * profile.pathSegmentsPer100m * tSpan)
  );
  const widthScale = meshWidth / Math.max(1e-4, corridorWidth);
  const lateralCells = Math.max(16, Math.round(profile.lateralSegments * 2 * widthScale));
  const nrows = pathSamples;
  const ncols = lateralCells + 1;

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
    const rowU = row / (nrows - 1);
    const pathT = -apronT + rowU * tSpan;
    const featureT = THREE.MathUtils.clamp(pathT, 0, 1);

    path.sampleExtended(pathT, _sample);
    path.tangent(featureT, _tan);
    path.right(featureT, _right);

    // Continue the fall-line drop past the authored ends.
    const corridorCenterY = _sample.y - dropPerT * featureT;
    const bank = Math.sin(featureT * Math.PI * 4 + seed * 0.001) * 2.5 * profile.roughness;

    for (let col = 0; col < ncols; col++) {
      const u = col / lateralCells;
      const lateral = (u - 0.5) * 2 * meshHalfWidth;
      const wx = _sample.x + _right.x * lateral;
      const wz = _sample.z + _right.z * lateral;

      minX = Math.min(minX, wx);
      minZ = Math.min(minZ, wz);
      maxX = Math.max(maxX, wx);
      maxZ = Math.max(maxZ, wz);

      const absLat = Math.abs(lateral);
      const raceDistNorm = absLat / Math.max(1e-4, raceHalf);
      const meshDistNorm = absLat / Math.max(1e-4, meshHalfWidth);
      const apronNorm =
        absLat <= raceHalf ? 0 : (absLat - raceHalf) / Math.max(1e-4, apronWidth);

      const macro = fbm(wx * 0.018, wz * 0.018, seed, 4) - 0.5;
      const micro = fbm(wx * 0.09, wz * 0.09, seed + 17, 3) - 0.5;
      const shelfNoise = fbm(wx * 0.035, wz * 0.035, seed + 53, 3) - 0.5;
      const flankRidge = fbm(wx * 0.022, wz * 0.022, seed + 91, 4) - 0.5;
      // Stronger near relief so the playable sheet isn't a flat card.
      const rough = (macro * 9.5 + micro * 3.4) * profile.roughness * reliefScale;

      let y =
        corridorCenterY -
        Math.tan(pitch) * path.distanceAt(featureT) * 0.015 +
        rough +
        bank * lateral * 0.04;

      // Soft berms at the race-corridor edge — readable line, not a wall.
      if (raceDistNorm > 0.78 && raceDistNorm < 1.15) {
        const edge = raceDistNorm - 0.78;
        y += edge * edge * 18 * (0.35 + profile.roughness) * reliefScale;
      }

      // Off-piste powder shelves / soft berms continuing the mountain flanks.
      if (apronNorm > 0) {
        const shelf = Math.sin(Math.min(1, apronNorm) * Math.PI);
        y -= shelf * (2.8 + shelfNoise * 2.2) * (0.55 + profile.roughness * 0.5) * reliefScale;
        // Rise into foothills toward apron edge — joins visual backdrop mass.
        y += apronNorm * apronNorm * 28 * (0.45 + profile.roughness * 0.55) * reliefScale;
        y += shelfNoise * 4.2 * apronNorm * reliefScale;
        // Mid-apron ridgelines break the flat powder sheet.
        if (apronNorm > 0.28) {
          const ridgeU = (apronNorm - 0.28) / 0.72;
          y +=
            Math.pow(ridgeU, 1.35) *
            flankRidge *
            26 *
            (0.55 + profile.roughness * 0.6) *
            reliefScale;
        }
      }

      // Catch berm / foothill lip at the absolute mesh border.
      if (meshDistNorm > 0.82) {
        const lip = meshDistNorm - 0.82;
        y += lip * lip * 85 * (0.75 + profile.roughness * 0.4) * reliefScale;
      }

      // Halfpipe depression (race corridor features only).
      if (profile.halfpipe && pathT >= 0 && pathT <= 1) {
        const { startT, endT, depth, width } = profile.halfpipe;
        if (featureT >= startT && featureT <= endT) {
          const pipeU = (featureT - startT) / (endT - startT);
          const edge = Math.abs(lateral) / (width * 0.5);
          if (edge <= 1) {
            const bowl = (1 - edge * edge) * depth;
            y -= bowl * (0.65 + 0.35 * Math.sin(pipeU * Math.PI));
          }
        }
      }

      // Canyon walls pinch the finish corridor without blocking the line.
      if (profile.canyon && pathT >= 0 && pathT <= 1) {
        const { startT, endT, depth } = profile.canyon;
        if (featureT >= startT && featureT <= endT) {
          const pinch = (featureT - startT) / (endT - startT);
          const wall = Math.max(0, Math.abs(lateral) - raceHalf * (0.55 - pinch * 0.2));
          y += wall * wall * 0.015 * depth;
        }
      }

      // Alternate-line shelves — viable side channels, not traps.
      if (profile.altLines && pathT >= 0 && pathT <= 1) {
        for (const alt of profile.altLines) {
          const env = envelope01(featureT, alt.startT, alt.endT);
          if (env <= 0) continue;
          const edge = Math.abs(lateral - alt.lateral) / (alt.width * 0.5);
          if (edge < 1) {
            y -= alt.depth * (1 - edge * edge) * env;
          }
        }
      }

      baseY = Math.min(baseY, y);

      const idx = row * ncols + col;
      heights[idx] = y;

      let surface: SurfaceKind = 'packed';
      const slopeProxy = Math.abs(macro) + Math.abs(lateral) * 0.002;
      const powderBias = valueNoise(wx * 0.04, wz * 0.04, seed + 401);

      // Center stays groomed; flanks and apron bias hard to powder.
      if (raceDistNorm < 0.2) {
        surface = 'packed';
      } else if (raceDistNorm > 0.42 || apronNorm > 0 || powderBias > 0.42 - raceDistNorm * 0.35) {
        surface = 'powder';
      }
      // Ice only on the race strip — steep packed patches, not the powder apron.
      if (raceDistNorm < 0.95 && slopeProxy > 0.42 && featureT > 0.35) {
        surface = 'ice';
      }
      if (raceDistNorm < 0.18) {
        surface = 'packed';
      }
      // Absolute apron / catch zone is always deep powder.
      if (apronNorm > 0.15) {
        surface = 'powder';
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
      uvs.push(u, rowU);
    }
  }

  // Heightfield array is origin-relative; visual mesh keeps world Y for spawn/props.
  const originX = minX;
  const originZ = minZ;
  const cellSizeX = (maxX - minX) / Math.max(1, ncols - 1);
  const cellSizeZ = (maxZ - minZ) / Math.max(1, nrows - 1);
  const cellSize = Math.max(cellSizeX, cellSizeZ);

  // Heightfield stores relative heights with origin.y = baseY.
  // Keep mesh positions in world space so path/spawn/props line up with the trimesh.
  for (let i = 0; i < heights.length; i++) {
    heights[i] -= baseY;
  }

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

  const backdrop = buildAlpineBackdrop(path, meshHalfWidth, seed, profile.backdrop);

  return {
    mesh,
    backdrop,
    heightfield: {
      nrows,
      ncols,
      heights,
      cellSize,
      origin: [originX, baseY, originZ],
    },
    surfaceIndices,
    surfaceKinds: SURFACE_TABLE,
    corridorWidth,
    meshWidth,
    apronT,
  };
}

/**
 * Bilinear sample of the authored visual mesh at path parameter t.
 * `lateralU` is 0..1 across the full mesh (0.5 = centerline).
 * Path t∈[0,1] maps into the interior rows, accounting for nose/tail apron.
 */
export function sampleTerrainAt(
  terrain: TerrainBuildResult,
  t: number,
  lateralU = 0.5,
  out = new THREE.Vector3()
): THREE.Vector3 {
  const { nrows, ncols } = terrain.heightfield;
  const pos = terrain.mesh.geometry.getAttribute('position');
  if (!pos) return out.set(0, 0, 0);

  const apronT = terrain.apronT ?? 0;
  const tSpan = 1 + 2 * apronT;
  const rowU = THREE.MathUtils.clamp((t + apronT) / tSpan, 0, 1);
  const rowF = rowU * (nrows - 1);
  const colF = THREE.MathUtils.clamp(lateralU, 0, 1) * (ncols - 1);
  const r0 = Math.floor(rowF);
  const r1 = Math.min(nrows - 1, r0 + 1);
  const c0 = Math.floor(colF);
  const c1 = Math.min(ncols - 1, c0 + 1);
  const fr = rowF - r0;
  const fc = colF - c0;

  const read = (r: number, c: number, target: THREE.Vector3): THREE.Vector3 => {
    const i = r * ncols + c;
    return target.set(pos.getX(i), pos.getY(i), pos.getZ(i));
  };

  read(r0, c0, _a);
  read(r0, c1, _b);
  read(r1, c0, _c);
  read(r1, c1, _d);

  _a.lerp(_b, fc);
  _c.lerp(_d, fc);
  return out.copy(_a.lerp(_c, fr));
}

/**
 * Convert metres of lateral offset to mesh U.
 * Pass full `meshWidth` (corridor + flanks) so gates stay on the race line.
 */
export function lateralToU(lateralMetres: number, meshWidth: number): number {
  if (meshWidth <= 1e-4) return 0.5;
  return THREE.MathUtils.clamp(0.5 + lateralMetres / meshWidth, 0.02, 0.98);
}

export { SURFACE_TABLE, SNOW_SURFACES };
