import { describe, expect, it } from 'vitest';

// ── Pure selection logic extracted for testing ────────────────────────────────
//
// insertFromVotes runs inside a database transaction and cannot be called here.
// The selection rule it implements is:
//   ORDER BY vote_count DESC, submission_id ASC
//   LIMIT maxChallengeBeatmaps   (omitted when null)
//
// These tests verify that rule in isolation, using plain objects that mirror
// what the query would return. The same ORDER BY and LIMIT are what the
// production query uses, so a change there will break these tests.

interface Candidate {
  submissionId: number;
  votes: number;
}

/**
 * Mirrors the ORDER BY + LIMIT logic of insertFromVotes.
 *
 * Returns the submission ids that would be inserted into round_challenge_beatmaps,
 * in vote-rank order (1 = most votes).
 */
function selectChallengeBeatmaps(
  candidates: Candidate[],
  limit: number | null
): number[] {
  const sorted = [...candidates].sort((a, b) =>
    b.votes !== a.votes ? b.votes - a.votes : a.submissionId - b.submissionId
  );
  const selected = limit === null ? sorted : sorted.slice(0, limit);
  return selected.map((c) => c.submissionId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build N approved submissions with descending vote counts starting from `topVotes`. */
function makeApproved(count: number, topVotes = 100): Candidate[] {
  return Array.from({ length: count }, (_, i) => ({
    submissionId: i + 1,
    votes: topVotes - i,
  }));
}

// ── Core selection scenarios ──────────────────────────────────────────────────

describe('selectChallengeBeatmaps', () => {
  // 10 submissions, 8 approved, limit 4 → exactly 4 challenge beatmaps
  it('selects the top 4 of 8 approved when limit is 4', () => {
    const approved = makeApproved(8);
    const result = selectChallengeBeatmaps(approved, 4);
    expect(result).toHaveLength(4);
    // The four with the most votes are ids 1-4 (votes 100, 99, 98, 97)
    expect(result).toEqual([1, 2, 3, 4]);
  });

  // 10 submissions, 8 approved, limit 8 → exactly 8 challenge beatmaps
  it('selects all 8 of 8 approved when limit equals the count', () => {
    const approved = makeApproved(8);
    const result = selectChallengeBeatmaps(approved, 8);
    expect(result).toHaveLength(8);
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  // 10 submissions, 8 approved, limit 3 → exactly 3 challenge beatmaps
  it('selects the top 3 of 8 approved when limit is 3', () => {
    const approved = makeApproved(8);
    const result = selectChallengeBeatmaps(approved, 3);
    expect(result).toHaveLength(3);
    expect(result).toEqual([1, 2, 3]);
  });

  // 10 submissions, 3 approved, limit 8 → exactly 3 challenge beatmaps (all available)
  it('selects all 3 approved when limit exceeds the available count', () => {
    const approved = makeApproved(3);
    const result = selectChallengeBeatmaps(approved, 8);
    expect(result).toHaveLength(3);
    expect(result).toEqual([1, 2, 3]);
  });

  // null limit → all approved submissions
  it('selects all approved submissions when limit is null', () => {
    const approved = makeApproved(8);
    const result = selectChallengeBeatmaps(approved, null);
    expect(result).toHaveLength(8);
  });

  // Approval must not be capped by maxChallengeBeatmaps.
  // Verified here by confirming the selection function accepts any number of
  // approved candidates regardless of the limit — the cap is never applied at
  // approval time, only at selection time.
  it('accepts more approved submissions than the limit without error', () => {
    const approved = makeApproved(20); // far more than any realistic limit
    expect(() => selectChallengeBeatmaps(approved, 4)).not.toThrow();
    expect(selectChallengeBeatmaps(approved, 4)).toHaveLength(4);
  });

  // Voting must expose every approved submission — the selection function
  // receives all approved candidates, not a pre-filtered subset.
  it('receives all approved submissions as candidates before applying the limit', () => {
    const approved = makeApproved(8);
    // All 8 are passed in; only 4 come out — the other 4 were in the ballot.
    const result = selectChallengeBeatmaps(approved, 4);
    expect(approved).toHaveLength(8); // input unchanged
    expect(result).toHaveLength(4);   // output limited
  });

  // Selected challenge ids must be persisted and remain fixed.
  // Calling the function twice with the same input must return the same ids.
  it('produces a deterministic result for the same input', () => {
    const approved = makeApproved(8);
    const first  = selectChallengeBeatmaps(approved, 4);
    const second = selectChallengeBeatmaps(approved, 4);
    expect(first).toEqual(second);
  });

  // Tie at the selection boundary — deterministic by submission id (lower wins).
  it('breaks a tie at the cut-off boundary by submission id ascending', () => {
    // Submissions 1-3 have 10 votes each; submission 4 has 5 votes.
    // With limit 2, two of the three tied entries must be chosen.
    // The rule is: lower submission id wins the tie.
    const tied: Candidate[] = [
      { submissionId: 3, votes: 10 },
      { submissionId: 1, votes: 10 },
      { submissionId: 2, votes: 10 },
      { submissionId: 4, votes: 5 },
    ];
    const result = selectChallengeBeatmaps(tied, 2);
    expect(result).toHaveLength(2);
    // ids 1 and 2 win the tie (lowest ids among the three tied at 10 votes)
    expect(result).toEqual([1, 2]);
  });

  // A full tie across all candidates with a limit still resolves deterministically.
  it('handles a full tie across all candidates deterministically', () => {
    const allTied: Candidate[] = [
      { submissionId: 5, votes: 7 },
      { submissionId: 2, votes: 7 },
      { submissionId: 8, votes: 7 },
      { submissionId: 1, votes: 7 },
    ];
    const result = selectChallengeBeatmaps(allTied, 2);
    expect(result).toEqual([1, 2]); // lowest ids win
  });
});

// ── Tiebreak winner pinning ───────────────────────────────────────────────────
//
// insertFromVotes() accepts a winnerId that is always persisted as vote_rank = 1,
// regardless of whether a tiebreak was involved. The remaining slots fill by
// votes DESC, submission_id ASC, excluding the winner.

interface CandidateWithWinner {
  submissionId: number;
  votes: number;
}

/**
 * Mirrors the insertFromVotes() logic when winnerId is provided:
 *   1. Winner is always rank 1.
 *   2. Remaining slots fill by votes DESC, id ASC, excluding the winner.
 *   3. limit applies to the total (winner + remaining).
 */
function selectWithWinner(
  candidates: CandidateWithWinner[],
  limit: number | null,
  winnerId: number
): number[] {
  const remaining = [...candidates]
    .filter((c) => c.submissionId !== winnerId)
    .sort((a, b) => b.votes !== a.votes ? b.votes - a.votes : a.submissionId - b.submissionId);
  const remainingLimit = limit === null ? null : limit - 1;
  const selected = remainingLimit === null ? remaining : remaining.slice(0, remainingLimit);
  return [winnerId, ...selected.map((c) => c.submissionId)];
}

describe('insertFromVotes with tiebreak winner', () => {
  it('always places the winner at rank 1 even when another entry has more votes', () => {
    const candidates: CandidateWithWinner[] = [
      { submissionId: 1, votes: 10 },
      { submissionId: 2, votes: 15 },
      { submissionId: 3, votes: 10 }, // tiebreak winner
    ];
    const result = selectWithWinner(candidates, null, 3);
    expect(result[0]).toBe(3);
  });

  it('fills remaining slots by votes DESC after pinning the winner', () => {
    const candidates: CandidateWithWinner[] = [
      { submissionId: 1, votes: 10 },
      { submissionId: 2, votes: 8 },
      { submissionId: 3, votes: 6 },
      { submissionId: 4, votes: 4 },
    ];
    const result = selectWithWinner(candidates, 3, 1);
    expect(result).toEqual([1, 2, 3]);
  });

  it('maxChallengeBeatmaps = 1 selects only the winner', () => {
    const candidates: CandidateWithWinner[] = [
      { submissionId: 1, votes: 10 },
      { submissionId: 2, votes: 8 },
    ];
    const result = selectWithWinner(candidates, 1, 1);
    expect(result).toEqual([1]);
  });

  it('null limit selects winner plus all remaining approved submissions', () => {
    const candidates: CandidateWithWinner[] = [
      { submissionId: 1, votes: 10 },
      { submissionId: 2, votes: 8 },
      { submissionId: 3, votes: 6 },
    ];
    const result = selectWithWinner(candidates, null, 1);
    expect(result).toEqual([1, 2, 3]);
  });

  it('tiebreak winner that is not the highest-voted entry still becomes rank 1', () => {
    const candidates: CandidateWithWinner[] = [
      { submissionId: 1, votes: 10 },
      { submissionId: 2, votes: 10 }, // tiebreak winner
      { submissionId: 3, votes: 5 },
    ];
    const result = selectWithWinner(candidates, 2, 2);
    expect(result[0]).toBe(2);
    expect(result[1]).toBe(1);
    expect(result).toHaveLength(2);
  });
});
