import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AirTricks } from './AirTricks.ts';
import { evaluateLanding, LANDING_THRESHOLDS, landingScoreMultiplier } from './LandingEvaluator.ts';
import { GrindSystem } from './GrindSystem.ts';
import type { RiderInput } from '@/types/input.ts';

function input(partial: Partial<RiderInput> = {}): RiderInput {
  return {
    steer: 0,
    lean: 0,
    jump: false,
    jumpPressed: false,
    brake: false,
    boost: false,
    spinLeft: false,
    spinRight: false,
    flipFront: false,
    flipBack: false,
    grabIndy: false,
    grabMute: false,
    grabMelon: false,
    grabMethod: false,
    ...partial,
  };
}

describe('LandingEvaluator', () => {
  it('grades perfect / good / sketchy / bail with clear thresholds', () => {
    assert.equal(
      evaluateLanding({
        alignment: LANDING_THRESHOLDS.perfectAlign,
        impactSpeed: LANDING_THRESHOLDS.softImpact,
      }).grade,
      'perfect',
    );
    assert.equal(
      evaluateLanding({
        alignment: LANDING_THRESHOLDS.goodAlign,
        impactSpeed: 10,
      }).grade,
      'good',
    );
    assert.equal(
      evaluateLanding({
        alignment: LANDING_THRESHOLDS.sketchyAlign,
        impactSpeed: 10,
      }).grade,
      'sketchy',
    );
    assert.equal(
      evaluateLanding({
        alignment: LANDING_THRESHOLDS.sketchyAlign - 0.01,
        impactSpeed: 4,
      }).grade,
      'bail',
    );
    assert.equal(
      evaluateLanding({
        alignment: 1,
        impactSpeed: LANDING_THRESHOLDS.hardImpact,
      }).grade,
      'bail',
    );
  });

  it('assist widens the perfect window', () => {
    const align = LANDING_THRESHOLDS.perfectAlign - LANDING_THRESHOLDS.assistAlignBonus * 0.5;
    const impact = LANDING_THRESHOLDS.softImpact + 1;
    const harsh = evaluateLanding({
      alignment: align,
      impactSpeed: impact,
      assist: false,
    });
    const soft = evaluateLanding({
      alignment: align,
      impactSpeed: impact,
      assist: true,
    });
    assert.notEqual(harsh.grade, 'perfect');
    assert.equal(soft.grade, 'perfect');
  });

  it('never grades upside-down / inverted contacts as perfect', () => {
    assert.equal(
      evaluateLanding({ alignment: -1, impactSpeed: 2, assist: true }).grade,
      'bail',
    );
    assert.equal(
      evaluateLanding({
        alignment: LANDING_THRESHOLDS.uprightMin - 0.01,
        impactSpeed: 3,
        assist: false,
      }).grade,
      'bail',
    );
    assert.notEqual(
      evaluateLanding({ alignment: -0.2, impactSpeed: 1, assist: true }).grade,
      'perfect',
    );
  });

  it('firm upright landings are good, not perfect', () => {
    assert.equal(
      evaluateLanding({
        alignment: 1,
        impactSpeed: LANDING_THRESHOLDS.softImpact + 3,
      }).grade,
      'good',
    );
  });

  it('exposes landing score multipliers', () => {
    assert.equal(landingScoreMultiplier('perfect'), 1.25);
    assert.equal(landingScoreMultiplier('bail'), 0);
  });
});

describe('AirTricks', () => {
  it('names left/right spins from yaw motion', () => {
    const tricks = new AirTricks();
    tricks.beginAir({ boardYaw: 0, boardPitch: 0 });
    // ~360° left over several steps
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      tricks.update(1 / 60, input(), {
        boardYaw: ((Math.PI * 2) * i) / steps,
        boardPitch: 0,
      });
    }
    const result = tricks.resolveLanding('good');
    assert.ok(result);
    assert.match(result!.name, /Left 360/);
    assert.equal(result!.spinDegrees, 360);
  });

  it('names front/back flips and multi-rotations', () => {
    const tricks = new AirTricks();
    tricks.beginAir({ boardYaw: 0, boardPitch: 0 });
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      tricks.update(1 / 60, input(), {
        boardYaw: 0,
        boardPitch: ((Math.PI * 4) * i) / steps, // ~720° front
      });
    }
    const result = tricks.resolveLanding('perfect');
    assert.ok(result);
    assert.match(result!.name, /Double Front Flip/);
    assert.ok(result!.score > 200);
  });

  it('records all four grabs and builds combos', () => {
    for (const [key, label] of [
      ['grabIndy', 'Indy'],
      ['grabMute', 'Mute'],
      ['grabMelon', 'Melon'],
      ['grabMethod', 'Method'],
    ] as const) {
      const tricks = new AirTricks();
      tricks.beginAir({ boardYaw: 0, boardPitch: 0 });
      for (let i = 1; i <= 10; i++) {
        tricks.update(1 / 60, input({ [key]: true }), {
          boardYaw: ((Math.PI * 2) * i) / 10,
          boardPitch: 0,
        });
      }
      const result = tricks.resolveLanding('good');
      assert.ok(result);
      assert.match(result!.name, new RegExp(`Left 360 ${label}`));
      assert.equal(result!.combo, true);
      assert.equal(result!.grab, label.toLowerCase());
    }
  });

  it('emits grab change once per new grab', () => {
    const tricks = new AirTricks();
    tricks.beginAir({ boardYaw: 0, boardPitch: 0 });
    tricks.update(1 / 60, input({ grabIndy: true }), { boardYaw: 0, boardPitch: 0 });
    assert.equal(tricks.consumeGrabChanged(), 'indy');
    tricks.update(1 / 60, input({ grabIndy: true }), { boardYaw: 0.1, boardPitch: 0 });
    assert.equal(tricks.consumeGrabChanged(), null);
    tricks.update(1 / 60, input({ grabMute: true }), { boardYaw: 0.2, boardPitch: 0 });
    assert.equal(tricks.consumeGrabChanged(), 'mute');
  });
});

describe('GrindSystem', () => {
  it('recognizes rail contact and scores by duration', () => {
    const grind = new GrindSystem();
    grind.begin('rail');
    for (let i = 0; i < 30; i++) {
      grind.update(1 / 60, 0, 0.1); // nearly aligned → 50-50
    }
    const result = grind.end();
    assert.ok(result);
    assert.equal(result!.kind, '50-50');
    assert.equal(result!.name, '50-50');
    assert.ok(result!.score > 0);
    assert.ok(result!.duration > 0.4);
  });

  it('classifies boardslide when across the rail', () => {
    const grind = new GrindSystem();
    grind.begin('rail');
    for (let i = 0; i < 20; i++) {
      grind.update(1 / 60, Math.PI / 2, 0);
    }
    const result = grind.end();
    assert.ok(result);
    assert.equal(result!.kind, 'boardslide');
  });
});
