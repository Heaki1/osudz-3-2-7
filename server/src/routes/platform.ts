import { Router } from 'express';
import { getLevelRush, getMappingStats, getPlayerProgress, getPlayerStreak, listActivity, comparePlayers, getLatestRoundRecap, getPlayerCompareExtras } from '../repos/platform.js';
import { fetchPublicUser, fetchPublicUserBestScores } from '../services/osu.js';

const router = Router();

router.get('/activity', async (req, res) => {
  try {
    const rows = await listActivity(Number(req.query.limit) || 30);
    res.json(rows.map((r) => ({ id: r.id, userId: r.user_id, username: r.username, avatarUrl: r.avatar_url, roundId: r.round_id, roundNumber: r.round_number, type: r.type, payload: r.payload, createdAt: r.created_at.toISOString() })));
  } catch { res.status(503).json({ error: 'Activity feed unavailable' }); }
});

router.get('/level-rush', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    res.json(await getLevelRush(limit));
  } catch { res.status(503).json({ error: 'Level rush leaderboard unavailable' }); }
});

router.get('/players/:userId/progression', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id' });
  try { res.json({ progression: await getPlayerProgress(userId), streak: await getPlayerStreak(userId), mapping: await getMappingStats(userId) }); }
  catch { res.status(503).json({ error: 'Player progression unavailable' }); }
});

router.get('/mapping-stats', async (_req, res) => {
  try { res.json(await getMappingStats()); } catch { res.status(503).json({ error: 'Mapping statistics unavailable' }); }
});

router.get('/recap', async (_req, res) => {
  try {
    const { round, nextStart } = await getLatestRoundRecap();
    if (!round) return res.json(null);
    const archiveAt = nextStart ? new Date(nextStart.getTime() + 24 * 60 * 60 * 1000) : null;
    if (archiveAt && Date.now() >= archiveAt.getTime()) return res.json(null);
    res.json({ roundNumber: round.round_number, month: round.month, year: round.year, winner: round.title ? { title: round.title, artist: round.artist, difficultyName: round.difficulty_name, coverUrl: round.cover_url } : null, winnerVoteCount: round.winner_vote_count, totalVotes: round.total_votes, archiveAt: archiveAt?.toISOString() ?? null });
  } catch { res.status(503).json({ error: 'Round recap unavailable' }); }
});

