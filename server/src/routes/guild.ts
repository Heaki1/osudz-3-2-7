import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  GuildRuleError,
  cashOutExam,
  expireExam,
  getGuildProfile,
  getPlacementExam,
  importPlacementExamScore,
  registerIron,
  startPlacementExam,
  completeGuildOnboarding,
  getGuildKingdoms,
  getGuildKingdom,
  travelToKingdom,
} from '../services/beatmapHunts.js';
import * as guild from '../repos/guild.js';
import { GuildPartyRuleError, acceptPartyQuest, createAdventurerParty, getPartyDashboard, joinAdventurerParty, resolvePartyQuest } from '../services/guildParties.js';
import { getActiveWar, getWarBoard, setKingdom, submitTrumpCard, syncWarScoresForUser, useWarSummons, hasWarSummons } from '../services/guildWar.js';

const router = Router();

function fail(res: any, error: unknown) {
  if (error instanceof GuildRuleError || error instanceof GuildPartyRuleError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error('[guild] request failed:', error);
  res.status(503).json({ error: 'Guild service unavailable' });
}

router.post('/parties', requireAuth, async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    res.status(201).json(await createAdventurerParty(req.user!.id, name));
  } catch (error) { fail(res, error); }
});

router.get('/party', requireAuth, async (req, res) => {
  try { res.json(await getPartyDashboard(req.user!.id)); }
  catch (error) { fail(res, error); }
});

router.post('/parties/:id/join', requireAuth, async (req, res) => {
  try {
    res.json(await joinAdventurerParty(req.user!.id, req.params.id));
  } catch (error) { fail(res, error); }
});

router.post('/parties/:id/quests', requireAuth, async (req, res) => {
  try {
    const templateId = typeof req.body?.templateId === 'string' ? req.body.templateId : '';
    res.status(201).json(await acceptPartyQuest(req.user!.id, req.params.id, templateId));
  } catch (error) { fail(res, error); }
});

router.post('/party-quests/:id/resolve', requireAuth, async (req, res) => {
  try {
    const results = Array.isArray(req.body?.results) ? req.body.results : [];
    res.json(await resolvePartyQuest(req.user!.id, req.params.id, results.map((result: any) => ({
      userId: Number(result.userId),
      attemptId: result.attemptId == null ? null : String(result.attemptId),
      outcome: result.outcome === 'ACTIVE' ? 'ACTIVE' : 'LEECH',
    }))));
  } catch (error) { fail(res, error); }
});

router.get('/profile', requireAuth, async (req, res) => {
  try {
    res.json(await getGuildProfile(req.user!.id));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/register/iron', requireAuth, async (req, res) => {
  try {
    res.json(await registerIron(req.user!.id));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/kingdom', requireAuth, async (req, res) => {
  try { res.json(await setKingdom(req.user!.id, String(req.body?.kingdom) as any)); }
  catch (error) { fail(res, error); }
});

router.get('/kingdoms', requireAuth, async (_req, res) => { try { res.json(await getGuildKingdoms()); } catch (error) { fail(res, error); } });

router.post('/onboarding', requireAuth, async (req, res) => {
  try {
    const adventurerName = typeof req.body?.adventurerName === 'string' ? req.body.adventurerName : '';
    const kingdom = typeof req.body?.kingdom === 'string' ? req.body.kingdom : '';
    const path = req.body?.path === 'EXAM' ? 'EXAM' : 'IRON';
    res.status(201).json(await completeGuildOnboarding(req.user!.id, { adventurerName, kingdom, path }));
  } catch (error) { fail(res, error); }
});

router.post('/travel', requireAuth, async (req, res) => {
  try { const destination = typeof req.body?.kingdom === 'string' ? req.body.kingdom : ''; res.status(201).json(await travelToKingdom(req.user!.id, destination)); } catch (error) { fail(res, error); }
});

router.get('/kingdom/:kingdom', requireAuth, async (req, res) => {
  try { res.json(await getGuildKingdom(req.user!.id, req.params.kingdom)); } catch (error) { fail(res, error); }
});

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    res.json(await guild.listNotifications(req.user!.id));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    res.json({ ok: await guild.markNotificationRead(req.user!.id, Number(req.params.id)) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/exam', requireAuth, async (req, res) => {
  try {
    const exam = await getPlacementExam(req.user!.id);
    if (exam?.status === 'IN_PROGRESS' && new Date(exam.expires_at).getTime() <= Date.now()) {
      await expireExam(req.user!.id);
      res.json(await getPlacementExam(req.user!.id));
      return;
    }
    res.json(exam);
  } catch (error) {
    fail(res, error);
  }
});

router.post('/exam/start', requireAuth, async (req, res) => {
  try {
    res.status(201).json(await startPlacementExam(req.user!.id));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/exam/import', requireAuth, async (req, res) => {
  try {
    const score = typeof req.body?.score === 'string' || typeof req.body?.score === 'number' ? String(req.body.score) : '';
    res.json(await importPlacementExamScore(req.user!.id, score));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/exam/cashout', requireAuth, async (req, res) => {
  try {
    res.json(await cashOutExam(req.user!.id));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/war', optionalAuth, async (req, res) => {
  try {
    const active = await getActiveWar();
    if (!active) { res.json(null); return; }
    if (req.user) void syncWarScoresForUser(active.id, req.user.id).catch(() => undefined);
    res.json(await getWarBoard(active.id, req.user?.id));
  } catch (error) { fail(res, error); }
});

router.post('/war/:cycleId/summons', requireAuth, async (req, res) => {
  try {
    res.status(201).json(await useWarSummons(req.params.cycleId, req.user!.id));
  } catch (error) { fail(res, error); }
});

router.get('/war/:cycleId/summons', requireAuth, async (req, res) => {
  try { res.json(await hasWarSummons(req.params.cycleId, req.user!.id)); }
  catch (error) { fail(res, error); }
});

router.post('/war/:cycleId/trump', requireAuth, async (req, res) => {
  try {
    const active = await getActiveWar();
    if (!active || active.id !== req.params.cycleId || active.phase !== 'TRUMP') { res.status(409).json({ error: 'Trump card submission is closed.' }); return; }
    res.status(201).json(await submitTrumpCard(active.id, req.user!.id, {
      beatmapId: Number(req.body?.beatmapId), beatmapsetId: req.body?.beatmapsetId == null ? null : Number(req.body.beatmapsetId),
      difficultyId: Number(req.body?.difficultyId), modRequirement: String(req.body?.modRequirement ?? 'FM'), notes: String(req.body?.notes ?? '').slice(0, 1000),
    }));
  } catch (error) { fail(res, error); }
});

export default router;
