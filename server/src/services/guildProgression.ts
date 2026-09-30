import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import {
  isFamilyBoundary,
  nextRank,
  previousRank,
  rankMultiplier,
  type RankRule,
} from '../domain/beatmapHunts/progression.js';
import type { GuildRank } from '../domain/beatmapHunts/rules.js';
import * as guild from '../repos/guild.js';

type GateResult = { satisfied: boolean; reason: string };

const PROMOTION_MESSAGES: Record<GuildRank, string> = {
  COPPER: "You survived, mosquito? How surprising. I suppose you are slightly more useful than a common slug now. Here is your Copper tag. Try not to die on the next contract; the paperwork is tedious.",
  SILVER: "Silver, eh? You’ve finally washed the stench of a rookie off you. You hunted a rival target and proved your steel. Welcome to the ranks of the true professionals. Don't let the Guild down.",
  GOLD: "Oya? It seems the little sheep has learned how to bite. To consistently execute your contracts without a single misstep... fascinating. I look forward to seeing how much further your potential can be... harvested.",
  PLATINUM: "To think a lowly human could reach the Elite ranks. You have claimed victory and survived the deep waters. I suppose you are somewhat competent. Just remember your place—no matter how high you climb, you remain an insect before the Supreme One.",
  MITHRIL: "You possess a strong will and a steady blade. Surviving those ironclad contracts requires both absolute discipline and honor. You have earned this Mithril badge. Please, continue to walk a path you can be proud of.",
  ORICHALCUM: "You have dismantled the Elites and conquered the most dangerous bounties in this realm. Few ever reach this domain. As a fellow warrior, I respect your strength. Carry this Orichalcum rank with the weight it deserves.",
  ADAMANTITE: "Umu. You have defended your throne against all challengers and proven yourself the absolute apex of this world. Excellent! I acknowledge your supreme power! Rise, Adamantite Adventurer! Let your name echo through the annals of history!",
  IRON: '',
};

function sinceClause(resetAt: Date | string | null, values: unknown[]): string {
  if (!resetAt) return '';
  values.push(resetAt);
  return ' AND a.submitted_at >= $' + values.length;
}

async function countDistinctHunts(
  userId: number,
  client: PoolClient,
  options: { tier?: string; types?: string[]; qualifies?: boolean; resetAt?: Date | string | null },
) {
  const values: unknown[] = [userId];
  const where = ['a.user_id = $1'];
  if (options.tier) {
    values.push(options.tier);
    where.push('COALESCE(h.admin_tier, h.auto_tier) = $' + values.length);
  }
  if (options.types?.length) {
    values.push(options.types);
    where.push('h.hunt_type = ANY($' + values.length + '::text[])');
  }
  if (options.qualifies) where.push('a.qualifies = true');
  const since = sinceClause(options.resetAt ?? null, values);
  const { rows } = await client.query(
    'SELECT COUNT(DISTINCT h.id)::int AS count FROM beatmap_hunt_attempts a JOIN beatmap_hunts h ON h.id = a.hunt_id WHERE ' + where.join(' AND ') + since,
    values,
  );
  return Number(rows[0]?.count ?? 0);
}

async function countTargetTypes(userId: number, client: PoolClient, tier: string, resetAt: Date | string | null) {
  const values: unknown[] = [userId, tier];
  const since = sinceClause(resetAt, values);
  const { rows } = await client.query(
    "SELECT COUNT(DISTINCT h.id) FILTER (WHERE h.hunt_type IN ('BEAT_MY_SCORE','SNIPE_SCORE'))::int AS target_count, COUNT(DISTINCT h.id) FILTER (WHERE h.hunt_type = 'BEAT_MY_SCORE')::int AS beat_my_score_count, COUNT(DISTINCT h.id) FILTER (WHERE h.hunt_type = 'SNIPE_SCORE')::int AS snipe_score_count FROM beatmap_hunt_attempts a JOIN beatmap_hunts h ON h.id = a.hunt_id WHERE a.user_id = $1 AND COALESCE(h.admin_tier, h.auto_tier) = $2 AND a.qualifies = true" + since,
    values,
  );
  return {
    targetCount: Number(rows[0]?.target_count ?? 0),
    beatMyScoreCount: Number(rows[0]?.beat_my_score_count ?? 0),
    snipeScoreCount: Number(rows[0]?.snipe_score_count ?? 0),
  };
}

