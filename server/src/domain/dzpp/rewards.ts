import { SEASON_SIZE } from './rankings.js';
import type { DzppBeatmapResult } from './formula.js';

export const DZP_CHALLENGE_SCORE_POINTS = 2;
export const DZP_SUBMISSION_APPROVED_POINTS = 3;
export const DZP_VOTE_POINTS = 5;

export interface DzpMapInput {
  userId: number;
  challengeScoreExists: boolean;
  qualificationPoints: number;
  placementPoints: number;
}

export interface DzpRoundInput {
  maps: readonly DzpMapInput[];
  approvedSubmitterIds: ReadonlySet<number>;
  voterIds: ReadonlySet<number>;
}

export interface DzpPlayerReward {
  userId: number;
  challengeScorePoints: number;
  submissionApprovedPoints: number;
  votePoints: number;
  qualificationPoints: number;
  placementPoints: number;
  totalDzp: number;
}

export function calculateDzpRewards(input: DzpRoundInput): DzpPlayerReward[] {
  const byUser = new Map<number, {
    challengeScorePoints: number;
    qualificationPoints: number;
    placementPoints: number;
  }>();
  for (const map of input.maps) {
    if (!map.challengeScoreExists) continue;
    const existing = byUser.get(map.userId) ?? {
      challengeScorePoints: 0,
      qualificationPoints: 0,
      placementPoints: 0,
    };
    existing.challengeScorePoints += DZP_CHALLENGE_SCORE_POINTS;
    existing.qualificationPoints += map.qualificationPoints;
    existing.placementPoints += map.placementPoints;
    byUser.set(map.userId, existing);
  }

  const results: DzpPlayerReward[] = [];
  for (const [userId, totals] of byUser) {
    const submissionApprovedPoints = input.approvedSubmitterIds.has(userId)
      ? DZP_SUBMISSION_APPROVED_POINTS
      : 0;
    const votePoints = input.voterIds.has(userId) ? DZP_VOTE_POINTS : 0;
    const totalDzp =
      totals.challengeScorePoints +
      submissionApprovedPoints +
      votePoints +
      totals.qualificationPoints +
      totals.placementPoints;
    results.push({
      userId,
      challengeScorePoints: totals.challengeScorePoints,
      submissionApprovedPoints,
      votePoints,
      qualificationPoints: totals.qualificationPoints,
      placementPoints: totals.placementPoints,
      totalDzp,
    });
  }
  return results.sort((a, b) => a.userId - b.userId);
}

export function seasonNumberForRound(roundNumber: number): number {
  return Math.max(1, Math.ceil(roundNumber / SEASON_SIZE));
}

export function calculateRoundDzpRewards(
  detailed: readonly DzppBeatmapResult[],
  approvedSubmitters: ReadonlySet<number>,
  voters: ReadonlySet<number>
): DzpPlayerReward[] {
  return calculateDzpRewards({
    maps: detailed.map((result) => ({
      userId: result.userId,
      challengeScoreExists: true,
      qualificationPoints: result.qualificationPoints,
      placementPoints: result.placementPoints,
    })),
    approvedSubmitterIds: approvedSubmitters,
    voterIds: voters,
  });
}