router.get('/compare', async (req, res) => {
  const a = typeof req.query.a === 'string' ? req.query.a.trim() : '';
  const b = typeof req.query.b === 'string' ? req.query.b.trim() : '';
  if (!a || !b || a.toLowerCase() === b.toLowerCase()) return res.status(400).json({ error: 'Two different player usernames are required' });

  const [platformResult, osuAResult, osuBResult] = await Promise.allSettled([
    comparePlayers(a, b),
    fetchPublicUser(a),
    fetchPublicUser(b),
  ]);

  if (osuAResult.status === 'rejected' || osuBResult.status === 'rejected') {
    const failed = osuAResult.status === 'rejected'
      ? { player: a, error: osuAResult.reason }
      : { player: b, error: (osuBResult as PromiseRejectedResult).reason };
    const message = failed.error instanceof Error ? failed.error.message : String(failed.error);
    if (message.includes('failed: 404')) {
      return res.status(404).json({ error: `osu! player not found: ${failed.player}`, code: 'PLAYER_NOT_FOUND' });
    }
    if (message.includes('failed: 429')) {
      return res.status(429).json({ error: 'osu! API rate limit reached. Try again shortly.', code: 'OSU_API_RATE_LIMITED' });
    }
    console.error('[platform] osu! player lookup failed:', failed.player, message);
    return res.status(503).json({ error: 'osu! player data unavailable', code: 'OSU_API_UNAVAILABLE' });
  }

  if (platformResult.status === 'rejected') {
    console.error('[platform] local comparison failed:', platformResult.reason instanceof Error ? platformResult.reason.message : platformResult.reason);
    return res.status(503).json({ error: 'osu!DZ comparison data unavailable', code: 'DATABASE_UNAVAILABLE' });
  }

  const osuA = osuAResult.value;
  const osuB = osuBResult.value;
  const platformRows = platformResult.value;
  const platformByName = new Map(platformRows.map((player: any) => [player.username.toLowerCase(), player]));
  const localA = platformByName.get(osuA.username.toLowerCase());
  const localB = platformByName.get(osuB.username.toLowerCase());
  const extrasResults = await Promise.allSettled([
    localA ? getPlayerCompareExtras(Number(localA.user_id)) : Promise.resolve(null),
    localB ? getPlayerCompareExtras(Number(localB.user_id)) : Promise.resolve(null),
  ]);
  const extraA = extrasResults[0].status === 'fulfilled' ? extrasResults[0].value : null;
  const extraB = extrasResults[1].status === 'fulfilled' ? extrasResults[1].value : null;
  const bestResults = await Promise.allSettled([
    fetchPublicUserBestScores(osuA.id),
    fetchPublicUserBestScores(osuB.id),
  ]);
  const warnings: Array<{ code: string; player: string }> = [];
  const bestA = bestResults[0].status === 'fulfilled' ? bestResults[0].value : [];
  const bestB = bestResults[1].status === 'fulfilled' ? bestResults[1].value : [];
  if (bestResults[0].status === 'rejected') {
    console.error('[platform] best scores unavailable:', a, bestResults[0].reason instanceof Error ? bestResults[0].reason.message : bestResults[0].reason);
    warnings.push({ code: 'SCORES_UNAVAILABLE', player: a });
  }
  if (bestResults[1].status === 'rejected') {
    console.error('[platform] best scores unavailable:', b, bestResults[1].reason instanceof Error ? bestResults[1].reason.message : bestResults[1].reason);
    warnings.push({ code: 'SCORES_UNAVAILABLE', player: b });
  }

  try {
    const shapeOsu = (u: Awaited<ReturnType<typeof fetchPublicUser>>, best: Awaited<ReturnType<typeof fetchPublicUserBestScores>>) => ({
      id: u.id,
      username: u.username,
      country: u.country_code,
      avatarUrl: u.avatar_url ?? '',
      globalRank: u.statistics?.global_rank ?? null,
      countryRank: u.statistics?.country_rank ?? null,
      pp: u.statistics?.pp ?? null,
      accuracy: u.statistics?.hit_accuracy ?? null,
      playCount: u.statistics?.play_count ?? null,
      playTime: u.statistics?.play_time ?? null,
      totalScore: u.statistics?.total_score ?? null,
      rankedScore: u.statistics?.ranked_score ?? null,
      maxCombo: u.statistics?.maximum_combo ?? null,
      totalHits: u.statistics?.total_hits ?? null,
      level: u.statistics?.level ?? null,
      grades: u.statistics?.grade_counts ?? null,
      replaysWatched: u.statistics?.replays_watched_by_others ?? null,
      best,
    });
    const platform = [osuA, osuB].map((osuPlayer) => platformByName.get(osuPlayer.username.toLowerCase()) ?? {
      user_id: 0,
      username: osuPlayer.username,
      osu_id: String(osuPlayer.id),
      avatar_url: osuPlayer.avatar_url ?? null,
      global_rank: osuPlayer.statistics?.global_rank ?? null,
      dzpp: 0,
      rounds: 0,
      wins: 0,
      best: null,
      registered: false,
    });
    const registeredPlatform = platform.map((player) => player.registered === false ? player : { ...player, registered: true });
    const extras = [extraA, extraB];
    res.json({
      platform: registeredPlatform.map((player, index) => ({ ...player, extras: extras[index] })),
      osu: [shapeOsu(osuA, bestA), shapeOsu(osuB, bestB)],
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (err) {
    console.error('[platform] comparison response failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Player comparison unavailable' });
  }
});

export default router;
