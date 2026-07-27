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
  summit: 0.35,
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
 * Corridor center stays clear — plant on flanks only.
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

  const trees = scatterForestBelt(def.id, path, raceHalf, apron, options.maxTreeInstances, authored, rng);
  const furniture =
    options.furniture === false
      ? []
      : scatterCourseFurniture(def.id, path, raceHalf, authored, rng);

  return [...authored, ...trees, ...furniture];
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

function scatterForestBelt(
  courseId: CourseDef['id'],
  path: SplinePath,
  raceHalf: number,
  apron: number,
  maxTrees: number,
  authored: readonly PropPlacement[],
  rng: SeededRng
): PropPlacement[] {
  const fill = FOREST_FILL[courseId] ?? 0.6;
  const target = Math.max(0, Math.floor(maxTrees * fill));
  const existing = authored.filter((p) => p.kind === 'tree').length;
  const slots = Math.max(0, target - existing);
  if (slots === 0) return [];

  // Dense multi-row apron wall — hug the race strip; do not spray loners across powder.
  const inner = raceHalf + (courseId === 'timberline' ? 3.2 : courseId === 'summit' ? 5 : 4.5);
  const beltDepth =
    courseId === 'summit'
      ? Math.min(apron * 0.28, 30)
      : courseId === 'timberline'
        ? Math.min(apron * 0.3, 34)
        : Math.min(apron * 0.34, 48);
  const outer = inner + beltDepth;
  const rows = courseId === 'summit' ? 2 : courseId === 'timberline' ? 5 : 4;
  // Front-weighted gallery so course_start / forest chase frames read as a belt.
  const denseEnd = courseId === 'summit' ? 0.55 : 0.62;
  const denseFrac = courseId === 'summit' ? 0.55 : 0.78;
  const denseSlots = Math.floor(slots * denseFrac);
  const out: PropPlacement[] = [];

  for (let i = 0; i < slots; i++) {
    const inDense = i < denseSlots;
    const local = inDense ? i : i - denseSlots;
    const localCount = inDense ? denseSlots : Math.max(1, slots - denseSlots);
    const t0 = inDense ? 0.03 : denseEnd;
    const t1 = inDense ? denseEnd : 0.97;
    // Stratified clumps: several trees share a path cell → wall read, not loners.
    const clumpSize = courseId === 'summit' ? 2 : 3;
    const clump = Math.floor(local / clumpSize);
    const clumpCount = Math.max(1, Math.ceil(localCount / clumpSize));
    const stratum = (clump + 0.5) / clumpCount;
    const t =
      t0 +
      stratum * (t1 - t0) +
      (rng.next() - 0.5) * 0.01 +
      ((local % clumpSize) - (clumpSize - 1) * 0.5) * 0.0035;
    const tt = THREE.MathUtils.clamp(t, 0.02, 0.98);
    const side = local % 2 === 0 ? -1 : 1;
    const row = Math.floor(local / 2) % rows;
    const rowJitter = rng.range(0.08, 0.92);
    const latNorm = Math.pow((row + rowJitter) / rows, courseId === 'timberline' ? 0.75 : 0.82);
    const lateral = side * (inner + latNorm * Math.max(3, outer - inner));

    path.sample(tt, _center);
    path.right(tt, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    const y = _center.y; // snapPropsToTerrain raycasts to bed
    const scale = 0.68 + rng.range(0, 0.62);
    const far = Math.abs(lateral) > raceHalf + 14;

    out.push({
      id: `belt-tree-${courseId}-${i}`,
      kind: 'tree',
      position: [x, y, z],
      rotationY: rng.range(0, Math.PI * 2),
      variant: rng.int(0, 3),
      scale,
      recovery: far || courseId === 'alpine',
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
  const edge = raceHalf + 1.6;
  // Race-tunnel language: banners + fence runs along both flanks (not a handful).
  const bannerCount = courseId === 'timberline' ? 18 : 16;
  const fenceCount = courseId === 'timberline' ? 36 : 32;

  for (let i = 0; i < bannerCount; i++) {
    const t = 0.06 + (i / Math.max(1, bannerCount - 1)) * 0.86;
    const side = i % 2 === 0 ? -1 : 1;
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const lateral = side * (edge + rng.range(0, 1.4));
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
    const t = 0.04 + (i / Math.max(1, fenceCount - 1)) * 0.9;
    const side = i % 2 === 0 ? 1 : -1;
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const lateral = side * (edge + 0.35 + (i % 3) * 0.15);
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
