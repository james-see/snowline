import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_MACROS,
  ACTION_SHOTS,
  GATE_SHOT_IDS,
  REQUIRED_SHOT_IDS,
  SCENE_SHOT_IDS,
} from '../../tools/critic/capture.mjs';

describe('capture shot catalogue', () => {
  it('ACTION_MACROS covers every ACTION_SHOTS entry', () => {
    const macroIds = Object.keys(ACTION_MACROS).sort();
    const shotIds = ACTION_SHOTS.map((s) => s.id).sort();
    assert.deepEqual(shotIds, macroIds);
    for (const shot of ACTION_SHOTS) {
      const macro = ACTION_MACROS[shot.id as keyof typeof ACTION_MACROS];
      assert.equal(shot.base, macro.base ?? 'course_start');
      assert.ok(Array.isArray(shot.actions) && shot.actions.length > 0);
      assert.ok(shot.frames > 0);
      assert.equal(shot.intent, macro.intent);
    }
  });

  it('gate shots cover title, course_start, carve, forest', () => {
    for (const id of ['title', 'course_start', 'carve', 'forest']) {
      assert.ok(GATE_SHOT_IDS.includes(id), `missing gate shot ${id}`);
      assert.ok(
        SCENE_SHOT_IDS.includes(id) || ACTION_SHOTS.some((s) => s.id === id),
        `${id} not in scene or action catalogue`
      );
    }
  });

  it('REQUIRED_SHOT_IDS includes scene + action catalogue without duplicates', () => {
    for (const id of SCENE_SHOT_IDS) assert.ok(REQUIRED_SHOT_IDS.includes(id));
    for (const shot of ACTION_SHOTS) assert.ok(REQUIRED_SHOT_IDS.includes(shot.id));
    assert.equal(REQUIRED_SHOT_IDS.length, new Set(REQUIRED_SHOT_IDS).size);
    assert.ok(REQUIRED_SHOT_IDS.includes('course_start'));
    assert.ok(REQUIRED_SHOT_IDS.includes('carve'));
    assert.ok(REQUIRED_SHOT_IDS.includes('forest'));
    assert.ok(REQUIRED_SHOT_IDS.includes('forest_run'));
    assert.ok(REQUIRED_SHOT_IDS.includes('midair_spin'));
  });

  it('carve and forest_run macros are long enough for usable gameplay frames', () => {
    assert.ok(ACTION_MACROS.carve.frames >= 80);
    assert.ok(ACTION_MACROS.forest_run.frames >= 60);
    assert.equal(ACTION_MACROS.forest_run.base, 'forest');
    assert.equal(ACTION_MACROS.carve.base, 'course_start');
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
