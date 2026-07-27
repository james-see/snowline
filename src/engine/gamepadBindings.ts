/**
 * Remappable gamepad bindings + auto-presets.
 *
 * 8BitDo Ultimate 2 **X mode** on Mac/Chrome Bluetooth:
 * - When Chrome remaps → `mapping: "standard"` (W3C indices).
 * - When pass-through → `mapping: ""` and Chromium's Xbox Bluetooth HID
 *   (same as Ultimate 2C macOS patches → MapperXboxBluetooth raw):
 *   A0 B1 · X3 Y4 · LB6 RB7 · LT a3 RT a4 · Select10 Start11 ·
 *   LX a0 LY a1 RX a2 RY a5 · hat a9
 */

import type { InputAction } from '@/types/input.ts';

const TRIGGER = 0.3;
const BUTTON = 0.5;

/** Button index or signed axis (triggers / stick directions). */
export type PadSource =
  | { kind: 'button'; index: number }
  | { kind: 'axis'; index: number; sign: 1 | -1 };

export type GamepadPresetId = 'standard' | 'ultimate2-x' | 'empty-6axis';

/** Runtime binding map used by sampleGamepad. */
export type GamepadBindingMap = {
  preset: GamepadPresetId | 'custom';
  steerAxis: number;
  steerYAxis: number;
  lookXAxis: number;
  lookYAxis: number;
  /** Optional explicit LT/RT axis (in addition to lean/boost sources). */
  ltAxis: number | null;
  rtAxis: number | null;
  hatAxis: number | null;
  actions: Partial<Record<InputAction, PadSource>>;
};

/** Persisted shape (same as runtime map; null in settings = auto). */
export type StoredGamepadBindings = GamepadBindingMap;

export type ResolvedGamepadBindings = GamepadBindingMap;

export const REMAP_ACTIONS = [
  'jump',
  'brake',
  'lean',
  'boost',
  'pause',
  'back',
  'grabIndy',
  'grabMute',
  'grabMelon',
  'grabMethod',
  'spinLeft',
  'spinRight',
  'flipFront',
  'flipBack',
] as const;

export type GamepadBindAction = (typeof REMAP_ACTIONS)[number];

export const REMAP_LABELS: Record<GamepadBindAction, string> = {
  jump: 'Jump / Confirm',
  brake: 'Brake',
  lean: 'Lean (LT)',
  boost: 'Boost (RT)',
  pause: 'Pause (Start)',
  back: 'Back (Select)',
  grabIndy: 'Grab Indy (X)',
  grabMute: 'Grab Mute (Y)',
  grabMelon: 'Grab Melon (LB)',
  grabMethod: 'Grab Method (RB)',
  spinLeft: 'Spin Left',
  spinRight: 'Spin Right',
  flipFront: 'Flip Front',
  flipBack: 'Flip Back',
};

/** Aliases for Settings UI. */
export const BIND_UI_ACTIONS = REMAP_ACTIONS;
export const BIND_LABELS = REMAP_LABELS;

function btn(index: number): PadSource {
  return { kind: 'button', index };
}
function axis(index: number, sign: 1 | -1 = 1): PadSource {
  return { kind: 'axis', index, sign };
}

/** W3C standard (Chrome remapped X-mode). */
export function standardBindingMap(): GamepadBindingMap {
  return {
    preset: 'standard',
    steerAxis: 0,
    steerYAxis: 1,
    lookXAxis: 2,
    lookYAxis: 3,
    ltAxis: null,
    rtAxis: null,
    hatAxis: null,
    actions: {
      jump: btn(0),
      confirm: btn(0),
      brake: btn(1),
      grabIndy: btn(2),
      grabMute: btn(3),
      grabMelon: btn(4),
      grabMethod: btn(5),
      lean: btn(6),
      boost: btn(7),
      back: btn(8),
      pause: btn(9),
      flipFront: btn(12),
      flipBack: btn(13),
      spinLeft: btn(14),
      spinRight: btn(15),
    },
  };
}

