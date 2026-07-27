import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ModeController } from './ModeController.ts';

describe('ModeController', () => {
  it('flows title → course → mode → playing → results → restart', () => {
    const c = new ModeController();
    assert.equal(c.state.screen, 'title');

    c.navigate('course');
    assert.equal(c.state.screen, 'course');

    c.selectCourse('timberline');
    assert.equal(c.state.courseId, 'timberline');
    assert.equal(c.state.screen, 'mode');

    c.selectMode('trick_attack');
    assert.equal(c.state.mode, 'trick_attack');
    assert.equal(c.state.screen, 'playing');
    assert.equal(c.state.runActive, true);

    c.finishRun();
    assert.equal(c.state.screen, 'results');
    assert.equal(c.state.runActive, false);

    c.restartRun();
    assert.equal(c.state.screen, 'playing');
    assert.equal(c.state.mode, 'trick_attack');
  });

  it('normalizes legacy mode ids on select', () => {
    const c = new ModeController();
    c.selectMode('score');
    assert.equal(c.state.mode, 'trick_attack');
  });

  it('toggles pause while running', () => {
    const c = new ModeController();
    c.selectMode('freeride');
    c.setPaused(true);
    assert.equal(c.state.screen, 'paused');
    c.setPaused(false);
    assert.equal(c.state.screen, 'playing');
  });

  it('finishRun clears runActive and lands on results', () => {
    const c = new ModeController();
    c.selectMode('time_trial');
    assert.equal(c.state.runActive, true);
    c.finishRun();
    assert.equal(c.state.screen, 'results');
    assert.equal(c.state.runActive, false);
    assert.equal(c.state.paused, false);
  });
});
