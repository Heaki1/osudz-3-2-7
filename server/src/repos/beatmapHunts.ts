import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import type { HuntRequirements, HuntTier, HuntType } from '../domain/beatmapHunts/rules.js';
import { seasonForRoundNumber } from '../domain/shop/pricing.js';

const HUNT_SELECT =
  "SELECT h.id, h.poster_user_id, poster.username AS poster_username, h.hunt_type, h.status, h.auto_tier, h.admin_tier, " +
  "h.beatmap_id, h.beatmapset_id, h.title, h.artist, h.mapper, h.difficulty_name, h.cover_url, h.preview_url, h.stars, h.kingdom, " +
  "h.cs, h.ar, h.od, h.hp, h.max_combo, h.bounty_dzp, h.escrowed_dzp, h.requirements, h.description, h.target_score_id, " +
  "h.target_score_user_id, h.target_score_data, h.upgrade_required_dzp, h.expires_at, h.published_at, h.completed_at, " +
  "h.winner_user_id, winner.username AS winner_username, h.winner_attempt_id, h.created_at " +
  "FROM beatmap_hunts h JOIN users poster ON poster.id = h.poster_user_id LEFT JOIN users winner ON winner.id = h.winner_user_id ";

export async function findHunt(id: string, db: PoolClient | typeof pool = pool) {
  const { rows } = await db.query(HUNT_SELECT + "WHERE h.id = $1", [id]);
  return rows[0] ?? null;
}

export async function listHunts(status: 'ACTIVE' | 'CLAIMED', tier: HuntTier | null, kingdom: string | null = null, limit = 100, offset = 0) {
  const values: unknown[] = [status];
  const where = ["h.status = $1"];
  if (kingdom) { values.push(kingdom); where.push("h.kingdom = $" + values.length); }
  if (tier) {
    values.push(tier);
    where.push("COALESCE(h.admin_tier, h.auto_tier) = $" + values.length);
  }
  values.push(Math.min(Math.max(limit, 1), 200), Math.max(offset, 0));
  const { rows } = await pool.query(
    HUNT_SELECT + "WHERE " + where.join(" AND ") + " ORDER BY h.created_at DESC, h.id LIMIT $" + (values.length - 1) + " OFFSET $" + values.length,
    values,
  );
  return rows;
}