/**
 * Ultimate 2 X-mode Mac/Chrome empty mapping = Xbox Bluetooth raw HID.
 * Matches Chromium `MapperXboxBluetooth` input side.
 */
export function ultimate2XBindingMap(): GamepadBindingMap {
  return {
    preset: 'ultimate2-x',
    steerAxis: 0,
    steerYAxis: 1,
    lookXAxis: 2,
    lookYAxis: 5,
    ltAxis: 3,
    rtAxis: 4,
    hatAxis: 9,
    actions: {
      jump: btn(0),
      confirm: btn(0),
      brake: btn(1),
      grabIndy: btn(3),
      grabMute: btn(4),
      grabMelon: btn(6),
      grabMethod: btn(7),
      // Digital LT/RT (SDL / some stacks); analog via ltAxis/rtAxis below.
      lean: btn(8),
      boost: btn(9),
      back: btn(10),
      pause: btn(11),
    },
  };
}

/** Generic empty 6-axis: LX LY LT RX RY RT. */
export function empty6AxisBindingMap(): GamepadBindingMap {
  return {
    preset: 'empty-6axis',
    steerAxis: 0,
    steerYAxis: 1,
    lookXAxis: 3,
    lookYAxis: 4,
    ltAxis: 2,
    rtAxis: 5,
    hatAxis: 9,
    actions: {
      jump: btn(0),
      confirm: btn(0),
      brake: btn(1),
      grabIndy: btn(2),
      grabMute: btn(3),
      grabMelon: btn(4),
      grabMethod: btn(5),
      lean: axis(2, 1),
      boost: axis(5, 1),
      back: btn(8),
      pause: btn(9),
    },
  };
}

export function isUltimate2Id(id: string): boolean {
  const s = id.toLowerCase();
  if (!(s.includes('8bitdo') || s.includes('2dc8'))) return false;
  return (
    s.includes('ultimate 2') ||
    s.includes('ultimate2') ||
    s.includes('6012') ||
    s.includes('301b') ||
    s.includes('301d') ||
    s.includes('0126') ||
    s.includes('0b31')
  );
}

export const is8BitDoUltimate = isUltimate2Id;
export const ULTIMATE2_X_BINDING_MAP: GamepadBindingMap = ultimate2XBindingMap();

export function detectGamepadPreset(
  id: string,
  mapping: string,
): GamepadPresetId {
  if (mapping === 'standard') return 'standard';
  // Ultimate 2 X-mode pass-through on Mac Chrome → Xbox BT raw.
  if (isUltimate2Id(id)) return 'ultimate2-x';
  const s = id.toLowerCase();
  if (s.includes('xbox') || s.includes('045e') || s.includes('microsoft')) {
    return 'ultimate2-x';
  }
  return 'empty-6axis';
}

export function autoBindingMap(gp: Pick<Gamepad, 'id' | 'mapping' | 'axes'>): GamepadBindingMap {
  const preset = detectGamepadPreset(gp.id, gp.mapping);
  if (preset === 'standard') return standardBindingMap();
  if (preset === 'ultimate2-x') return ultimate2XBindingMap();
  if (gp.axes.length >= 6) return empty6AxisBindingMap();
  return standardBindingMap();
}

export function resolveBindingsForPad(
  gp: Pick<Gamepad, 'id' | 'mapping' | 'axes'>,
  stored: GamepadBindingMap | null | undefined,
): ResolvedGamepadBindings {
  if (stored && stored.preset === 'custom') return stored;
  if (stored && Object.keys(stored.actions ?? {}).length > 0) {
    const auto = autoBindingMap(gp);
    return {
      ...auto,
      ...stored,
      preset: 'custom',
      actions: { ...auto.actions, ...stored.actions },
    };
  }
  return autoBindingMap(gp);
}

