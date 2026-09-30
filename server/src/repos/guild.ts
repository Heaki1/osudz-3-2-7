import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import type { GuildRank, HuntTier } from '../domain/beatmapHunts/rules.js';
import { rankMultiplier, scaleGuildExp, previousRank } from '../domain/beatmapHunts/progression.js';

export async function getGuildProfile(userId: number, db: PoolClient | typeof pool = pool) {
  const { rows } = await db.query(
    "SELECT user_id, registration_status, guild_rank, guild_exp, attempted_hunts, successful_hunts, failed_hunts, exam_used, registered_at, demotion_warning_started_at, demotion_target_rank, family_gate_reset_at, adventurer_name, onboarding_completed, kingdom, travel_started_at, travel_arrives_at, travel_destination, kingdom_cooldown_until FROM user_guild_profiles WHERE user_id = $1",
    [userId],
  );
  return rows[0] ?? {
    user_id: userId, registration_status: 'UNREGISTERED', guild_rank: 'IRON',
    guild_exp: 0, attempted_hunts: 0, successful_hunts: 0, failed_hunts: 0,
    exam_used: false, registered_at: null, demotion_warning_started_at: null,
    demotion_target_rank: null, family_gate_reset_at: null, adventurer_name: null,
    onboarding_completed: false, kingdom: null, travel_started_at: null, travel_arrives_at: null,
    travel_destination: null, kingdom_cooldown_until: null,
  };
}

export async function completeOnboarding(userId: number, input: { adventurerName: string; kingdom: string }, client: PoolClient) {
  const { rows } = await client.query(
    "UPDATE user_guild_profiles SET adventurer_name = $2, kingdom = $3, onboarding_completed = true, updated_at = now() WHERE user_id = $1 AND onboarding_completed = false RETURNING *",
    [userId, input.adventurerName, input.kingdom],
  );
  return rows[0] ?? null;
}

export async function listKingdoms() {
  const { rows } = await pool.query("SELECT kingdom, display_name, capital, lore, travel_cost_dzp, travel_duration_hours, cooldown_months FROM guild_kingdoms WHERE is_active = true ORDER BY kingdom");
  return rows;
}

export async function getKingdom(kingdom: string, db: PoolClient | typeof pool = pool) {
  const { rows } = await db.query("SELECT kingdom, display_name, capital, lore, travel_cost_dzp, travel_duration_hours, cooldown_months FROM guild_kingdoms WHERE kingdom = $1 AND is_active = true", [kingdom]);
  return rows[0] ?? null;
}

