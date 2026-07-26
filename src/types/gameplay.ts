/**
 * Gameplay contracts shared by rider, world, VFX and audio modules.
 */

import type * as THREE from 'three';

/** Snow surface and obstacle classification for board physics and feedback. */
export type SurfaceKind = 'powder' | 'packed' | 'ice' | 'rail' | 'wood' | 'rock';

export type CourseId = 'alpine' | 'timberline' | 'summit';
export type GameModeId = 'freeride' | 'time_trial' | 'trick_attack' | 'free' | 'time' | 'score';
export type Medal = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

/** Authoring spawn pose (tuple position for course defs). */
export interface SpawnPose {
  position: [number, number, number];
  yaw: number;
  pitch?: number;
}

/** Per-surface response used by board physics and spray VFX. */
export interface SurfaceProfile {
  kind: SurfaceKind;
  /** Longitudinal drag multiplier relative to packed snow. */
  drag: number;
  /** Lateral grip multiplier relative to packed snow. */
  grip: number;
  /** Spray intensity multiplier when carving, in [0,1]. */
  spray: number;
}

export const SURFACE_PROFILES: Readonly<Record<SurfaceKind, SurfaceProfile>> = {
  powder: { kind: 'powder', drag: 1.35, grip: 0.72, spray: 1.0 },
  packed: { kind: 'packed', drag: 1.0, grip: 1.0, spray: 0.55 },
  ice: { kind: 'ice', drag: 0.82, grip: 0.28, spray: 0.15 },
  rail: { kind: 'rail', drag: 0.95, grip: 0.05, spray: 0.05 },
  wood: { kind: 'wood', drag: 1.05, grip: 0.85, spray: 0.2 },
  rock: { kind: 'rock', drag: 1.2, grip: 0.4, spray: 0.35 },
} as const;

/** Spawn pose for the rider at run start or respawn. */
export interface RiderSpawn {
  position: THREE.Vector3;
  /** Facing angle around world Y, in radians. */
  yaw: number;
  /** Optional pitch for staged jumps or half-pipe starts. */
  pitch?: number;
}

/** Quality of a landing, used for trick scoring and crash resolution. */
export type LandingGrade = 'perfect' | 'good' | 'sketchy' | 'bail';

export interface LandingResult {
  grade: LandingGrade;
  /** Dot product between board up and ground normal, in [-1,1]. */
  alignment: number;
  /** Downward impact speed at contact, m/s. */
  impactSpeed: number;
  /** Horizontal speed retained after landing, m/s. */
  speed: number;
  surface: SurfaceKind;
}

export type GrabKind = 'indy' | 'mute' | 'melon' | 'method';

/** Alias used by UI/events; identical to `GrabKind`. */
export type GrabType = GrabKind;

export interface TrickResult {
  /** Human-readable trick name, e.g. "540 Mute". */
  name: string;
  score: number;
  /** Signed spin amount in degrees (positive = left / counter-clockwise from above). */
  spinDegrees: number;
  /** Signed flip amount in degrees (positive = front flip). */
  flipDegrees: number;
  grab: GrabKind | null;
  landing: LandingGrade;
  /** True when multiple distinct elements were combined in one air. */
  combo: boolean;
}

/** Published rider state for camera, HUD and animation. */
export interface RiderState {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly speed: number;
  readonly grounded: boolean;
  readonly airborne: boolean;
  readonly grinding: boolean;
  readonly crashed: boolean;
  readonly boardYaw: number;
  readonly boardPitch: number;
  readonly boardRoll: number;
  readonly lean: number;
  readonly edgeAngle: number;
  readonly surfaceKind: SurfaceKind;
  readonly boostMeter: number;
  readonly recoveryRemaining: number;
}
