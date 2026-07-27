import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { horizontalDistance, shouldCompleteRun } from './finishPolicy.ts';

describe('shouldCompleteRun', () => {
  const base = {
    alreadyFinished: false,
    inFinishTrigger: false,
    pathT: 0.5,
    finishT: 0.97,
    distanceToFinish: 0,
    finishRadius: 80,
  };

  it('does not finish mid-course', () => {
    assert.equal(shouldCompleteRun(base), false);
  });

  it('finishes when inside the finish trigger even without pathT', () => {
    assert.equal(
      shouldCompleteRun({ ...base, inFinishTrigger: true, pathT: 0.9, distanceToFinish: 80 }),
      true
    );
  });

  it('finishes when pathT crosses finish.t even far from arch (void / overshoot)', () => {
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.97, distanceToFinish: 60 }),
      true
    );
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 1, distanceToFinish: 120 }),
      true
    );
  });

  it('finishes in approach plaza before finish.t when close enough', () => {
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.94, distanceToFinish: 50, approachT: 0.89 }),
      true
    );
  });

  it('does not finish in approach band when still far from arch', () => {
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.94, distanceToFinish: 200, approachT: 0.89 }),
      false
    );
  });

  it('does not finish near arch when still early on the path', () => {
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.5, distanceToFinish: 5 }),
      false
    );
  });

  it('does not require checkpoints (missed gates still finish)', () => {
    assert.equal(shouldCompleteRun({ ...base, inFinishTrigger: true, pathT: 0.5 }), true);
  });

  it('ignores further checks once already finished', () => {
    assert.equal(
      shouldCompleteRun({
        ...base,
        alreadyFinished: true,
        inFinishTrigger: true,
        pathT: 1,
        distanceToFinish: 0,
      }),
      false
    );
  });
});

describe('horizontalDistance', () => {
  it('ignores Y separation', () => {
    assert.equal(horizontalDistance(0, 0, 3, 4), 5);
  });
});