async function challengePlacementRequirements(userId: number, client: PoolClient, tier: string, resetAt: Date | string | null) {
  const values: unknown[] = [userId, tier];
  const since = sinceClause(resetAt, values);
  const { rows } = await client.query(
    "SELECT " +
      "COUNT(DISTINCT h.id) FILTER (WHERE a.final_placement = 1)::int AS first_count, " +
      "COUNT(DISTINCT h.id) FILTER (WHERE a.final_placement BETWEEN 2 AND 3)::int AS additional_top3_count, " +
      "COUNT(DISTINCT h.id) FILTER (WHERE a.final_placement BETWEEN 4 AND 5)::int AS additional_top5_count, " +
      "COUNT(DISTINCT h.id)::int AS challenge_count " +
      "FROM beatmap_hunt_attempts a JOIN beatmap_hunts h ON h.id = a.hunt_id " +
      "WHERE a.user_id = $1 AND COALESCE(h.admin_tier, h.auto_tier) = $2 " +
      "AND h.hunt_type = 'BEATMAP_CHALLENGE' AND a.qualifies = true" + since,
    values,
  );
  return {
    challengeCount: Number(rows[0]?.challenge_count ?? 0),
    firstCount: Number(rows[0]?.first_count ?? 0),
    additionalTop3Count: Number(rows[0]?.additional_top3_count ?? 0),
    additionalTop5Count: Number(rows[0]?.additional_top5_count ?? 0),
  };
}

async function advancedQualifiedStreak(userId: number, client: PoolClient, resetAt: Date | string | null) {
  const values: unknown[] = [userId];
  const since = sinceClause(resetAt, values);
  const { rows } = await client.query(
    "SELECT a.qualifies, a.penalty_reason FROM beatmap_hunt_attempts a JOIN beatmap_hunts h ON h.id = a.hunt_id WHERE a.user_id = $1 AND COALESCE(h.admin_tier, h.auto_tier) = 'ADVANCED'" + since + ' ORDER BY a.submitted_at DESC, a.id DESC',
    values,
  );
  let streak = 0;
  for (const row of rows) {
    if (row.qualifies !== true) break;
    streak++;
  }
  return streak;
}

