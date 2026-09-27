// Challenge-phase scores.
//
// Since migration 020 each score is tied to a specific challenge beatmap via
// submission_id. The unique constraint is now (round_id, submission_id, user_id)
// so a player can post one score per beatmap per round.
//
// submission_id is nullable for rows written before 020; all new rows carry it.

import { pool } from '../db.js';

export interface ChallengeScoreRow {
  id: number;
  round_id: number;
  submission_id: number | null;
  user_id: number;
  /** bigint: pg hands these back as strings. */
  score: string;
  /** numeric(5,2), also a string. Stored as a percentage, 0.00 to 100.00. */
  accuracy: string;
  misses: number;
  /** Maximum combo achieved by the imported osu! play. */
  max_combo: number;
  /** Maximum combo of the challenge beatmap used for the Full Combo check. */
  beatmap_max_combo: number;
  mods: string;
  qualified: boolean;
  /** numeric(8,2), also a string. Null when osu! reported no pp for the play. */
  pp: string | null;
  osu_score_id: string | null;
  submitted_at: Date;
  /** Joined from users, for the leaderboard. */
  username: string;
  osu_id: string;
  avatar_url: string | null;
}

export interface NewChallengeScore {
  roundId: number;
  submissionId: number | null;
  userId: number;
  score: number;
  /** A percentage, 0-100. The osu! API reports a 0..1 fraction; convert before here. */
  accuracy: number;
  misses: number;
  /** Maximum combo achieved by the imported osu! play. Required for osu! imports; manual admin entries may omit it. */
  maxCombo?: number;
  /** Maximum combo of the challenge beatmap. Required for osu! imports; manual admin entries may omit it. */
  beatmapMaxCombo?: number;
  /** Acronyms joined with no separator ('HDHR'), or 'NM' for a no-mod play. */
  mods: string;
  qualified: boolean;
  /** osu! pp for the play, or null when osu! reported none. The DZPP performance term. */
  pp: number | null;
  /** The osu! score id when this came from the API; null when entered by hand. */
  osuScoreId: number | null;
}

const COLUMNS = `cs.id, cs.round_id, cs.submission_id, cs.user_id, cs.score, cs.accuracy, cs.misses,
                 cs.max_combo, cs.beatmap_max_combo, cs.mods, cs.qualified, cs.pp, cs.osu_score_id, cs.submitted_at,
                 u.username, u.osu_id, u.avatar_url`;

const SELECT = `SELECT ${COLUMNS} FROM challenge_scores cs JOIN users u ON u.id = cs.user_id`;

// ── Qualification ────────────────────────────────────────────────────────────

const IGNORED_MODS = ['CL'];

/** Splits a stored mod string ('HDHR') into acronyms (['HD', 'HR']). */
export function splitMods(mods: string): string[] {
  const text = mods.trim().toUpperCase();
  if (text === '' || text === 'NM') return [];
  return (text.match(/.{1,2}/g) ?? []).filter((acronym) => !IGNORED_MODS.includes(acronym));
}

export function modComplies(play: { mods: string }, modRequirement: string): boolean {
  const modReq = modRequirement.trim().toUpperCase();
  if (modReq === 'FM') return true;
  const required = splitMods(modRequirement);
  const played = splitMods(play.mods);
  // EXACT match: the play must use exactly the required mods — no more, no less.
  // A play with HDHR does NOT satisfy an HD requirement; the player must use HD only.
  // NM (no mods) is required.length === 0 and played.length === 0.
  if (required.length !== played.length) return false;
  return required.every((acronym) => played.includes(acronym));
}

export function qualifies(
  play: { mods: string; misses: number; maxCombo: number; beatmapMaxCombo: number },
  requirement: { modRequirement: string; challengeRequirement: string }
): boolean {
  if (!modComplies(play, requirement.modRequirement)) return false;
  if (requirement.challengeRequirement !== 'Full Combo') return true;
  return play.misses === 0 && play.beatmapMaxCombo > 0 && play.maxCombo === play.beatmapMaxCombo;
}

export function orderFor(challengeRequirement: string): string {
  switch (challengeRequirement) {
    case 'Best Accuracy':    return 'cs.accuracy DESC, cs.score DESC';
    case 'Lowest Miss Count': return 'cs.misses ASC, cs.score DESC';
    default:                  return 'cs.score DESC';
  }
}

// ── Reads and writes ─────────────────────────────────────────────────────────

/**
 * Scores for one challenge beatmap in a round, best first.
 * Pass submissionId to scope to a specific beatmap (post-020).
 * Omit it to read all scores for the round (legacy / pre-020 rounds).
 */