export async function startTravel(userId: number, destination: string, client: PoolClient) {
  const { rows } = await client.query(
    "SELECT p.*, k.travel_cost_dzp, k.travel_duration_hours, k.cooldown_months FROM user_guild_profiles p JOIN guild_kingdoms k ON k.kingdom = $2 WHERE p.user_id = $1 FOR UPDATE",
    [userId, destination],
  );
  const profile = rows[0];
  if (!profile) throw new Error('Guild profile or kingdom not found');
  const now = new Date();
  const arrivesAt = new Date(now.getTime() + Number(profile.travel_duration_hours) * 60 * 60 * 1000);
  const cooldownUntil = new Date(arrivesAt);
  cooldownUntil.setMonth(cooldownUntil.getMonth() + Number(profile.cooldown_months));
  const id = cryptoRandomUuid();
  await client.query("INSERT INTO guild_travel_events (id, user_id, from_kingdom, to_kingdom, cost_dzp, started_at, arrives_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [id, userId, profile.kingdom, destination, profile.travel_cost_dzp, now, arrivesAt]);
  await client.query("UPDATE user_guild_profiles SET travel_started_at = $2, travel_arrives_at = $3, travel_destination = $4, kingdom_cooldown_until = $5, updated_at = now() WHERE user_id = $1", [userId, now, arrivesAt, destination, cooldownUntil]);
  return { id, fromKingdom: profile.kingdom, toKingdom: destination, costDzp: Number(profile.travel_cost_dzp), startedAt: now.toISOString(), arrivesAt: arrivesAt.toISOString(), cooldownUntil: cooldownUntil.toISOString() };
}

export async function completeTravel(userId: number, client: PoolClient) {
  const { rows } = await client.query("SELECT * FROM user_guild_profiles WHERE user_id = $1 FOR UPDATE", [userId]);
  const profile = rows[0];
  if (!profile?.travel_destination || !profile.travel_arrives_at) return profile;
  if (new Date(profile.travel_arrives_at).getTime() > Date.now()) return profile;
  await client.query("UPDATE user_guild_profiles SET kingdom = travel_destination, travel_started_at = NULL, travel_arrives_at = NULL, travel_destination = NULL, updated_at = now() WHERE user_id = $1", [userId]);
  await client.query("UPDATE guild_travel_events SET status = 'COMPLETED', completed_at = now() WHERE user_id = $1 AND status = 'IN_TRANSIT' AND arrives_at <= now()", [userId]);
  return (await getGuildProfile(userId, client));
}

export async function registerAsIron(userId: number, client: PoolClient) {
  const { rows } = await client.query(
    "INSERT INTO user_guild_profiles (user_id, registration_status, guild_rank, guild_exp, registered_at) VALUES ($1, 'ACTIVE', 'IRON', 0, now()) " +
    "ON CONFLICT (user_id) DO UPDATE SET registration_status = CASE WHEN user_guild_profiles.registration_status = 'UNREGISTERED' THEN 'ACTIVE' ELSE user_guild_profiles.registration_status END, " +
    "registered_at = COALESCE(user_guild_profiles.registered_at, now()), updated_at = now() " +
    "RETURNING user_id, registration_status, guild_rank, guild_exp, attempted_hunts, successful_hunts, failed_hunts, exam_used, registered_at",
    [userId],
  );
  return rows[0];
}

export async function markExamUsed(userId: number, client: PoolClient) {
  await client.query("UPDATE user_guild_profiles SET exam_used = true, updated_at = now() WHERE user_id = $1", [userId]);
}

export async function setGuildRank(userId: number, rank: GuildRank, client: PoolClient) {
  await client.query("UPDATE user_guild_profiles SET guild_rank = $2, updated_at = now() WHERE user_id = $1", [userId, rank]);
}

export async function incrementGuildStats(userId: number, attempted: number, successful: number, failed: number, client: PoolClient) {
  await client.query(
    "UPDATE user_guild_profiles SET attempted_hunts = attempted_hunts + $2, successful_hunts = successful_hunts + $3, failed_hunts = failed_hunts + $4, updated_at = now() WHERE user_id = $1",
    [userId, attempted, successful, failed],
  );
}

export async function lockGuildProfile(userId: number, client: PoolClient) {
  const { rows } = await client.query(
    "SELECT user_id, registration_status, guild_rank, guild_exp, attempted_hunts, successful_hunts, failed_hunts, exam_used, registered_at, demotion_warning_started_at, demotion_target_rank, family_gate_reset_at FROM user_guild_profiles WHERE user_id = $1 FOR UPDATE",
    [userId],
  );
  return rows[0] ?? null;
}

export interface GuildExpApplication {
  profile: any;
  baseExp: number;
  appliedDelta: number;
  multiplier: number;
  rankAtEvent: GuildRank;
  demotionWarningStartedAt: string | null;
  demotionTargetRank: GuildRank | null;
}

export async function addGuildExp(userId: number, baseExp: number, reason: string, huntId: string | null, attemptId: string | null, client: PoolClient, eventType = 'HUNT') : Promise<GuildExpApplication> {
  const before = await lockGuildProfile(userId, client);
  if (!before) throw new Error('Guild profile not found');
  const rankAtEvent = before.guild_rank as GuildRank;
  const multiplier = rankMultiplier(rankAtEvent);
  const appliedDelta = scaleGuildExp(baseExp, rankAtEvent);

  await client.query(
    "INSERT INTO guild_exp_events (user_id, hunt_id, attempt_id, delta_exp, reason, base_exp, rank_multiplier, rank_at_event, event_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [userId, huntId, attemptId, appliedDelta, reason, baseExp, multiplier, rankAtEvent, eventType],
  );

  const { rows } = await client.query(
    "UPDATE user_guild_profiles SET guild_exp = GREATEST(0, guild_exp + $2), updated_at = now() WHERE user_id = $1 " +
    "RETURNING user_id, registration_status, guild_rank, guild_exp, attempted_hunts, successful_hunts, failed_hunts, exam_used, registered_at, demotion_warning_started_at, demotion_target_rank, family_gate_reset_at",
    [userId, appliedDelta],
  );
  const profile = rows[0];
  if (!profile) throw new Error('Guild profile update failed');

  const { rows: rankRules } = await client.query(
    "SELECT rank, rank_order, family, min_exp FROM guild_rank_definitions WHERE is_active = true ORDER BY rank_order",
  );
  const currentRule = rankRules.find((rule) => rule.rank === rankAtEvent);
  let warningStartedAt = profile.demotion_warning_started_at as string | null;
  let warningTarget = profile.demotion_target_rank as GuildRank | null;

  if (rankAtEvent !== 'IRON' && currentRule?.min_exp !== null && Number(profile.guild_exp) <= Number(currentRule.min_exp)) {
    if (!warningStartedAt) {
      const target = previousRank(rankAtEvent, rankRules);
      warningTarget = target?.rank ?? 'IRON';
      warningStartedAt = new Date().toISOString();
      await client.query(
        "UPDATE user_guild_profiles SET demotion_warning_started_at = now(), demotion_target_rank = $2, updated_at = now() WHERE user_id = $1",
        [userId, warningTarget],
      );
      await createNotification(
        userId,
        'GUILD_DEMOTION_WARNING',
        'Guild demotion warning',
        'Your Guild EXP is at or below the minimum for ' + rankAtEvent + '. Recover above ' + currentRule.min_exp + ' EXP within 24 hours to retain your rank.',
        { previousRank: rankAtEvent, targetRank: warningTarget, guildExp: Number(profile.guild_exp), graceHours: 24 },
        client,
      );
    }
  } else if (profile.demotion_warning_started_at) {
    await client.query(
      "UPDATE user_guild_profiles SET demotion_warning_started_at = NULL, demotion_target_rank = NULL, updated_at = now() WHERE user_id = $1",
      [userId],
    );
    warningStartedAt = null;
    warningTarget = null;
  }

  return {
    profile: { ...profile, demotion_warning_started_at: warningStartedAt, demotion_target_rank: warningTarget },
    baseExp,
    appliedDelta,
    multiplier,
    rankAtEvent,
    demotionWarningStartedAt: warningStartedAt,
    demotionTargetRank: warningTarget,
  };
}

export async function listRankRules() {
  const { rows } = await pool.query(
    "SELECT rank, rank_order, family, badge_asset, min_exp, required_hunt_tier, required_successes, gate_requirements FROM guild_rank_definitions WHERE is_active = true ORDER BY rank_order",
  );
  return rows;
}

export async function clearDemotionWarning(userId: number, client: PoolClient) {
  await client.query(
    "UPDATE user_guild_profiles SET demotion_warning_started_at = NULL, demotion_target_rank = NULL, updated_at = now() WHERE user_id = $1",
    [userId],
  );
}

export async function setFamilyGateReset(userId: number, resetAt: Date, client: PoolClient) {
  await client.query("UPDATE user_guild_profiles SET family_gate_reset_at = $2, updated_at = now() WHERE user_id = $1", [userId, resetAt]);
}

export async function clearFamilyGateReset(userId: number, client: PoolClient) {
  await client.query("UPDATE user_guild_profiles SET family_gate_reset_at = NULL, updated_at = now() WHERE user_id = $1", [userId]);
}

export async function listDemotionCandidates(limit = 100) {
  const { rows } = await pool.query(
    "SELECT p.user_id FROM user_guild_profiles p JOIN guild_rank_definitions r ON r.rank = p.guild_rank WHERE p.registration_status = 'ACTIVE' AND p.guild_rank <> 'IRON' AND r.min_exp IS NOT NULL AND p.guild_exp <= r.min_exp AND (p.demotion_warning_started_at IS NULL OR p.demotion_warning_started_at <= now() - interval '24 hours') ORDER BY COALESCE(p.demotion_warning_started_at, now()) ASC, p.user_id ASC LIMIT $1",
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows as Array<{ user_id: number }>;
}

export async function createRankReview(userId: number, requestedRank: 'ORICHALCUM' | 'ADAMANTITE', client: PoolClient) {
  const id = cryptoRandomUuid();
  const { rows } = await client.query(
    "INSERT INTO guild_rank_reviews (id, user_id, requested_rank, status) VALUES ($1, $2, $3, 'PENDING_REVIEW') ON CONFLICT (user_id) WHERE status = 'PENDING_REVIEW' DO NOTHING RETURNING id, user_id, requested_rank, status, requested_at, reviewed_by, reviewed_at, note",
    [id, userId, requestedRank],
  );
  return rows[0] ?? null;
}

export async function getPendingRankReview(userId: number, client: PoolClient | typeof pool = pool) {
  const { rows } = await client.query(
    "SELECT id, user_id, requested_rank, status, requested_at, reviewed_by, reviewed_at, note FROM guild_rank_reviews WHERE user_id = $1 AND status = 'PENDING_REVIEW' LIMIT 1",
    [userId],
  );
  return rows[0] ?? null;
}

export async function listPendingRankReviews(limit = 100) {
  const { rows } = await pool.query(
    "SELECT r.id, r.user_id, u.username, r.requested_rank, r.status, r.requested_at, r.reviewed_by, r.reviewed_at, r.note FROM guild_rank_reviews r JOIN users u ON u.id = r.user_id WHERE r.status = 'PENDING_REVIEW' ORDER BY r.requested_at ASC LIMIT $1",
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows;
}

export async function resolveRankReview(reviewId: string, adminUserId: number, status: 'APPROVED' | 'REJECTED', note: string, client: PoolClient) {
  const { rows } = await client.query(
    "UPDATE guild_rank_reviews SET status = $2, reviewed_by = $3, reviewed_at = now(), note = $4 WHERE id = $1 AND status = 'PENDING_REVIEW' RETURNING id, user_id, requested_rank, status",
    [reviewId, status, adminUserId, note],
  );
  return rows[0] ?? null;
}

export async function updateRankRule(rank: GuildRank, minExp: number | null, requiredHuntTier: HuntTier | null, requiredSuccesses: number | null) {
  await pool.query(
    "UPDATE guild_rank_definitions SET min_exp = $2, required_hunt_tier = $3, required_successes = $4, updated_at = now() WHERE rank = $1",
    [rank, minExp, requiredHuntTier, requiredSuccesses],
  );
}

export async function listTierRules() {
  const { rows } = await pool.query(
    "SELECT tier, tier_order, display_name, min_stars, min_bounty_dzp, updated_at FROM guild_hunt_tier_rules ORDER BY tier_order",
  );
  return rows;
}

export async function updateTierRule(tier: HuntTier, minStars: number, minBountyDzp: number) {
  await pool.query(
    "UPDATE guild_hunt_tier_rules SET min_stars = $2, min_bounty_dzp = $3, updated_at = now() WHERE tier = $1",
    [tier, minStars, minBountyDzp],
  );
}

export async function createNotification(userId: number, kind: string, title: string, body: string, payload: Record<string, unknown>, client: PoolClient) {
  await client.query(
    "INSERT INTO guild_notifications (user_id, kind, title, body, payload) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [userId, kind, title, body, JSON.stringify(payload)],
  );
}

export async function listNotifications(userId: number, limit = 30) {
  const { rows } = await pool.query(
    "SELECT id, kind, title, body, payload, read_at, created_at FROM guild_notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2",
    [userId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows;
}

export async function markNotificationRead(userId: number, id: number) {
  const result = await pool.query("UPDATE guild_notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2", [id, userId]);
  return result.rowCount === 1;
}

export async function getActiveLoan(userId: number, client: PoolClient) {
  const { rows } = await client.query(
    "SELECT id, user_id, hunt_id, principal_dzp, remaining_dzp, installment_percent, status, issued_at, due_at, last_repayment_at, paid_at FROM guild_loans WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1 FOR UPDATE",
    [userId],
  );
  return rows[0] ?? null;
}

export async function createLoan(userId: number, huntId: string, principalDzp: number, installmentPercent: number, client: PoolClient) {
  const id = cryptoRandomUuid();
  await client.query(
    "INSERT INTO guild_loans (id, user_id, hunt_id, principal_dzp, remaining_dzp, installment_percent, due_at) VALUES ($1, $2, $3, $4, $4, $5, now() + interval '7 days')",
    [id, userId, huntId, principalDzp, installmentPercent],
  );
  return id;
}

export async function applyLoanRepayment(loanId: string, amount: number, client: PoolClient) {
  const { rows } = await client.query(
    "UPDATE guild_loans SET remaining_dzp = GREATEST(0, remaining_dzp - $2), status = CASE WHEN remaining_dzp - $2 <= 0 THEN 'PAID' ELSE 'ACTIVE' END, paid_at = CASE WHEN remaining_dzp - $2 <= 0 THEN now() ELSE paid_at END, last_repayment_at = now() WHERE id = $1 AND status = 'ACTIVE' RETURNING remaining_dzp",
    [loanId, amount],
  );
  const remaining = rows[0]?.remaining_dzp ?? 0;
  return { remaining, paid: remaining === 0 };
}

export async function listDueLoans(limit = 100) {
  const { rows } = await pool.query(
    "SELECT id, user_id, principal_dzp, remaining_dzp, installment_percent, due_at FROM guild_loans WHERE status = 'ACTIVE' AND due_at <= now() AND (last_repayment_at IS NULL OR last_repayment_at <= now() - interval '1 day') ORDER BY due_at ASC LIMIT $1",
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows;
}

export async function getExamTemplate(testNumber: number, client: PoolClient | typeof pool = pool) {
  const { rows } = await client.query(
    "SELECT test_number, difficulty_id, requirements, reward_rank, reward_dzp FROM guild_placement_exam_templates WHERE test_number = $1 AND enabled = true",
    [testNumber],
  );
  return rows[0] ?? null;
}

export async function listExamTemplates() {
  const { rows } = await pool.query(
    "SELECT test_number, difficulty_id, requirements, reward_rank, reward_dzp, enabled, updated_at FROM guild_placement_exam_templates ORDER BY test_number",
  );
  return rows;
}

export async function upsertExamTemplate(testNumber: number, difficultyId: number, requirements: Record<string, unknown>, rewardRank: GuildRank | null, rewardDzp: number) {
  await pool.query(
    "INSERT INTO guild_placement_exam_templates (test_number, difficulty_id, requirements, reward_rank, reward_dzp) VALUES ($1, $2, $3::jsonb, $4, $5) " +
    "ON CONFLICT (test_number) DO UPDATE SET difficulty_id = EXCLUDED.difficulty_id, requirements = EXCLUDED.requirements, reward_rank = EXCLUDED.reward_rank, reward_dzp = EXCLUDED.reward_dzp, enabled = true, updated_at = now()",
    [testNumber, difficultyId, JSON.stringify(requirements), rewardRank, rewardDzp],
  );
}

export async function getExamForUser(userId: number, client: PoolClient | typeof pool = pool) {
  const { rows } = await client.query(
    "SELECT id, user_id, current_test_number, highest_cleared_test, started_at, expires_at, status, assigned_rank, reward_dzp, reviewed_by, reviewed_at, review_note FROM guild_placement_exams WHERE user_id = $1",
    [userId],
  );
  return rows[0] ?? null;
}

export async function listExpiredExams(limit = 50) {
  const { rows } = await pool.query(
    "SELECT user_id FROM guild_placement_exams WHERE status = 'IN_PROGRESS' AND expires_at <= now() ORDER BY expires_at ASC LIMIT $1",
    [Math.min(Math.max(limit, 1), 200)],
  );
  return rows as Array<{ user_id: number }>;
}

export async function createExam(userId: number, expiresAt: Date, client: PoolClient) {
  const id = cryptoRandomUuid();
  await client.query("INSERT INTO guild_placement_exams (id, user_id, expires_at) VALUES ($1, $2, $3)", [id, userId, expiresAt]);
  return id;
}

export async function updateExam(examId: string, patch: {
  currentTestNumber?: number;
  highestClearedTest?: number;
  status?: string;
  assignedRank?: GuildRank | null;
  rewardDzp?: number;
  reviewedBy?: number | null;
  reviewNote?: string | null;
}, client: PoolClient) {
  await client.query(
    "UPDATE guild_placement_exams SET current_test_number = COALESCE($2, current_test_number), highest_cleared_test = COALESCE($3, highest_cleared_test), status = COALESCE($4, status), assigned_rank = COALESCE($5, assigned_rank), reward_dzp = COALESCE($6, reward_dzp), reviewed_by = COALESCE($7, reviewed_by), reviewed_at = CASE WHEN $7 IS NOT NULL THEN now() ELSE reviewed_at END, review_note = COALESCE($8, review_note), updated_at = now() WHERE id = $1",
    [examId, patch.currentTestNumber ?? null, patch.highestClearedTest ?? null, patch.status ?? null, patch.assignedRank ?? null, patch.rewardDzp ?? null, patch.reviewedBy ?? null, patch.reviewNote ?? null],
  );
}

function cryptoRandomUuid(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
