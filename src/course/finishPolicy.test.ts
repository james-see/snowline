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
    finishRadius: 45,
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

  it('finishes when near the arch past approachT', () => {
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.97, distanceToFinish: 5 }),
      true
    );
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.94, distanceToFinish: 12 }),
      true
    );
  });

  it('finishes on pathT past finish even with large bogus spline lateral (via radius)', () => {
    // Terrain/spline Y divergence used to inflate lateral and block completion.
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.99, distanceToFinish: 20 }),
      true
    );
  });

  it('does not finish near arch when still early on the path', () => {
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.5, distanceToFinish: 5 }),
      false
    );
  });

  it('does not finish past finish.t when far from the arch', () => {
    assert.equal(
      shouldCompleteRun({ ...base, pathT: 0.99, distanceToFinish: 80 }),
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
