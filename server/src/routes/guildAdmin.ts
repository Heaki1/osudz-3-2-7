import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  GuildRuleError,
  adminApproveFinalExam,
  adminOverrideHuntTier,
  adminSetPlayerRank,
  reconcileDueLoans,
} from '../services/beatmapHunts.js';
import { approveGuildRankReview, rejectGuildRankReview } from '../services/guildProgression.js';
import * as hunts from '../repos/beatmapHunts.js';
import * as guild from '../repos/guild.js';
import * as parties from '../repos/guildParties.js';
import { pool } from '../db.js';
import { fetchBeatmapAnyStatus } from '../services/osu.js';
import { createWarCycle, getActiveWar, publishWarMaps, reviewTrumpCard, selectTopRoster } from '../services/guildWar.js';

const router = Router();
router.use(requireAdmin);

function fail(res: any, error: unknown) {
  if (error instanceof GuildRuleError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error('[admin/guild] request failed:', error);
  res.status(503).json({ error: 'Guild administration unavailable' });
}

router.get('/hunts', async (_req, res) => {
  try {
    res.json((await hunts.listAdminHunts()).map((row) => ({
      id: row.id,
      poster: { userId: row.poster_user_id, username: row.poster_username },
      tier: row.admin_tier ?? row.auto_tier,
      autoTier: row.auto_tier,
      adminTier: row.admin_tier,
      bountyDzp: Number(row.bounty_dzp),
      upgradeRequiredDzp: Number(row.upgrade_required_dzp),
      status: row.status,
      title: row.title,
      stars: Number(row.stars),
    })));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/hunts/:id/tier', async (req, res) => {
  try {
    const tier = String(req.body?.tier) as any;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    if (!['BEGINNER', 'ADVANCED', 'ELITE', 'LEGENDARY_MASTER'].includes(tier)) {
      res.status(400).json({ error: 'Invalid Guild poster row.' });
      return;
    }
    res.json(await adminOverrideHuntTier(req.user!.id, req.params.id, tier, reason));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/reports', async (_req, res) => {
  try {
    res.json(await hunts.listReports('PENDING'));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/reports/:id/resolve', async (req, res) => {
  try {
    const status = req.body?.status as 'RESOLVED_BANNED' | 'RESOLVED_CLEARED';
    if (status !== 'RESOLVED_BANNED' && status !== 'RESOLVED_CLEARED') {
      res.status(400).json({ error: 'Invalid report resolution.' });
      return;
    }
    const ok = await hunts.resolveReport(req.params.id, status, req.user!.id, String(req.body?.note ?? '').slice(0, 1000));
    res.json({ ok });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/players/:userId/rank', async (req, res) => {
  try {
    const rank = String(req.body?.rank) as any;
    if (!['IRON', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'MITHRIL', 'ORICHALCUM', 'ADAMANTITE'].includes(rank)) {
      res.status(400).json({ error: 'Invalid Guild rank.' });
      return;
    }
    await adminSetPlayerRank(req.user!.id, Number(req.params.userId), rank, String(req.body?.reason ?? ''));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/rank-reviews', async (_req, res) => {
  try {
    res.json(await guild.listPendingRankReviews());
  } catch (error) {
    fail(res, error);
  }
});

router.post('/rank-reviews/:id/approve', async (req, res) => {
  try {
    res.json(await approveGuildRankReview(req.params.id, req.user!.id, String(req.body?.note ?? '')));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/rank-reviews/:id/reject', async (req, res) => {
  try {
    res.json(await rejectGuildRankReview(req.params.id, req.user!.id, String(req.body?.note ?? '')));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/rank-rules', async (_req, res) => {
  try {
    res.json(await guild.listRankRules());
  } catch (error) {
    fail(res, error);
  }
});

router.post('/party-quest-templates', async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
    const expBounty = Number(req.body?.expBounty);
    if (!title || !Number.isInteger(expBounty) || expBounty <= 0) {
      res.status(400).json({ error: 'Party Quest title and EXP bounty are required.' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = await parties.createPartyQuestTemplate(title, expBounty, client);
      await client.query('COMMIT');
      res.status(201).json({ id, title, expBounty });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  } catch (error) { fail(res, error); }
});

router.put('/rank-rules/:rank', async (req, res) => {
  try {
    const rank = String(req.params.rank) as any;
    await guild.updateRankRule(
      rank,
      req.body?.minExp === null ? null : Number(req.body?.minExp),
      req.body?.requiredHuntTier === null ? null : String(req.body?.requiredHuntTier) as any,
      req.body?.requiredSuccesses === null ? null : Number(req.body?.requiredSuccesses),
    );
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/tier-rules', async (_req, res) => {
  try { res.json(await guild.listTierRules()); } catch (error) { fail(res, error); }
});

router.put('/tier-rules/:tier', async (req, res) => {
  try {
    const tier = String(req.params.tier) as any;
    if (!['BEGINNER', 'ADVANCED', 'ELITE', 'LEGENDARY_MASTER'].includes(tier)) {
      res.status(400).json({ error: 'Invalid Guild hunt tier.' }); return;
    }
    const minStars = Number(req.body?.minStars);
    const minBountyDzp = Number(req.body?.minBountyDzp);
    if (!Number.isFinite(minStars) || minStars < 0 || !Number.isInteger(minBountyDzp) || minBountyDzp < 100) {
      res.status(400).json({ error: 'Tier thresholds are invalid.' }); return;
    }
    await guild.updateTierRule(tier, minStars, minBountyDzp);
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});

router.get('/exam/beatmap/:difficultyId', async (req, res) => {
  try {
    const difficultyId = Number(req.params.difficultyId);
    if (!Number.isInteger(difficultyId) || difficultyId <= 0) { res.status(400).json({ error: 'Invalid difficulty ID.' }); return; }
    const beatmap = await fetchBeatmapAnyStatus(difficultyId);
    res.json({
      difficultyId,
      beatmapId: beatmap.difficultyId,
      beatmapsetId: beatmap.beatmapsetId,
      title: beatmap.title,
      artist: beatmap.artist,
      difficultyName: beatmap.difficultyName,
      stars: beatmap.stars,
      cs: beatmap.cs,
      ar: beatmap.ar,
      od: beatmap.od,
      hp: beatmap.hp,
      maxCombo: beatmap.maxCombo,
      status: beatmap.mapStatus,
    });
  } catch (error) { fail(res, error); }
});

router.get('/exam/templates', async (_req, res) => {
  try {
    res.json(await guild.listExamTemplates());
  } catch (error) {
    fail(res, error);
  }
});

router.put('/exam/templates/:testNumber', async (req, res) => {
  try {
    const testNumber = Number(req.params.testNumber);
    if (!Number.isInteger(testNumber) || testNumber < 1 || testNumber > 6) {
      res.status(400).json({ error: 'Test number must be 1 through 6.' });
      return;
    }
    await guild.upsertExamTemplate(
      testNumber,
      Number(req.body?.difficultyId),
      req.body?.requirements && typeof req.body.requirements === 'object' ? req.body.requirements : {},
      req.body?.rewardRank === null ? null : String(req.body?.rewardRank) as any,
      Number(req.body?.rewardDzp ?? 0),
    );
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/exam/reviews', async (_req, res) => {
  try {
    const { rows } = await import('../db.js').then((module) => module.pool.query(
      "SELECT e.id, e.user_id, u.username, e.highest_cleared_test, e.started_at, e.expires_at, e.status FROM guild_placement_exams e JOIN users u ON u.id = e.user_id WHERE e.status = 'PENDING_REVIEW' ORDER BY e.updated_at DESC",
    ));
    res.json(rows);
  } catch (error) {
    fail(res, error);
  }
});

router.post('/exam/reviews/:userId/approve', async (req, res) => {
  try {
    await adminApproveFinalExam(req.user!.id, Number(req.params.userId), String(req.body?.rank) as any, String(req.body?.note ?? ''));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/loans/reconcile', async (_req, res) => {
  try {
    res.json(await reconcileDueLoans());
  } catch (error) {
    fail(res, error);
  }
});

router.post('/war/cycles', async (req, res) => {
  try { res.status(201).json(await createWarCycle(new Date(String(req.body?.startsAt ?? '')))); }
  catch (error) { fail(res, error); }
});

router.post('/war/roster', async (_req, res) => {
  try { const active = await getActiveWar(); if (!active) { res.status(404).json({ error: 'No active war cycle.' }); return; } res.json(await selectTopRoster(active.id)); }
  catch (error) { fail(res, error); }
});

router.get('/war/trump-cards', async (_req, res) => {
  try {
    const active = await getActiveWar();
    if (!active) { res.json([]); return; }
    const { rows } = await import('../db.js').then((m) => m.pool.query('SELECT t.*,u.username FROM guild_war_trump_cards t JOIN users u ON u.id=t.user_id WHERE t.cycle_id=$1 ORDER BY t.kingdom,t.submitted_at', [active.id]));
    res.json(rows);
  } catch (error) { fail(res, error); }
});

router.post('/war/trump-cards/:id/review', async (req, res) => {
  try {
    const active = await getActiveWar();
    if (!active || active.phase !== 'REVIEW') { res.status(409).json({ error: 'Trump review is closed.' }); return; }
    res.json(await reviewTrumpCard(active.id, req.params.id, req.user!.id, req.body?.approved === true, String(req.body?.note ?? '').slice(0,1000)));
  } catch (error) { fail(res, error); }
});

router.post('/war/reveal', async (req, res) => {
  try {
    const active = await getActiveWar();
    if (!active) { res.status(404).json({ error: 'No active war cycle.' }); return; }
    const vipMaps = Array.isArray(req.body?.vipMaps) ? req.body.vipMaps.map((m: any) => ({ difficultyId:Number(m.difficultyId), beatmapId:Number(m.beatmapId), beatmapsetId:m.beatmapsetId == null ? null : Number(m.beatmapsetId), modRequirement:String(m.modRequirement ?? 'FM'), challengeRequirement:m.challengeRequirement && typeof m.challengeRequirement === 'object' ? m.challengeRequirement : {} })) : [];
    await publishWarMaps(active.id, vipMaps);
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});

export default router;