async function gateForRank(userId: number, rank: GuildRank, client: PoolClient, resetAt: Date | string | null): Promise<GateResult> {
  switch (rank) {
    case 'IRON':
      return { satisfied: true, reason: 'Starting rank' };
    case 'COPPER': {
      const count = await countDistinctHunts(userId, client, { types: ['BEATMAP_CHALLENGE'], qualifies: true, resetAt });
      return { satisfied: count >= 3, reason: `${count}/3 qualified Beatmap Challenges` };
    }
    case 'SILVER': {
      const count = await countDistinctHunts(userId, client, { types: ['BEAT_MY_SCORE', 'SNIPE_SCORE'], qualifies: true, resetAt });
      return { satisfied: count >= 2, reason: `${count}/2 qualified Target Hunts` };
    }
    case 'GOLD': {
      const streak = await advancedQualifiedStreak(userId, client, resetAt);
      return { satisfied: streak >= 5, reason: `${streak}/5 consecutive qualified Advanced Hunts` };
    }
    case 'PLATINUM': {
      const beginnerTargets = await countDistinctHunts(userId, client, { tier: 'BEGINNER', types: ['BEAT_MY_SCORE', 'SNIPE_SCORE'], qualifies: true, resetAt });
      const beginnerChallenges = await challengePlacementRequirements(userId, client, 'BEGINNER', resetAt);
      const advancedTargets = await countTargetTypes(userId, client, 'ADVANCED', resetAt);
      const advancedChallenges = await challengePlacementRequirements(userId, client, 'ADVANCED', resetAt);
      const satisfied = beginnerTargets >= 2 && beginnerChallenges.challengeCount >= 2 && beginnerChallenges.additionalTop3Count >= 1
        && advancedTargets.targetCount >= 4 && advancedTargets.beatMyScoreCount >= 2 && advancedTargets.snipeScoreCount >= 2
        && advancedChallenges.challengeCount >= 3 && advancedChallenges.firstCount >= 1
        && advancedChallenges.additionalTop3Count >= 1 && advancedChallenges.additionalTop5Count >= 1;
      return {
        satisfied,
        reason: `Beginner targets ${beginnerTargets}/2, Beginner challenges ${beginnerChallenges.challengeCount}/2 with Top-3 ${beginnerChallenges.additionalTop3Count}/1; Advanced targets ${advancedTargets.targetCount}/4 (${advancedTargets.beatMyScoreCount}/2 BMS, ${advancedTargets.snipeScoreCount}/2 Snipe); Advanced challenges ${advancedChallenges.challengeCount}/3 with 1st ${advancedChallenges.firstCount}/1, additional Top-3 ${advancedChallenges.additionalTop3Count}/1, additional Top-5 ${advancedChallenges.additionalTop5Count}/1`,
      };
    }
    case 'MITHRIL': {
      const values: unknown[] = [userId];
      const since = sinceClause(resetAt, values);
      const { rows } = await client.query(
        "SELECT COUNT(DISTINCT h.id)::int AS count FROM beatmap_hunt_attempts a JOIN beatmap_hunts h ON h.id = a.hunt_id WHERE a.user_id = $1 AND COALESCE(h.admin_tier, h.auto_tier) = 'ELITE' AND a.qualifies = true AND LOWER(COALESCE(h.requirements->>'exactMods','false')) = 'true'" + since,
        values,
      );
      const count = Number(rows[0]?.count ?? 0);
      return { satisfied: count >= 3, reason: `${count}/3 qualified Elite Hunts with exact mod enforcement` };
    }
    case 'ORICHALCUM': {
      const advancedTargets = await countTargetTypes(userId, client, 'ADVANCED', resetAt);
      const advancedChallenges = await challengePlacementRequirements(userId, client, 'ADVANCED', resetAt);
      const eliteTargets = await countTargetTypes(userId, client, 'ELITE', resetAt);
      const eliteChallenges = await challengePlacementRequirements(userId, client, 'ELITE', resetAt);
      const satisfied = advancedTargets.targetCount >= 3 && advancedChallenges.challengeCount >= 2 && advancedChallenges.firstCount >= 1
        && eliteTargets.targetCount >= 4 && eliteTargets.beatMyScoreCount >= 2 && eliteTargets.snipeScoreCount >= 2
        && eliteChallenges.challengeCount >= 3 && eliteChallenges.firstCount >= 1;
      return {
        satisfied,
        reason: `Advanced targets ${advancedTargets.targetCount}/3; Advanced challenges ${advancedChallenges.challengeCount}/2 with 1st ${advancedChallenges.firstCount}/1; Elite targets ${eliteTargets.targetCount}/4 (${eliteTargets.beatMyScoreCount}/2 BMS, ${eliteTargets.snipeScoreCount}/2 Snipe); Elite challenges ${eliteChallenges.challengeCount}/3 with 1st ${eliteChallenges.firstCount}/1`,
      };
    }
    case 'ADAMANTITE': {
      const values: unknown[] = [userId];
      const since = sinceClause(resetAt, values);
      const { rows } = await client.query(
        "SELECT COUNT(DISTINCT h.id) FILTER (WHERE h.hunt_type IN ('BEAT_MY_SCORE','SNIPE_SCORE') AND h.winner_user_id = a.user_id)::int AS legendary_target_wins, COUNT(DISTINCT h.id) FILTER (WHERE h.hunt_type = 'BEAT_MY_SCORE' AND h.status = 'EXPIRED')::int AS unbeaten_bms_expiries FROM beatmap_hunt_attempts a JOIN beatmap_hunts h ON h.id = a.hunt_id WHERE a.user_id = $1 AND COALESCE(h.admin_tier, h.auto_tier) = 'LEGENDARY_MASTER'" + since,
        values,
      );
      // The second criterion is about Hunts posted by the adventurer, not their attempts.
      const postedValues: unknown[] = [userId];
      const postedSince = resetAt ? (postedValues.push(resetAt), ' AND h.created_at >= $2') : '';
      const posted = await client.query(
        "SELECT COUNT(*)::int AS count FROM beatmap_hunts h WHERE h.poster_user_id = $1 AND h.hunt_type = 'BEAT_MY_SCORE' AND COALESCE(h.admin_tier, h.auto_tier) = 'LEGENDARY_MASTER' AND h.status = 'EXPIRED'" + postedSince,
        postedValues,
      );
      const targetWins = Number(rows[0]?.legendary_target_wins ?? 0);
      const unbeaten = Number(posted.rows[0]?.count ?? 0);
      return { satisfied: targetWins >= 3 && unbeaten >= 1, reason: `${targetWins}/3 Legendary Master Target Hunt wins; ${unbeaten}/1 unbeaten Legendary Master BEAT_MY_SCORE expiry` };
    }
  }
}

