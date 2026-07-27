/**
 * Gamepad mapping helpers (W3C "standard" + Ultimate 2 X / Xbox BT fallbacks).
 * Pure functions — safe to unit-test without DOM / navigator.
 */

import type { InputAction } from '@/types/input.ts';
import {
  applyBindingsToHeld,
  autoBindingMap,
  isUltimate2Id,
  resolveBindingsForPad,
  type GamepadBindingMap,
} from '@/engine/gamepadBindings.ts';

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

/** Stick / button activity floor — ignores idle noise and resting trigger axes. */
export const GAMEPAD_ACTIVITY = 0.35;
/** Controller Test / steal threshold — any real press, including soft analog. */
export const GAMEPAD_ACTIVITY_RAW = 0.08;

/**
 * Snapshot `navigator.getGamepads()` via indexed access.
 * Prefer this over `Array.from` — some engines mishandle GamepadList holes.
 */
export function readGamepadSlots(
  source?: ArrayLike<Gamepad | null> | null,
): Array<Gamepad | null> {
  const raw =
    source ??
    (typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null) ??
    null;
  if (!raw) return [];
  const out: Array<Gamepad | null> = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw[i] ?? null;
  }
  return out;
}

/** Empty-id / unknown Steam·OS zombies that should lose to a real 8BitDo. */
export function isGhostPad(gp: Pick<Gamepad, 'id' | 'buttons' | 'axes'>): boolean {
  const id = (gp.id ?? '').trim();
  if (!id) return true;
  const lower = id.toLowerCase();
  if (lower === 'unknown' || lower === 'xinput' || lower === 'ghost') return true;
  return false;
}

/**
 * True when any button is down or any stick/trigger axis is meaningfully deflected.
 * Used to steal focus from zombie "connected" slots (Steam Input, OS ghosts).
 * `pressed === true` always counts, even when value is 0 (some BT stacks).
 */
export function gamepadHasActivity(gp: Gamepad, threshold = GAMEPAD_ACTIVITY): boolean {
  for (const b of gp.buttons) {
    if (!b) continue;
    if (b.pressed || b.value > threshold) return true;
  }
  const layout = resolveAxisLayout(gp);
  const lx = gp.axes[layout.leftX] ?? 0;
  const ly = gp.axes[layout.leftY] ?? 0;
  if (Math.hypot(lx, ly) > threshold) return true;
  const rx = gp.axes[layout.rightX] ?? 0;
  const ry = gp.axes[layout.rightY] ?? 0;
  if (Math.hypot(rx, ry) > threshold) return true;
  if (layout.ltAxis !== null && normalizeTriggerAxis(gp.axes[layout.ltAxis] ?? 0) > threshold) {
    return true;
  }
  if (layout.rtAxis !== null && normalizeTriggerAxis(gp.axes[layout.rtAxis] ?? 0) > threshold) {
    return true;
  }
  for (let i = 0; i < gp.axes.length; i++) {
    if (
      i === layout.leftX ||
      i === layout.leftY ||
      i === layout.rightX ||
      i === layout.rightY ||
      i === layout.ltAxis ||
      i === layout.rtAxis
    ) {
      continue;
    }
    const v = gp.axes[i] ?? 0;
    if (!Number.isFinite(v)) continue;
    if (Math.abs(v) > 0 && Math.abs(v) <= 1.01 && Math.abs(v) > threshold) return true;
  }
  return false;
}

/** Preference score — activity first, then 8BitDo / non-empty id over ghosts. */
export function padPreferenceScore(gp: Gamepad): number {
  let score = 0;
  if (gamepadHasActivity(gp, GAMEPAD_ACTIVITY_RAW)) score += 1000;
  else if (gamepadHasActivity(gp)) score += 800;
  if (isUltimate2Id(gp.id)) score += 200;
  else if (/8bitdo|2dc8/i.test(gp.id)) score += 150;
  if ((gp.id ?? '').trim()) score += 40;
  if (gp.mapping === 'standard') score += 10;
  if (isGhostPad(gp)) score -= 500;
  // Stable tie-break: lower index wins only when scores equal (caller compares >).
  score -= gp.index * 0.01;
  return score;
}

/**
 * Over-sample every slot each frame.
 * 1) Highest preference among pads with any raw activity (steals from ghosts).
 * 2) Else preferred while connected and non-ghost.
 * 3) Else best non-ghost connected (8BitDo preferred).
 * 4) Else first connected.
 */
export function pickActiveGamepad(
  pads: Array<Gamepad | null>,
  preferredIndex: number | null,
): Gamepad | null {
  let bestActive: Gamepad | null = null;
  let bestActiveScore = -Infinity;
  for (const gp of pads) {
    if (!gp?.connected) continue;
    if (!gamepadHasActivity(gp, GAMEPAD_ACTIVITY_RAW) && !gamepadHasActivity(gp)) continue;
    const score = padPreferenceScore(gp);
    // Sticky preferred index still wins among active pads when tied-ish.
    const boost =
      preferredIndex !== null && gp.index === preferredIndex ? 50 : 0;
    if (score + boost > bestActiveScore) {
      bestActiveScore = score + boost;
      bestActive = gp;
    }
  }
  if (bestActive) return bestActive;

  let bestIdle: Gamepad | null = null;
  let bestIdleScore = -Infinity;
  for (const gp of pads) {
    if (!gp?.connected) continue;
    let score = padPreferenceScore(gp);
    // Mild sticky preference — below 8BitDo / activity bonuses.
    if (preferredIndex !== null && gp.index === preferredIndex) score += 30;
    if (score > bestIdleScore) {
      bestIdleScore = score;
      bestIdle = gp;
    }
  }
  return bestIdle;
}