function normalizeTriggerAxis(v: number): number {
  if (v < 0) return Math.max(0, (v + 1) / 2);
  return Math.max(0, Math.min(1, v));
}

function buttonDown(
  buttons: ReadonlyArray<{ pressed: boolean; value: number } | undefined>,
  index: number,
): boolean {
  const b = buttons[index];
  if (!b) return false;
  return b.pressed || b.value > BUTTON;
}

export function sourceActive(
  src: PadSource,
  buttons: ReadonlyArray<{ pressed: boolean; value: number } | undefined>,
  axes: readonly number[],
): boolean {
  if (src.kind === 'button') return buttonDown(buttons, src.index);
  const raw = axes[src.index] ?? 0;
  const n = normalizeTriggerAxis(raw);
  if (n > TRIGGER && src.sign > 0 && (raw < 0 || Math.abs(raw) > TRIGGER)) {
    return n > TRIGGER;
  }
  return src.sign > 0 ? raw > TRIGGER : raw < -TRIGGER;
}

export function applyBindingsToHeld(
  held: Set<InputAction>,
  map: GamepadBindingMap,
  buttons: Gamepad['buttons'],
  axes: readonly number[],
): void {
  for (const action of REMAP_ACTIONS) {
    const src = map.actions[action];
    if (!src) continue;
    if (sourceActive(src, buttons, axes)) held.add(action);
  }
  if (held.has('jump')) held.add('confirm');

  // Axis triggers from layout even if action source missed.
  if (map.ltAxis !== null && normalizeTriggerAxis(axes[map.ltAxis] ?? 0) > TRIGGER) {
    held.add('lean');
  }
  if (map.rtAxis !== null && normalizeTriggerAxis(axes[map.rtAxis] ?? 0) > TRIGGER) {
    held.add('boost');
  }

  // Hat D-pad (Xbox BT / Ultimate 2 X empty map).
  if (map.hatAxis !== null) {
    const hat = axes[map.hatAxis];
    if (hat !== undefined && Number.isFinite(hat) && Math.abs(hat) <= 1.01) {
      if (hat < -0.9) held.add('flipFront');
      else if (hat >= -0.6 && hat <= -0.3) held.add('spinRight');
      else if (hat >= 0.0 && hat <= 0.3) held.add('flipBack');
      else if (hat >= 0.5 && hat <= 0.9) held.add('spinLeft');
    }
  }
}

export function formatPadSource(src: PadSource | undefined): string {
  if (!src) return '—';
  if (src.kind === 'button') return `b${src.index}`;
  return `a${src.index}${src.sign < 0 ? '−' : '+'}`;
}

export function sanitizeBindingMap(raw: unknown): GamepadBindingMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<GamepadBindingMap>;
  const actions: Partial<Record<InputAction, PadSource>> = {};
  if (o.actions && typeof o.actions === 'object') {
    for (const [k, v] of Object.entries(o.actions)) {
      if (!v || typeof v !== 'object') continue;
      const src = v as PadSource;
      if (src.kind === 'button' && Number.isFinite(src.index)) {
        actions[k as InputAction] = { kind: 'button', index: src.index | 0 };
      } else if (
        src.kind === 'axis' &&
        Number.isFinite(src.index) &&
        (src.sign === 1 || src.sign === -1)
      ) {
        actions[k as InputAction] = {
          kind: 'axis',
          index: src.index | 0,
          sign: src.sign,
        };
      }
    }
  }
  if (Object.keys(actions).length === 0 && o.preset !== 'custom') return null;
  if (Object.keys(actions).length === 0) return null;
  const base = standardBindingMap();
  return {
    preset:
      o.preset === 'custom' ||
      o.preset === 'ultimate2-x' ||
      o.preset === 'empty-6axis' ||
      o.preset === 'standard'
        ? o.preset
        : 'custom',
    steerAxis: Number.isFinite(o.steerAxis) ? (o.steerAxis as number) : base.steerAxis,
    steerYAxis: Number.isFinite(o.steerYAxis) ? (o.steerYAxis as number) : base.steerYAxis,
    lookXAxis: Number.isFinite(o.lookXAxis) ? (o.lookXAxis as number) : base.lookXAxis,
    lookYAxis: Number.isFinite(o.lookYAxis) ? (o.lookYAxis as number) : base.lookYAxis,
    ltAxis:
      o.ltAxis === null || Number.isFinite(o.ltAxis) ? (o.ltAxis as number | null) : base.ltAxis,
    rtAxis:
      o.rtAxis === null || Number.isFinite(o.rtAxis) ? (o.rtAxis as number | null) : base.rtAxis,
    hatAxis:
      o.hatAxis === null || Number.isFinite(o.hatAxis)
        ? (o.hatAxis as number | null)
        : base.hatAxis,
    actions,
  };
}

