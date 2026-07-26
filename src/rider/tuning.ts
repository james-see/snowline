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
  minSteer: 3.2,
  /** Brake bleeds speed at this constant rate, m/s². */
  brakeDecel: 24,
} as const;

/** Longitudinal and lateral acceleration on snow, m/s². */
export const ACCEL = {
  /** Downhill gravity projection scale while grounded. */
  slopeGravity: 1.12,
  /** Forward push from pumping / natural roll on packed snow. */
  coast: 2.6,
  /** Extra downhill push while boosting. */
  boost: 17,
  /** Air drag along velocity, 1/s. */
  airDrag: 0.35,
} as const;

/** Carve and edge behaviour. */
export const CARVE = {
  /** How quickly lean reaches its target, 1/s. */
  leanRate: 12,
  /** Maximum lean input magnitude. */
  maxLean: 1,
  /** Edge angle per unit lean, radians. */
  edgePerLean: 0.7,
  /** Yaw rate from lean × speed, rad/(s·m/s). */
  steerRate: 0.072,
  /** Extra yaw when actively steering with stick/keys, rad/s. */
  steerInputRate: 2.25,
  /** Lateral grip at full edge on packed snow, 1/s. */
  baseGrip: 18,
  /** Lateral grip when flat / low edge — allows readable slides. */
  flatSlideGrip: 3.2,
  /** Minimum speed before carve spray is emitted. */
  sprayMinSpeed: 7.5,
  /** Edge angle threshold for full spray intensity. */
  sprayEdgeThreshold: 0.32,
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
  buffer: 0.16,
  /** Seconds after leaving ground where a jump still registers. */
  coyote: 0.12,
  /** Downward ray length for ground sensing, m. */
  rayLength: 3.2,
  /**
   * Rays start this far above the board origin so trimesh contact just under
   * the board still registers (and we clear numeric penetration).
   */
  rayLift: 0.4,
  /**
   * Contact band below the board after subtracting `rayLift`. A hit with
   * `distance <= rayLift + groundEpsilon` counts as near-ground.
   */
  groundEpsilon: 0.32,
  /** Minimum near-ground ray hits required when the center probe misses. */
  groundMinHits: 2,
  /** Preferred ride height above the hit surface, m. */
  rideHeight: 0.05,
  /** Snap the board down toward the surface when grounded, m/s. */
  groundStick: 6,
  /** Board half-length for ray offsets, m. */
  boardHalfLength: 0.78,
  /** Board half-width for lateral ray offsets, m. */
  boardHalfWidth: 0.14,
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

/**
 * Off-mesh / void freefall recovery.
 * When board rays miss trimesh (holes, map edge), soft powder wallow then
 * restore toward the last grounded pose instead of falling forever.
 */
export const VOID = {
  /** Airborne with zero terrain hits longer than this triggers recovery, s. */
  freefallTime: 1.75,
  /** Drop this far below last grounded Y to trigger, m. */
  maxDrop: 14,
  /** Absolute world kill-plane Y. */
  killPlaneY: -48,
  /** Soft powder wallow before hard restore, s. */
  wallowTime: 0.85,
  /** Pull toward last grounded pose during wallow, 1/s. */
  pullRate: 3.2,
  /** Extra velocity damping while wallowing (deep powder), 1/s. */
  powderDrag: 5.8,
  /** Mild sink during early wallow for arcade “deep powder” feel, m/s. */
  sinkRate: 1.8,
  /** Brief control lock after wallow snap, s. */
  recoverStun: 0.55,
} as const;

/** Boost meter behaviour. */
export const BOOST = {
  maxMeter: 1,
  /** Drain rate while boosting, 1/s. */
  drainRate: 0.36,
  /** Recharge rate on ground when not boosting, 1/s. */
  rechargeRate: 0.24,
  /** Minimum meter required to start boosting. */
  minToUse: 0.05,
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
