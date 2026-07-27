/**
 * Gamepad mapping helpers (W3C "standard" + common Bluetooth fallbacks).
 * Pure functions — safe to unit-test without DOM / navigator.
 */

import type { InputAction } from '@/types/input.ts';

/** Axial / radial stick deadzone — low enough that small carve inputs read. */
export const GAMEPAD_DEADZONE = 0.12;
/** Analog trigger press threshold. */
export const GAMEPAD_TRIGGER = 0.3;
/** Right-stick look sensitivity (radians-ish per frame at full deflect). */
export const GAMEPAD_LOOK_X = 0.08;
export const GAMEPAD_LOOK_Y = 0.05;
/** Stick magnitude that also asserts digital steerLeft / steerRight. */
export const GAMEPAD_STEER_DIGITAL = 0.5;

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

/** Face / shoulder — some BT stacks report value without pressed. */
export function buttonDown(
  buttons: ReadonlyArray<{ pressed: boolean; value: number } | undefined>,
  index: number,
  threshold = 0.5,
): boolean {
  const b = buttons[index];
  if (!b) return false;
  return b.pressed || b.value > threshold;
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

/** True when the Gamepad API has slots but every entry is still null (Chrome pre-gesture). */
export function gamepadsAwaitingGesture(pads: Array<Gamepad | null>): boolean {
  if (pads.length === 0) return false;
  return pads.every((p) => p === null);
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

export type GamepadAxisLayout = {
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  /** Axis index for LT when triggers are analog axes (else null). */
  ltAxis: number | null;
  rtAxis: number | null;
};

/**
 * Resolve stick / trigger axes. Standard mapping uses 0–3 sticks + button
 * triggers. Many Bluetooth pads expose 6 axes: LX LY LT RX RY RT.
 */
export function resolveAxisLayout(gp: Pick<Gamepad, 'mapping' | 'axes' | 'id'>): GamepadAxisLayout {
  const n = gp.axes.length;
  if (gp.mapping === 'standard' || n <= 4) {
    return { leftX: 0, leftY: 1, rightX: 2, rightY: 3, ltAxis: null, rtAxis: null };
  }
  // Chrome / WebKit non-standard Xbox, DualSense, Switch Pro over BT.
  if (n >= 6) {
    return { leftX: 0, leftY: 1, rightX: 3, rightY: 4, ltAxis: 2, rtAxis: 5 };
  }
  return { leftX: 0, leftY: 1, rightX: 2, rightY: 3, ltAxis: null, rtAxis: null };
}

function axisValue(axes: readonly number[], index: number | null): number {
  if (index === null) return 0;
  return axes[index] ?? 0;
}

/** Normalize trigger axis that may be -1..1 (rest -1) or 0..1 (rest 0). */
export function normalizeTriggerAxis(v: number): number {
  if (v < 0) return Math.max(0, (v + 1) / 2);
  return Math.max(0, Math.min(1, v));
}

function fillFaceActions(
  held: Set<InputAction>,
  buttons: Gamepad['buttons'],
  layout: GamepadAxisLayout,
  axes: readonly number[],
): void {
  if (buttonDown(buttons, GP.A)) {
    held.add('jump');
    held.add('confirm');
  }
  if (buttonDown(buttons, GP.B)) held.add('brake');
  if (buttonDown(buttons, GP.X)) held.add('grabIndy');
  if (buttonDown(buttons, GP.Y)) held.add('grabMute');
  if (buttonDown(buttons, GP.LB)) held.add('grabMelon');
  if (buttonDown(buttons, GP.RB)) held.add('grabMethod');

  const ltAxis = normalizeTriggerAxis(axisValue(axes, layout.ltAxis));
  const rtAxis = normalizeTriggerAxis(axisValue(axes, layout.rtAxis));
  if (triggerDown(buttons, GP.LT) || ltAxis > GAMEPAD_TRIGGER) held.add('lean');
  if (triggerDown(buttons, GP.RT) || rtAxis > GAMEPAD_TRIGGER) held.add('boost');

  if (buttonDown(buttons, GP.START) || buttonDown(buttons, 10)) held.add('pause');
  if (buttonDown(buttons, GP.SELECT) || buttonDown(buttons, 11)) held.add('back');

  // D-pad as buttons (standard) or alternate indices on some BT stacks.
  if (buttonDown(buttons, GP.DPAD_L) || buttonDown(buttons, 16)) held.add('spinLeft');
  if (buttonDown(buttons, GP.DPAD_R) || buttonDown(buttons, 17)) held.add('spinRight');
  if (buttonDown(buttons, GP.DPAD_U) || buttonDown(buttons, 18)) held.add('flipFront');
  if (buttonDown(buttons, GP.DPAD_D) || buttonDown(buttons, 19)) held.add('flipBack');

  // Hat axis (common non-standard): axis 9 in [-1,1] octants.
  const hat = axes[9];
  if (hat !== undefined && Number.isFinite(hat) && Math.abs(hat) <= 1.01) {
    // Idle hat is often 3.3 / NaN / 0 — only treat discrete notches.
    if (hat < -0.5) held.add('spinLeft');
    else if (hat > 0.5 && hat < 1.1) held.add('spinRight');
    // Some stacks encode Y on the same axis via specific values; skip if ambiguous.
  }
}

/**
 * Map a gamepad into Snowline actions.
 * Stick steer, A jump, B brake, LT lean, RT boost, Start pause;
 * D-pad spin/flip; face/shoulder grabs.
 */
export function sampleStandardGamepad(gp: Gamepad): GamepadSample {
  return sampleGamepad(gp);
}

/** Prefer standard indices; fall back to common Bluetooth axis layouts. */
export function sampleGamepad(gp: Gamepad): GamepadSample {
  const layout = resolveAxisLayout(gp);
  const left = radialDeadzone(gp.axes[layout.leftX] ?? 0, gp.axes[layout.leftY] ?? 0);
  const right = radialDeadzone(gp.axes[layout.rightX] ?? 0, gp.axes[layout.rightY] ?? 0);
  const held = new Set<InputAction>();

  fillFaceActions(held, gp.buttons, layout, gp.axes);

  if (left.x <= -GAMEPAD_STEER_DIGITAL) held.add('steerLeft');
  if (left.x >= GAMEPAD_STEER_DIGITAL) held.add('steerRight');

  return {
    steer: left.x,
    lookX: -right.x * GAMEPAD_LOOK_X,
    lookY: right.y * GAMEPAD_LOOK_Y,
    held,
  };
}

export type GamepadDebugPad = {
  id: string;
  index: number;
  mapping: string;
  connected: boolean;
  axes: number[];
  buttons: Array<{ pressed: boolean; value: number }>;
};

export type GamepadDebugDump = {
  slotCount: number;
  awaitingGesture: boolean;
  pads: GamepadDebugPad[];
};

/** Snapshot for `window.__snowline.gamepadDebug()`. */
export function dumpGamepads(pads: Array<Gamepad | null>): GamepadDebugDump {
  const list = Array.from(pads);
  const live: GamepadDebugPad[] = [];
  for (const gp of list) {
    if (!gp) continue;
    live.push({
      id: gp.id,
      index: gp.index,
      mapping: gp.mapping,
      connected: gp.connected,
      axes: Array.from(gp.axes),
      buttons: Array.from(gp.buttons, (b) => ({
        pressed: !!b?.pressed,
        value: b?.value ?? 0,
      })),
    });
  }
  return {
    slotCount: list.length,
    awaitingGesture: gamepadsAwaitingGesture(list),
    pads: live,
  };
}
