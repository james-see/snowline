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
 */
export function expandCourseProps(
  def: Pick<CourseDef, 'id' | 'seed' | 'terrain' | 'props'>,
  path: SplinePath,
  options: ExpandPropsOptions
): PropPlacement[] {
  const authored = [...def.props];
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

  // Hug the race lip so canopies fill chase midfield — not amphitheater skyline loners.
  // Keep corridor clear (tests: minDist >= raceHalf * 0.85).
  const inner =
    courseId === 'timberline'
      ? raceHalf + 0.45
      : courseId === 'summit'
        ? raceHalf + 3.5
        : raceHalf + 0.6;
  // Shallow belt: pack overlapping rows beside the strip before foothill rise.
  const beltDepth =
    courseId === 'summit'
      ? Math.min(apron * 0.2, 24)
      : courseId === 'timberline'
        ? Math.min(apron * 0.16, 16)
        : Math.min(apron * 0.14, 18);
  const outer = inner + beltDepth;
  // Hard front-weight: forest / course_start chase frames own most of the budget.
  const denseEnd = courseId === 'summit' ? 0.5 : 0.48;
  const denseFrac = courseId === 'summit' ? 0.6 : 0.9;
  const denseSlots = Math.floor(slots * denseFrac);
  // latPow > 1 → mass near inner lip (pow < 1 sprayed outward — lonely skyline cones).
  const latPow = courseId === 'timberline' ? 2.15 : courseId === 'summit' ? 1.35 : 1.95;
  const out: PropPlacement[] = [];

  for (let i = 0; i < slots; i++) {
    const inDense = i < denseSlots;
    const local = inDense ? i : i - denseSlots;
    const localCount = inDense ? denseSlots : Math.max(1, slots - denseSlots);
    const t0 = inDense ? 0.02 : denseEnd;
    const t1 = inDense ? denseEnd : 0.97;
    // Tight clumps → overlapping canopies (timberline wall, not loner cones).
    const clumpSize = courseId === 'summit' ? 3 : 5;
    const clump = Math.floor(local / clumpSize);
    const clumpCount = Math.max(1, Math.ceil(localCount / clumpSize));
    const stratum = (clump + 0.5) / clumpCount;
    const inClump = local % clumpSize;
    const t =
      t0 +
      stratum * (t1 - t0) +
      (rng.next() - 0.5) * 0.012 +
      (inClump - (clumpSize - 1) * 0.5) * 0.0045;
    const tt = THREE.MathUtils.clamp(t, 0.015, 0.985);
    const side = local % 2 === 0 ? -1 : 1;
    // Stratified + power bias: most instances hug the race lip for midfield fill.
    const u = (local * 0.6180339887) % 1;
    const latNorm = Math.pow(u, latPow);
    // Clump mates offset along-path more than lateral — canopy overlap, corridor safe.
    const clumpLat = (inClump - (clumpSize - 1) * 0.5) * (courseId === 'timberline' ? 0.55 : 0.7);
    const lateral = side * (inner + latNorm * Math.max(2.5, outer - inner) + clumpLat);

    path.sample(tt, _center);
    path.right(tt, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    const y = _center.y; // snapPropsToTerrain raycasts to bed

    // Scale variety: near wall taller / mid understory shorter → depth + overlap read.
    const nearLip = Math.abs(lateral) < raceHalf + 8;
    const scale = nearLip
      ? 0.85 + rng.range(0, 0.95) // 0.85–1.8 looming midfield
      : 0.55 + rng.range(0, 0.7); // 0.55–1.25 understory / far
    const far = Math.abs(lateral) > raceHalf + 12;

    out.push({
      id: `belt-tree-${courseId}-${i}`,
      kind: 'tree',
      position: [x, y, z],
      rotationY: rng.range(0, Math.PI * 2),
      variant: rng.int(0, 3),
      scale,
      recovery: far || courseId === 'alpine' || nearLip,
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
  const edge = raceHalf + 1.35;
  // Race-tunnel language: banners dense in chase midfield, fences along both flanks.
  const bannerCount = courseId === 'timberline' ? 28 : 24;
  const fenceCount = courseId === 'timberline' ? 44 : 40;

  for (let i = 0; i < bannerCount; i++) {
    // Front-bias banners into forest / course_start frames.
    const u = i / Math.max(1, bannerCount - 1);
    const t = 0.04 + Math.pow(u, 0.72) * 0.88;
    const side = i % 2 === 0 ? -1 : 1;
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const lateral = side * (edge + rng.range(0, 1.2));
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
    const t = 0.03 + (i / Math.max(1, fenceCount - 1)) * 0.9;
    const side = i % 2 === 0 ? 1 : -1;
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const lateral = side * (edge + 0.25 + (i % 3) * 0.12);
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
