import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_WIN_LEVELS,
  DZPP_PER_LEVEL,
  LEVEL_50_REWARD,
  LEVEL_50_REWARD_LEVEL,
  calculatePlayerLevel,
} from './platform.js';

describe('player progression levels', () => {
  it('keeps DZPP as the base progression', () => {
    expect(DZPP_PER_LEVEL).toBe(100);
    expect(calculatePlayerLevel(0, 0)).toMatchObject({
      level: 1,
      baseLevel: 1,
      challengeWins: 0,
      challengeWinLevels: 0,
    });
    expect(calculatePlayerLevel(300, 0)).toMatchObject({
      level: 4,
      baseLevel: 4,
      levelProgress: 0,
      nextLevelDzpp: 400,
    });
  });

  it('adds five permanent levels for every challenge win', () => {
    expect(CHALLENGE_WIN_LEVELS).toBe(5);
    expect(calculatePlayerLevel(300, 1)).toMatchObject({
      level: 9,
      baseLevel: 4,
      challengeWins: 1,
      challengeWinLevels: 5,
    });
    expect(calculatePlayerLevel(300, 3)).toMatchObject({
      level: 19,
      challengeWinLevels: 15,
    });
  });

  it('defines a challenge win as winning the round winner beatmap', () => {
    // The database query in getPlayerProgress counts only round_dzpp_maps rows
    // whose submission_id matches rounds.winning_submission_id. A first-place
    // result on another selected challenge beatmap does not count as a win-level.
    expect(CHALLENGE_WIN_LEVELS).toBe(5);
  });

  it('calculates DZPP progress against the base level, not the bonus levels', () => {
    const progression = calculatePlayerLevel(300, 1);
    expect(progression.level).toBe(9);
    expect(progression.levelProgress).toBe(0);
    expect(progression.nextLevelDzpp).toBe(400);
  });

  it('unlocks the four-month osu!supporter reward at level 50', () => {
    expect(LEVEL_50_REWARD_LEVEL).toBe(50);
    expect(LEVEL_50_REWARD).toBe('Four months of osu!supporter');
    expect(calculatePlayerLevel(4400, 1).level).toBe(50);
    expect(calculatePlayerLevel(4400, 1).level50Reward).toBe(LEVEL_50_REWARD);
    expect(calculatePlayerLevel(4400, 0).level50Reward).toBeNull();
  });
});
