import { pool } from '../db.js';

export interface ChallengeMapOwnershipRow {
  round_id: number;
  submission_id: number;
  round_number: number;
  month: string;
  year: number;
  title: string;
  artist: string;
  mapper: string;
  difficulty_name: string;
  difficulty_id: number;
  beatmapset_id: number;
  stars: string;
  bpm: number;
  length_seconds: number;
  map_status: string;
  cs: string | null;
  ar: string | null;
  od: string | null;
  hp: string | null;
  cover_url: string;
  preview_url: string;
  mod_requirement: string;
  challenge_requirement: string;
  final_dzpp: number;
  placement: number | null;
  perfection_eligible: boolean;
  acquired_at: string;
  owner_user_id: number;
  owner_username: string;
}

export async function getChallengeMapCollection(userId: number): Promise<ChallengeMapOwnershipRow[]> {
  const result = await pool.query<ChallengeMapOwnershipRow>(`
    WITH winners AS (
      SELECT DISTINCT ON (rdm.round_id, rdm.submission_id)
        rdm.round_id,
        rdm.submission_id,
        rdm.final_dzpp,
        rdm.placement,
        rdm.user_id AS original_winner_id
      FROM round_dzpp_maps rdm
      WHERE rdm.placement = 1
      ORDER BY rdm.round_id, rdm.submission_id, rdm.finalized_at DESC
    ), current_ownership AS (
      SELECT round_id, submission_id, user_id, acquired_at
      FROM challenge_map_ownership
      WHERE lost_at IS NULL
    )
    SELECT
      w.round_id,
      w.submission_id,
      r.round_number,
      r.month,
      r.year,
      s.title,
      s.artist,
      s.mapper,
      s.difficulty_name,
      s.difficulty_id,
      s.beatmapset_id,
      s.stars,
      s.bpm,
      s.length_seconds,
      s.map_status,
      s.cs,
      s.ar,
      s.od,
      s.hp,
      COALESCE(s.cover_url, '') AS cover_url,
      COALESCE(s.preview_url, '') AS preview_url,
      s.mod_requirement,
      s.challenge_requirement,
      w.final_dzpp,
      w.placement,
      (
        EXISTS (
          SELECT 1 FROM submissions ps
          WHERE ps.round_id = w.round_id
            AND ps.user_id = COALESCE(co.user_id, w.original_winner_id)
            AND ps.status = 'approved'
        )
        AND EXISTS (
          SELECT 1 FROM votes pv
          WHERE pv.round_id = w.round_id
            AND pv.user_id = COALESCE(co.user_id, w.original_winner_id)
        )
      ) AS perfection_eligible,
      COALESCE(co.acquired_at, r.created_at) AS acquired_at,
      COALESCE(co.user_id, w.original_winner_id) AS owner_user_id,
      u.username AS owner_username
    FROM winners w
    JOIN submissions s ON s.id = w.submission_id
    JOIN rounds r ON r.id = w.round_id
    LEFT JOIN current_ownership co
      ON co.round_id = w.round_id AND co.submission_id = w.submission_id
    JOIN users u ON u.id = COALESCE(co.user_id, w.original_winner_id)
    WHERE COALESCE(co.user_id, w.original_winner_id) = $1
    ORDER BY COALESCE(co.acquired_at, r.created_at) DESC, w.round_id DESC
  `, [userId]);

  return result.rows;
}

export async function transferChallengeMap(
  senderId: number,
  roundId: number,
  submissionId: number,
  recipientUsername: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const recipient = await client.query<{ id: number; username: string }>(
      'SELECT id, username FROM users WHERE lower(username) = lower($1) LIMIT 1',
      [recipientUsername.trim()],
    );
    if (recipient.rowCount === 0) throw new Error('Recipient player was not found.');
    const recipientId = recipient.rows[0].id;
    if (recipientId === senderId) throw new Error('You cannot gift a challenge map to yourself.');

    const winner = await client.query<{ user_id: number }>(
      `SELECT user_id FROM round_dzpp_maps
       WHERE round_id = $1 AND submission_id = $2 AND placement = 1
       ORDER BY finalized_at DESC LIMIT 1`,
      [roundId, submissionId],
    );
    if (winner.rowCount === 0) throw new Error('That challenge map is not transferable.');

    const current = await client.query<{ id: number; user_id: number }>(
      `SELECT id, user_id FROM challenge_map_ownership
       WHERE round_id = $1 AND submission_id = $2 AND lost_at IS NULL
       FOR UPDATE`,
      [roundId, submissionId],
    );

    const ownerId = current.rowCount ? current.rows[0].user_id : winner.rows[0].user_id;
    if (ownerId !== senderId) throw new Error('You do not own this challenge map.');

    if (current.rowCount) {
      await client.query(
        'UPDATE challenge_map_ownership SET lost_at = now() WHERE id = $1',
        [current.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO challenge_map_ownership (round_id, submission_id, user_id)
         VALUES ($1, $2, $3)`,
        [roundId, submissionId, senderId],
      );
    }

    await client.query(
      `INSERT INTO challenge_map_ownership (round_id, submission_id, user_id)
       VALUES ($1, $2, $3)`,
      [roundId, submissionId, recipientId],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
