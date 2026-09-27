import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query<{
      players: number;
      submissions: number;
      votes: number;
      challenges: number;
      winners: number;
    }>(`
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

    res.json(rows[0]);
  } catch (err) {
    console.error(
      '[stats] GET / failed:',
      err instanceof Error ? err.message : err
    );
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

export default router;