async function loadRankRules(client: PoolClient): Promise<RankRule[]> {
  const { rows } = await client.query(
    'SELECT rank, rank_order, min_exp, family FROM guild_rank_definitions WHERE is_active = true ORDER BY rank_order',
  );
  return rows as RankRule[];
}

export async function maybePromoteGuildPlayer(userId: number, client: PoolClient) {
  const rules = await loadRankRules(client);
  for (let step = 0; step < rules.length; step++) {
    const profile = await guild.lockGuildProfile(userId, client);
    if (!profile) return null;
    const currentRank = profile.guild_rank as GuildRank;
    const next = nextRank(currentRank, rules);
    if (!next || next.min_exp === null || Number(profile.guild_exp) < Number(next.min_exp)) return currentRank;

    const gate = await gateForRank(userId, next.rank, client, profile.family_gate_reset_at ?? null);
    if (!gate.satisfied) return currentRank;

    if (next.rank === 'ADAMANTITE') {
      const existing = await guild.getPendingRankReview(userId, client);
      if (!existing) {
        const review = await guild.createRankReview(userId, 'ADAMANTITE', client);
        if (review) {
          await guild.createNotification(
            userId,
            'GUILD_RANK_REVIEW_PENDING',
            'Adamantite Tribunal review pending',
            'You have satisfied the EXP and progression requirements for Adamantite. The Guild Tribunal must review and approve your final rank.',
            { requestedRank: 'ADAMANTITE', reviewId: review.id },
            client,
          );
        }
      }
      return currentRank;
    }

    await guild.setGuildRank(userId, next.rank, client);
    await guild.clearDemotionWarning(userId, client);
    if (isFamilyBoundary(next.rank, currentRank)) await guild.clearFamilyGateReset(userId, client);
    const multiplier = rankMultiplier(currentRank);
    await guild.createNotification(
      userId,
      'GUILD_RANK_ADJUSTED',
      'Guild rank promotion',
      PROMOTION_MESSAGES[next.rank],
      {
        type: 'PROMOTION',
        previousRank: currentRank,
        newRank: next.rank,
        guildExp: Number(profile.guild_exp),
        rankMultiplier: multiplier,
        gate: gate.reason,
      },
      client,
    );
  }
  return (await guild.lockGuildProfile(userId, client))?.guild_rank ?? null;
}

async function startDemotionWarning(userId: number, rank: GuildRank, targetRank: GuildRank, guildExp: number, threshold: number, client: PoolClient) {
  await client.query(
    "UPDATE user_guild_profiles SET demotion_warning_started_at = now(), demotion_target_rank = $2, updated_at = now() WHERE user_id = $1 AND demotion_warning_started_at IS NULL",
    [userId, targetRank],
  );
  await guild.createNotification(
    userId,
    'GUILD_DEMOTION_WARNING',
    'Guild demotion warning',
    'Your Guild EXP is at or below the minimum for ' + rank + '. Recover above ' + threshold + ' EXP within 24 hours to retain your rank.',
    { previousRank: rank, targetRank, guildExp, threshold, graceHours: 24 },
    client,
  );
}

