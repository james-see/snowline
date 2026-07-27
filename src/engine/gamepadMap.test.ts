import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDeadzone,
  buttonDown,
  dumpGamepads,
  edgeSets,
  GAMEPAD_DEADZONE,
  gamepadHasActivity,
  gamepadsAwaitingGesture,
  GP,
  normalizeTriggerAxis,
  pickActiveGamepad,
  pickConnectedGamepad,
  radialDeadzone,
  resolveAxisLayout,
  sampleGamepad,
  sampleStandardGamepad,
  triggerDown,
} from '@/engine/gamepadMap.ts';

function fakeButton(pressed: boolean, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value };
}

function fakePad(partial: {
  index?: number;
  connected?: boolean;
  mapping?: GamepadMappingType;
  id?: string;
  axes?: number[];
  buttons?: Array<GamepadButton | undefined>;
}): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, i) => partial.buttons?.[i] ?? fakeButton(false));
  return {
    id: partial.id ?? 'test-pad',
    index: partial.index ?? 0,
    connected: partial.connected ?? true,
    mapping: partial.mapping ?? 'standard',
    axes: partial.axes ?? [0, 0, 0, 0],
    buttons,
    timestamp: 0,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('gamepadMap', () => {
  it('applyDeadzone zeros small deflections', () => {
    assert.equal(applyDeadzone(0.05), 0);
    assert.ok(Math.abs(applyDeadzone(0.5)) >= GAMEPAD_DEADZONE);
  });

  it('radialDeadzone rescales past the ring', () => {
    const still = radialDeadzone(0.05, 0.05);
    assert.equal(still.x, 0);
    assert.equal(still.y, 0);
    const carve = radialDeadzone(1, 0);
    assert.ok(carve.x > 0.9);
    assert.equal(carve.y, 0);
  });

  it('pickConnectedGamepad prefers preferred index then first live', () => {
    const a = fakePad({ index: 0, connected: false });
    const b = fakePad({ index: 1, connected: true });
    const c = fakePad({ index: 2, connected: true });
    assert.equal(pickConnectedGamepad([a, b, c], 2)?.index, 2);
    assert.equal(pickConnectedGamepad([a, b, c], 0)?.index, 1);
    assert.equal(pickConnectedGamepad([a, null, null], null), null);
  });

  it('gamepadHasActivity ignores idle pads', () => {
    assert.equal(gamepadHasActivity(fakePad({})), false);
    const stick = fakePad({ axes: [0.8, 0, 0, 0] });
    assert.equal(gamepadHasActivity(stick), true);
    const buttons = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[0] = fakeButton(true);
    assert.equal(gamepadHasActivity(fakePad({ buttons })), true);
  });

  it('pickActiveGamepad steals from idle preferred zombie', () => {
    const zombie = fakePad({ index: 0, id: 'ghost' });
    const buttons = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[0] = fakeButton(true);
    const real = fakePad({ index: 1, id: 'DualSense', buttons, axes: [0, 0, 0, 0] });
    assert.equal(pickConnectedGamepad([zombie, real], 0)?.index, 0);
    assert.equal(pickActiveGamepad([zombie, real], 0)?.index, 1);
    assert.equal(pickActiveGamepad([zombie, real], 1)?.index, 1);
    // No activity → keep preferred / first connected
    assert.equal(pickActiveGamepad([zombie, fakePad({ index: 1 })], 0)?.index, 0);
  });

  it('gamepadsAwaitingGesture detects Chrome null slots', () => {
    assert.equal(gamepadsAwaitingGesture([]), false);
    assert.equal(gamepadsAwaitingGesture([null, null]), true);
    assert.equal(gamepadsAwaitingGesture([null, fakePad({})]), false);
  });

  it('triggerDown honors value threshold', () => {
    assert.equal(triggerDown([fakeButton(false, 0.5)], 0), true);
    assert.equal(triggerDown([fakeButton(false, 0.1)], 0), false);
  });

  it('buttonDown accepts value without pressed', () => {
    assert.equal(buttonDown([fakeButton(false, 0.9)], 0), true);
    assert.equal(buttonDown([fakeButton(false, 0.1)], 0), false);
    assert.equal(buttonDown([fakeButton(true, 0)], 0), true);
  });

  it('resolveAxisLayout uses 6-axis BT fallback', () => {
    const std = resolveAxisLayout({ mapping: 'standard', axes: [0, 0, 0, 0, 0, 0], id: 'x' });
    assert.equal(std.rightX, 2);
    assert.equal(std.ltAxis, null);

    const bt = resolveAxisLayout({
      mapping: '',
      axes: [0, 0, 0, 0, 0, 0],
      id: 'Wireless Controller',
    });
    assert.equal(bt.leftX, 0);
    assert.equal(bt.rightX, 3);
    assert.equal(bt.ltAxis, 2);
    assert.equal(bt.rtAxis, 5);
  });

  it('normalizeTriggerAxis maps -1..1 rests', () => {
    assert.equal(normalizeTriggerAxis(-1), 0);
    assert.ok(normalizeTriggerAxis(1) > 0.9);
    assert.ok(normalizeTriggerAxis(0.8) > 0.7);
  });

  it('sampleStandardGamepad maps stick / A / B / triggers / Start', () => {
    const buttons: GamepadButton[] = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[GP.A] = fakeButton(true);
    buttons[GP.B] = fakeButton(true);
    buttons[GP.LT] = fakeButton(false, 0.8);
    buttons[GP.RT] = fakeButton(false, 0.9);
    buttons[GP.START] = fakeButton(true);
    buttons[GP.DPAD_L] = fakeButton(true);

    const sample = sampleStandardGamepad(
      fakePad({ axes: [0.9, 0.1, -0.5, 0.2], buttons }),
    );

    assert.ok(sample.steer > 0.5);
    assert.ok(sample.held.has('jump'));
    assert.ok(sample.held.has('confirm'));
    assert.ok(sample.held.has('brake'));
    assert.ok(sample.held.has('lean'));
    assert.ok(sample.held.has('boost'));
    assert.ok(sample.held.has('pause'));
    assert.ok(sample.held.has('spinLeft'));
    assert.ok(sample.held.has('steerRight'));
    assert.ok(!sample.held.has('grabIndy'));
  });

  it('sampleGamepad reads 6-axis non-standard Bluetooth layout', () => {
    const buttons: GamepadButton[] = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[GP.A] = fakeButton(true);
    // LX LY LT RX RY RT — left stick right, RT pulled via axis
    const sample = sampleGamepad(
      fakePad({
        mapping: '',
        axes: [0.95, 0.05, -1, 0.1, 0.2, 0.85],
        buttons,
      }),
    );
    assert.ok(sample.steer > 0.5);
    assert.ok(sample.held.has('jump'));
    assert.ok(sample.held.has('boost'));
    assert.ok(!sample.held.has('lean'));
  });

  it('dumpGamepads snapshots live pads', () => {
    const dump = dumpGamepads([null, fakePad({ index: 1, id: 'Pad One', axes: [0.2, 0] })]);
    assert.equal(dump.slotCount, 2);
    assert.equal(dump.awaitingGesture, false);
    assert.equal(dump.pads.length, 1);
    assert.equal(dump.pads[0]?.id, 'Pad One');
    assert.equal(dump.pads[0]?.index, 1);
  });

  it('edgeSets reports press and release', () => {
    const prev = new Set(['jump', 'brake'] as const);
    const next = new Set(['jump', 'boost'] as const);
    const { pressed, released } = edgeSets(prev, next);
    assert.ok(pressed.has('boost'));
    assert.ok(!pressed.has('jump'));
    assert.ok(released.has('brake'));
    assert.ok(!released.has('jump'));
  });
});
