import express, { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  acceptDuelForUser,
  acceptRulesForUser,
  createDuelForUser,
  getBeatmapArchive,
  getReplayPath,
  getReplayStatus,
  getRules,
  importScoreForUser,
  listDuelData,
  lookupBeatmap,
  uploadMockOpponentReplay,
  uploadReplay,
  BeatmapNotFound,
  ScoreNotFound,
} from '../services/duels.js';
import { runReplayUpload, removeReplayFile } from '../services/replay.js';

const router = Router();

const invalidDuelId = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

router.get('/rules', requireAuth, async (req, res) => {
  res.json(await getRules(req.user!.id));
});

router.post('/rules/accept', requireAuth, async (req, res) => {
  res.json(await acceptRulesForUser(req.user!.id));
});

router.post('/lookup', requireAuth, async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url) return res.status(400).json({ error: 'Paste an osu! beatmap URL' });
  try {
    res.json(await lookupBeatmap(url));
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_DIFFICULTY_URL') {
      return res.status(400).json({ error: 'That link does not name a difficulty. Pick a difficulty on osu! and copy its URL.' });
    }
    if (err instanceof Error && err.message === 'UNSUPPORTED_RULESET') {
      return res.status(422).json({ error: 'Duel challenges support osu!standard and osu!mania beatmaps only.' });
    }
    if (err instanceof BeatmapNotFound) return res.status(404).json({ error: 'osu! has no beatmap difficulty with that id' });
    console.error('[duels] beatmap lookup failed', err);
    return res.status(503).json({ error: 'Could not read that beatmap from osu!' });
  }
});

router.get('/', optionalAuth, async (req, res) => {
  try {
    res.json(await listDuelData(req.user?.id));
  } catch (err) {
    console.error('[duels] list failed', err);
    res.status(503).json({ error: 'Duel data unavailable' });
  }
});

router.get('/:id/replays', optionalAuth, async (req, res) => {
  const id = invalidDuelId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid duel id' });
  try {
    res.json(await getReplayStatus(id));
  } catch {
    return res.status(404).json({ error: 'Live duel not found' });
  }
});

router.get('/:id/beatmap', optionalAuth, async (req, res) => {
  const id = invalidDuelId(req.params.id);
  if (id === null) return res.status(404).json({ error: 'Live duel beatmap is unavailable' });
  try {
    const archive = await getBeatmapArchive(id);
    res.type('application/zip').set('Cache-Control', 'public, max-age=300').send(archive);
  } catch (err) {
    console.error('[duels] beatmap archive failed', err);
    res.status(503).json({ error: 'Could not load the duel beatmap' });
  }
});

router.get('/:id/replay/:side', optionalAuth, async (req, res) => {
  const id = invalidDuelId(req.params.id);
  const side = req.params.side === 'challenger' ? 'challenger' : req.params.side === 'opponent' ? 'opponent' : null;
  if (id === null || !side) return res.status(404).json({ error: 'Replay is unavailable' });
  try {
    const replayPath = await getReplayPath(id, side);
    res.type('application/octet-stream').set('Cache-Control', 'no-store').sendFile(replayPath);
  } catch (err) {
    if (err instanceof Error && err.message === 'REPLAY_NOT_SHARED') {
      return res.status(404).json({ error: 'Replay has not been shared yet' });
    }
    return res.status(404).json({ error: 'Replay is unavailable' });
  }
});

router.post('/:id/replay', requireAuth, runReplayUpload, async (req, res) => {
  const id = invalidDuelId(req.params.id);
  const file = req.file;
  if (id === null) {
    await removeReplayFile(file?.path);
    return res.status(400).json({ error: 'Invalid duel id' });
  }
  if (!file) return res.status(400).json({ error: 'Replay file is required' });
  try {
    res.json(await uploadReplay(id, req.user!.id, file.path));
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'DUEL_NOT_LIVE') return res.status(409).json({ error: 'Duel is not live' });
    if (code === 'REPLAY_FORBIDDEN') return res.status(403).json({ error: 'Only duel participants can share a replay' });
    if (code === 'REPLAY_BEATMAP_MISMATCH') return res.status(422).json({ error: 'This replay is not from the exact beatmap used by the duel.' });
    console.error('[duels] replay upload failed', err);
    return res.status(503).json({ error: 'Could not validate the replay' });
  }
});

