import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '@/engine/Input.ts';
import { readRiderInput } from '@/types/input.ts';

function fakeButton(pressed: boolean, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value };
}

function fakePad(partial: {
  index?: number;
  axes?: number[];
  buttons?: GamepadButton[];
  mapping?: GamepadMappingType;
}): Gamepad {
  const buttons =
    partial.buttons ?? Array.from({ length: 16 }, () => fakeButton(false));
  return {
    id: 'test-pad',
    index: partial.index ?? 0,
    connected: true,
    mapping: partial.mapping ?? 'standard',
    axes: partial.axes ?? [0, 0, 0, 0],
    buttons,
    timestamp: 0,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('Input gamepad → rider', () => {
  let el: HTMLElement;
  let input: Input;
  let pads: Array<Gamepad | null>;
  const prevNav = globalThis.navigator;

  before(() => {
    const stub = {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
      pointerLockElement: null as Element | null,
      exitPointerLock() {},
    };
    if (typeof globalThis.document === 'undefined') {
      (globalThis as unknown as { document: typeof stub }).document = stub;
    }
    if (typeof globalThis.window === 'undefined') {
      (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
    }
    const w = globalThis as unknown as {
      addEventListener?: () => void;
      removeEventListener?: () => void;
    };
    if (typeof w.addEventListener !== 'function') {
      w.addEventListener = () => {};
      w.removeEventListener = () => {};
    }
  });

  beforeEach(() => {
    el = {
      addEventListener() {},
      removeEventListener() {},
      requestPointerLock() {},
    } as unknown as HTMLElement;
    pads = [null, null, null, null];
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        getGamepads: () => pads,
      },
    });
    input = new Input(el);
    input.setLockout(false);
  });

  afterEach(() => {
    input.dispose();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: prevNav,
    });
  });

  it('reports awaitingGesture while slots are null', () => {
    input.beginFrame();
    assert.equal(input.gamepadAwaitingGesture, true);
    assert.equal(input.move.x, 0);
    input.endFrame();
  });

  it('applies stick steer and face buttons to rider input', () => {
    const buttons = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[0] = fakeButton(true); // A jump
    buttons[1] = fakeButton(true); // B brake
    buttons[7] = fakeButton(false, 0.9); // RT boost
    pads = [fakePad({ axes: [0.9, 0, 0, 0], buttons })];

    input.beginFrame();
    assert.ok(input.move.x > 0.5);
    assert.equal(input.gamepadAwaitingGesture, false);
    assert.equal(input.gamepadActive, true);

    const rider = readRiderInput(input);
    assert.ok(rider.steer > 0.5);
    assert.equal(rider.jump, true);
    assert.equal(rider.jumpPressed, true);
    assert.equal(rider.brake, true);
    assert.equal(rider.boost, true);

    input.endFrame();
    input.beginFrame();
    assert.equal(readRiderInput(input).jumpPressed, false);
    input.endFrame();
  });

  it('gamepadDebug dumps axes and held actions', () => {
    const buttons = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[0] = fakeButton(true);
    pads = [fakePad({ index: 0, axes: [0.5, 0, 0, 0], buttons })];
    input.beginFrame();
    const dump = input.gamepadDebug();
    assert.equal(dump.pads.length, 1);
    assert.ok(dump.held.includes('jump'));
    assert.equal(dump.lockedOut, false);
    input.endFrame();
  });

  it('lockout zeros move but pause still reads', () => {
    const buttons = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[9] = fakeButton(true); // Start
    pads = [fakePad({ axes: [1, 0, 0, 0], buttons })];
    input.setLockout(true);
    input.beginFrame();
    assert.equal(input.move.x, 0);
    assert.equal(input.isDown('pause'), true);
    assert.equal(input.isDown('jump'), false);
    input.endFrame();
  });
});