export async function listAdminHunts(limit = 200) {
  const { rows } = await pool.query(
    HUNT_SELECT + "WHERE h.status IN ('ACTIVE', 'PENDING_UPGRADE') ORDER BY h.status DESC, h.created_at DESC LIMIT $1",
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows;
}

export async function insertHunt(input: {
  posterUserId: number; huntType: HuntType; autoTier: HuntTier; beatmapId: number; beatmapsetId: number;
  kingdom: string;
  title: string; artist: string; mapper: string; difficultyName: string; coverUrl: string | null; previewUrl: string | null;
  stars: number; cs: number | null; ar: number | null; od: number | null; hp: number | null; maxCombo: number | null;
  bountyDzp: number; requirements: HuntRequirements; description: string; targetScoreId: number | null;
  targetScoreUserId: number | null; targetScoreData: Record<string, unknown> | null; expiresAt: Date;
}, client: PoolClient) {
  const id = crypto.randomUUID();
  await client.query(
    "INSERT INTO beatmap_hunts (id, poster_user_id, hunt_type, auto_tier, beatmap_id, beatmapset_id, title, artist, mapper, difficulty_name, cover_url, preview_url, stars, kingdom, cs, ar, od, hp, max_combo, bounty_dzp, escrowed_dzp, requirements, description, target_score_id, target_score_user_id, target_score_data, expires_at) " +
    "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19, $20, $21::jsonb, $22, $23, $24, $25::jsonb, $26)",
    [id, input.posterUserId, input.huntType, input.autoTier, input.beatmapId, input.beatmapsetId, input.title, input.artist, input.mapper, input.difficultyName, input.coverUrl, input.previewUrl, input.stars, input.kingdom, input.cs, input.ar, input.od, input.hp, input.maxCombo, input.bountyDzp, JSON.stringify(input.requirements), input.description, input.targetScoreId, input.targetScoreUserId, input.targetScoreData ? JSON.stringify(input.targetScoreData) : null, input.expiresAt],
  );
  return id;
}

export async function getCurrentSeason(client: PoolClient) {
  const { rows } = await client.query(
    "SELECT COALESCE((SELECT round_number FROM rounds WHERE phase <> 'ended' ORDER BY round_number DESC LIMIT 1), (SELECT MAX(round_number) FROM rounds)) AS round_number",
  );
  return seasonForRoundNumber(rows[0]?.round_number == null ? null : Number(rows[0].round_number));
}

export async function getSpendableBalance(userId: number, season: number, client: PoolClient) {
  const { rows } = await client.query("SELECT COALESCE(SUM(amount_dzp), 0)::int AS balance_dzp FROM dzp_ledger WHERE user_id = $1 AND season = $2", [userId, season]);
  return Number(rows[0]?.balance_dzp ?? 0);
}

export async function insertLedger(input: { userId: number | null; season: number; amountDzp: number; transactionType: string; referenceId: string; description: string }, client: PoolClient) {
  const { rows } = await client.query(
    "INSERT INTO dzp_ledger (user_id, round_id, item_id, season, amount_dzp, transaction_type, reference_id, description) VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6) RETURNING id::text",
    [input.userId, input.season, input.amountDzp, input.transactionType, input.referenceId, input.description],
  );
  return rows[0].id as string;
}

export async function insertAttempt(input: {
  id: string; huntId: string; userId: number; osuScoreId: number; score: number; accuracy: number; maxCombo: number; misses: number;
  mods: string; pp: number | null; passed: boolean; qualifies: boolean; failureReason: string | null; penaltyReason: string | null;
  guildExpDelta: number;
}, client: PoolClient) {
  await client.query(
    "INSERT INTO beatmap_hunt_attempts (id, hunt_id, user_id, osu_score_id, score, accuracy, max_combo, misses, mods, pp, passed, qualifies, failure_reason, penalty_reason, guild_exp_delta) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
    [input.id, input.huntId, input.userId, input.osuScoreId, input.score, input.accuracy, input.maxCombo, input.misses, input.mods, input.pp, input.passed, input.qualifies, input.failureReason, input.penaltyReason, input.guildExpDelta],
  );
}

export async function listAttempts(huntId: string) {
  const { rows } = await pool.query(
    "WITH ranked AS (SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.user_id ORDER BY a.qualifies DESC, a.score DESC, a.accuracy DESC, a.submitted_at ASC, a.id) AS row_for_user FROM beatmap_hunt_attempts a WHERE a.hunt_id = $1 AND a.deleted_at IS NULL) " +
    "SELECT r.id, r.hunt_id, r.user_id, u.username, u.avatar_url, r.osu_score_id, r.score, r.accuracy, r.max_combo, r.misses, r.mods, r.pp, r.passed, r.qualifies, r.failure_reason, r.penalty_reason, r.guild_exp_delta, r.final_placement, r.deleted_at, r.submitted_at FROM ranked r JOIN users u ON u.id = r.user_id WHERE r.row_for_user = 1 ORDER BY r.qualifies DESC, r.score DESC, r.accuracy DESC, r.submitted_at ASC, r.id",
    [huntId],
  );
  return rows;
}

export async function listAttemptHistory(huntId: string, userId: number) {
  const { rows } = await pool.query(
    "SELECT a.id, a.hunt_id, a.user_id, u.username, u.avatar_url, a.osu_score_id, a.score, a.accuracy, a.max_combo, a.misses, a.mods, a.pp, a.passed, a.qualifies, a.failure_reason, a.penalty_reason, a.guild_exp_delta, a.final_placement, a.deleted_at, a.submitted_at FROM beatmap_hunt_attempts a JOIN users u ON u.id = a.user_id WHERE a.hunt_id = $1 AND a.user_id = $2 ORDER BY a.submitted_at DESC, a.id DESC",
    [huntId, userId],
  );
  return rows;
}

export async function deleteAttempt(attemptId: string, userId: number) {
  const result = await pool.query("UPDATE beatmap_hunt_attempts SET deleted_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [attemptId, userId]);
  return result.rowCount === 1;
}

export async function findExistingAttemptForScore(huntId: string, osuScoreId: number) {
  const { rows } = await pool.query("SELECT id, hunt_id, user_id, osu_score_id, score, accuracy, max_combo, misses, mods, pp, passed, qualifies, failure_reason, penalty_reason, guild_exp_delta, final_placement, deleted_at, submitted_at FROM beatmap_hunt_attempts WHERE hunt_id = $1 AND osu_score_id = $2", [huntId, osuScoreId]);
  return rows[0] ?? null;
}

export async function failedAttemptPlacement(input: {
  huntId: string;
  qualifies: boolean;
  score: number;
  accuracy: number;
  submittedAt: Date;
  attemptId: string;
  unqualifiedOnly?: boolean;
}, db: PoolClient | typeof pool = pool) {
  const values: unknown[] = [input.huntId, input.score, input.accuracy, input.submittedAt, input.attemptId];
  const rows = await db.query(
    "SELECT COUNT(*)::int AS count FROM beatmap_hunt_attempts a WHERE a.hunt_id = $1 AND a.deleted_at IS NULL AND a.qualifies = false AND (a.score > $2 OR (a.score = $2 AND a.accuracy > $3) OR (a.score = $2 AND a.accuracy = $3 AND a.submitted_at < $4) OR (a.score = $2 AND a.accuracy = $3 AND a.submitted_at = $4 AND a.id < $5))",
    values,
  );
  let placement = Number(rows.rows[0]?.count ?? 0) + 1;
  if (!input.unqualifiedOnly && input.qualifies) placement = 1;
  if (!input.unqualifiedOnly && !input.qualifies) {
    const qualified = await db.query(
      "SELECT COUNT(*)::int AS count FROM beatmap_hunt_attempts WHERE hunt_id = $1 AND deleted_at IS NULL AND qualifies = true",
      [input.huntId],
    );
    placement += Number(qualified.rows[0]?.count ?? 0);
  }
  return placement;
}

export async function claimHunt(huntId: string, attemptId: string, winnerUserId: number, client: PoolClient) {
  const result = await client.query("UPDATE beatmap_hunts SET status = 'CLAIMED', completed_at = now(), winner_user_id = $2, winner_attempt_id = $3, updated_at = now() WHERE id = $1 AND status = 'ACTIVE'", [huntId, winnerUserId, attemptId]);
  return result.rowCount === 1;
}

export async function findBestQualifyingAttempt(huntId: string, db: PoolClient | typeof pool = pool) {
  const { rows } = await db.query(
    "SELECT a.id, a.hunt_id, a.user_id, u.username, u.avatar_url, a.osu_score_id, a.score, a.accuracy, a.max_combo, a.misses, a.mods, a.pp, a.passed, a.qualifies, a.failure_reason, a.penalty_reason, a.guild_exp_delta, a.final_placement, a.deleted_at, a.submitted_at FROM beatmap_hunt_attempts a JOIN users u ON u.id = a.user_id WHERE a.hunt_id = $1 AND a.qualifies = true AND a.deleted_at IS NULL ORDER BY a.score DESC, a.accuracy DESC, a.submitted_at ASC, a.id LIMIT 1",
    [huntId],
  );
  return rows[0] ?? null;
}

export async function findFirstQualifyingAttempt(huntId: string, db: PoolClient | typeof pool = pool) {
  const { rows } = await db.query(
    "SELECT a.id, a.hunt_id, a.user_id, u.username, u.avatar_url, a.osu_score_id, a.score, a.accuracy, a.max_combo, a.misses, a.mods, a.pp, a.passed, a.qualifies, a.failure_reason, a.penalty_reason, a.guild_exp_delta, a.final_placement, a.deleted_at, a.submitted_at FROM beatmap_hunt_attempts a JOIN users u ON u.id = a.user_id WHERE a.hunt_id = $1 AND a.qualifies = true AND a.deleted_at IS NULL ORDER BY a.submitted_at ASC, a.id LIMIT 1",
    [huntId],
  );
  return rows[0] ?? null;
}

export async function finalizeChallengeHunt(huntId: string, winner: { id: string; user_id: number } | null, client: PoolClient) {
  const lock = await client.query("SELECT status FROM beatmap_hunts WHERE id = $1 FOR UPDATE", [huntId]);
  const status = lock.rows[0]?.status;
  if (!status) throw new Error('Hunt not found');
  if (status !== 'ACTIVE') return 'ALREADY_DONE' as const;
  if (!winner) {
    await client.query("UPDATE beatmap_hunts SET status = 'EXPIRED', completed_at = now(), updated_at = now() WHERE id = $1", [huntId]);
    return 'EXPIRED' as const;
  }
  await client.query("UPDATE beatmap_hunts SET status = 'CLAIMED', completed_at = now(), winner_user_id = $2, winner_attempt_id = $3, updated_at = now() WHERE id = $1", [huntId, winner.user_id, winner.id]);
  return 'CLAIMED' as const;
}

export async function assignFinalPlacements(huntId: string, client: PoolClient) {
  await client.query(
    "WITH ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY qualifies DESC, score DESC, accuracy DESC, submitted_at ASC, id)::int AS placement FROM beatmap_hunt_attempts WHERE hunt_id = $1 AND deleted_at IS NULL) UPDATE beatmap_hunt_attempts a SET final_placement = ranked.placement, updated_at = now() FROM ranked WHERE a.id = ranked.id",
    [huntId],
  );
}

export async function addAttemptExp(attemptId: string, delta: number, client: PoolClient) {
  await client.query("UPDATE beatmap_hunt_attempts SET guild_exp_delta = guild_exp_delta + $2, updated_at = now() WHERE id = $1", [attemptId, delta]);
}

export async function listQualifyingPlacements(huntId: string, client: PoolClient) {
  const { rows } = await client.query(
    "SELECT id, user_id, final_placement FROM beatmap_hunt_attempts WHERE hunt_id = $1 AND qualifies = true AND deleted_at IS NULL ORDER BY final_placement ASC",
    [huntId],
  );
  return rows;
}

export async function listTopPlacements(huntId: string, client: PoolClient, limit = 10) {
  const { rows } = await client.query(
    "SELECT id, user_id, qualifies, penalty_reason, final_placement FROM beatmap_hunt_attempts WHERE hunt_id = $1 AND deleted_at IS NULL AND final_placement BETWEEN 1 AND $2 ORDER BY final_placement ASC",
    [huntId, Math.min(Math.max(limit, 1), 10)],
  );
  return rows;
}

export async function listReports(status: 'PENDING' | 'ALL' = 'PENDING') {
  const where = status === 'PENDING' ? "WHERE r.status = 'PENDING' " : '';
  const { rows } = await pool.query(
    "SELECT r.id, r.reason, r.status, r.created_at, r.resolution_note, r.attempt_id, a.hunt_id, a.user_id, u.username, a.score, a.accuracy, a.mods, a.qualifies FROM hunt_reports r JOIN beatmap_hunt_attempts a ON a.id = r.attempt_id JOIN users u ON u.id = a.user_id " +
    where + "ORDER BY r.created_at DESC LIMIT 500",
  );
  return rows;
}

export async function createReport(attemptId: string, reporterUserId: number, reason: string) {
  const id = crypto.randomUUID();
  await pool.query("INSERT INTO hunt_reports (id, attempt_id, reporter_user_id, reason) VALUES ($1, $2, $3, $4)", [id, attemptId, reporterUserId, reason]);
  return id;
}

export async function resolveReport(reportId: string, status: 'RESOLVED_BANNED' | 'RESOLVED_CLEARED', adminUserId: number, note: string) {
  const result = await pool.query("UPDATE hunt_reports SET status = $2, resolved_by = $3, resolution_note = $4, resolved_at = now() WHERE id = $1 AND status = 'PENDING'", [reportId, status, adminUserId, note]);
  return result.rowCount === 1;
}

export async function setAdminTier(huntId: string, adminTier: HuntTier, reason: string, requiredTopUpDzp: number, adminUserId: number, client: PoolClient) {
  const lock = await client.query("SELECT auto_tier, admin_tier FROM beatmap_hunts WHERE id = $1 FOR UPDATE", [huntId]);
  const hunt = lock.rows[0];
  if (!hunt) throw new Error('Hunt not found');
  await client.query("UPDATE beatmap_hunts SET admin_tier = $2, status = CASE WHEN status = 'ACTIVE' AND $3 > 0 THEN 'PENDING_UPGRADE' ELSE status END, upgrade_required_dzp = $3, admin_override_reason = $4, updated_at = now() WHERE id = $1", [huntId, adminTier, requiredTopUpDzp, reason]);
  await client.query("INSERT INTO guild_hunt_admin_actions (hunt_id, admin_user_id, action, previous_tier, new_tier, required_top_up_dzp, reason) VALUES ($1, $2, 'TIER_OVERRIDE', $3, $4, $5, $6)", [huntId, adminUserId, hunt.admin_tier ?? hunt.auto_tier, adminTier, requiredTopUpDzp, reason]);
}

export async function republishAfterUpgrade(huntId: string, client: PoolClient) {
  await client.query(
    "UPDATE beatmap_hunts SET status = 'ACTIVE', bounty_dzp = bounty_dzp + upgrade_required_dzp, escrowed_dzp = escrowed_dzp + upgrade_required_dzp, upgrade_required_dzp = 0, updated_at = now() WHERE id = $1 AND status = 'PENDING_UPGRADE'",
    [huntId],
  );
}

export async function findAttempt(id: string) {
  const { rows } = await pool.query("SELECT id, hunt_id, user_id, osu_score_id, score, accuracy, max_combo, misses, mods, pp, passed, qualifies, failure_reason, penalty_reason, guild_exp_delta, final_placement, deleted_at, submitted_at FROM beatmap_hunt_attempts WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function listExpiredActiveHunts(limit = 50) {
  const { rows } = await pool.query(
    "SELECT id FROM beatmap_hunts WHERE status = 'ACTIVE' AND expires_at <= now() ORDER BY expires_at ASC LIMIT $1",
    [Math.min(Math.max(limit, 1), 200)],
  );
  return rows as Array<{ id: string }>;
}
