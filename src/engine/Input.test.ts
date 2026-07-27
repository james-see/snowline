import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '@/engine/Input.ts';
import { readRiderInput } from '@/types/input.ts';

function fakeButton(pressed: boolean, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value };
}

function fakePad(partial: {
  index?: number;
  id?: string;
  axes?: number[];
  buttons?: GamepadButton[];
  mapping?: GamepadMappingType;
}): Gamepad {
  const buttons =
    partial.buttons ?? Array.from({ length: 16 }, () => fakeButton(false));
  return {
    id: partial.id ?? 'test-pad',
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
    assert.ok(dump.rawMoveX > 0.4);
    assert.equal(dump.slots.length, 1);
    assert.equal(dump.slots[0]?.present, true);
    assert.equal(dump.connectEvents, 0);
    input.endFrame();
  });

  it('rawMoveX survives lockout zeroing of move', () => {
    const buttons = Array.from({ length: 16 }, () => fakeButton(false));
    pads = [fakePad({ axes: [0.9, 0, 0, 0], buttons })];
    input.setLockout(true);
    input.beginFrame();
    assert.equal(input.move.x, 0);
    assert.ok(input.gamepadDebug().rawMoveX > 0.5);
    input.endFrame();
  });

  it('idle connected pad activates (wired / hot-plug sample path)', () => {
    pads = [
      fakePad({ index: 0, id: '8BitDo Ultimate 2 Pro', axes: [0, 0, 0, 0] }),
    ];
    input.beginFrame();
    assert.equal(input.gamepadActive, true);
    assert.equal(input.gamepadAwaitingGesture, false);
    assert.equal(input.gamepadIndex, 0);
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

  it('steals active pad from idle ghost slot on activity', () => {
    const ghost = fakePad({ index: 0, id: 'ghost', axes: [0, 0, 0, 0] });
    const buttons = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[0] = fakeButton(true);
    const real = fakePad({
      index: 1,
      id: 'Wireless Controller',
      axes: [0.85, 0, 0, 0],
      buttons,
    });
    pads = [ghost, real];

    input.beginFrame();
    assert.equal(input.gamepadIndex, 1);
    assert.ok(input.move.x > 0.5);
    assert.equal(input.consumeGamepadToast(), 'Wireless Controller');
    assert.equal(input.consumeGamepadToast(), null);
    input.endFrame();
  });

  it('inject holds survive pad sampling', () => {
    pads = [fakePad({ axes: [0, 0, 0, 0] })];
    input.inject(['boost'], true);
    input.beginFrame();
    assert.equal(input.isDown('boost'), true);
    input.endFrame();
    input.inject(['boost'], false);
    input.beginFrame();
    assert.equal(input.isDown('boost'), false);
    input.endFrame();
  });
});
