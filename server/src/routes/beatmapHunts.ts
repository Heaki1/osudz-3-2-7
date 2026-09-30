import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  GuildRuleError,
  acceptUpgradeLoan,
  cancelHunt,
  createHunt,
  importHuntScore,
  listMyTargetScores,
  payUpgrade,
  reportAttempt,
} from '../services/beatmapHunts.js';
import * as hunts from '../repos/beatmapHunts.js';
import * as guild from '../repos/guild.js';

const router = Router();

function errorResponse(res: any, error: unknown) {
  if (error instanceof GuildRuleError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error('[beatmap-hunts] request failed:', error);
  res.status(503).json({ error: 'Guild Hunt service unavailable' });
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await guild.getGuildProfile(req.user!.id);
    if (profile.registration_status !== 'ACTIVE' || !profile.kingdom || !profile.onboarding_completed) { res.status(403).json({ error: 'Complete Guild onboarding before entering a Guild board.' }); return; }
    const status = req.query.status === 'claimed' ? 'CLAIMED' : 'ACTIVE';
    const tier = typeof req.query.tier === 'string' ? req.query.tier as any : null;
    const rows = await hunts.listHunts(status, tier, profile.kingdom);
    res.json(rows.map(huntJson));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/target-scores', requireAuth, async (req, res) => {
  try {
    const difficultyId = Number(req.query.difficultyId);
    if (!Number.isInteger(difficultyId) || difficultyId <= 0) {
      res.status(400).json({ error: 'difficultyId is required' });
      return;
    }
    res.json(await listMyTargetScores(req.user!.id, difficultyId));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/claimed', requireAuth, async (req, res) => {
  try {
    const profile = await guild.getGuildProfile(req.user!.id);
    if (profile.registration_status !== 'ACTIVE' || !profile.kingdom || !profile.onboarding_completed) { res.status(403).json({ error: 'Complete Guild onboarding before entering a Guild board.' }); return; }
    const tier = typeof req.query.tier === 'string' ? req.query.tier as any : null;
    const rows = await hunts.listHunts('CLAIMED', tier, profile.kingdom);
    res.json(rows.map(huntJson));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const hunt = await hunts.findHunt(req.params.id);
    if (!hunt) {
      res.status(404).json({ error: 'Hunt not found' });
      return;
    }
    res.json({
      hunt: huntJson(hunt),
      leaderboard: (await hunts.listAttempts(hunt.id)).map(attemptJson),
      myHistory: req.user ? (await hunts.listAttemptHistory(hunt.id, req.user.id)).map(attemptJson) : [],
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const hunt = await createHunt(req.user!.id, {
      huntType: body.huntType as any,
      difficultyId: Number(body.difficultyId),
      bountyDzp: Number(body.bountyDzp),
      requirements: body.requirements && typeof body.requirements === 'object' ? body.requirements as any : {},
      description: typeof body.description === 'string' ? body.description : '',
      targetScoreInput: typeof body.targetScoreInput === 'string' ? body.targetScoreInput : undefined,
    });
    res.status(201).json(huntJson(hunt));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/import', requireAuth, async (req, res) => {
  try {
    const score = typeof req.body?.score === 'string' || typeof req.body?.score === 'number' ? String(req.body.score) : '';
    res.json(await importHuntScore(req.user!.id, req.params.id, score));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.delete('/:id/attempts/:attemptId', requireAuth, async (req, res) => {
  try {
    const attempt = await hunts.findAttempt(req.params.attemptId);
    if (!attempt || attempt.hunt_id !== req.params.id) {
      res.status(404).json({ error: 'Attempt not found' });
      return;
    }
    if (!await hunts.deleteAttempt(req.params.attemptId, req.user!.id)) {
      res.status(403).json({ error: 'You can only delete your own attempt' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    await cancelHunt(req.user!.id, req.params.id);
    res.json({ ok: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/upgrade/pay', requireAuth, async (req, res) => {
  try {
    await payUpgrade(req.user!.id, req.params.id);
    res.json({ ok: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/upgrade/loan', requireAuth, async (req, res) => {
  try {
    res.json(await acceptUpgradeLoan(req.user!.id, req.params.id));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/attempts/:attemptId/report', requireAuth, async (req, res) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    await reportAttempt(req.user!.id, req.params.attemptId, reason);
    res.status(201).json({ ok: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

function huntJson(row: any) {
  return {
    id: row.id,
    poster: { userId: row.poster_user_id, username: row.poster_username },
    huntType: row.hunt_type,
    status: row.status,
    tier: row.admin_tier ?? row.auto_tier,
    autoTier: row.auto_tier,
    adminTier: row.admin_tier,
    beatmap: {
      difficultyId: Number(row.beatmap_id),
      beatmapsetId: Number(row.beatmapset_id),
      title: row.title,
      artist: row.artist,
      mapper: row.mapper,
      difficultyName: row.difficulty_name,
      coverUrl: row.cover_url,
      previewUrl: row.preview_url,
      stars: Number(row.stars),
      cs: row.cs === null ? null : Number(row.cs),
      ar: row.ar === null ? null : Number(row.ar),
      od: row.od === null ? null : Number(row.od),
      hp: row.hp === null ? null : Number(row.hp),
      maxCombo: row.max_combo === null ? null : Number(row.max_combo),
    },
    bountyDzp: Number(row.bounty_dzp),
    escrowedDzp: Number(row.escrowed_dzp),
    requirements: row.requirements,
    description: row.description,
    targetScore: row.target_score_data ? {
      ...row.target_score_data,
      id: Number(row.target_score_data.id),
      userId: Number(row.target_score_data.userId),
      score: Number(row.target_score_data.score),
      accuracy: Number(row.target_score_data.accuracy),
      maxCombo: Number(row.target_score_data.maxCombo),
      misses: Number(row.target_score_data.misses),
      pp: row.target_score_data.pp == null ? null : Number(row.target_score_data.pp),
    } : null,
    upgradeRequiredDzp: Number(row.upgrade_required_dzp),
    expiresAt: new Date(row.expires_at).toISOString(),
    publishedAt: new Date(row.published_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    winner: row.winner_user_id ? { userId: row.winner_user_id, username: row.winner_username } : null,
  };
}

function attemptJson(row: any) {
  return {
    id: row.id,
    hunt_id: row.hunt_id,
    user_id: Number(row.user_id),
    username: row.username,
    avatar_url: row.avatar_url,
    osu_score_id: Number(row.osu_score_id),
    score: Number(row.score),
    accuracy: Number(row.accuracy),
    max_combo: Number(row.max_combo),
    misses: Number(row.misses),
    mods: row.mods,
    pp: row.pp == null ? null : Number(row.pp),
    passed: Boolean(row.passed),
    qualifies: Boolean(row.qualifies),
    failure_reason: row.failure_reason,
    penalty_reason: row.penalty_reason,
    guild_exp_delta: Number(row.guild_exp_delta),
    final_placement: row.final_placement == null ? null : Number(row.final_placement),
    deleted_at: row.deleted_at,
    submitted_at: new Date(row.submitted_at).toISOString(),
  };
}

export default router;
