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

  // Continuous multi-row timberline — not a single lip of spaced cones.
  // Keep corridor clear (tests: minDist >= raceHalf * 0.85).
  const inner =
    courseId === 'timberline'
      ? raceHalf + 0.35
      : courseId === 'summit'
        ? raceHalf + 3.2
        : raceHalf + 0.45;
  // Deeper rows so canopies stack into a belt in chase midfield (not a lip dotted line).
  const beltDepth =
    courseId === 'summit'
      ? Math.min(apron * 0.22, 26)
      : courseId === 'timberline'
        ? Math.min(apron * 0.26, 30)
        : Math.min(apron * 0.22, 30);
  const outer = inner + beltDepth;
  // Fewer rows than a spray → tighter along-path pitch for continuous canopy.
  const rows = courseId === 'summit' ? 3 : courseId === 'timberline' ? 4 : 4;
  // Short front gallery: forest + carve / course_start own the budget (capture warmups stay near start).
  const denseEnd = courseId === 'summit' ? 0.5 : 0.36;
  const denseFrac = courseId === 'summit' ? 0.62 : 0.94;
  const denseSlots = Math.floor(slots * denseFrac);
  const out: PropPlacement[] = [];

  for (let i = 0; i < slots; i++) {
    const inDense = i < denseSlots;
    const local = inDense ? i : i - denseSlots;
    const localCount = inDense ? denseSlots : Math.max(1, slots - denseSlots);
    const t0 = inDense ? 0.015 : denseEnd;
    const t1 = inDense ? denseEnd : 0.97;

    // Grid pack: side × cell along path × lip-weighted row → continuous belt.
    const lane = Math.floor(local / 2); // index within one flank
    const side = local % 2 === 0 ? -1 : 1;
    const cellsAlong = Math.max(1, Math.ceil(localCount / (2 * rows)));
    const cell = lane % cellsAlong;
    // Lip-weighted rows (still multi-row depth) — mass in chase FOV, not skyline.
    const rowU = (lane * 0.6180339887) % 1;
    const row = Math.min(rows - 1, Math.floor(Math.pow(rowU, 1.35) * rows));
    // Hex-ish stagger: odd rows shift half a cell so canopies interlock.
    const stagger = (row % 2) * 0.5;
    const cellJitter = (rng.next() - 0.5) * 0.18;
    const t =
      t0 + ((cell + 0.5 + stagger + cellJitter) / cellsAlong) * (t1 - t0);
    const tt = THREE.MathUtils.clamp(t, 0.012, 0.985);

    // Even row fill inside the shallow-deep belt for continuous canopy mass.
    const rowJitter = rng.range(0.15, 0.85);
    const latNorm = (row + rowJitter) / rows;
    const lateral = side * (inner + latNorm * Math.max(3, outer - inner));

    path.sample(tt, _center);
    path.right(tt, _right);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    // Micro lateral nudge so trunks don't grid-lock; keep canopy overlap.
    const nudge = (rng.next() - 0.5) * (courseId === 'timberline' ? 1.1 : 1.4);
    const x = _center.x + _right.x * (lateral + nudge);
    const z = _center.z + _right.z * (lateral + nudge);
    const y = _center.y; // snapPropsToTerrain raycasts to bed

    // Near rows loom large so canopies overlap; back rows understory for depth.
    const nearLip = row <= 1 || Math.abs(lateral) < raceHalf + 10;
    const scale = nearLip
      ? 1.2 + rng.range(0, 1.15) // 1.2–2.35 continuous midfield wall
      : 0.65 + rng.range(0, 0.85); // 0.65–1.5 understory
    const far = Math.abs(lateral) > raceHalf + 18;

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
