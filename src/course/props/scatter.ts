import * as THREE from 'three';
import type { CourseDef, PropPlacement } from '@/types/course.ts';
import type { SplinePath } from '@/course/SplinePath.ts';
import { SeededRng } from '@/engine/Rng.ts';

const _center = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tan = new THREE.Vector3();

/** Fraction of Lod tree budget to fill per course (apron forest belts). */
const FOREST_FILL: Record<CourseDef['id'], number> = {
  alpine: 1,
  timberline: 1,
  summit: 0.4,
};

/**
 * Share of tree budget reserved for mid-corridor inset pines that sit
 * inside the forward chase FOV cone (path look-ahead), not apron flanks only.
 * Alpine gets a heavy cut so course_start/carve midfield packs like alpine/SSX.
 */
const INSET_TREE_FRAC: Record<CourseDef['id'], number> = {
  alpine: 0.24,
  timberline: 0.08,
  summit: 0.05,
};

const BANNER_LABELS = ['SLOW DOWN', 'CAUTION', 'STAY LEFT', 'GATE AHEAD'] as const;

export interface ExpandPropsOptions {
  maxTreeInstances: number;
  /** When false, skip procedural furniture (authored only). Default true. */
  furniture?: boolean;
}

/**
 * Merge authored course props with procedural apron forest belts + race furniture.
 * Authored trees keep priority; belts fill remaining Lod tree slots.
 * Corridor center stays clear — plant on flanks / mid-corridor-adjacent only.
 * Props with `pathT` resolve world XZ from the run spline before scatter merge.
 */
export function expandCourseProps(
  def: Pick<CourseDef, 'id' | 'seed' | 'terrain' | 'props'>,
  path: SplinePath,
  options: ExpandPropsOptions
): PropPlacement[] {
  const authored = resolvePathPlacements(def.props, path);
  const rng = new SeededRng(def.seed ^ 0x70e5_f01e);
  const raceHalf = def.terrain.width * 0.5;
  const apron = def.terrain.apronWidth ?? Math.max(110, def.terrain.width * 1.4);

  const fill = FOREST_FILL[def.id] ?? 0.6;
  const target = Math.max(0, Math.floor(options.maxTreeInstances * fill));
  const existing = authored.filter((p) => p.kind === 'tree').length;
  const treeSlots = Math.max(0, target - existing);
  const insetFrac = INSET_TREE_FRAC[def.id] ?? 0.1;
  const insetSlots = Math.min(treeSlots, Math.floor(treeSlots * insetFrac));
  const beltSlots = Math.max(0, treeSlots - insetSlots);

  const inset = scatterInsetFrustumTrees(def.id, path, raceHalf, insetSlots, rng);
  const trees = scatterForestBelt(def.id, path, raceHalf, apron, beltSlots, rng);
  const furniture =
    options.furniture === false
      ? []
      : [
          ...scatterCourseFurniture(def.id, path, raceHalf, authored, rng),
          ...scatterAheadFrustumFill(def.id, path, raceHalf, authored, rng),
        ];

  return [...authored, ...inset, ...trees, ...furniture];
}

/**
 * Resolve pathT/lateral authoring into world positions.
 * rotationY is an offset from path-aligned defaults (ramp faces fall line;
 * rail/box length follows tangent).
 */
export function resolvePathPlacements(
  placements: readonly PropPlacement[],
  path: SplinePath
): PropPlacement[] {
  return placements.map((p) => {
    if (p.pathT === undefined) return { ...p };
    const t = THREE.MathUtils.clamp(p.pathT, 0.02, 0.98);
    const lateral = p.lateral ?? 0;
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    _tan.y = 0;
    if (_tan.lengthSq() < 1e-8) _tan.set(0, 0, 1);
    else _tan.normalize();

    const fallYaw = Math.atan2(_tan.x, _tan.z);
    // Rails/boxes: local X = length → align with tangent.
    // Ramps: local +Z = fall line.
    const baseYaw =
      p.kind === 'ramp' || p.kind === 'tunnel' || p.kind === 'checkpoint_gate' || p.kind === 'finish_arch'
        ? fallYaw
        : fallYaw + Math.PI * 0.5;
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    return {
      ...p,
      position: [x, _center.y, z],
      rotationY: baseYaw + (p.rotationY ?? 0),
    };
  });
}

