// round_challenge_beatmaps table access.
//
// Records which submissions advanced to the challenge phase for a round, and in
// what vote-rank order. Populated once when the admin approves the winner
// (routes/admin.ts POST /round/winner). Read by GET /api/challenge/beatmaps.

import { pool } from '../db.js';

export interface ChallengeBeatmapRow {
  id: number;
  round_id: number;
  submission_id: number;
  vote_rank: number;
  // Joined from submissions
  title: string;
  artist: string;
  mapper: string;
  difficulty_name: string;
  difficulty_id: string;
  beatmapset_id: string;
  stars: string;
  bpm: number;
  length_seconds: number;
  cover_url: string | null;
  preview_url: string | null;
  mod_requirement: string;
  challenge_requirement: string;
  map_status: string;
}

const SELECT = `
  SELECT rcb.id, rcb.round_id, rcb.submission_id, rcb.vote_rank,
         s.title, s.artist, s.mapper, s.difficulty_name,
         s.difficulty_id, s.beatmapset_id, s.stars, s.bpm, s.length_seconds,
         s.cover_url, s.preview_url, s.mod_requirement, s.challenge_requirement,
         s.map_status
    FROM round_challenge_beatmaps rcb
    JOIN submissions s ON s.id = rcb.submission_id`;

/** All challenge beatmaps for a round, in vote-rank order (1 = most votes). */
export async function listForRound(roundId: number): Promise<ChallengeBeatmapRow[]> {
  const { rows } = await pool.query<ChallengeBeatmapRow>(
    `${SELECT} WHERE rcb.round_id = $1 ORDER BY rcb.vote_rank ASC`,
    [roundId]
  );
  return rows;
}

/** Find one challenge beatmap by round + submission. */
export async function findBySubmission(
  roundId: number,
  submissionId: number
): Promise<ChallengeBeatmapRow | null> {
  const { rows } = await pool.query<ChallengeBeatmapRow>(
    `${SELECT} WHERE rcb.round_id = $1 AND rcb.submission_id = $2`,
    [roundId, submissionId]
  );
  return rows[0] ?? null;
}

/**
 * Inserts the selected challenge beatmaps for a round.
 *
 * Called inside the approveWinner transaction in repo/rounds.ts, using the
 * same client so the insert is atomic with the phase change.
 *
 * winnerId — the submission the administrator approved as the official winner.
 *   It is always persisted as vote_rank = 1, regardless of whether a tiebreak
 *   was involved. This guarantees that winning_submission_id === vote_rank 1.
 *
 * limit — how many beatmaps to select in total (including the winner).
 *   null means all approved submissions.
 *
 * Remaining slots (limit - 1, or all others when limit is null) are filled by
 * the remaining approved submissions ordered by vote count descending, then
 * submission_id ascending for deterministic tie-breaking.
 */
export async function insertFromVotes(
  client: import('pg').PoolClient,
  roundId: number,
  limit: number | null,
  winnerId: number | null
): Promise<void> {
  if (winnerId === null) {
    // No winner recorded (round ended without one) — fall back to pure vote order.
    const limitClause = limit !== null ? `LIMIT ${limit}` : '';
    await client.query(
      `INSERT INTO round_challenge_beatmaps (round_id, submission_id, vote_rank)
       SELECT $1,
              s.id,
              ROW_NUMBER() OVER (ORDER BY COUNT(v.id) DESC, s.id ASC)
         FROM submissions s
         LEFT JOIN votes v ON v.submission_id = s.id
        WHERE s.round_id = $1 AND s.status = 'approved'
        GROUP BY s.id
        ORDER BY COUNT(v.id) DESC, s.id ASC
        ${limitClause}`,
      [roundId]
    );
    return;
  }

  // The winner is pinned to vote_rank = 1. Remaining slots fill from the rest
  // of the approved submissions ordered by votes DESC, id ASC.
  // When limit = 1, only the winner is inserted.
  // When limit = null, all approved submissions are inserted.
  const remainingLimit = limit === null ? null : limit - 1;
  const remainingLimitClause = remainingLimit !== null ? `LIMIT ${remainingLimit}` : '';

  // Insert the winner at rank 1.
  await client.query(
    `INSERT INTO round_challenge_beatmaps (round_id, submission_id, vote_rank)
     VALUES ($1, $2, 1)`,
    [roundId, winnerId]
  );

  if (remainingLimit === 0) return; // limit = 1, winner only

  // Insert the remaining slots, ranked from 2 upward.
  await client.query(
    `INSERT INTO round_challenge_beatmaps (round_id, submission_id, vote_rank)
     SELECT $1,
            s.id,
            ROW_NUMBER() OVER (ORDER BY COUNT(v.id) DESC, s.id ASC) + 1
       FROM submissions s
       LEFT JOIN votes v ON v.submission_id = s.id
      WHERE s.round_id = $1
        AND s.status = 'approved'
        AND s.id <> $2
      GROUP BY s.id
      ORDER BY COUNT(v.id) DESC, s.id ASC
      ${remainingLimitClause}`,
    [roundId, winnerId]
  );
}

/** "2:19" from raw seconds. */
function formatLength(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Maps a row to the ApiChallengeBeatmap DTO. */
export function toApiChallengeBeatmap(row: ChallengeBeatmapRow) {
  return {
    submissionId: row.submission_id,
    voteRank: row.vote_rank,
    title: row.title,
    artist: row.artist,
    mapper: row.mapper,
    difficultyName: row.difficulty_name,
    difficultyId: Number(row.difficulty_id),
    beatmapsetId: Number(row.beatmapset_id),
    stars: Number(row.stars),
    bpm: row.bpm,
    length: formatLength(row.length_seconds),
    coverUrl: row.cover_url ?? '',
    previewUrl: row.preview_url ?? '',
    modRequirement: row.mod_requirement,
    challengeRequirement: row.challenge_requirement,
    mapStatus: row.map_status,
  };
}
