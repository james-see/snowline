/**
 * Standard Gamepad mapping helpers (W3C "standard" layout).
 * Pure functions — safe to unit-test without DOM / navigator.
 */

import type { InputAction } from '@/types/input.ts';

/** Axial / radial stick deadzone. */
export const GAMEPAD_DEADZONE = 0.18;
/** Analog trigger press threshold. */
export const GAMEPAD_TRIGGER = 0.3;
/** Right-stick look sensitivity (radians-ish per frame at full deflect). */
export const GAMEPAD_LOOK_X = 0.08;
export const GAMEPAD_LOOK_Y = 0.05;

/** Standard button indices. */
export const GP = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  DPAD_U: 12,
  DPAD_D: 13,
  DPAD_L: 14,
  DPAD_R: 15,
} as const;

export function applyDeadzone(v: number, dz = GAMEPAD_DEADZONE): number {
  return Math.abs(v) < dz ? 0 : v;
}

/** Circular deadzone with rescaled remainder — nicer carve feel than axial. */
export function radialDeadzone(
  x: number,
  y: number,
  dz = GAMEPAD_DEADZONE,
): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag < dz || mag === 0) return { x: 0, y: 0 };
  const scale = Math.min(1, (mag - dz) / (1 - dz));
  return { x: (x / mag) * scale, y: (y / mag) * scale };
}

export function triggerDown(
  buttons: ReadonlyArray<{ pressed: boolean; value: number } | undefined>,
  index: number,
  threshold = GAMEPAD_TRIGGER,
): boolean {
  const b = buttons[index];
  if (!b) return false;
  return b.pressed || b.value > threshold;
}

export function buttonDown(
  buttons: ReadonlyArray<{ pressed: boolean; value: number } | undefined>,
  index: number,
): boolean {
  return buttons[index]?.pressed ?? false;
}

/**
 * Prefer `preferredIndex` while that pad stays connected; otherwise first
 * connected slot. Returns null when nothing is plugged in.
 */
export function pickConnectedGamepad(
  pads: Array<Gamepad | null>,
  preferredIndex: number | null,
): Gamepad | null {
  if (preferredIndex !== null) {
    const preferred = pads[preferredIndex];
    if (preferred?.connected) return preferred;
  }
  for (const gp of pads) {
    if (gp?.connected) return gp;
  }
  return null;
}

export type GamepadSample = {
  steer: number;
  lookX: number;
  lookY: number;
  held: Set<InputAction>;
};

/** Diff held sets into edge sets for wasPressed / wasReleased. */
export function edgeSets(
  prev: ReadonlySet<InputAction>,
  next: ReadonlySet<InputAction>,
): { pressed: Set<InputAction>; released: Set<InputAction> } {
  const pressed = new Set<InputAction>();
  const released = new Set<InputAction>();
  for (const a of next) {
    if (!prev.has(a)) pressed.add(a);
  }
  for (const a of prev) {
    if (!next.has(a)) released.add(a);
  }
  return { pressed, released };
}

/**
 * Map a standard-layout gamepad into Snowline actions.
 * Stick steer, A jump, B brake, LT lean, RT boost, Start pause;
 * D-pad spin/flip; face/shoulder grabs.
 */
export function sampleStandardGamepad(gp: Gamepad): GamepadSample {
  const left = radialDeadzone(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
  const right = radialDeadzone(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
  const held = new Set<InputAction>();

  if (buttonDown(gp.buttons, GP.A)) held.add('jump');
  if (buttonDown(gp.buttons, GP.B)) held.add('brake');
  if (buttonDown(gp.buttons, GP.X)) held.add('grabIndy');
  if (buttonDown(gp.buttons, GP.Y)) held.add('grabMute');
  if (buttonDown(gp.buttons, GP.LB)) held.add('grabMelon');
  if (buttonDown(gp.buttons, GP.RB)) held.add('grabMethod');
  if (triggerDown(gp.buttons, GP.LT)) held.add('lean');
  if (triggerDown(gp.buttons, GP.RT)) held.add('boost');
  if (buttonDown(gp.buttons, GP.START)) held.add('pause');
  if (buttonDown(gp.buttons, GP.SELECT)) held.add('back');
  if (buttonDown(gp.buttons, GP.DPAD_L)) held.add('spinLeft');
  if (buttonDown(gp.buttons, GP.DPAD_R)) held.add('spinRight');
  if (buttonDown(gp.buttons, GP.DPAD_U)) held.add('flipFront');
  if (buttonDown(gp.buttons, GP.DPAD_D)) held.add('flipBack');

  return {
    steer: left.x,
    lookX: -right.x * GAMEPAD_LOOK_X,
    lookY: right.y * GAMEPAD_LOOK_Y,
    held,
  };
}
