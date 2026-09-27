import { pool } from '../db.js';

export interface PlatformStatsRow {
  players: number;
  submissions: number;
  votes: number;
  challenges: number;
  winners: number;
}

export async function getPlatformStats(): Promise<PlatformStatsRow> {
  const { rows } = await pool.query<PlatformStatsRow>(`
    WITH current_round AS (
      SELECT id
      FROM rounds
      WHERE phase <> 'ended'
      ORDER BY round_number DESC
      LIMIT 1
    )
    SELECT
      (SELECT COUNT(*)::int
         FROM users) AS players,

      (SELECT COUNT(*)::int
         FROM submissions
        WHERE round_id = (SELECT id FROM current_round)
          AND status = 'approved') AS submissions,

      (SELECT COUNT(*)::int
         FROM votes
        WHERE round_id = (SELECT id FROM current_round)) AS votes,

      (SELECT COUNT(*)::int
         FROM challenge_scores
        WHERE round_id = (SELECT id FROM current_round)) AS challenges,

      (SELECT COUNT(*)::int
         FROM rounds
        WHERE phase = 'ended'
          AND winner_status = 'official') AS winners
  `);
  return rows[0];
}
