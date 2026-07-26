import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  DISQUALIFIERS,
  GAMEPLAY_CATEGORIES,
  GATE,
  evaluate,
  validateVerdict,
} from '../../tools/critic/rubric.mjs';

function perfectScores() {
  const scores: Record<string, { score: number; note: string }> = {};
  for (const c of CATEGORIES) {
    scores[c.id] = { score: 10, note: 'ok' };
  }
  return scores;
}

describe('rubric snowboarding gate', () => {
  it('exposes snowboarding-focused categories and gameplay bar', () => {
    const ids = CATEGORIES.map((c) => c.id);
    for (const need of [
      'snow',
      'terrain',
      'rider',
      'camera',
      'physics_believability',
      'control_feel',
      'trick_satisfaction',
      'overall_fun',
    ]) {
      assert.ok(ids.includes(need), `missing category ${need}`);
    }
    assert.ok(GAMEPLAY_CATEGORIES.includes('control_feel'));
    assert.ok(GAMEPLAY_CATEGORIES.includes('trick_satisfaction'));
    assert.equal(GATE.minGameplayScore, 9);
    assert.equal(GATE.minMeanScore, 8.5);
    assert.ok(DISQUALIFIERS.some((d) => d.id === 'blank_sky'));
  });

  it('validateVerdict rejects missing categories', () => {
    assert.throws(() => validateVerdict({ scores: {}, disqualifiers: [] }), /missing categories/);
  });

  it('evaluate fails on blank_sky disqualifier even with perfect scores', () => {
    const verdict = validateVerdict({
      scores: perfectScores(),
      disqualifiers: ['blank_sky'],
      worstProblem: 'washed sky',
      fixes: ['fix camera framing'],
      verdict: 'fail',
    });
    const result = evaluate(verdict, { fps: 72 });
    assert.equal(result.passed, false);
    assert.ok(result.reasons.some((r) => r.includes('blank_sky')));
  });

  it('evaluate passes when scores and fps clear the gate', () => {
    const scores = perfectScores();
    for (const id of GAMEPLAY_CATEGORIES) scores[id] = { score: 9, note: 'ship' };
    for (const c of CATEGORIES) {
      if (!GAMEPLAY_CATEGORIES.includes(c.id)) scores[c.id] = { score: 9, note: 'ok' };
    }
    const verdict = validateVerdict({
      scores,
      disqualifiers: [],
      worstProblem: '',
      fixes: [],
      verdict: 'pass',
    });
    const result = evaluate(verdict, { fps: 60 });
    assert.equal(result.passed, true);
    assert.ok(result.mean >= GATE.minMeanScore);
  });
});
