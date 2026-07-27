import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDeadzone,
  edgeSets,
  GAMEPAD_DEADZONE,
  GP,
  pickConnectedGamepad,
  radialDeadzone,
  sampleStandardGamepad,
  triggerDown,
} from '@/engine/gamepadMap.ts';

function fakeButton(pressed: boolean, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value };
}

function fakePad(partial: {
  index?: number;
  connected?: boolean;
  axes?: number[];
  buttons?: Array<GamepadButton | undefined>;
}): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, i) => partial.buttons?.[i] ?? fakeButton(false));
  return {
    id: 'test-pad',
    index: partial.index ?? 0,
    connected: partial.connected ?? true,
    mapping: 'standard',
    axes: partial.axes ?? [0, 0, 0, 0],
    buttons,
    timestamp: 0,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('gamepadMap', () => {
  it('applyDeadzone zeros small deflections', () => {
    assert.equal(applyDeadzone(0.1), 0);
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

  it('triggerDown honors value threshold', () => {
    assert.equal(triggerDown([fakeButton(false, 0.5)], 0), true);
    assert.equal(triggerDown([fakeButton(false, 0.1)], 0), false);
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
    assert.ok(sample.held.has('brake'));
    assert.ok(sample.held.has('lean'));
    assert.ok(sample.held.has('boost'));
    assert.ok(sample.held.has('pause'));
    assert.ok(sample.held.has('spinLeft'));
    assert.ok(!sample.held.has('grabIndy'));
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