/**
 * Mid-corridor pines for the *ahead* chase frustum (B8 without CAM_CROSS).
 * Laterals sit inside the FOV cone at 8–40 m look-ahead (FOV~48 → half-width
 * ~9–18 m on alpine), not out on the apron lip.
 */
function scatterInsetFrustumTrees(
  courseId: CourseDef['id'],
  path: SplinePath,
  raceHalf: number,
  slots: number,
  rng: SeededRng
): PropPlacement[] {
  if (slots <= 0 || courseId === 'summit') return [];

  const out: PropPlacement[] = [];
  // Clear fall-line lane (~±0.1 raceHalf); pack the rest into the near FOV cone.
  const inner = raceHalf * (courseId === 'timberline' ? 0.28 : 0.11);
  const outer = raceHalf * (courseId === 'timberline' ? 0.78 : 0.52);
  const rows = courseId === 'timberline' ? 2 : 3;
  // Ultra-near gallery fills course_start lower midfield (8–40 m ≈ tiny path-t).
  const nearEnd = courseId === 'timberline' ? 0.07 : 0.06;
  const midEnd = courseId === 'timberline' ? 0.38 : 0.42;
  const nearSlots = Math.floor(slots * 0.38);
  const midSlots = Math.floor(slots * 0.55);
  // Remainder → sparse tail past meadow.

  for (let i = 0; i < slots; i++) {
    const inNear = i < nearSlots;
    const inMid = !inNear && i < nearSlots + midSlots;
    const local = inNear ? i : inMid ? i - nearSlots : i - nearSlots - midSlots;
    const localCount = inNear
      ? nearSlots
      : inMid
        ? midSlots
        : Math.max(1, slots - nearSlots - midSlots);
    const t0 = inNear ? 0.005 : inMid ? nearEnd : midEnd + 0.04;
    const t1 = inNear ? nearEnd : inMid ? midEnd : 0.78;

    const side = local % 2 === 0 ? -1 : 1;
    const idx = Math.floor(local / 2);
    const perSide = Math.max(1, Math.ceil(localCount / 2));
    const cellsAlong = Math.max(1, Math.ceil(perSide / rows));
    const cell = idx % cellsAlong;
    const row = Math.floor(idx / cellsAlong) % rows;
    const stagger = (row % 2) * 0.5;
    const cellJitter = (rng.next() - 0.5) * 0.08;
    const u = (cell + 0.5 + stagger + cellJitter) / cellsAlong;
    const t = t0 + Math.pow(Math.max(0, Math.min(1, u)), inNear ? 0.85 : 1) * (t1 - t0);
    const tt = THREE.MathUtils.clamp(t, 0.004, 0.96);

    // Near gallery hugs the FOV cone; mid rows spread slightly wider.
    const latInner = inNear ? inner : inner + raceHalf * 0.02;
    const latOuter = inNear ? outer * 0.85 : outer;
    const latNorm = (row + rng.range(0.08, 0.9)) / rows;
    const lateral = side * (latInner + latNorm * Math.max(2, latOuter - latInner));

    path.sample(tt, _center);
    path.right(tt, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    const nudge = (rng.next() - 0.5) * (inNear ? 0.55 : 0.85);
    const x = _center.x + _right.x * (lateral + nudge);
    const z = _center.z + _right.z * (lateral + nudge);

    // Midfield furniture scale — readable in frustum, not a full lip wall.
    const scale =
      row === 0 ? 2.2 + rng.range(0, 1.1) : row === 1 ? 1.7 + rng.range(0, 0.95) : 1.3 + rng.range(0, 0.8);

    out.push({
      id: `inset-tree-${courseId}-${i}`,
      kind: 'tree',
      position: [x, _center.y, z],
      rotationY: rng.range(0, Math.PI * 2),
      variant: rng.int(0, 3),
      scale,
      recovery: true,
    });
  }

  return out;
}

/**
 * Rocks + mid-corridor banners/fences packed into path look-ahead so forward
 * chase (FOV ~48, look ~8–40 m) shows alpine/SSX midfield mass — not empty corduroy.
 */
function scatterAheadFrustumFill(
  courseId: CourseDef['id'],
  path: SplinePath,
  raceHalf: number,
  authored: readonly PropPlacement[],
  rng: SeededRng
): PropPlacement[] {
  if (courseId === 'summit') return [];

  const out: PropPlacement[] = [];
  const authoredRocks = authored.filter((p) => p.kind === 'rock').length;
  // High Lod rock budget is 48 — leave a couple slots for authored landmarks.
  const rockBudget = courseId === 'timberline' ? 40 : 46;
  const rockCount = Math.max(0, rockBudget - authoredRocks);
  // Inside FOV cone at 8–40 m (alpine half-width ~9–18 m); clear dead-center lane.
  const rockInner = raceHalf * (courseId === 'timberline' ? 0.22 : 0.1);
  const rockOuter = raceHalf * (courseId === 'timberline' ? 0.62 : 0.42);
  // Front gallery owns start/carve frames; sparse tail after meadow.
  const rockDenseEnd = 0.4;
  const rockDense = Math.floor(rockCount * 0.9);

  for (let i = 0; i < rockCount; i++) {
    const inDense = i < rockDense;
    const u = inDense
      ? i / Math.max(1, rockDense - 1)
      : (i - rockDense) / Math.max(1, rockCount - rockDense - 1);
    const t = inDense
      ? 0.008 + Math.pow(u, 0.78) * (rockDenseEnd - 0.008)
      : rockDenseEnd + 0.03 + u * 0.45;
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2) % 4;
    const latNorm = (row + rng.range(0.08, 0.92)) / 4;
    const lateral = side * (rockInner + latNorm * (rockOuter - rockInner));

    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    const nudge = (rng.next() - 0.5) * 1.0;
    const x = _center.x + _right.x * (lateral + nudge);
    const z = _center.z + _right.z * (lateral + nudge);

    out.push({
      id: `frustum-rock-${courseId}-${i}`,
      kind: 'rock',
      position: [x, _center.y, z],
      rotationY: rng.range(0, Math.PI * 2),
      variant: rng.int(0, 3),
      // Larger near-row rocks sell midfield mass in stills.
      scale: 1.15 + rng.range(0, 1.55) + (row <= 1 ? 0.55 : 0),
      recovery: true,
    });
  }

  // Extra banners inside the strip — apron-edge banners alone miss near FOV.
  const midBannerCount = courseId === 'timberline' ? 22 : 32;
  const banInner = raceHalf * (courseId === 'timberline' ? 0.24 : 0.12);
  const banOuter = raceHalf * (courseId === 'timberline' ? 0.5 : 0.38);
  for (let i = 0; i < midBannerCount; i++) {
    const u = i / Math.max(1, midBannerCount - 1);
    const t = 0.01 + Math.pow(u, 0.65) * 0.42;
    const side = i % 2 === 0 ? 1 : -1;
    const lateral = side * (banInner + rng.range(0, banOuter - banInner));
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    const yaw = Math.atan2(_tan.x, _tan.z) + (side > 0 ? -0.2 : 0.2);
    out.push({
      id: `frustum-banner-${courseId}-${i}`,
      kind: 'banner',
      position: [x, _center.y, z],
      rotationY: yaw,
      label: BANNER_LABELS[i % BANNER_LABELS.length],
      recovery: true,
    });
  }

  // Mid-corridor fence segments — race-tunnel language in the 8–40 m look-ahead.
  const midFenceCount = courseId === 'timberline' ? 28 : 40;
  const fenceInner = raceHalf * (courseId === 'timberline' ? 0.3 : 0.16);
  const fenceOuter = raceHalf * (courseId === 'timberline' ? 0.55 : 0.4);
  for (let i = 0; i < midFenceCount; i++) {
    const u = i / Math.max(1, midFenceCount - 1);
    const t = 0.01 + Math.pow(u, 0.7) * 0.4;
    const side = i % 2 === 0 ? -1 : 1;
    const lateral = side * (fenceInner + rng.range(0, fenceOuter - fenceInner));
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    const yaw = Math.atan2(_tan.x, _tan.z) + Math.PI * 0.5;
    out.push({
      id: `frustum-fence-${courseId}-${i}`,
      kind: 'fence',
      position: [x, _center.y, z],
      rotationY: yaw,
      length: 5.5 + rng.range(0, 4.5),
      recovery: true,
    });
  }

  return out;
}

