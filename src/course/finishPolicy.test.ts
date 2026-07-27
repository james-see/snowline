import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCompleteRun } from './finishPolicy.ts';

describe('shouldCompleteRun', () => {
  const base = {
    alreadyFinished: false,
    inFinishTrigger: false,
    pathT: 0.5,
    finishT: 0.97,
    lateralAbs: 0,
    finishHalfWidth: 13,
  };

  it('does not finish mid-course', () => {
    assert.equal(shouldCompleteRun(base), false);
  });

  it('finishes when inside the finish trigger even without pathT', () => {
    assert.equal(shouldCompleteRun({ ...base, inFinishTrigger: true, pathT: 0.9 }), true);
  });

  it('finishes when pathT crosses finish within corridor', () => {
    assert.equal(shouldCompleteRun({ ...base, pathT: 0.97, lateralAbs: 5 }), true);
    assert.equal(shouldCompleteRun({ ...base, pathT: 0.99, lateralAbs: 12 }), true);
  });

  it('does not finish past finish.t when far off the corridor', () => {
    assert.equal(shouldCompleteRun({ ...base, pathT: 0.99, lateralAbs: 40 }), false);
  });

  it('does not require checkpoints (missed gates still finish)', () => {
    // Policy has no checkpoint fields — crossing the arch is enough.
    assert.equal(shouldCompleteRun({ ...base, inFinishTrigger: true, pathT: 0.5 }), true);
  });

  it('ignores further checks once already finished', () => {
    assert.equal(
      shouldCompleteRun({ ...base, alreadyFinished: true, inFinishTrigger: true, pathT: 1 }),
      false
    );
  });
});
