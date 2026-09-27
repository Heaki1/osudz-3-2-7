import { describe, expect, it } from 'vitest';
import {
  calculateDzpRewards,
  DZP_CHALLENGE_SCORE_POINTS,
  DZP_SUBMISSION_APPROVED_POINTS,
  DZP_VOTE_POINTS,
} from './dzp.js';

describe('calculateDzpRewards', () => {
  it('gives one-map reward from finalized non-performance components', () => {
    const [reward] = calculateDzpRewards({
      maps: [
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 25,
          placementPoints: 12,
        },
      ],
      approvedSubmitterIds: new Set([1]),
      voterIds: new Set([1]),
    });

    expect(reward).toEqual({
      userId: 1,
      challengeScorePoints: DZP_CHALLENGE_SCORE_POINTS,
      submissionApprovedPoints: DZP_SUBMISSION_APPROVED_POINTS,
      votePoints: DZP_VOTE_POINTS,
      qualificationPoints: 25,
      placementPoints: 12,
      totalDzp: 47,
    });
  });

  it('counts challenge score, qualification, and placement once per map', () => {
    const [reward] = calculateDzpRewards({
      maps: [
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 10,
          placementPoints: 12,
        },
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 25,
          placementPoints: 16,
        },
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 0,
          placementPoints: 4,
        },
      ],
      approvedSubmitterIds: new Set(),
      voterIds: new Set(),
    });

    expect(reward.challengeScorePoints).toBe(6);
    expect(reward.qualificationPoints).toBe(35);
    expect(reward.placementPoints).toBe(32);
    expect(reward.totalDzp).toBe(73);
  });

  it('does not multiply round-level submission and vote points across maps', () => {
    const [reward] = calculateDzpRewards({
      maps: [
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 10,
          placementPoints: 4,
        },
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 10,
          placementPoints: 4,
        },
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 10,
          placementPoints: 4,
        },
      ],
      approvedSubmitterIds: new Set([1]),
      voterIds: new Set([1]),
    });

    expect(reward.submissionApprovedPoints).toBe(3);
    expect(reward.votePoints).toBe(5);
    expect(reward.totalDzp).toBe(2 * 3 + 3 + 5 + 10 * 3 + 4 * 3);
  });

  it('does not reward a player who has no challenge score', () => {
    const rewards = calculateDzpRewards({
      maps: [
        {
          userId: 1,
          challengeScoreExists: false,
          qualificationPoints: 25,
          placementPoints: 40,
        },
      ],
      approvedSubmitterIds: new Set([1]),
      voterIds: new Set([1]),
    });

    expect(rewards).toEqual([]);
  });

  it('handles multiple players independently', () => {
    const rewards = calculateDzpRewards({
      maps: [
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 15,
          placementPoints: 20,
        },
        {
          userId: 2,
          challengeScoreExists: true,
          qualificationPoints: 10,
          placementPoints: 12,
        },
      ],
      approvedSubmitterIds: new Set([1]),
      voterIds: new Set([2]),
    });

    expect(rewards).toEqual([
      {
        userId: 1,
        challengeScorePoints: 2,
        submissionApprovedPoints: 3,
        votePoints: 0,
        qualificationPoints: 15,
        placementPoints: 20,
        totalDzp: 40,
      },
      {
        userId: 2,
        challengeScorePoints: 2,
        submissionApprovedPoints: 0,
        votePoints: 5,
        qualificationPoints: 10,
        placementPoints: 12,
        totalDzp: 29,
      },
    ]);
  });

  it('does not use performance value at all', () => {
    const [reward] = calculateDzpRewards({
      maps: [
        {
          userId: 1,
          challengeScoreExists: true,
          qualificationPoints: 25,
          placementPoints: 40,
        },
      ],
      approvedSubmitterIds: new Set(),
      voterIds: new Set(),
    });

    expect(reward.totalDzp).toBe(67);
  });
});