/** Capture first changed button/axis vs baseline. */
export function capturePadSource(
  gp: Gamepad,
  baseline: { buttons: number[]; axes: number[] },
  threshold = 0.55,
): PadSource | null {
  for (let i = 0; i < gp.buttons.length; i++) {
    const b = gp.buttons[i];
    const prev = baseline.buttons[i] ?? 0;
    const v = b ? Math.max(b.value, b.pressed ? 1 : 0) : 0;
    if (v > threshold && prev <= threshold) return { kind: 'button', index: i };
  }
  for (let i = 0; i < gp.axes.length; i++) {
    const cur = gp.axes[i] ?? 0;
    const prev = baseline.axes[i] ?? 0;
    const nCur = normalizeTriggerAxis(cur);
    const nPrev = normalizeTriggerAxis(prev);
    if (nCur > threshold && nPrev <= threshold * 0.5) {
      return { kind: 'axis', index: i, sign: 1 };
    }
    if (Math.abs(cur) > threshold && Math.abs(cur - prev) > 0.35) {
      return { kind: 'axis', index: i, sign: cur >= 0 ? 1 : -1 };
    }
  }
  return null;
}

export function snapshotPad(gp: Gamepad): { buttons: number[]; axes: number[] } {
  return {
    buttons: Array.from(gp.buttons, (b) => (b ? Math.max(b.value, b.pressed ? 1 : 0) : 0)),
    axes: Array.from(gp.axes),
  };
}

/** First button over threshold (bind-by-press). */
export function firstPressedButton(
  buttons: ReadonlyArray<{ pressed: boolean; value: number } | undefined>,
  threshold = 0.55,
): number | null {
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (!b) continue;
    if (b.pressed || b.value > threshold) return i;
  }
  return null;
}

/** Rebind one action to a raw button index (Ultimate 2 X / standard). */
export function rebindAction(
  map: GamepadBindingMap,
  action: GamepadBindAction,
  buttonIndex: number,
): GamepadBindingMap {
  const src = btn(buttonIndex);
  const actions = { ...map.actions, [action]: src };
  if (action === 'jump') actions.confirm = src;
  return { ...map, preset: 'custom', actions };
}

/** Merge a single action rebind into a stored custom map. */
export function withReboundAction(
  current: GamepadBindingMap | null,
  gp: Pick<Gamepad, 'id' | 'mapping' | 'axes'>,
  action: InputAction,
  source: PadSource,
): GamepadBindingMap {
  const base = current?.preset === 'custom' ? current : autoBindingMap(gp);
  const next: GamepadBindingMap = {
    ...base,
    preset: 'custom',
    actions: { ...base.actions, [action]: source },
  };
  if (action === 'jump') next.actions.confirm = source;
  if (action === 'lean' && source.kind === 'axis') next.ltAxis = source.index;
  if (action === 'boost' && source.kind === 'axis') next.rtAxis = source.index;
  return next;
}
