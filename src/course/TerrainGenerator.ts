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

/**
 * Alpine ridgeline profile — continuous mass with summit accents.
 * Floor keeps silhouettes connected (no cardboard spikes over empty void).
 */
function ridgeSilhouette(u: number, seed: number, peakCount: number, jagged: number): number {
  const phase = valueNoise(u * 3.1, seed * 0.001, seed + 7) * Math.PI * 2;
  const wave = Math.sin(u * Math.PI * peakCount + phase);
  const peak = Math.pow(Math.max(0, wave), jagged);
  const secondary = Math.pow(
    Math.max(0, Math.sin(u * Math.PI * (peakCount * 1.7) - phase)),
    jagged * 1.2
  );
  const rumble = fbm(u * 6.5, seed * 0.02, seed + 41, 3);
  const accents = peak * 0.55 + secondary * 0.22 + (rumble - 0.5) * 0.12;
  // Connected floor (~0.38) so mid-ridge never collapses to empty sky.
  return THREE.MathUtils.clamp(0.38 + accents, 0.28, 1.15);
}

const SNOW_POWDER_TINT: [number, number, number] = [0.93, 0.96, 1.0];
const SNOW_PACKED_TINT: [number, number, number] = [0.86, 0.9, 0.94];
const ROCK_TINT: [number, number, number] = [0.45, 0.44, 0.42];
/** Soft haze lean toward scene FogExp2 horizon (lighting owns fog density). */
const HAZE_TINT: [number, number, number] = [0.72, 0.66, 0.56];

function paintAlpineVert(
  out: number[],
  rise: number,
  peakHeight: number,
  crest: number,
  mist: number,
  rockBias: number
): void {
  const snowAmt = THREE.MathUtils.clamp(rise / Math.max(40, peakHeight * 0.55), 0, 1);
  const steep = THREE.MathUtils.clamp(rockBias, 0, 1);
  // Steep mid-faces → rock; high gentle crests → powder; foothills → packed.
  let br: number;
  let bg: number;
  let bb: number;
  if (steep > 0.55 && snowAmt > 0.2 && snowAmt < 0.85) {
    const k = (steep - 0.55) / 0.45;
    br = THREE.MathUtils.lerp(SNOW_PACKED_TINT[0], ROCK_TINT[0], k);
    bg = THREE.MathUtils.lerp(SNOW_PACKED_TINT[1], ROCK_TINT[1], k);
    bb = THREE.MathUtils.lerp(SNOW_PACKED_TINT[2], ROCK_TINT[2], k);
  } else if (snowAmt > 0.62 && crest > 0.45) {
    br = SNOW_POWDER_TINT[0];
    bg = SNOW_POWDER_TINT[1];
    bb = SNOW_POWDER_TINT[2];
  } else {
    br = SNOW_PACKED_TINT[0];
    bg = SNOW_PACKED_TINT[1];
    bb = SNOW_PACKED_TINT[2];
  }
  // Aerial perspective toward fog horizon — coordinates with B11 without owning fog.
  const m = THREE.MathUtils.clamp(mist, 0, 0.55);
  out.push(
    br * (1 - m) + HAZE_TINT[0] * m,
    bg * (1 - m) + HAZE_TINT[1] * m,
    bb * (1 - m) + HAZE_TINT[2] * m
  );
}

interface RidgelineLayer {
  name: string;
  /**
   * Metres beyond race+apron half-width at the *inner* skirt.
   * Negative = overlap playable apron so foothills ground into snow (no void gap).
   */
  lateralPad: number;
  /** Depth of the mountain mass outward, metres. */
  massDepth: number;
  /** Peak rise above local path Y, metres. */
  peakHeight: number;
  /** Soft foothill pedestal under peaks, metres. */
  foothill: number;
  /**
   * Height at the apron join (inner edge), metres above path Y.
   * Must meet terrain catch-berm so peaks don't float over clear-color.
   */
  apronJoin: number;
  peakCount: number;
  jagged: number;
  roughness: number;
  alongSamples: number;
  depthSamples: number;
  /** Path-t span for the strip (can extend past [0,1]). */
  t0: number;
  t1: number;
  /** +1 = rider right, -1 = rider left. */
  side: 1 | -1;
  /** Extra haze for far layers (B11 coordination). */
  mistBias: number;
}

