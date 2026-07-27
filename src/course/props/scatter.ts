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

  // Timberline hugs the chute; alpine spreads into wide powder flanks.
  const inner = raceHalf + (courseId === 'timberline' ? 4.5 : 7);
  const outer = raceHalf + apron * (courseId === 'summit' ? 0.45 : 0.82);
  const out: PropPlacement[] = [];

  for (let i = 0; i < slots; i++) {
    const t = rng.range(0.03, 0.97);
    const side = rng.next() < 0.5 ? -1 : 1;
    // Bias density toward the corridor wall (forest edge read).
    const latNorm = Math.pow(rng.next(), courseId === 'timberline' ? 0.55 : 0.7);
    const lateral = side * (inner + latNorm * Math.max(4, outer - inner));
    const jitterT = (rng.next() - 0.5) * 0.008;
    const tt = THREE.MathUtils.clamp(t + jitterT, 0.02, 0.98);

    path.sample(tt, _center);
    path.right(tt, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    const y = _center.y; // snapPropsToTerrain raycasts to bed
    const scale = 0.72 + rng.range(0, 0.55);
    const far = Math.abs(lateral) > raceHalf + 12;

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
    // Authored furniture present — still add light procedural fill for density language.
  }

  const out: PropPlacement[] = [];
  const edge = raceHalf + 1.8;
  const bannerCount = courseId === 'timberline' ? 6 : 5;
  const fenceCount = courseId === 'timberline' ? 14 : 12;

  for (let i = 0; i < bannerCount; i++) {
    const t = 0.1 + (i / Math.max(1, bannerCount - 1)) * 0.78;
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
    const t = 0.06 + (i / Math.max(1, fenceCount - 1)) * 0.86;
    const side = i % 2 === 0 ? 1 : -1;
    path.sample(t, _center);
    path.right(t, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    path.tangent(t, _tan);
    const lateral = side * (edge + 0.4);
    const x = _center.x + _right.x * lateral;
    const z = _center.z + _right.z * lateral;
    const yaw = Math.atan2(_tan.x, _tan.z) + Math.PI * 0.5;
    out.push({
      id: `belt-fence-${courseId}-${i}`,
      kind: 'fence',
      position: [x, _center.y, z],
      rotationY: yaw,
      length: 8 + rng.range(0, 4),
      recovery: true,
    });
  }

  return out;
}
