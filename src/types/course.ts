import type { CourseId, SpawnPose, SurfaceKind } from '@/types/gameplay.ts';

export type Difficulty = 'green' | 'blue' | 'black' | 'double-black';

export type PropKind =
  | 'rail'
  | 'ramp'
  | 'tree'
  | 'rock'
  | 'flag'
  | 'checkpoint_gate'
  | 'finish_arch'
  | 'tunnel';

export interface CoursePose extends SpawnPose {
  pitch?: number;
}

export interface CheckpointDef {
  id: string;
  name: string;
  /** Normalised distance along the run spline, in [0, 1]. */
  t: number;
  /** Lateral offset from centerline in metres (+ = rider's right). */
  lateral?: number;
  /** Gate span in metres. Wide gates are recovery-friendly. */
  width?: number;
}

export interface PropPlacement {
  id: string;
  kind: PropKind;
  position: [number, number, number];
  rotationY?: number;
  scale?: number | [number, number, number];
  surface?: SurfaceKind;
  variant?: number;
  /** Rail span along local X, in metres. */
  length?: number;
  /** Ramp lip height, in metres. */
  lip?: number;
  grindable?: boolean;
  /** Marks a forgiving bailout zone — props here stay off the main line. */
  recovery?: boolean;
}

export interface MedalThresholds {
  bronzeTime: number;
  silverTime: number;
  goldTime: number;
  platinumTime: number;
  bronzeScore: number;
  silverScore: number;
  goldScore: number;
  platinumScore: number;
}

export interface SurfaceRegionDef {
  center: [number, number, number];
  radius: number;
  kind: SurfaceKind;
}

/** Authoring knobs that drive terrain synthesis for a course. */
export interface TerrainProfile {
  /** Full width of the playable corridor at the start, in metres. */
  width: number;
  /** Vertical drop from spawn to finish, in metres. */
  drop: number;
  /** Grid resolution along the path (segments per 100 m). */
  pathSegmentsPer100m: number;
  /** Cross-slope grid cells per half-width. */
  lateralSegments: number;
  /** Base pitch of the fall line in degrees. */
  pitchDeg: number;
  /** 0 = groomed, 1 = full off-piste noise. */
  roughness: number;
  /** Optional halfpipe segment along t ∈ [start, end]. */
  halfpipe?: { startT: number; endT: number; depth: number; width: number };
  /** Optional canyon pinch for dramatic finishes. */
  canyon?: { startT: number; endT: number; depth: number };
}

export interface CourseDef {
  id: CourseId;
  name: string;
  description: string;
  seed: number;
  /** Approximate run length along the spline, in metres. */
  length: number;
  difficulty: Difficulty;
  spawn: CoursePose;
  checkpoints: CheckpointDef[];
  finish: CheckpointDef;
  props: PropPlacement[];
  surfaceRegions?: SurfaceRegionDef[];
  /** World-space control points. Y should decrease toward the finish. */
  controlPoints: [number, number, number][];
  terrain: TerrainProfile;
  medals: MedalThresholds;
}

export interface CourseProgress {
  courseId: CourseId | null;
  nextCheckpointIndex: number;
  checkpointsCleared: number;
  totalCheckpoints: number;
  finished: boolean;
  /** Seconds since resetRun(). */
  elapsed: number;
  /** Closest spline parameter for the rider, in [0, 1]. */
  pathT: number;
}

export interface TerrainHeightfield {
  nrows: number;
  ncols: number;
  /** Row-major heights; length = nrows * ncols. */
  heights: Float32Array;
  /** World size of one cell in X/Z. */
  cellSize: number;
  /** World-space origin of grid corner (min X, base Y, min Z). */
  origin: [number, number, number];
}

export interface TerrainBuildResult {
  mesh: import('three').Mesh;
  heightfield: TerrainHeightfield;
  /** Per-vertex surface kind index into `surfaceKinds`. */
  surfaceIndices: Uint8Array;
  surfaceKinds: SurfaceKind[];
}
