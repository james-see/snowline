import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBindingsToHeld,
  autoBindingMap,
  detectGamepadPreset,
  is8BitDoUltimate,
  rebindAction,
  sanitizeBindingMap,
  ULTIMATE2_X_BINDING_MAP,
  withReboundAction,
} from '@/engine/gamepadBindings.ts';
import type { InputAction } from '@/types/input.ts';

function fakeButton(pressed: boolean, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value };
}

describe('gamepadBindings', () => {
  it('detects 8BitDo Ultimate 2 by id', () => {
    assert.equal(is8BitDoUltimate('8BitDo Ultimate 2 Wireless'), true);
    assert.equal(is8BitDoUltimate('Vendor: 8BitDo Ultimate 2 (Vendor: 2dc8)'), true);
    assert.equal(is8BitDoUltimate('8BitDo Ultimate 2 Pro'), true);
    assert.equal(is8BitDoUltimate('Xbox Wireless Controller'), false);
    assert.equal(is8BitDoUltimate('8BitDo Pro 2'), false);
  });

  it('Ultimate 2 X: standard when remapped, ultimate2-x when empty', () => {
    assert.equal(detectGamepadPreset('8BitDo Ultimate 2 Wireless', 'standard'), 'standard');
    assert.equal(detectGamepadPreset('8BitDo Ultimate 2 Wireless', ''), 'ultimate2-x');
    assert.equal(detectGamepadPreset('DualSense Wireless Controller', ''), 'empty-6axis');
  });

  it('autoBindingMap uses Xbox BT HID for Ultimate 2 empty mapping', () => {
    const map = autoBindingMap({
      id: '8BitDo Ultimate 2 Wireless',
      mapping: '',
      axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    assert.equal(map.preset, 'ultimate2-x');
    assert.equal(map.actions.jump?.kind, 'button');
    assert.equal(map.actions.jump && map.actions.jump.kind === 'button' ? map.actions.jump.index : -1, 0);
    assert.equal(map.actions.brake && map.actions.brake.kind === 'button' ? map.actions.brake.index : -1, 1);
    assert.equal(map.actions.grabIndy && map.actions.grabIndy.kind === 'button' ? map.actions.grabIndy.index : -1, 3);
    assert.equal(map.actions.pause && map.actions.pause.kind === 'button' ? map.actions.pause.index : -1, 11);
    assert.equal(map.lookXAxis, 2);
    assert.equal(map.lookYAxis, 5);
    assert.equal(map.ltAxis, 3);
    assert.equal(map.rtAxis, 4);
  });

  it('autoBindingMap keeps W3C Xbox indices when mapping is standard', () => {
    const map = autoBindingMap({
      id: '8BitDo Ultimate 2 Wireless',
      mapping: 'standard',
      axes: [0, 0, 0, 0],
    });
    assert.equal(map.preset, 'standard');
    assert.equal(map.actions.grabIndy && map.actions.grabIndy.kind === 'button' ? map.actions.grabIndy.index : -1, 2);
    assert.equal(map.actions.lean && map.actions.lean.kind === 'button' ? map.actions.lean.index : -1, 6);
    assert.equal(map.actions.pause && map.actions.pause.kind === 'button' ? map.actions.pause.index : -1, 9);
  });

  it('applyBindingsToHeld maps Ultimate 2 X face buttons', () => {
    const buttons = Array.from({ length: 16 }, () => fakeButton(false));
    buttons[0] = fakeButton(true); // A jump
    buttons[3] = fakeButton(true); // X indy
    buttons[6] = fakeButton(true); // LB melon
    const held = new Set<InputAction>();
    applyBindingsToHeld(held, ULTIMATE2_X_BINDING_MAP, buttons, [
      0, 0, 0, -1, -1, 0, 0, 0, 0, 0,
    ]);
    assert.ok(held.has('jump'));
    assert.ok(held.has('grabIndy'));
    assert.ok(held.has('grabMelon'));
    assert.ok(!held.has('grabMute'));
  });

  it('rebindAction marks custom and glues confirm to jump', () => {
    const next = rebindAction(ULTIMATE2_X_BINDING_MAP, 'jump', 2);
    assert.equal(next.preset, 'custom');
    assert.equal(next.actions.jump && next.actions.jump.kind === 'button' ? next.actions.jump.index : -1, 2);
    assert.equal(next.actions.confirm && next.actions.confirm.kind === 'button' ? next.actions.confirm.index : -1, 2);
  });

  it('withReboundAction accepts axis triggers', () => {
    const next = withReboundAction(
      null,
      { id: '8BitDo Ultimate 2', mapping: 'standard', axes: [0, 0, 0, 0] },
      'boost',
      { kind: 'axis', index: 5, sign: 1 },
    );
    assert.equal(next.preset, 'custom');
    assert.equal(next.rtAxis, 5);
    assert.deepEqual(next.actions.boost, { kind: 'axis', index: 5, sign: 1 });
  });

  it('sanitizeBindingMap rejects empty junk', () => {
    assert.equal(sanitizeBindingMap(null), null);
    const ok = sanitizeBindingMap({
      preset: 'custom',
      actions: { jump: { kind: 'button', index: 1 }, brake: { kind: 'button', index: 0 } },
    });
    assert.ok(ok);
    assert.equal(ok?.actions.jump && ok.actions.jump.kind === 'button' ? ok.actions.jump.index : -1, 1);
    assert.equal(ok?.preset, 'custom');
  });
});
