import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import {
  classifyHuntTier,
  EXAM_REWARDS,
  examExpiresAt,
  huntExpiresAt,
  LOAN_DEFAULT_INSTALLMENT_PERCENT,
  qualifyAttempt,
  splitModAcronyms,
  type GuildRank,
  type HuntRequirements,
  type HuntTier,
  type HuntType,
} from '../domain/beatmapHunts/rules.js';
import {
  GUILD_EXP_POLICY,
  rankMultiplier,
  terribleAttemptBaseExp,
  targetTerribleAttemptBaseExp,
} from '../domain/beatmapHunts/progression.js';
import { maybePromoteGuildPlayer } from './guildProgression.js';
import * as hunts from '../repos/beatmapHunts.js';
import * as guild from '../repos/guild.js';
import {
  fetchBeatmapAnyStatus,
  fetchScoreById,
  fetchUserScoresForDifficulty,
  type OsuScore,
} from './osu.js';
import { getActiveWar, hasWarSummons } from './guildWar.js';

export class GuildRuleError extends Error {}

async function getOsuUserId(localUserId: number): Promise<number> {
  const { rows } = await pool.query<{ osu_id: number }>('SELECT osu_id FROM users WHERE id = $1', [localUserId]);
  if (!rows[0]) throw new GuildRuleError('Your osu! account could not be resolved.');
  return Number(rows[0].osu_id);
}

function parseScoreId(input: string): number | null {
  const value = input.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/\/scores\/(?:[a-z]+\/)?(\d+)/i);
  return match ? Number(match[1]) : null;
}

function asRequirements(value: unknown): HuntRequirements {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const list = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string').map((item) => item.toUpperCase()) : undefined;
  return {
    requiredMods: list(raw.requiredMods),
    exactMods: raw.exactMods === true,
    minAccuracy: typeof raw.minAccuracy === 'number' ? raw.minAccuracy : undefined,
    maxMisses: typeof raw.maxMisses === 'number' ? raw.maxMisses : undefined,
    minCombo: typeof raw.minCombo === 'number' ? raw.minCombo : undefined,
    minScore: typeof raw.minScore === 'number' ? raw.minScore : undefined,
    minPp: typeof raw.minPp === 'number' ? raw.minPp : undefined,
    fullCombo: raw.fullCombo === true,
  };
}

function scoreSnapshot(score: Awaited<ReturnType<typeof fetchScoreById>>) {
  return {
    id: score.osuScoreId,
    userId: score.userId,
    username: score.username,
    beatmapId: score.beatmapId,
    beatmapsetId: score.beatmapsetId,
    title: score.title,
    artist: score.artist,
    difficultyName: score.difficultyName,
    score: score.score,
    accuracy: score.accuracy,
    maxCombo: score.maxCombo,
    misses: score.misses,
    mods: score.mods,
    pp: score.pp,
    rank: score.rank,
    ruleset: score.ruleset ?? 'osu',
    passed: score.passed,
    endedAt: score.endedAt,
  };
}

async function loadTierRules() {
  const { rows } = await pool.query("SELECT tier, tier_order, min_stars, min_bounty_dzp FROM guild_hunt_tier_rules ORDER BY tier_order");
  return rows as Array<{ tier: HuntTier; tier_order: number; min_stars: number; min_bounty_dzp: number }>;
}