/** True when the Gamepad API has slots but every entry is still null (Chrome pre-gesture). */
export function gamepadsAwaitingGesture(pads: Array<Gamepad | null>): boolean {
  if (pads.length === 0) return false;
  return pads.every((p) => p === null);
}

/** Per-slot raw scan for Controller Test / debug (includes nulls). */
export type GamepadSlotScan = {
  index: number;
  present: boolean;
  id: string;
  mapping: string;
  connected: boolean;
  ghost: boolean;
  activity: boolean;
  pressedButtons: number[];
  maxAxis: number;
};

export function scanGamepadSlots(pads: Array<Gamepad | null>): GamepadSlotScan[] {
  return pads.map((gp, index) => {
    if (!gp) {
      return {
        index,
        present: false,
        id: '',
        mapping: '',
        connected: false,
        ghost: false,
        activity: false,
        pressedButtons: [],
        maxAxis: 0,
      };
    }
    const pressedButtons: number[] = [];
    for (let i = 0; i < gp.buttons.length; i++) {
      const b = gp.buttons[i];
      if (b && (b.pressed || b.value > GAMEPAD_ACTIVITY_RAW)) pressedButtons.push(i);
    }
    let maxAxis = 0;
    for (const a of gp.axes) {
      if (!Number.isFinite(a)) continue;
      maxAxis = Math.max(maxAxis, Math.abs(a));
    }
    return {
      index: gp.index,
      present: true,
      id: gp.id,
      mapping: gp.mapping || '',
      connected: gp.connected,
      ghost: isGhostPad(gp),
      activity: gamepadHasActivity(gp, GAMEPAD_ACTIVITY_RAW),
      pressedButtons,
      maxAxis,
    };
  });
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
  ltAxis: number | null;
  rtAxis: number | null;
};

/**
 * Resolve stick / trigger axes.
 * Ultimate 2 X-mode empty map → Chromium Xbox BT (RX=a2 RY=a5 LT=a3 RT=a4).
 */
export function resolveAxisLayout(gp: Pick<Gamepad, 'mapping' | 'axes' | 'id'>): GamepadAxisLayout {
  if (gp.mapping !== 'standard' && isUltimate2Id(gp.id) && gp.axes.length >= 6) {
    return { leftX: 0, leftY: 1, rightX: 2, rightY: 5, ltAxis: 3, rtAxis: 4 };
  }
  // Xbox-like empty maps with hat axis present.
  if (gp.mapping !== 'standard' && gp.axes.length >= 9) {
    return { leftX: 0, leftY: 1, rightX: 2, rightY: 5, ltAxis: 3, rtAxis: 4 };
  }
  const n = gp.axes.length;
  if (gp.mapping === 'standard' || n <= 4) {
    return { leftX: 0, leftY: 1, rightX: 2, rightY: 3, ltAxis: null, rtAxis: null };
  }
  if (n >= 6) {
    return { leftX: 0, leftY: 1, rightX: 3, rightY: 4, ltAxis: 2, rtAxis: 5 };
  }
  return { leftX: 0, leftY: 1, rightX: 2, rightY: 3, ltAxis: null, rtAxis: null };
}

/** Normalize trigger axis that may be -1..1 (rest -1) or 0..1 (rest 0). */
export function normalizeTriggerAxis(v: number): number {
  if (v < 0) return Math.max(0, (v + 1) / 2);
  return Math.max(0, Math.min(1, v));
}

/**
 * Map a gamepad into Snowline actions via auto-preset + optional custom binds.
 */
export function sampleStandardGamepad(
  gp: Gamepad,
  bindings?: GamepadBindingMap | null,
): GamepadSample {
  return sampleGamepad(gp, bindings);
}

export function sampleGamepad(
  gp: Gamepad,
  bindings?: GamepadBindingMap | null,
): GamepadSample {
  const map = resolveBindingsForPad(gp, bindings ?? undefined);
  const left = radialDeadzone(gp.axes[map.steerAxis] ?? 0, gp.axes[map.steerYAxis] ?? 0);
  const right = radialDeadzone(gp.axes[map.lookXAxis] ?? 0, gp.axes[map.lookYAxis] ?? 0);
  const held = new Set<InputAction>();

  applyBindingsToHeld(held, map, gp.buttons, gp.axes);

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
  /** Count of non-null Gamepad objects from the browser (not activity-filtered). */
  presentCount: number;
  awaitingGesture: boolean;
  /**
   * Non-null pads only. Empty with `slotCount: 4` means Chrome returned
   * `[null,null,null,null]` — Snowline does **not** drop inactive pads here.
   */
  pads: GamepadDebugPad[];
  slots: GamepadSlotScan[];
};

/** Snapshot for `window.__snowline.gamepadDebug()`. */
export function dumpGamepads(pads: Array<Gamepad | null>): GamepadDebugDump {
  const list = pads.slice();
  const live: GamepadDebugPad[] = [];
  for (const gp of list) {
    // Only skip browser null slots — never filter by activity / activation.
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
    presentCount: live.length,
    awaitingGesture: gamepadsAwaitingGesture(list),
    pads: live,
    slots: scanGamepadSlots(list),
  };
}

// Re-export for callers that only import gamepadMap.
export { autoBindingMap, isUltimate2Id };
