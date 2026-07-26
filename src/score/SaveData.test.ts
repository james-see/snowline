import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSave,
  equipCosmetic,
  getBests,
  isScoreMode,
  loadSave,
  normalizeMode,
  recordRun,
  medalRank,
} from './SaveData.ts';
import { computeMedal } from './ScoreModule.ts';

const THRESHOLDS = {
  bronzeTime: 120,
  silverTime: 100,
  goldTime: 80,
  platinumTime: 60,
  bronzeScore: 4000,
  silverScore: 7000,
  goldScore: 10000,
  platinumScore: 14000,
};

describe('SaveData', () => {
  beforeEach(() => {
    clearSave();
  });

  it('normalizes legacy mode aliases', () => {
    assert.equal(normalizeMode('free'), 'freeride');
    assert.equal(normalizeMode('time'), 'time_trial');
    assert.equal(normalizeMode('score'), 'trick_attack');
    assert.ok(isScoreMode('score'));
  });

  it('persists bests medals and unlocks', () => {
    let state = loadSave();
    state = recordRun(state, 'alpine', 'time_trial', 75, 1000, 'gold');
    const bests = getBests(state, 'alpine', 'time_trial');
    assert.equal(bests.bestTime, 75);
    assert.equal(bests.medal, 'gold');
    assert.ok(state.unlocks.includes('board-alpine'));

    state = recordRun(state, 'alpine', 'time_trial', 90, 500, 'bronze');
    assert.equal(getBests(state, 'alpine', 'time_trial').bestTime, 75);
    assert.equal(getBests(state, 'alpine', 'time_trial').medal, 'gold');

    const reloaded = loadSave();
    assert.equal(getBests(reloaded, 'alpine', 'time_trial').bestTime, 75);
  });

  it('equips unlocked cosmetics only', () => {
    const state = loadSave();
    equipCosmetic(state, 'board-carbon');
    assert.equal(state.equippedBoard, 'board-azure');
    state.unlocks.push('board-carbon');
    equipCosmetic(state, 'board-carbon');
    assert.equal(state.equippedBoard, 'board-carbon');
  });

  it('ranks medals', () => {
    assert.ok(medalRank('platinum') > medalRank('gold'));
    assert.ok(medalRank('bronze') > medalRank('none'));
  });
});

describe('computeMedal', () => {
  it('uses time for freeride and score for trick attack', () => {
    assert.equal(computeMedal('freeride', 55, 0, THRESHOLDS), 'platinum');
    assert.equal(computeMedal('time_trial', 75, 99999, THRESHOLDS), 'gold');
    assert.equal(computeMedal('time_trial', 85, 99999, THRESHOLDS), 'silver');
    assert.equal(computeMedal('trick_attack', 999, 14000, THRESHOLDS), 'platinum');
    assert.equal(computeMedal('trick_attack', 10, 100, THRESHOLDS), 'none');
  });
});
