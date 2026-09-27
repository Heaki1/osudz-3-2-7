// DZP — the spendable Shop currency.
//
// DZP and DZPP are separate systems.
//
// DZP intentionally excludes the performance value (osu! pp). It reuses only
// the finalized Completion, Qualification, and Placement components produced
// by the DZPP scoring engine.
//
// Multi-map rule:
//   - Challenge-score points are awarded once per eligible challenge score/map.
//   - Qualification points are summed per eligible challenge map.
//   - Placement points are summed per eligible challenge map.
//   - Approved-submission points are awarded once per player/round.
//   - Vote points are awarded once per player/round.
//
// No balance, season, price, or database state lives here. This file is pure.

export const DZP_CHALLENGE_SCORE_POINTS = 2;
export const DZP_SUBMISSION_APPROVED_POINTS = 3;
export const DZP_VOTE_POINTS = 5;

export interface DzpMapInput {
  userId: number;

  /** A finalized challenge-score result exists for this player on this map. */
  challengeScoreExists: boolean;

  /** Finalized non-performance components for this map. */
  qualificationPoints: number;
  placementPoints: number;
}

export interface DzpRoundInput {
  maps: readonly DzpMapInput[];

  /** Round-level finalized completion facts. */
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

/**
 * Calculates the DZP reward for every player who has at least one eligible
 * finalized challenge score in the round.
 *
 * Performance value is deliberately absent from the input.
 *
 * The function does not trust round-level completion fields from every map.
 * Submission/vote are supplied separately and applied once per player.
 */
export function calculateDzpRewards(
  input: DzpRoundInput,
): DzpPlayerReward[] {
  const byUser = new Map<
    number,
    {
      challengeScorePoints: number;
      qualificationPoints: number;
      placementPoints: number;
    }
  >();

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

    const votePoints = input.voterIds.has(userId)
      ? DZP_VOTE_POINTS
      : 0;

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