function scatterForestBelt(
  courseId: CourseDef['id'],
  path: SplinePath,
  raceHalf: number,
  apron: number,
  slots: number,
  rng: SeededRng
): PropPlacement[] {
  if (slots === 0) return [];

  // Near-solid canopy wall hugging the corridor lip — pull into first ~40% of path.
  // Keep corridor clear (tests: minDist >= raceHalf * 0.85).
  const inner =
    courseId === 'timberline'
      ? raceHalf + 0.12
      : courseId === 'summit'
        ? raceHalf + 2.4
        : raceHalf + 0.08;
  // Shallow multi-row depth: mass stays in chase FOV, not amphitheater loners.
  const beltDepth =
    courseId === 'summit'
      ? Math.min(apron * 0.18, 22)
      : courseId === 'timberline'
        ? Math.min(apron * 0.18, 18)
        : Math.min(apron * 0.14, 16);
  const outer = inner + beltDepth;
  // Few deep rows → short along-path pitch (solid timberline, not dotted cones).
  const rows = courseId === 'summit' ? 2 : 3;
  // Solid lip packing in chase gallery — keep short pitch for canopy wall.
  // Closer lip (inner) + inset/furniture fill the ahead FOV for harsh B8.
  const denseEnd = courseId === 'summit' ? 0.48 : 0.2;
  const denseFrac = courseId === 'summit' ? 0.55 : 0.97;
  const denseSlots = Math.floor(slots * denseFrac);
  const out: PropPlacement[] = [];

  for (let i = 0; i < slots; i++) {
    const inDense = i < denseSlots;
    const local = inDense ? i : i - denseSlots;
    const localCount = inDense ? denseSlots : Math.max(1, slots - denseSlots);
    // Sparse tail starts past chase frames so it cannot open gallery gaps.
    const t0 = inDense ? 0.006 : Math.max(denseEnd + 0.12, 0.32);
    const t1 = inDense ? denseEnd : 0.97;

    const side = local % 2 === 0 ? -1 : 1;
    const idx = Math.floor(local / 2);
    const perSide = Math.max(1, Math.ceil(localCount / 2));
    const cellsAlong = Math.max(1, Math.ceil(perSide / rows));
    // Even row fill (not power-biased) so every cell gets a lip + understory stack.
    const cell = idx % cellsAlong;
    const row = Math.floor(idx / cellsAlong) % rows;
    // Hex stagger locks canopies; tiny jitter only — gaps read as FAIL.
    const stagger = (row % 2) * 0.5;
    const cellJitter = (rng.next() - 0.5) * (inDense ? 0.06 : 0.18);
    const u = (cell + 0.5 + stagger + cellJitter) / cellsAlong;
    const t = t0 + u * (t1 - t0);
    const tt = THREE.MathUtils.clamp(t, 0.005, 0.985);

    // Tight row bands hugging the race lip for a continuous midfield wall.
    const rowJitter = rng.range(0.15, 0.7);
    const latNorm = (row + rowJitter) / rows;
    const lateral = side * (inner + latNorm * Math.max(2.0, outer - inner));

    path.sample(tt, _center);
    path.right(tt, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    // Micro nudge only — keep trunks from perfect grid without opening snow gaps.
    const nudge = (rng.next() - 0.5) * (courseId === 'timberline' ? 0.45 : 0.55);
    const x = _center.x + _right.x * (lateral + nudge);
    const z = _center.z + _right.z * (lateral + nudge);
    const y = _center.y; // snapPropsToTerrain raycasts to bed

    // Overlapping Kenney scales: lip trees loom; rear row still large enough to seal gaps.
    const lip = row === 0;
    const mid = row === 1;
    const scale = lip
      ? 2.5 + rng.range(0, 1.4) // 2.5–3.9 solid wall
      : mid
        ? 1.9 + rng.range(0, 1.1) // 1.9–3.0
        : 1.35 + rng.range(0, 0.9); // 1.35–2.25 understory seal
    const far = Math.abs(lateral) > raceHalf + 16;

    out.push({
      id: `belt-tree-${courseId}-${i}`,
      kind: 'tree',
      position: [x, y, z],
      rotationY: rng.range(0, Math.PI * 2),
      // Mix Kenney variants for silhouette variety without thinning count.
      variant: rng.int(0, 3),
      scale,
      recovery: far || courseId === 'alpine' || lip || mid,
    });
  }

  return out;
}

function scatterCourseFurniture(
  courseId: CourseDef['id'],
  path: SplinePath,
  raceHalf: number,
  authored: readonly PropPlacement[],
  rng: SeededRng
): PropPlacement[] {
  if (courseId === 'summit') return [];
  if (authored.some((p) => p.kind === 'banner' || p.kind === 'fence')) {
    // Authored furniture present — still add procedural fill for race-banner density.
  }

  const out: PropPlacement[] = [];
  // Pull apron-edge furniture tighter to the lip so it reads in forward chase.
  const edge = raceHalf + 0.55;
  // Race-tunnel language: banners dense in chase midfield, fences along both flanks.
  const bannerCount = courseId === 'timberline' ? 28 : 28;
  const fenceCount = courseId === 'timberline' ? 44 : 48;

  for (let i = 0; i < bannerCount; i++) {
    // Front-bias banners into forest / course_start frames.
    const u = i / Math.max(1, bannerCount - 1);
    const t = 0.02 + Math.pow(u, 0.68) * 0.88;
    const side = i % 2 === 0 ? -1 : 1;
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const lateral = side * (edge + rng.range(0, 0.9));
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    const yaw = Math.atan2(_tan.x, _tan.z) + (side > 0 ? -0.15 : 0.15);
    out.push({
      id: `belt-banner-${courseId}-${i}`,
      kind: 'banner',
      position: [x, _center.y, z],
      rotationY: yaw,
      label: BANNER_LABELS[i % BANNER_LABELS.length],
      recovery: true,
    });
  }

  for (let i = 0; i < fenceCount; i++) {
    const u = i / Math.max(1, fenceCount - 1);
    // Pack more fence mass into the first ~40% look-ahead.
    const t = 0.015 + Math.pow(u, 0.75) * 0.9;
    const side = i % 2 === 0 ? 1 : -1;
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const lateral = side * (edge + 0.15 + (i % 3) * 0.1);
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    const yaw = Math.atan2(_tan.x, _tan.z) + Math.PI * 0.5;
    out.push({
      id: `belt-fence-${courseId}-${i}`,
      kind: 'fence',
      position: [x, _center.y, z],
      rotationY: yaw,
      length: 7 + rng.range(0, 5),
      recovery: true,
    });
  }

  return out;
}