export async function getGuildProfile(userId: number) {
  const profile = await guild.getGuildProfile(userId);
  const rules = await guild.listRankRules();
  const current = rules.find((rule) => rule.rank === profile.guild_rank);
  const next = rules.find((rule) => rule.rank_order === (current?.rank_order ?? 1) + 1);
  let progressPercent: number | null = null;
  if (next?.min_exp !== null && next?.min_exp !== undefined) {
    const floor = current?.min_exp ?? 0;
    progressPercent = Math.max(0, Math.min(100, ((profile.guild_exp - floor) / Math.max(1, next.min_exp - floor)) * 100));
  }
  const loanClient = await pool.connect();
  try {
    const loan = await guild.getActiveLoan(userId, loanClient);
    const review = await guild.getPendingRankReview(userId, loanClient);
    const transitClient = await pool.connect();
    let currentProfile = profile;
    try { currentProfile = await guild.completeTravel(userId, transitClient); } finally { transitClient.release(); }
    return {
      profile: currentProfile,
      nextRank: next?.rank ?? null,
      nextRankExp: next?.min_exp ?? null,
      progressPercent,
      rankMultiplier: rankMultiplier(profile.guild_rank as GuildRank),
      demotionWarning: profile.demotion_warning_started_at ? {
        startedAt: new Date(profile.demotion_warning_started_at).toISOString(),
        expiresAt: new Date(new Date(profile.demotion_warning_started_at).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        targetRank: profile.demotion_target_rank,
      } : null,
      rankReview: review ? {
        id: review.id,
        requestedRank: review.requested_rank,
        status: review.status,
        requestedAt: new Date(review.requested_at).toISOString(),
      } : null,
      badgeAsset: current?.badge_asset ?? '/guild/badges/iron.png',
      loan: loan ? {
        id: loan.id,
        remainingDzp: Number(loan.remaining_dzp),
        dueAt: new Date(loan.due_at).toISOString(),
        installmentPercent: Number(loan.installment_percent),
      } : null,
    };
  } finally {
    loanClient.release();
  }
}

export async function getGuildKingdoms() {
  return guild.listKingdoms();
}

export async function getGuildKingdom(userId: number, kingdom: string) {
  const profile = await guild.getGuildProfile(userId);
  const war = kingdom === 'SORCERER_KINGDOM' ? await getActiveWar() : null;
  const summoned = war && war.phase === 'MASCARA' ? await hasWarSummons(war.id, userId) : null;
  const warAccess = Boolean(summoned);
  if (!profile.onboarding_completed || profile.registration_status !== 'ACTIVE' || profile.travel_destination || (profile.kingdom !== kingdom && !warAccess)) {
    throw new GuildRuleError('This Guild Hall is restricted to adventurers currently residing in this kingdom.');
  }
  return { ...(await guild.getKingdom(kingdom)), warAccess };
}

export async function completeGuildOnboarding(userId: number, input: { adventurerName: string; kingdom: string; path: 'IRON' | 'EXAM' }) {
  const name = input.adventurerName.trim();
  if (!/^[A-Za-z0-9 _'-]{2,32}$/.test(name)) throw new GuildRuleError('Adventurer Name must be 2–32 characters and use letters, numbers, spaces, apostrophes, hyphens, or underscores.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profile = await guild.getGuildProfile(userId, client);
    if (profile.onboarding_completed) throw new GuildRuleError('Guild onboarding is already complete.');
    if (!(await guild.getKingdom(input.kingdom, client))) throw new GuildRuleError('Choose one of the four recognized kingdoms.');
    const existingName = await client.query("SELECT user_id FROM user_guild_profiles WHERE lower(adventurer_name) = lower($1) AND user_id <> $2", [name, userId]);
    if (existingName.rows[0]) throw new GuildRuleError('That Adventurer Name is already registered.');
    if (input.path === 'IRON') {
      await guild.registerAsIron(userId, client);
      await guild.completeOnboarding(userId, { adventurerName: name, kingdom: input.kingdom }, client);
    } else {
      if (profile.exam_used) throw new GuildRuleError('The Placement Exam is available only once.');
      for (let test = 1; test <= 6; test++) if (!(await guild.getExamTemplate(test, client))) throw new GuildRuleError('The Guild has not prepared all six Placement Exam tests yet.');
      await guild.completeOnboarding(userId, { adventurerName: name, kingdom: input.kingdom }, client);
      const started = new Date();
      const id = await guild.createExam(userId, examExpiresAt(started), client);
      await guild.markExamUsed(userId, client);
      await client.query('COMMIT');
      return { path: input.path, exam: { id, startedAt: started.toISOString(), expiresAt: examExpiresAt(started).toISOString(), currentTestNumber: 1, highestClearedTest: 0 } };
    }
    await client.query('COMMIT');
    return { path: input.path, exam: null };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function travelToKingdom(userId: number, destination: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profile = await guild.getGuildProfile(userId, client);
    if (!profile.onboarding_completed || profile.registration_status !== 'ACTIVE') throw new GuildRuleError('Complete Guild registration before travelling.');
    const active = await guild.completeTravel(userId, client);
    const current = active.kingdom as string | null;
    if (!current) throw new GuildRuleError('Choose a home kingdom first.');
    if (active.travel_destination) throw new GuildRuleError('You are already travelling.');
    if (current === destination) throw new GuildRuleError('You are already in that kingdom.');
    if (active.kingdom_cooldown_until && new Date(active.kingdom_cooldown_until).getTime() > Date.now()) throw new GuildRuleError('You cannot migrate again until ' + new Date(active.kingdom_cooldown_until).toISOString() + '.');
    const kingdom = await guild.getKingdom(destination, client);
    if (!kingdom) throw new GuildRuleError('Unknown kingdom.');
    const season = await hunts.getCurrentSeason(client);
    const balance = await hunts.getSpendableBalance(userId, season, client);
    if (balance < Number(kingdom.travel_cost_dzp)) throw new GuildRuleError('You need ' + kingdom.travel_cost_dzp + ' DZP to travel.');
    await hunts.insertLedger({ userId, season, amountDzp: -Number(kingdom.travel_cost_dzp), transactionType: 'guild_travel', referenceId: 'guild-travel:' + crypto.randomUUID(), description: 'Guild travel from ' + current + ' to ' + destination }, client);
    const travel = await guild.startTravel(userId, destination, client);
    await client.query('COMMIT');
    return travel;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function registerIron(userId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profile = await guild.registerAsIron(userId, client);
    await client.query('COMMIT');
    return profile;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function startPlacementExam(userId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profile = await guild.getGuildProfile(userId, client);
    if (profile.registration_status === 'ACTIVE') throw new GuildRuleError('You are already registered with the Guild.');
    if (profile.exam_used) throw new GuildRuleError('The Placement Exam is available only once.');
    const existing = await guild.getExamForUser(userId, client);
    if (existing) throw new GuildRuleError('Your Placement Exam has already been started.');

    for (let test = 1; test <= 6; test++) {
      if (!(await guild.getExamTemplate(test, client))) {
        throw new GuildRuleError('The Guild has not prepared all six Placement Exam tests yet.');
      }
    }

    const started = new Date();
    const id = await guild.createExam(userId, examExpiresAt(started), client);
    await guild.markExamUsed(userId, client);
    await client.query('COMMIT');
    return { id, startedAt: started.toISOString(), expiresAt: examExpiresAt(started).toISOString(), currentTestNumber: 1, highestClearedTest: 0 };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getPlacementExam(userId: number) {
  const exam = await guild.getExamForUser(userId);
  if (!exam) return null;
  const template = exam.status === 'IN_PROGRESS' ? await guild.getExamTemplate(Number(exam.current_test_number)) : null;
  return { ...exam, currentTemplate: template };
}

export async function importPlacementExamScore(userId: number, scoreIdInput: string) {
  const exam = await guild.getExamForUser(userId);
  if (!exam) throw new GuildRuleError('No Placement Exam is active.');
  if (exam.status !== 'IN_PROGRESS') throw new GuildRuleError('This Placement Exam is already closed.');
  if (new Date(exam.expires_at).getTime() <= Date.now()) {
    await expireExam(userId);
    throw new GuildRuleError('The three-day Placement Exam has expired.');
  }

  const scoreId = parseScoreId(scoreIdInput);
  if (scoreId === null) throw new GuildRuleError('Enter a valid osu! score URL or score ID.');
  const template = await guild.getExamTemplate(Number(exam.current_test_number));
  if (!template) throw new GuildRuleError('The current Guild test is not configured.');
  const score = await fetchScoreById(scoreId);
  if (score.userId !== await getOsuUserId(userId)) throw new GuildRuleError('The imported score does not belong to your osu! account.');
  if (score.beatmapId !== Number(template.difficulty_id)) throw new GuildRuleError('That score is not for the current Guild test beatmap.');

  const result = qualifyAttempt(asRequirements(template.requirements), scoreSnapshot(score));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "INSERT INTO guild_placement_exam_attempts (id, exam_id, test_number, osu_score_id, score, accuracy, max_combo, misses, mods, pp, qualifies, failure_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
      [crypto.randomUUID(), exam.id, exam.current_test_number, score.osuScoreId, score.score, score.accuracy, score.maxCombo, score.misses, score.mods, score.pp, result.qualifies, result.failureReason],
    );

    if (!result.qualifies) {
      const reward = EXAM_REWARDS[Number(exam.highest_cleared_test)] ?? { rank: null, dzp: 0 };
      await finishExamAtClearedLevel(userId, exam, reward.rank, reward.dzp, 'FAILED', client);
      await client.query('COMMIT');
      return { passed: false, highestClearedTest: Number(exam.highest_cleared_test), rank: reward.rank, rewardDzp: reward.dzp };
    }

    const testNumber = Number(exam.current_test_number);
    if (testNumber === 6) {
      await guild.updateExam(exam.id, { highestClearedTest: 6, status: 'PENDING_REVIEW' }, client);
      await client.query('COMMIT');
      return { passed: true, highestClearedTest: 6, status: 'PENDING_REVIEW', rank: null, rewardDzp: 0 };
    }

    await guild.updateExam(exam.id, { highestClearedTest: testNumber, currentTestNumber: testNumber + 1 }, client);
    await client.query('COMMIT');
    return { passed: true, highestClearedTest: testNumber, currentTestNumber: testNumber + 1, status: 'IN_PROGRESS' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function finishExamAtClearedLevel(userId: number, exam: { id: string }, rank: GuildRank | null, rewardDzp: number, status: string, client: PoolClient) {
  if (!rank) {
    await guild.updateExam(exam.id, { status }, client);
    return;
  }
  await guild.registerAsIron(userId, client);
  await guild.setGuildRank(userId, rank, client);
  if (rewardDzp > 0) {
    const season = await hunts.getCurrentSeason(client);
    await hunts.insertLedger({
      userId,
      season,
      amountDzp: rewardDzp,
      transactionType: 'guild_exam_reward',
      referenceId: 'guild-exam:' + exam.id + ':' + rewardDzp,
      description: 'Adventurer Guild Placement Exam reward',
    }, client);
  }
  await guild.updateExam(exam.id, { status, assignedRank: rank, rewardDzp }, client);
}

export async function cashOutExam(userId: number) {
  const exam = await guild.getExamForUser(userId);
  if (!exam || exam.status !== 'IN_PROGRESS') throw new GuildRuleError('There is no active exam to conclude.');
  if (Number(exam.highest_cleared_test) < 1) throw new GuildRuleError('Pass at least the first test before concluding the exam.');
  const reward = EXAM_REWARDS[Number(exam.highest_cleared_test)];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await finishExamAtClearedLevel(userId, exam, reward.rank, reward.dzp, 'CASHED_OUT', client);
    await client.query('COMMIT');
    return { rank: reward.rank, rewardDzp: reward.dzp, highestClearedTest: Number(exam.highest_cleared_test) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function expireExam(userId: number) {
  const exam = await guild.getExamForUser(userId);
  if (!exam || exam.status !== 'IN_PROGRESS') return;
  const reward = EXAM_REWARDS[Number(exam.highest_cleared_test)] ?? { rank: null, dzp: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await finishExamAtClearedLevel(userId, exam, reward.rank, reward.dzp, 'EXPIRED', client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function createHunt(userId: number, input: {
  huntType: HuntType;
  difficultyId: number;
  bountyDzp: number;
  requirements: HuntRequirements;
  description: string;
  targetScoreInput?: string;
}) {
  if (!Number.isInteger(input.bountyDzp) || input.bountyDzp < 100) throw new GuildRuleError('Minimum bounty is 100 DZP.');
  const beatmap = await fetchBeatmapAnyStatus(input.difficultyId);
  if (beatmap.modeInt !== 0) throw new GuildRuleError('Adventurer Guild Hunts currently use osu!standard beatmaps.');
  if (!['ranked', 'loved', 'approved'].includes(beatmap.mapStatus)) throw new GuildRuleError('This beatmap is not eligible for Guild Hunts.');

  let target: Awaited<ReturnType<typeof fetchScoreById>> | null = null;
  if (input.huntType !== 'BEATMAP_CHALLENGE') {
    if (!input.targetScoreInput) throw new GuildRuleError('A target score is required for Score Hunts.');
    const targetId = parseScoreId(input.targetScoreInput);
    if (targetId === null) throw new GuildRuleError('Enter a valid osu! score URL or score ID.');
    target = await fetchScoreById(targetId);
    if (target.beatmapId !== input.difficultyId) throw new GuildRuleError('The target score is for a different beatmap.');
    if (target.ruleset !== 'osu') throw new GuildRuleError('The target score must be an osu!standard score.');
    if (input.huntType === 'BEAT_MY_SCORE' && target.userId !== await getOsuUserId(userId)) throw new GuildRuleError('Beat My Score must use your own score.');
  }

  const rules = await loadTierRules();
  const autoTier = classifyHuntTier(beatmap.stars, input.bountyDzp, rules);
  const requirements: HuntRequirements = {
    ...input.requirements,
    ...(target ? { requiredMods: splitModAcronyms(target.mods), exactMods: true } : {}),
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profile = await guild.getGuildProfile(userId, client);
    if (profile.registration_status !== 'ACTIVE') throw new GuildRuleError('Register with the Adventurer Guild before posting Hunts.');
    if (!profile.kingdom || !profile.onboarding_completed) throw new GuildRuleError('Complete Guild onboarding before posting Hunts.');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const season = await hunts.getCurrentSeason(client);
    const balance = await hunts.getSpendableBalance(userId, season, client);
    if (balance < input.bountyDzp) throw new GuildRuleError('You do not have enough DZP for this bounty.');
    await hunts.insertLedger({
      userId,
      season,
      amountDzp: -input.bountyDzp,
      transactionType: 'guild_hunt_escrow',
      referenceId: 'hunt-escrow:' + crypto.randomUUID(),
      description: 'Guild Hunt bounty escrow',
    }, client);

    const created = new Date();
    const id = await hunts.insertHunt({
      posterUserId: userId,
      huntType: input.huntType,
      autoTier,
      kingdom: profile.kingdom,
      beatmapId: beatmap.difficultyId,
      beatmapsetId: beatmap.beatmapsetId,
      title: beatmap.title,
      artist: beatmap.artist,
      mapper: beatmap.mapper,
      difficultyName: beatmap.difficultyName,
      coverUrl: beatmap.coverUrl || null,
      previewUrl: beatmap.previewUrl || null,
      stars: beatmap.stars,
      cs: beatmap.cs,
      ar: beatmap.ar,
      od: beatmap.od,
      hp: beatmap.hp,
      maxCombo: beatmap.maxCombo,
      bountyDzp: input.bountyDzp,
      requirements,
      description: input.description.trim().slice(0, 1000),
      targetScoreId: target?.osuScoreId ?? null,
      targetScoreUserId: target?.userId ?? null,
      targetScoreData: target ? scoreSnapshot(target) : null,
      expiresAt: huntExpiresAt(created),
    }, client);
    await client.query('COMMIT');
    return hunts.findHunt(id);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listMyTargetScores(userId: number, difficultyId: number) {
  const scores = await fetchUserScoresForDifficulty(difficultyId, await getOsuUserId(userId), 'osu');
  return scores.slice(0, 100).map((score) => ({
    osuScoreId: score.osuScoreId,
    score: score.score,
    accuracy: score.accuracy,
    maxCombo: score.maxCombo,
    misses: score.misses,
    mods: score.mods,
    pp: score.pp,
    rank: score.rank,
    endedAt: score.endedAt,
  }));
}

export async function importHuntScore(userId: number, huntId: string, scoreIdInput: string) {
  const profile = await guild.getGuildProfile(userId);
  if (profile.registration_status !== 'ACTIVE') throw new GuildRuleError('Register with the Adventurer Guild before hunting.');
  const hunt = await hunts.findHunt(huntId);
  if (!hunt || hunt.status !== 'ACTIVE') throw new GuildRuleError('This Hunt is not active.');
  if (new Date(hunt.expires_at).getTime() <= Date.now()) throw new GuildRuleError('This Hunt has expired.');
  const scoreId = parseScoreId(scoreIdInput);
  if (scoreId === null) throw new GuildRuleError('Enter a valid osu! score URL or score ID.');
  const score = await fetchScoreById(scoreId);
  if (score.userId !== await getOsuUserId(userId)) throw new GuildRuleError('The imported score does not belong to your osu! account.');
  if (score.beatmapId !== Number(hunt.beatmap_id) || score.ruleset !== 'osu') throw new GuildRuleError('The score does not match this Hunt beatmap/ruleset.');
  if (await hunts.findExistingAttemptForScore(huntId, score.osuScoreId)) throw new GuildRuleError('That score has already been submitted to this Hunt.');

  const requirements = asRequirements(hunt.requirements);
  const baseQualification = qualifyAttempt(requirements, scoreSnapshot(score));
  const targetScore = hunt.target_score_data && typeof hunt.target_score_data === 'object' ? Number((hunt.target_score_data as Record<string, unknown>).score ?? 0) : 0;
  const beatsTarget = hunt.hunt_type === 'BEATMAP_CHALLENGE' || score.score > targetScore;
  const qualifies = baseQualification.qualifies && beatsTarget;
  const failureReason = qualifies ? null : !beatsTarget ? 'Score did not beat the target score' : baseQualification.failureReason;
  const terrible = !baseQualification.qualifies && baseQualification.terrible;
  const targetHunt = hunt.hunt_type === 'BEAT_MY_SCORE' || hunt.hunt_type === 'SNIPE_SCORE';
  const submittedAt = new Date();
  const penaltyReason = terrible ? 'Terrible attempt: no meaningful Hunt requirement was satisfied.' : null;
  const attemptId = crypto.randomUUID();
  let expDelta = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fresh = await hunts.findHunt(huntId, client);
    if (!fresh || fresh.status !== 'ACTIVE') throw new GuildRuleError('This Hunt has already been claimed or closed.');

    await hunts.insertAttempt({
      id: attemptId, huntId, userId, osuScoreId: score.osuScoreId, score: score.score,
      accuracy: score.accuracy, maxCombo: score.maxCombo, misses: score.misses, mods: score.mods,
      pp: score.pp, passed: score.passed, qualifies, failureReason, penaltyReason, guildExpDelta: 0,
    }, client);

    let baseExp = 0;
    if (qualifies) {
      baseExp = targetHunt ? GUILD_EXP_POLICY.targetHunt.qualifyingAttempt : GUILD_EXP_POLICY.beatmapChallenge.qualifyingAttempt;
    } else if (terrible) {
      const failedPlacement = await hunts.failedAttemptPlacement({
        huntId,
        qualifies,
        score: score.score,
        accuracy: score.accuracy,
        submittedAt,
        attemptId,
        unqualifiedOnly: targetHunt,
      }, client);
      baseExp = targetHunt ? targetTerribleAttemptBaseExp(failedPlacement) : terribleAttemptBaseExp(failedPlacement);
    }

    await guild.incrementGuildStats(userId, 1, 0, qualifies ? 0 : 1, client);
    if (baseExp !== 0) {
      const application = await guild.addGuildExp(
        userId,
        baseExp,
        qualifies ? (targetHunt ? 'Qualified Target Hunt attempt' : 'Qualified Beatmap Challenge attempt') : 'Terrible Hunt attempt',
        huntId,
        attemptId,
        client,
        'HUNT_ATTEMPT',
      );
      expDelta = application.appliedDelta;
      await hunts.addAttemptExp(attemptId, application.appliedDelta, client);
      await maybePromoteGuildPlayer(userId, client);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return { attemptId, qualifies, failureReason, terrible, expDelta };
}

async function settleWinner(huntId: string, userId: number, bountyDzp: number, client: PoolClient) {
  const season = await hunts.getCurrentSeason(client);
  const loan = await guild.getActiveLoan(userId, client);
  let payout = bountyDzp;
  if (loan && new Date(loan.due_at).getTime() <= Date.now()) {
    payout = Math.max(0, bountyDzp - Math.min(Number(loan.remaining_dzp), Math.floor(bountyDzp * Number(loan.installment_percent) / 100)));
    const repayment = bountyDzp - payout;
    if (repayment > 0) {
      await hunts.insertLedger({
        userId, season, amountDzp: -repayment, transactionType: 'guild_loan_repayment',
        referenceId: 'loan-repayment:' + loan.id + ':' + crypto.randomUUID(), description: 'Guild loan repayment from Hunt bounty',
      }, client);
      await guild.applyLoanRepayment(loan.id, repayment, client);
    }
  }
  if (payout > 0) {
    await hunts.insertLedger({
      userId, season, amountDzp: payout, transactionType: 'guild_hunt_payout',
      referenceId: 'hunt-payout:' + huntId, description: 'Guild Hunt bounty payout',
    }, client);
  }
  await client.query("UPDATE beatmap_hunts SET escrowed_dzp = 0, updated_at = now() WHERE id = $1", [huntId]);
}

export async function cancelHunt(userId: number, huntId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hunt = await hunts.findHunt(huntId, client);
    if (!hunt || hunt.poster_user_id !== userId) throw new GuildRuleError('You do not own this Hunt.');
    if (hunt.status !== 'ACTIVE') throw new GuildRuleError('Only an active Hunt without a winner can be cancelled.');
    const season = await hunts.getCurrentSeason(client);
    await hunts.insertLedger({
      userId, season, amountDzp: Number(hunt.escrowed_dzp), transactionType: 'guild_hunt_refund',
      referenceId: 'hunt-refund:' + huntId, description: 'Guild Hunt cancellation refund',
    }, client);
    await client.query("UPDATE beatmap_hunts SET status = 'CANCELLED', escrowed_dzp = 0, completed_at = now(), updated_at = now() WHERE id = $1", [huntId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function expireHunt(huntId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hunt = await hunts.findHunt(huntId, client);
    if (!hunt || hunt.status !== 'ACTIVE' || new Date(hunt.expires_at).getTime() > Date.now()) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query("SELECT id FROM beatmap_hunts WHERE id = $1 FOR UPDATE", [huntId]);
    const lockedHunt = await hunts.findHunt(huntId, client);
    if (!lockedHunt || lockedHunt.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return null;
    }
    const winner = await hunts.findBestQualifyingAttempt(huntId, client);
    await hunts.assignFinalPlacements(huntId, client);
    if (winner) {
      await hunts.finalizeChallengeHunt(huntId, { id: winner.id, user_id: winner.user_id }, client);
      await guild.incrementGuildStats(winner.user_id, 0, 1, 0, client);
      if (hunt.hunt_type === 'BEATMAP_CHALLENGE') {
        const application = await guild.addGuildExp(winner.user_id, GUILD_EXP_POLICY.beatmapChallenge.winner, 'Beatmap Challenge 1st-place winner', huntId, winner.id, client, 'HUNT_WINNER');
        await hunts.addAttemptExp(winner.id, application.appliedDelta, client);
        await maybePromoteGuildPlayer(winner.user_id, client);
      }
      await settleWinner(huntId, winner.user_id, Number(hunt.bounty_dzp), client);
    } else {
      const season = await hunts.getCurrentSeason(client);
      await hunts.insertLedger({
        userId: hunt.poster_user_id, season, amountDzp: Number(hunt.escrowed_dzp), transactionType: 'guild_hunt_refund',
        referenceId: 'hunt-expiry-refund:' + huntId, description: 'Guild Hunt expired without a qualifying winner',
      }, client);
      await hunts.finalizeChallengeHunt(huntId, null, client);
      await client.query("UPDATE beatmap_hunts SET escrowed_dzp = 0 WHERE id = $1", [huntId]);
    }

    const ranked = await hunts.listTopPlacements(huntId, client, 10);
    for (const entry of ranked) {
      const placement = Number(entry.final_placement);
      if (placement < 2 || placement > 10 || entry.penalty_reason) continue;
      const base = GUILD_EXP_POLICY.placementBonus[placement];
      if (!base) continue;
      const eventBase = entry.qualifies === true ? base : base * GUILD_EXP_POLICY.unqualifiedPlacementMultiplier;
      const application = await guild.addGuildExp(Number(entry.user_id), eventBase, 'Hunt placement #' + placement, huntId, entry.id, client, 'HUNT_PLACEMENT');
      await hunts.addAttemptExp(entry.id, application.appliedDelta, client);
      await maybePromoteGuildPlayer(Number(entry.user_id), client);
    }
    await client.query('COMMIT');
    return winner;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function reportAttempt(userId: number, attemptId: string, reason: string) {
  if (reason.trim().length < 10) throw new GuildRuleError('Report reason must be at least 10 characters.');
  return hunts.createReport(attemptId, userId, reason.trim().slice(0, 500));
}

export async function acceptUpgradeLoan(userId: number, huntId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hunt = await hunts.findHunt(huntId, client);
    if (!hunt || hunt.poster_user_id !== userId || hunt.status !== 'PENDING_UPGRADE') throw new GuildRuleError('This Hunt is not awaiting your upgrade payment.');
    const amount = Number(hunt.upgrade_required_dzp);
    if (amount <= 0) throw new GuildRuleError('No upgrade payment is due.');
    const existing = await guild.getActiveLoan(userId, client);
    if (existing) throw new GuildRuleError('You already have an active Guild Loan.');
    const season = await hunts.getCurrentSeason(client);
    await hunts.insertLedger({ userId, season, amountDzp: amount, transactionType: 'guild_loan_funding', referenceId: 'guild-loan-funding:' + huntId, description: 'Guild Loan funding for Hunt upgrade' }, client);
    const loanId = await guild.createLoan(userId, huntId, amount, LOAN_DEFAULT_INSTALLMENT_PERCENT, client);
    await hunts.insertLedger({ userId, season, amountDzp: -amount, transactionType: 'guild_hunt_escrow', referenceId: 'hunt-upgrade-escrow:' + huntId, description: 'Guild Hunt upgrade escrow' }, client);
    await hunts.republishAfterUpgrade(huntId, client);
    await guild.createNotification(userId, 'LOAN_ISSUED', 'Guild Loan issued', 'The Guild funded your Hunt upgrade. Repayment begins after the seven-day due date.', { loanId, amount }, client);
    await client.query('COMMIT');
    return { loanId, amountDzp: amount, installmentPercent: LOAN_DEFAULT_INSTALLMENT_PERCENT };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function payUpgrade(userId: number, huntId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hunt = await hunts.findHunt(huntId, client);
    if (!hunt || hunt.poster_user_id !== userId || hunt.status !== 'PENDING_UPGRADE') throw new GuildRuleError('This Hunt is not awaiting your upgrade payment.');
    const amount = Number(hunt.upgrade_required_dzp);
    const season = await hunts.getCurrentSeason(client);
    const balance = await hunts.getSpendableBalance(userId, season, client);
    if (balance < amount) throw new GuildRuleError('You do not have enough DZP. You can request a Guild Loan instead.');
    await hunts.insertLedger({ userId, season, amountDzp: -amount, transactionType: 'guild_hunt_escrow', referenceId: 'hunt-upgrade-escrow:' + huntId, description: 'Guild Hunt upgrade payment' }, client);
    await hunts.republishAfterUpgrade(huntId, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function reconcileDueLoans(limit = 100) {
  const due = await guild.listDueLoans(limit);
  let collected = 0;
  for (const loan of due) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [loan.user_id]);
      const active = await guild.getActiveLoan(loan.user_id, client);
      if (!active) {
        await client.query('COMMIT');
        continue;
      }
      const season = await hunts.getCurrentSeason(client);
      const balance = await hunts.getSpendableBalance(loan.user_id, season, client);
      const amount = Math.min(Number(active.remaining_dzp), Math.floor(balance * Number(active.installment_percent) / 100));
      if (amount > 0) {
        await hunts.insertLedger({ userId: loan.user_id, season, amountDzp: -amount, transactionType: 'guild_loan_repayment', referenceId: 'loan-sweep:' + active.id + ':' + crypto.randomUUID(), description: 'Guild Loan scheduled repayment' }, client);
        await guild.applyLoanRepayment(active.id, amount, client);
        collected++;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
  }
  return { loansChecked: due.length, loansCollected: collected };
}

export async function adminOverrideHuntTier(adminUserId: number, huntId: string, tier: HuntTier, reason: string) {
  const hunt = await hunts.findHunt(huntId);
  if (!hunt) throw new GuildRuleError('Hunt not found.');
  const { rows } = await pool.query("SELECT min_bounty_dzp FROM guild_hunt_tier_rules WHERE tier = $1", [tier]);
  const minimum = Number(rows[0]?.min_bounty_dzp ?? 100);
  const topUp = Math.max(0, minimum - Number(hunt.bounty_dzp));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await hunts.setAdminTier(huntId, tier, reason.trim().slice(0, 500), topUp, adminUserId, client);
    if (topUp > 0) {
      await guild.createNotification(
        hunt.poster_user_id,
        'HUNT_TIER_UPGRADE',
        'The Guild upgraded your Quest poster',
        'Your poster was moved to ' + tier + '. An additional ' + topUp + ' DZP is required before it can return to the board.',
        { huntId, tier, topUp },
        client,
      );
    }
    await client.query('COMMIT');
    return { topUpDzp: topUp, tier };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function adminSetPlayerRank(adminUserId: number, userId: number, rank: GuildRank, reason: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await guild.registerAsIron(userId, client);
    await guild.setGuildRank(userId, rank, client);
    await guild.clearDemotionWarning(userId, client);
    await guild.createNotification(
      userId,
      'GUILD_RANK_ADJUSTED',
      'The Guild adjusted your rank',
      'The Guild administration assigned you the ' + rank + ' rank.',
      { rank, reason: reason.trim().slice(0, 500), adminUserId },
      client,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function adminApproveFinalExam(adminUserId: number, userId: number, rank: GuildRank, note: string) {
  if (rank !== 'ORICHALCUM' && rank !== 'ADAMANTITE') {
    throw new GuildRuleError('The final Placement Exam may only assign Orichalcum or Adamantite.');
  }
  const exam = await guild.getExamForUser(userId);
  if (!exam || exam.status !== 'PENDING_REVIEW' || Number(exam.highest_cleared_test) !== 6) {
    throw new GuildRuleError('This player does not have a Test 6 exam awaiting Guild review.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await guild.registerAsIron(userId, client);
    await guild.setGuildRank(userId, rank, client);
    await guild.clearDemotionWarning(userId, client);
    const season = await hunts.getCurrentSeason(client);
    await hunts.insertLedger({
      userId,
      season,
      amountDzp: 5000,
      transactionType: 'guild_exam_reward',
      referenceId: 'guild-exam-final:' + exam.id,
      description: 'Adventurer Guild final Placement Exam reward',
    }, client);
    await guild.updateExam(exam.id, {
      status: 'APPROVED',
      assignedRank: rank,
      rewardDzp: 5000,
      reviewedBy: adminUserId,
      reviewNote: note.trim().slice(0, 1000),
    }, client);
    await guild.createNotification(
      userId,
      'GUILD_EXAM_APPROVED',
      'Placement Exam approved',
      'The Guild approved your final exam and assigned you ' + rank + '. You received 5000 DZP.',
      { rank, rewardDzp: 5000 },
      client,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

