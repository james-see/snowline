import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_MACROS,
  ACTION_SHOTS,
  REQUIRED_SHOT_IDS,
  SCENE_SHOT_IDS,
} from '../../tools/critic/capture.mjs';

describe('capture shot catalogue', () => {
  it('ACTION_MACROS covers every ACTION_SHOTS entry', () => {
    const macroIds = Object.keys(ACTION_MACROS).sort();
    const shotIds = ACTION_SHOTS.map((s) => s.id).sort();
    assert.deepEqual(shotIds, macroIds);
    for (const shot of ACTION_SHOTS) {
      assert.equal(shot.base, 'course_start');
      assert.ok(Array.isArray(shot.actions) && shot.actions.length > 0);
      assert.ok(shot.frames > 0);
      assert.equal(shot.intent, ACTION_MACROS[shot.id as keyof typeof ACTION_MACROS].intent);
    }
  });

  it('REQUIRED_SHOT_IDS includes scene + action catalogue without duplicates', () => {
    for (const id of SCENE_SHOT_IDS) assert.ok(REQUIRED_SHOT_IDS.includes(id));
    for (const shot of ACTION_SHOTS) assert.ok(REQUIRED_SHOT_IDS.includes(shot.id));
    assert.equal(REQUIRED_SHOT_IDS.length, new Set(REQUIRED_SHOT_IDS).size);
    assert.ok(REQUIRED_SHOT_IDS.includes('course_start'));
    assert.ok(REQUIRED_SHOT_IDS.includes('carve'));
    assert.ok(REQUIRED_SHOT_IDS.includes('midair_spin'));
  });

  it('macro actions stay within known CaptureBridge macro vocabulary', () => {
    const known = new Set([
      'carve',
      'hard_carve',
      'tuck',
      'jump',
      'spin_360',
      'spin_180',
      'flip_back',
      'grab_indy',
      'grind',
      'land_clean',
      'land_sketchy',
      'crash',
      'boost',
      'boost_pad',
      'steerLeft',
      'steerRight',
      'lean',
      'grabIndy',
      'spinRight',
      'flipFront',
      'flipBack',
    ]);
    for (const [id, macro] of Object.entries(ACTION_MACROS)) {
      for (const action of macro.actions) {
        assert.ok(known.has(action), `${id} uses unknown macro "${action}"`);
      }
    }
  });
});