export async function processGuildDemotionWarnings(limit = 100) {
  const candidates = await guild.listDemotionCandidates(limit);
  let started = 0;
  let demoted = 0;

  for (const candidate of candidates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const profile = await guild.lockGuildProfile(candidate.user_id, client);
      if (!profile || profile.registration_status !== 'ACTIVE') {
        await client.query('COMMIT');
        continue;
      }
      const rules = await loadRankRules(client);
      const current = rules.find((rule) => rule.rank === profile.guild_rank);
      if (!current || current.min_exp === null || profile.guild_rank === 'IRON' || Number(profile.guild_exp) > Number(current.min_exp)) {
        if (profile.demotion_warning_started_at) await guild.clearDemotionWarning(candidate.user_id, client);
        await client.query('COMMIT');
        continue;
      }

      const previous = previousRank(profile.guild_rank as GuildRank, rules);
      if (!previous) {
        await client.query('COMMIT');
        continue;
      }

      if (!profile.demotion_warning_started_at) {
        await startDemotionWarning(candidate.user_id, profile.guild_rank as GuildRank, previous.rank, Number(profile.guild_exp), Number(current.min_exp), client);
        started++;
        await client.query('COMMIT');
        continue;
      }

      const warningAge = Date.now() - new Date(profile.demotion_warning_started_at).getTime();
      if (warningAge < 24 * 60 * 60 * 1000) {
        await client.query('COMMIT');
        continue;
      }

      const crossedFamily = isFamilyBoundary(profile.guild_rank as GuildRank, previous.rank as GuildRank);
      await guild.setGuildRank(candidate.user_id, previous.rank as GuildRank, client);
      await guild.clearDemotionWarning(candidate.user_id, client);
      if (crossedFamily) await guild.setFamilyGateReset(candidate.user_id, new Date(), client);
      await guild.createNotification(
        candidate.user_id,
        'GUILD_DEMOTION',
        'Guild rank demoted',
        'Your 24-hour Guild demotion grace period expired without recovering above the ' + current.min_exp + ' EXP floor. Your rank is now ' + previous.rank + '.' +
          (crossedFamily ? ' You must redo the Family Gate before returning to ' + profile.guild_rank + '.' : ''),
        {
          previousRank: profile.guild_rank,
          newRank: previous.rank,
          guildExp: Number(profile.guild_exp),
          familyGateReset: crossedFamily,
        },
        client,
      );
      demoted++;

      const newFloor = previous.min_exp;
      if (previous.rank !== 'IRON' && newFloor !== null && Number(profile.guild_exp) <= Number(newFloor)) {
        const lower = previousRank(previous.rank as GuildRank, rules);
        if (lower) {
          await startDemotionWarning(candidate.user_id, previous.rank as GuildRank, lower.rank, Number(profile.guild_exp), Number(newFloor), client);
          started++;
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[guild] failed to process demotion warning', candidate.user_id, error);
    } finally {
      client.release();
    }
    await yieldToEventLoop();
  }

  return { checked: candidates.length, warningsStarted: started, demotions: demoted };
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 50));
}

export async function approveGuildRankReview(reviewId: string, adminUserId: number, note: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const review = await guild.resolveRankReview(reviewId, adminUserId, 'APPROVED', note.trim().slice(0, 1000), client);
    if (!review) throw new Error('Rank review is no longer pending.');
    if (review.requested_rank !== 'ADAMANTITE') throw new Error('Only Adamantite rank reviews are supported.');
    const profile = await guild.lockGuildProfile(review.user_id, client);
    if (!profile || profile.guild_rank !== 'ORICHALCUM' || Number(profile.guild_exp) < 50000) {
      throw new Error('The adventurer no longer meets the Adamantite EXP/rank prerequisites.');
    }
    const gate = await gateForRank(review.user_id, 'ADAMANTITE', client, profile.family_gate_reset_at ?? null);
    if (!gate.satisfied) throw new Error('The adventurer no longer satisfies the Adamantite gate.');
    await guild.setGuildRank(review.user_id, 'ADAMANTITE', client);
    await guild.clearDemotionWarning(review.user_id, client);
    await guild.clearFamilyGateReset(review.user_id, client);
    await guild.createNotification(
      review.user_id,
      'GUILD_RANK_ADJUSTED',
      'Guild rank promotion',
      PROMOTION_MESSAGES.ADAMANTITE,
      { type: 'PROMOTION', previousRank: 'ORICHALCUM', newRank: 'ADAMANTITE', reviewId: review.id, adminUserId },
      client,
    );
    await client.query('COMMIT');
    return review;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectGuildRankReview(reviewId: string, adminUserId: number, note: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const review = await guild.resolveRankReview(reviewId, adminUserId, 'REJECTED', note.trim().slice(0, 1000), client);
    if (!review) throw new Error('Rank review is no longer pending.');
    await guild.createNotification(
      review.user_id,
      'GUILD_RANK_REVIEW_REJECTED',
      'Adamantite Tribunal review closed',
      'The Guild Tribunal did not approve the current Adamantite application. The progression record remains intact and may qualify for another review later.',
      { reviewId: review.id, requestedRank: review.requested_rank },
      client,
    );
    await client.query('COMMIT');
    return review;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
