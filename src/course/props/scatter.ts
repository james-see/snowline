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

  // Near-solid canopy wall on both corridor lips — visual continuity over skyline spray.
  // Keep corridor clear (tests: minDist >= raceHalf * 0.85).
  const inner =
    courseId === 'timberline'
      ? raceHalf + 0.3
      : courseId === 'summit'
        ? raceHalf + 3.0
        : raceHalf + 0.4;
  // Shallow multi-row depth: mass stays in chase FOV, not amphitheater loners.
  const beltDepth =
    courseId === 'summit'
      ? Math.min(apron * 0.18, 22)
      : courseId === 'timberline'
        ? Math.min(apron * 0.2, 22)
        : Math.min(apron * 0.18, 24);
  const outer = inner + beltDepth;
  // Few deep rows → short along-path pitch (solid timberline, not dotted cones).
  const rows = courseId === 'summit' ? 2 : 3;
  // Chase gallery owns nearly the whole budget (forest / carve / course_start).
  const denseEnd = courseId === 'summit' ? 0.48 : 0.2;
  const denseFrac = courseId === 'summit' ? 0.55 : 0.97;
  const denseSlots = Math.floor(slots * denseFrac);
  const out: PropPlacement[] = [];

  for (let i = 0; i < slots; i++) {
    const inDense = i < denseSlots;
    const local = inDense ? i : i - denseSlots;
    const localCount = inDense ? denseSlots : Math.max(1, slots - denseSlots);
    // Sparse tail starts past chase frames so it cannot open gallery gaps.
    const t0 = inDense ? 0.012 : Math.max(denseEnd + 0.12, 0.32);
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
    const cellJitter = (rng.next() - 0.5) * (inDense ? 0.08 : 0.2);
    const t = t0 + ((cell + 0.5 + stagger + cellJitter) / cellsAlong) * (t1 - t0);
    const tt = THREE.MathUtils.clamp(t, 0.01, 0.985);

    // Tight row bands hugging the race lip for a continuous midfield wall.
    const rowJitter = rng.range(0.2, 0.75);
    const latNorm = (row + rowJitter) / rows;
    const lateral = side * (inner + latNorm * Math.max(2.5, outer - inner));

    path.sample(tt, _center);
    path.right(tt, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    // Micro nudge only — keep trunks from perfect grid without opening snow gaps.
    const nudge = (rng.next() - 0.5) * (courseId === 'timberline' ? 0.55 : 0.7);
    const x = _center.x + _right.x * (lateral + nudge);
    const z = _center.z + _right.z * (lateral + nudge);
    const y = _center.y; // snapPropsToTerrain raycasts to bed

    // Overlapping Kenney scales: lip trees loom; rear row still large enough to seal gaps.
    const lip = row === 0;
    const mid = row === 1;
    const scale = lip
      ? 2.4 + rng.range(0, 1.4) // 2.4–3.8 solid wall
      : mid
        ? 1.8 + rng.range(0, 1.1) // 1.8–2.9
        : 1.3 + rng.range(0, 0.9); // 1.3–2.2 understory seal
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
