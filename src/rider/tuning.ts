/**
 * Rider and board tuning.
 *
 * Values target arcade snowboarding: instant carve response, readable air
 * tricks, and forgiving landings at moderate speeds with hard crashes only
 * on big misalignment or high impact.
 */

/** World gravity magnitude, m/s². Applied along the world -Y axis. */
export const GRAVITY = 24;

/** Horizontal speed caps, m/s. */
export const SPEED = {
  max: 42,
  boostMax: 58,
  /** Below this, steering authority is reduced so idle shuffling feels heavy. */
  minSteer: 3.5,
  /** Brake bleeds speed at this constant rate, m/s². */
  brakeDecel: 18,
} as const;

/** Longitudinal and lateral acceleration on snow, m/s². */
export const ACCEL = {
  /** Downhill gravity projection scale while grounded. */
  slopeGravity: 1.05,
  /** Forward push from pumping / natural roll on packed snow. */
  coast: 2.4,
  /** Extra downhill push while boosting. */
  boost: 14,
  /** Air drag along velocity, 1/s. */
  airDrag: 0.35,
} as const;

/** Carve and edge behaviour. */
export const CARVE = {
  /** How quickly lean reaches its target, 1/s. */
  leanRate: 9,
  /** Maximum lean input magnitude. */
  maxLean: 1,
  /** Edge angle per unit lean, radians. */
  edgePerLean: 0.62,
  /** Yaw rate from lean × speed, rad/(s·m/s). */
  steerRate: 0.055,
  /** Extra yaw when actively steering with stick/keys, rad/s. */
  steerInputRate: 1.85,
  /** Lateral grip from edge angle on packed snow, 1/s. */
  baseGrip: 14,
  /** How much lateral velocity bleeds when not on edge. */
  flatSlideGrip: 4.5,
  /** Minimum speed before carve spray is emitted. */
  sprayMinSpeed: 8,
  /** Edge angle threshold for full spray intensity. */
  sprayEdgeThreshold: 0.35,
} as const;

/** Per-surface friction multipliers applied to longitudinal drag and lateral grip. */
export const SURFACE = {
  powder: { drag: 1.35, grip: 0.72, spray: 1.0 },
  packed: { drag: 1.0, grip: 1.0, spray: 0.55 },
  ice: { drag: 0.82, grip: 0.28, spray: 0.15 },
  rail: { drag: 0.95, grip: 0.05, spray: 0.05 },
  wood: { drag: 1.05, grip: 0.85, spray: 0.2 },
  rock: { drag: 1.2, grip: 0.4, spray: 0.35 },
} as const;

/** Jump and ground contact. */
export const JUMP = {
  /** Base vertical impulse, m/s. */
  impulse: 7.2,
  /** Extra impulse from a brief pre-load (anticipation), m/s. */
  anticipationBonus: 1.6,
  /** Seconds jump input is remembered after leaving a lip. */
  buffer: 0.14,
  /** Seconds after leaving ground where a jump still registers. */
  coyote: 0.1,
  /** Downward ray length for ground sensing, m. */
  rayLength: 2.4,
  /** Distance from ray hit to count as grounded, m. */
  groundEpsilon: 0.22,
  /** Snap the board down toward the surface when grounded, m/s. */
  groundStick: 4.5,
  /** Board half-length for ray offsets, m. */
  boardHalfLength: 0.78,
  /** Board half-width for edge roll, m. */
  boardHalfWidth: 0.11,
} as const;

/** Air rotation limits, rad/s. */
export const AIR = {
  spinRate: 7.5,
  flipRate: 6.8,
  /** Pitch clamp while inverted, radians from level. */
  maxPitch: Math.PI * 1.35,
  /** Roll from edge carry into air, rad/s per rad of edge angle. */
  edgeRollCarry: 0.8,
  /** Align board slightly toward velocity while airborne. */
  velocityAlignRate: 1.2,
} as const;

/** Landing thresholds. */
export const LANDING = {
  /** Impact speed below this always counts as perfect alignment permitting. */
  softImpact: 6,
  /** Impact speed above this is a hard crash regardless of alignment. */
  hardImpact: 18,
  /** Alignment dot product above this is perfect. */
  perfectAlign: 0.92,
  /** Alignment above this is good. */
  goodAlign: 0.78,
  /** Alignment above this is sketchy; below is bail. */
  sketchyAlign: 0.55,
  /** Speed retained after a perfect landing, fraction in [0,1]. */
  perfectSpeedKeep: 0.98,
  goodSpeedKeep: 0.9,
  sketchySpeedKeep: 0.72,
  /** Speed multiplier applied after a bail before crash state. */
  bailSpeedKeep: 0.35,
} as const;

/** Crash and recovery. */
export const CRASH = {
  /** Seconds before control returns after a crash. */
  recoveryTime: 1.35,
  /** Horizontal speed after recovery, m/s. */
  recoverySpeed: 6,
} as const;

/** Boost meter behaviour. */
export const BOOST = {
  maxMeter: 1,
  /** Drain rate while boosting, 1/s. */
  drainRate: 0.42,
  /** Recharge rate on ground when not boosting, 1/s. */
  rechargeRate: 0.18,
  /** Minimum meter required to start boosting. */
  minToUse: 0.08,
} as const;

/** Grind stub tuning. */
export const GRIND = {
  /** Distance to rail surface to latch, m. */
  latchDistance: 0.35,
  /** Speed along rail while grinding, m/s. */
  railSpeed: 16,
  /** Downward stick onto rail, m/s. */
  stickDown: 2.5,
} as const;

/** Board collider half-extents written to the kinematic body, metres. */
export const BOARD_COLLIDER = {
  x: 0.11,
  y: 0.04,
  z: 0.78,
} as const;

/** Kinematic body collision group membership (reserved for physics backend). */
export const BOARD_GROUPS = 1 << 1;
