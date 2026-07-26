import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScoreSystem } from './ScoreSystem.ts';
import type { TrickResult } from '@/types/gameplay.ts';

function trick(partial: Partial<TrickResult> & { name: string; score: number }): TrickResult {
  return {
    spinDegrees: 360,
    flipDegrees: 0,
    grab: null,
    landing: 'good',
    combo: false,
    ...partial,
  };
}

describe('ScoreSystem', () => {
  it('banks pending on clean landing and rewards boost', () => {
    const s = new ScoreSystem();
    s.addTrick(trick({ name: '360 Left', score: 250 }));
    assert.equal(s.pending, 250);
    assert.equal(s.score, 0);
    const { banked, boostReward } = s.resolveLanding('good');
    assert.equal(banked, 250);
    assert.equal(s.score, 250);
    assert.equal(s.pending, 0);
    assert.ok(boostReward > 0.1);
  });

  it('wipes pending and combo on bail', () => {
    const s = new ScoreSystem();
    s.addTrick(trick({ name: '360 Left', score: 250 }));
    s.combo = 3;
    const r = s.resolveLanding('bail');
    assert.equal(r.banked, 0);
    assert.equal(s.pending, 0);
    assert.equal(s.combo, 1);
  });

  it('penalizes repeated trick names', () => {
    const s = new ScoreSystem();
    const first = s.addTrick(trick({ name: '360 Left', score: 200 }));
    s.combo = 1; // isolate repetition from combo growth
    const second = s.addTrick(trick({ name: '360 Left', score: 200 }));
    assert.ok(second < first);
  });

  it('adds perfect landing bonus', () => {
    const s = new ScoreSystem();
    s.addTrick(trick({ name: 'Method', score: 100 }));
    const { banked, bonus } = s.resolveLanding('perfect');
    assert.equal(banked, 100);
    assert.equal(bonus, 250);
    assert.equal(s.score, 350);
  });

  it('styleTick accrues carve points', () => {
    const s = new ScoreSystem();
    s.combo = 2;
    const gained = s.styleTick(1);
    assert.equal(gained, 16);
    assert.equal(s.score, 16);
  });
});
