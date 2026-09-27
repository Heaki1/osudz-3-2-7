import { pool } from '../db.js';
import { getLivePlayerDzpp } from './dzpp.js';

export const CHALLENGE_WIN_LEVELS = 5;
export const DZPP_PER_LEVEL = 100;
export const LEVEL_50_REWARD = 'Four months of osu!supporter';
export const LEVEL_50_REWARD_LEVEL = 50;

async function claimLevelRushWinner(userId: number, level: number): Promise<number | null> {
  if (level < LEVEL_50_REWARD_LEVEL) return null;

  await pool.query(
    `INSERT INTO level_rush_winner (id, winner_user_id)
     VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [userId],
  );

  const { rows } = await pool.query<{ winner_user_id: number }>(
    'SELECT winner_user_id FROM level_rush_winner WHERE id = 1',
  );
  return rows[0]?.winner_user_id ?? null;
}

export interface LevelRushEntry {
  rank: number;
  userId: number;
  username: string;
  avatarUrl: string;
  level: number;
  baseLevel: number;
  dzpp: number;
  challengeWins: number;
  challengeWinLevels: number;
  levelProgress: number;
  level50Reward: string | null;
}

export async function getLevelRush(limit = 10): Promise<LevelRushEntry[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 25);
  const { rows } = await pool.query<{
    user_id: number;
    username: string;
    avatar_url: string | null;
    dzpp: number;
    challenge_wins: number;
  }>(
    `WITH totals AS (
       SELECT user_id, COALESCE(SUM(final_dzpp), 0)::int AS dzpp
         FROM round_dzpp
        GROUP BY user_id
     ), wins AS (
       SELECT d.user_id, COUNT(DISTINCT d.round_id)::int AS challenge_wins
         FROM round_dzpp_maps d
         JOIN rounds r ON r.id = d.round_id
        WHERE d.placement = 1
          AND r.winning_submission_id IS NOT NULL
          AND d.submission_id = r.winning_submission_id
        GROUP BY d.user_id
     )
     SELECT u.id AS user_id,
            u.username,
            u.avatar_url,
            COALESCE(t.dzpp, 0)::int AS dzpp,
            COALESCE(w.challenge_wins, 0)::int AS challenge_wins
       FROM users u
       LEFT JOIN totals t ON t.user_id = u.id
       LEFT JOIN wins w ON w.user_id = u.id
      ORDER BY
        (GREATEST(1, FLOOR(COALESCE(t.dzpp, 0) / $1) + 1) + COALESCE(w.challenge_wins, 0) * $2) DESC,
        COALESCE(t.dzpp, 0) DESC,
        COALESCE(w.challenge_wins, 0) DESC,
        u.id ASC
      LIMIT $3`,
    [DZPP_PER_LEVEL, CHALLENGE_WIN_LEVELS, safeLimit],
  );

  const winnerResult = await pool.query<{ winner_user_id: number }>(
    'SELECT winner_user_id FROM level_rush_winner WHERE id = 1',
  );
  const winnerUserId = winnerResult.rows[0]?.winner_user_id ?? null;

  return rows.map((row, index) => {
    const progression = calculatePlayerLevel(row.dzpp, row.challenge_wins);
    const isWinner = row.user_id === winnerUserId;
    return {
      rank: index + 1,
      userId: row.user_id,
      username: row.username,
      avatarUrl: row.avatar_url ?? '',
      ...progression,
      dzpp: row.dzpp,
      level50Reward: isWinner ? LEVEL_50_REWARD : null,
    };
  });
}

export function calculatePlayerLevel(dzpp: number, challengeWins: number) {
  const safeDzpp = Math.max(0, dzpp);
  const baseLevel = Math.max(1, Math.floor(safeDzpp / DZPP_PER_LEVEL) + 1);
  const challengeWinLevels = Math.max(0, challengeWins) * CHALLENGE_WIN_LEVELS;
  const level = baseLevel + challengeWinLevels;
  const currentBase = (baseLevel - 1) * DZPP_PER_LEVEL;
  const nextBase = baseLevel * DZPP_PER_LEVEL;

  return {
    level,
    baseLevel,
    challengeWins: Math.max(0, challengeWins),
    challengeWinLevels,
    levelProgress: Math.min(1, Math.max(0, (dzpp - currentBase) / Math.max(1, nextBase - currentBase))),
    nextLevelDzpp: nextBase,
    level50Reward: level >= LEVEL_50_REWARD_LEVEL ? LEVEL_50_REWARD : null,
  };
}

export interface ActivityEventRow {
  id: number;
  user_id: number | null;
  username: string | null;
  avatar_url: string | null;
  round_id: number | null;
  round_number: number | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

export async function addActivity(
  type: string,
  payload: Record<string, unknown>,
  userId?: number | null,
  roundId?: number | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO activity_events (user_id, round_id, type, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [userId ?? null, roundId ?? null, type, JSON.stringify(payload)],
  );
}

export async function listActivity(limit = 30): Promise<ActivityEventRow[]> {
  const { rows } = await pool.query<ActivityEventRow>(
    `SELECT a.*, u.username, u.avatar_url, r.round_number
       FROM activity_events a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN rounds r ON r.id = a.round_id
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return rows;
}

export async function getPlayerProgress(userId: number) {
  const { rows } = await pool.query<{
    dzpp: number; rounds: number; wins: number; best: number | null; submissions: number; votes: number;
  }>(`
    SELECT
      COALESCE((SELECT SUM(final_dzpp)::int FROM round_dzpp WHERE user_id = $1), 0) AS dzpp,
      (SELECT COUNT(*)::int FROM round_dzpp WHERE user_id = $1) AS rounds,
      (SELECT COUNT(DISTINCT d.round_id)::int
         FROM round_dzpp_maps d
         JOIN rounds r ON r.id = d.round_id
        WHERE d.user_id = $1
          AND d.placement = 1
          AND d.submission_id = r.winning_submission_id
          AND r.winning_submission_id IS NOT NULL) AS wins,
      (SELECT MIN(placement)::int FROM round_dzpp WHERE user_id = $1 AND placement IS NOT NULL) AS best,
      (SELECT COUNT(*)::int FROM submissions WHERE user_id = $1 AND status = 'approved') AS submissions,
      (SELECT COUNT(*)::int FROM votes WHERE user_id = $1) AS votes
  `, [userId]);
  const row = rows[0];
  const liveRound = await pool.query<{ id: number }>("SELECT id FROM rounds WHERE phase = 'challenge' ORDER BY round_number DESC LIMIT 1");
  const liveDzpp = liveRound.rows[0] ? await getLivePlayerDzpp(liveRound.rows[0].id, userId) : 0;
  row.dzpp += liveDzpp;
  const progression = calculatePlayerLevel(row.dzpp, row.wins);
  const winnerUserId = await claimLevelRushWinner(userId, progression.level);
  return {
    ...row,
    liveDzpp,
    ...progression,
    level50Reward: winnerUserId === userId ? LEVEL_50_REWARD : null,
  };
}

export async function getPlayerStreak(userId: number) {
  const { rows } = await pool.query<{ round_number: number; won: boolean }>(
    `SELECT r.round_number, (d.placement = 1) AS won
       FROM round_dzpp d JOIN rounds r ON r.id = d.round_id
      WHERE d.user_id = $1 ORDER BY r.round_number DESC`, [userId]);
  let current = 0;
  for (const row of rows) { if (!row.won) break; current++; }
  let best = 0;
  let run = 0;
  for (const row of [...rows].reverse()) { run = row.won ? run + 1 : 0; best = Math.max(best, run); }
  return { currentWins: current, bestWins: best, rounds: rows.length };
}

export async function getMappingStats(userId?: number) {
  const args = userId === undefined ? [] : [userId];
  const where = userId === undefined ? '' : 'WHERE s.user_id = $1';
  const { rows } = await pool.query<{ submissions: number; approved: number; votes_received: number; rounds: number }>(
    `SELECT COUNT(*)::int AS submissions,
            COUNT(*) FILTER (WHERE s.status = 'approved')::int AS approved,
            COALESCE(SUM(v.vote_count), 0)::int AS votes_received,
            COUNT(DISTINCT s.round_id)::int AS rounds
       FROM submissions s
       LEFT JOIN LATERAL (SELECT COUNT(*)::int AS vote_count FROM votes WHERE submission_id = s.id) v ON true
      ${where}`,
    args,
  );
  return rows[0];
}

export async function comparePlayers(userA: string, userB: string) {
  const { rows } = await pool.query(`
    WITH totals AS (
      SELECT user_id, COALESCE(SUM(final_dzpp),0)::int dzpp,
             COUNT(*)::int rounds, COUNT(*) FILTER (WHERE placement=1)::int wins,
             MIN(placement)::int best
      FROM round_dzpp GROUP BY user_id
    )
    SELECT u.id user_id, u.username, u.osu_id::text osu_id, u.avatar_url,
           u.global_rank, COALESCE(t.dzpp,0) dzpp, COALESCE(t.rounds,0) rounds,
           COALESCE(t.wins,0) wins, t.best
      FROM users u LEFT JOIN totals t ON t.user_id=u.id
     WHERE lower(u.username) IN (lower($1), lower($2))`, [userA, userB]);
  return rows;
}

export interface RoundRecapRow {
  id: number;
  round_number: number;
  month: string;
  year: number;
  created_at: Date;
  winner_vote_count: number;
  total_votes: number;
  title: string | null;
  artist: string | null;
  difficulty_name: string | null;
  cover_url: string | null;
  submitted_by: number | null;
}

export async function getLatestRoundRecap(): Promise<{
  round: RoundRecapRow | null;
  nextStart: Date | null;
}> {
  const { rows } = await pool.query<RoundRecapRow>(`
    SELECT r.id, r.round_number, r.month, r.year, r.created_at,
           r.winner_vote_count, r.total_votes,
           s.title, s.artist, s.difficulty_name, s.cover_url, s.submitted_by
      FROM rounds r
      LEFT JOIN submissions s ON s.id = r.winning_submission_id
     WHERE r.phase = 'ended'
     ORDER BY r.round_number DESC LIMIT 1`);
  const round = rows[0] ?? null;
  if (!round) return { round: null, nextStart: null };

  const next = await pool.query<{ created_at: Date }>(
    'SELECT created_at FROM rounds WHERE round_number > $1 ORDER BY round_number ASC LIMIT 1',
    [round.round_number],
  );
  return { round, nextStart: next.rows[0]?.created_at ?? null };
}