/**
 * Visual-only multi-layer alpine peaks / ridgelines.
 * Overlaps apron skirts + stacked amphitheater walls so course_start midfield
 * reads as a connected mountain mass, not floating cardboard on clear-color void.
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
  const nearOffset = backdrop?.nearOffset ?? 0;
  const farOffset = backdrop?.farOffset ?? 220;

  // Apron catch berm ~ pathY+45–70 at the mesh lip — join skirts there.
  const apronJoinNear = 48;
  const apronJoinMid = 62;

  const layers: RidgelineLayer[] = [
    {
      name: 'foothill-right',
      lateralPad: nearOffset - 18,
      massDepth: 130,
      peakHeight: peakHeight * 0.32,
      foothill: 28,
      apronJoin: apronJoinNear,
      peakCount: 5,
      jagged: 1.55,
      roughness: 0.94,
      alongSamples: 56,
      depthSamples: 9,
      t0: -0.14,
      t1: 1.16,
      side: 1,
      mistBias: 0.06,
    },
    {
      name: 'foothill-left',
      lateralPad: nearOffset - 18,
      massDepth: 130,
      peakHeight: peakHeight * 0.34,
      foothill: 30,
      apronJoin: apronJoinNear,
      peakCount: 5,
      jagged: 1.5,
      roughness: 0.94,
      alongSamples: 56,
      depthSamples: 9,
      t0: -0.14,
      t1: 1.16,
      side: -1,
      mistBias: 0.06,
    },
    {
      name: 'mid-ridge-right',
      lateralPad: farOffset * 0.35,
      massDepth: 200,
      peakHeight: peakHeight * 0.68,
      foothill: 48,
      apronJoin: apronJoinMid,
      peakCount: 4,
      jagged: 2.0,
      roughness: 0.96,
      alongSamples: 48,
      depthSamples: 8,
      t0: -0.1,
      t1: 1.22,
      side: 1,
      mistBias: 0.14,
    },
    {
      name: 'mid-ridge-left',
      lateralPad: farOffset * 0.35,
      massDepth: 200,
      peakHeight: peakHeight * 0.72,
      foothill: 50,
      apronJoin: apronJoinMid,
      peakCount: 4,
      jagged: 2.05,
      roughness: 0.96,
      alongSamples: 48,
      depthSamples: 8,
      t0: -0.1,
      t1: 1.22,
      side: -1,
      mistBias: 0.14,
    },
    {
      name: 'far-peaks-right',
      lateralPad: farOffset * 0.85,
      massDepth: 320,
      peakHeight,
      foothill: 70,
      apronJoin: 78,
      peakCount: 3,
      jagged: 2.55,
      roughness: 0.98,
      alongSamples: 42,
      depthSamples: 8,
      t0: -0.02,
      t1: 1.28,
      side: 1,
      mistBias: 0.28,
    },
    {
      name: 'far-peaks-left',
      lateralPad: farOffset * 0.85,
      massDepth: 320,
      peakHeight: peakHeight * 1.08,
      foothill: 74,
      apronJoin: 80,
      peakCount: 3,
      jagged: 2.65,
      roughness: 0.98,
      alongSamples: 42,
      depthSamples: 8,
      t0: -0.02,
      t1: 1.28,
      side: -1,
      mistBias: 0.28,
    },
  ];

  // Stacked amphitheater walls — fill center midfield void from course_start onward.
  // Near wall sits in the view cone early; mid/far add depth for aerial haze.
  const span = meshHalfWidth + farOffset + 480;
  root.add(
    buildHorizonPeakWall(path, seed, {
      name: 'horizon-near',
      peakHeight: peakHeight * 0.55,
      lateralSpan: span * 0.78,
      depth: 160,
      aheadT: 0.38,
      baseRise: 42,
      mistBias: 0.12,
      peakCount: 6,
      seedOff: 211,
    })
  );
  root.add(
    buildHorizonPeakWall(path, seed, {
      name: 'horizon-mid',
      peakHeight: peakHeight * 0.88,
      lateralSpan: span * 0.95,
      depth: 200,
      aheadT: 0.72,
      baseRise: 55,
      mistBias: 0.22,
      peakCount: 5,
      seedOff: 503,
    })
  );
  root.add(
    buildHorizonPeakWall(path, seed, {
      name: 'horizon-far',
      peakHeight: peakHeight * 1.2,
      lateralSpan: span * 1.15,
      depth: 260,
      aheadT: 1.2,
      baseRise: 70,
      mistBias: 0.34,
      peakCount: 4,
      seedOff: 791,
    })
  );
  // Behind-start wrap — kills blank sky when chase looks slightly uphill / start framing.
  root.add(
    buildHorizonPeakWall(path, seed, {
      name: 'horizon-start',
      peakHeight: peakHeight * 0.62,
      lateralSpan: span * 0.85,
      depth: 140,
      aheadT: -0.12,
      baseRise: 50,
      mistBias: 0.16,
      peakCount: 5,
      seedOff: 1009,
      alongTangent: -1,
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

  for (let i = 0; i < alongN; i++) {
    const u = i / (alongN - 1);
    const pathT = THREE.MathUtils.lerp(layer.t0, layer.t1, u);
    const featureT = THREE.MathUtils.clamp(pathT, 0, 1);
    path.sampleExtended(pathT, _sample);
    path.right(featureT, _right);

    const sil = ridgeSilhouette(u, seed + layer.side * 97, layer.peakCount, layer.jagged);
    const silNext = ridgeSilhouette(
      Math.min(1, u + 1 / Math.max(1, alongN - 1)),
      seed + layer.side * 97,
      layer.peakCount,
      layer.jagged
    );
    const rockBias = Math.abs(silNext - sil) * 4.5 + sil * 0.15;
    const pathY = _sample.y;

    for (let d = 0; d < depthN; d++) {
      const du = d / Math.max(1, depthN - 1);
      const outward = layer.lateralPad + du * layer.massDepth;
      const lateral = layer.side * (meshHalfWidth + outward);
      const wx = _sample.x + _right.x * lateral;
      const wz = _sample.z + _right.z * lateral;

      // Inner skirt locked to apron join; crest carries continuous ridgeline + summits.
      const crest = Math.sin(du * Math.PI);
      const back = du > 0.58 ? (du - 0.58) / 0.42 : 0;
      const skirt = THREE.MathUtils.lerp(layer.apronJoin, layer.foothill * 0.85, Math.min(1, du * 1.35));
      const rise =
        skirt +
        layer.foothill * 0.45 * crest +
        layer.peakHeight * sil * (0.2 + 0.8 * crest) -
        back * back * layer.peakHeight * 0.18;

      const micro = (fbm(wx * 0.012, wz * 0.012, seed + 211, 3) - 0.5) * layer.peakHeight * 0.07;
      const y = pathY + rise + micro;

      positions.push(wx, y, wz);
      const mist = layer.mistBias + du * 0.16;
      paintAlpineVert(colors, rise, layer.peakHeight, crest, mist, rockBias * (0.35 + crest));
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

/** Full-span amphitheater wall — kills empty midfield when looking along the fall line. */
function buildHorizonPeakWall(
  path: SplinePath,
  seed: number,
  opts: {
    name: string;
    peakHeight: number;
    lateralSpan: number;
    depth: number;
    aheadT: number;
    baseRise: number;
    mistBias: number;
    peakCount: number;
    seedOff: number;
    /** +1 = downhill along tangent, -1 = uphill behind start. */
    alongTangent?: 1 | -1;
  }
): THREE.Mesh {
  const acrossN = 64;
  const depthN = 8;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const dir = opts.alongTangent ?? 1;

  const featureT = THREE.MathUtils.clamp(opts.aheadT, 0, 1);
  path.sampleExtended(opts.aheadT, _sample);
  path.tangent(featureT, _tan);
  path.right(featureT, _right);

  for (let i = 0; i < acrossN; i++) {
    const u = i / (acrossN - 1);
    const lateral = (u - 0.5) * 2 * opts.lateralSpan;
    const sil = ridgeSilhouette(u, seed + opts.seedOff, opts.peakCount, 2.4);
    // Dominant summits like alpine groom ref — still sit on continuous floor.
    const hero = Math.pow(Math.max(0, Math.sin(u * Math.PI * 2.15 + 0.35)), 2.8);
    const silNext = ridgeSilhouette(
      Math.min(1, u + 1 / Math.max(1, acrossN - 1)),
      seed + opts.seedOff,
      opts.peakCount,
      2.4
    );
    const rockBias = Math.abs(silNext - sil) * 5 + hero * 0.55;

    for (let d = 0; d < depthN; d++) {
      const du = d / Math.max(1, depthN - 1);
      const ahead = dir * du * opts.depth;
      const wx = _sample.x + _right.x * lateral + _tan.x * ahead;
      const wz = _sample.z + _right.z * lateral + _tan.z * ahead;
      const crest = Math.sin(Math.min(1, du * 1.12) * Math.PI);
      const back = du > 0.6 ? (du - 0.6) / 0.4 : 0;
      const profile = sil * 0.72 + hero * 0.48;
      const rise =
        opts.baseRise * (0.55 + 0.45 * (1 - du * 0.35)) +
        opts.peakHeight * profile * (0.28 + 0.72 * crest) -
        back * back * opts.peakHeight * 0.2 +
        (fbm(wx * 0.01, wz * 0.01, seed + 77, 3) - 0.5) * opts.peakHeight * 0.08;

      positions.push(wx, _sample.y + rise, wz);
      const mist = opts.mistBias + du * 0.18;
      paintAlpineVert(colors, rise, opts.peakHeight, crest, mist, rockBias * (0.4 + crest));
    }
  }

  for (let i = 0; i < acrossN - 1; i++) {
    for (let d = 0; d < depthN - 1; d++) {
      const a = i * depthN + d;
      const b = a + 1;
      const c = a + depthN;
      const e = c + 1;
      if (dir > 0) indices.push(a, b, c, b, e, c);
      else indices.push(a, c, b, b, c, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.01,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `backdrop-${opts.name}`;
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
        // Rise into foothills toward apron edge — joins visual backdrop mass (~48m at lip).
        y += apronNorm * apronNorm * 42 * (0.5 + profile.roughness * 0.5) * reliefScale;
        y += shelfNoise * 5.5 * apronNorm * reliefScale;
        // Mid-apron ridgelines break the flat powder sheet.
        if (apronNorm > 0.22) {
          const ridgeU = (apronNorm - 0.22) / 0.78;
          y +=
            Math.pow(ridgeU, 1.25) *
            flankRidge *
            32 *
            (0.55 + profile.roughness * 0.6) *
            reliefScale;
        }
      }

      // Catch berm / foothill lip — grounds backdrop skirts (no clear-color void at apron).
      if (meshDistNorm > 0.72) {
        const lip = meshDistNorm - 0.72;
        y += lip * lip * 145 * (0.8 + profile.roughness * 0.35) * reliefScale;
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