export async function listForRound(
  roundId: number,
  challengeRequirement: string,
  submissionId?: number | null
): Promise<ChallengeScoreRow[]> {
  if (submissionId != null) {
    const { rows } = await pool.query<ChallengeScoreRow>(
      `${SELECT}
        WHERE cs.round_id = $1 AND cs.submission_id = $2
        ORDER BY cs.qualified DESC, ${orderFor(challengeRequirement)}, cs.submitted_at ASC`,
      [roundId, submissionId]
    );
    return rows;
  }
  const { rows } = await pool.query<ChallengeScoreRow>(
    `${SELECT}
      WHERE cs.round_id = $1
      ORDER BY cs.qualified DESC, ${orderFor(challengeRequirement)}, cs.submitted_at ASC`,
    [roundId]
  );
  return rows;
}

/**
 * The caller's score for a specific challenge beatmap in a round.
 * Falls back to any score for the round when submissionId is null.
 */
export async function findForUser(
  roundId: number,
  userId: number,
  submissionId?: number | null
): Promise<ChallengeScoreRow | null> {
  if (submissionId != null) {
    const { rows } = await pool.query<ChallengeScoreRow>(
      `${SELECT} WHERE cs.round_id = $1 AND cs.submission_id = $2 AND cs.user_id = $3`,
      [roundId, submissionId, userId]
    );
    return rows[0] ?? null;
  }
  const { rows } = await pool.query<ChallengeScoreRow>(
    `${SELECT} WHERE cs.round_id = $1 AND cs.user_id = $2`,
    [roundId, userId]
  );
  return rows[0] ?? null;
}

/**
 * Records a play, replacing this user's previous one for this beatmap in the round.
 * Uses (round_id, submission_id, user_id) as the conflict target when submissionId
 * is provided (post-020). Falls back to a plain insert for legacy admin entries.
 */
export async function upsert(score: NewChallengeScore): Promise<ChallengeScoreRow> {
  let id: number;

  if (score.submissionId != null) {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO challenge_scores
         (round_id, submission_id, user_id, score, accuracy, misses,
          max_combo, beatmap_max_combo, mods, qualified, pp, osu_score_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (round_id, submission_id, user_id) DO UPDATE
          SET score             = EXCLUDED.score,
              accuracy          = EXCLUDED.accuracy,
              misses            = EXCLUDED.misses,
              max_combo         = EXCLUDED.max_combo,
              beatmap_max_combo = EXCLUDED.beatmap_max_combo,
              mods              = EXCLUDED.mods,
              qualified         = EXCLUDED.qualified,
              pp                = EXCLUDED.pp,
              osu_score_id      = EXCLUDED.osu_score_id,
              submitted_at      = now()
       RETURNING id`,
      [
        score.roundId, score.submissionId, score.userId,
        score.score, score.accuracy, score.misses,
        score.maxCombo ?? 0, score.beatmapMaxCombo ?? 0,
        score.mods, score.qualified, score.pp, score.osuScoreId,
      ]
    );
    id = rows[0].id;
  } else {
    // Legacy / admin manual path: no submission_id.
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO challenge_scores
         (round_id, user_id, score, accuracy, misses,
          max_combo, beatmap_max_combo, mods, qualified, pp, osu_score_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        score.roundId, score.userId,
        score.score, score.accuracy, score.misses,
        score.maxCombo ?? 0, score.beatmapMaxCombo ?? 0,
        score.mods, score.qualified, score.pp, score.osuScoreId,
      ]
    );
    id = rows[0].id;
  }

  const { rows: full } = await pool.query<ChallengeScoreRow>(`${SELECT} WHERE cs.id = $1`, [id]);
  return full[0];
}

export function toApiChallengeScore(
  row: ChallengeScoreRow,
  rank: number,
  dzpp: number | null,
  modRequirement = ''
) {
  return {
    rank,
    userId: row.user_id,
    osuId: Number(row.osu_id),
    username: row.username,
    avatarUrl: row.avatar_url ?? '',
    score: Number(row.score),
    accuracy: Number(row.accuracy),
    misses: row.misses,
    maxCombo: row.max_combo,
    beatmapMaxCombo: row.beatmap_max_combo,
    mods: row.mods,
    qualified: row.qualified,
    modCompliant: modComplies(row, modRequirement),
    dzpp,
    osuScoreId: row.osu_score_id === null ? null : Number(row.osu_score_id),
    submittedAt: row.submitted_at.toISOString(),
  };
}