router.post('/:id/mock-opponent-replay', requireAuth, runReplayUpload, async (req, res) => {
  const file = req.file;
  if (process.env.NODE_ENV === 'production') {
    await removeReplayFile(file?.path);
    return res.status(404).json({ error: 'Mock opponent testing is disabled in production.' });
  }
  const id = invalidDuelId(req.params.id);
  if (id === null) {
    await removeReplayFile(file?.path);
    return res.status(403).json({ error: 'Only the challenger can use the mock opponent test.' });
  }
  if (!file) return res.status(400).json({ error: 'Replay file is required' });
  try {
    res.json(await uploadMockOpponentReplay(id, req.user!.id, file.path));
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'MOCK_FORBIDDEN') return res.status(403).json({ error: 'Only the challenger can use the mock opponent test.' });
    if (code === 'OPPONENT_EXISTS') return res.status(409).json({ error: 'This duel already has an opponent.' });
    if (code === 'MOCK_BEATMAP_MISMATCH') return res.status(422).json({ error: 'This mock replay is not from the exact duel beatmap.' });
    if (code === 'MOCK_RULESET_MISMATCH') return res.status(422).json({ error: 'This mock replay uses a different ruleset than the duel beatmap.' });
    console.error('[duels] mock opponent replay failed', err);
    return res.status(503).json({ error: 'Could not read the mock replay' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const difficultyId = Number(b.difficultyId);
  const stake = Number(b.stake);
  const mods = String(b.mods || 'FM').toUpperCase();
  const requirement = String(b.requirement || 'Top #1 Score');
  if (!Number.isSafeInteger(difficultyId) || difficultyId <= 0 || !Number.isSafeInteger(stake) || stake <= 0) {
    return res.status(400).json({ error: 'Invalid duel request' });
  }
  if (!['Full Combo', 'Top #1 Score', 'Best Accuracy', 'Lowest Miss Count'].includes(requirement)) {
    return res.status(400).json({ error: 'Invalid win condition' });
  }
  try {
    const id = await createDuelForUser(req.user!.id, { difficultyId, stake, mods, requirement });
    return res.status(201).json({ id });
  } catch (err) {
    if (err instanceof BeatmapNotFound) return res.status(404).json({ error: 'Beatmap difficulty not found' });
    if (err instanceof Error && err.message === 'UNSUPPORTED_RULESET') return res.status(422).json({ error: 'Duel challenges support osu!standard and osu!mania beatmaps only.' });
    if (err instanceof Error && err.message === 'INVALID_MANIA_MOD') return res.status(400).json({ error: 'Invalid osu!mania mod requirement' });
    if (err instanceof Error && err.message === 'INVALID_MOD') return res.status(400).json({ error: 'Invalid mod requirement' });
    if (err instanceof Error && err.message === 'INSUFFICIENT_FUNDS') return res.status(402).json({ error: 'Insufficient Duel DZPP' });
    if (err instanceof Error && err.message === 'RULES_NOT_ACCEPTED') return res.status(428).json({ error: 'Accept the arena rules before posting a duel' });
    console.error('[duels] create failed', err);
    return res.status(503).json({ error: 'Duel could not be created' });
  }
});

router.post('/:id/accept', requireAuth, async (req, res) => {
  const id = invalidDuelId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid duel id' });
  try {
    res.json(await acceptDuelForUser(req.user!.id, id));
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    const map: Record<string, [number, string]> = {
      NOT_FOUND: [404, 'Duel not found'],
      NOT_OPEN: [409, 'Duel is no longer open'],
      SELF_ACCEPT: [409, 'You cannot accept your own duel'],
      EXPIRED: [409, 'This duel has expired'],
      RULES_NOT_ACCEPTED: [428, 'Accept the arena rules before entering a duel'],
      INSUFFICIENT_FUNDS: [402, 'Insufficient Duel DZPP'],
    };
    const hit = map[code];
    if (hit) return res.status(hit[0]).json({ error: hit[1] });
    console.error('[duels] accept failed', err);
    return res.status(503).json({ error: 'Duel could not be accepted' });
  }
});

router.post('/:id/import', requireAuth, async (req, res) => {
  const id = invalidDuelId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid duel id' });
  try {
    res.json(await importScoreForUser(id, req.user!.id, Number(req.user!.osu_id)));
  } catch (err) {
    if (err instanceof ScoreNotFound || (err instanceof Error && err.message === 'SCORE_NOT_FOUND')) {
      return res.status(404).json({ error: 'No eligible score found for this exact beatmap and required mods. Set the required score on osu! first.' });
    }
    if (err instanceof Error && err.message === 'DUEL_NOT_LIVE') {
      return res.status(409).json({ error: 'Duel is not live' });
    }
    console.error('[duels] import failed', err);
    return res.status(503).json({ error: 'Could not verify your osu! score' });
  }
});

export default router;

