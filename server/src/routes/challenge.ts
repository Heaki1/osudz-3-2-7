// Challenge-phase endpoints.
//
// Since migration 020 a round can have multiple challenge beatmaps. Every score
// endpoint requires a submissionId so scores are per-beatmap.
//
// Reads are public. Writing a score is gated by requireCanChallenge.

import { Router } from 'express';
import { addActivity } from '../repo/platform.js';
import type { Response } from 'express';
import { parsePositiveInt, parsePositiveSafeInt } from '../lib/validation.js';
import { requireAuth, requireCanChallenge } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { findById as findRound, findCurrent } from '../repo/rounds.js';
import { findById as findSubmission } from '../repo/submissions.js';
import {
  findForUser,
  listForRound,
  qualifies,
  toApiChallengeScore,
  upsert,
} from '../repo/challengeScores.js';
import {
  listForRound as listChallengeBeatmaps,
  findBySubmission as findChallengeBeatmap,
  toApiChallengeBeatmap,
} from '../repo/challengeBeatmaps.js';
import { scoreRound, toRoundPlay } from '../repo/dzpp.js';
import {
  ScoreNotFound,
  fetchBeatmapAnyStatus,
  fetchUserRecentScoresForDifficulty,
} from '../services/osu.js';

const router = Router();

function fail(res: Response, err: unknown, where: string): void {
  console.error(`[challenge] ${where} failed:`, err instanceof Error ? err.message : err);
  res.status(503).json({ error: 'Database unavailable' });
}

async function resolveChallenge(roundId: number | null) {
  const round = roundId === null ? await findCurrent() : await findRound(roundId);
  if (!round) return null;
  const winner =
    round.winning_submission_id === null ? null : await findSubmission(round.winning_submission_id);
  return { round, winner };
}

function readRoundId(raw: unknown): number | null | undefined {
  if (raw === undefined) return null;
  const roundId = parsePositiveInt(raw);
  return roundId === null ? undefined : roundId;
}

// GET /api/challenge/beatmaps?roundId= — all challenge beatmaps for a round.
router.get('/beatmaps', async (req, res) => {
  const roundId = readRoundId(req.query.roundId);
  if (roundId === undefined) {
    res.status(400).json({ error: 'roundId must be a positive integer' });
    return;
  }
  try {
    const round = roundId === null ? await findCurrent() : await findRound(roundId);
    if (!round) { res.json([]); return; }
    const rows = await listChallengeBeatmaps(round.id);
    res.json(rows.map(toApiChallengeBeatmap));
  } catch (err) {
    fail(res, err, 'challenge beatmaps');
  }
});

// GET /api/challenge/scores?submissionId=&roundId= — leaderboard for one beatmap.
router.get('/scores', async (req, res) => {
  const roundId = readRoundId(req.query.roundId);
  if (roundId === undefined) {
    res.status(400).json({ error: 'roundId must be a positive integer' });
    return;
  }

  const submissionId = req.query.submissionId !== undefined
    ? parsePositiveInt(req.query.submissionId)
    : null;
  if (req.query.submissionId !== undefined && submissionId === null) {
    res.status(400).json({ error: 'submissionId must be a positive integer' });
    return;
  }

  try {
    const context = await resolveChallenge(roundId);
    if (!context) { res.json([]); return; }

    let challengeRequirement = context.winner?.challenge_requirement ?? '';
    let modRequirement = context.winner?.mod_requirement ?? '';

    if (submissionId !== null) {
      const cb = await findChallengeBeatmap(context.round.id, submissionId);
      if (cb) {
        challengeRequirement = cb.challenge_requirement;
        modRequirement = cb.mod_requirement;
      }
    }

    const rows = await listForRound(context.round.id, challengeRequirement, submissionId);
    const provisional = new Map(
      scoreRound(
        rows.map((row) => toRoundPlay(row, false, false, modRequirement, challengeRequirement))
      ).map((result) => [result.userId, result.finalDzpp])
    );
    res.json(
      rows.map((row, i) =>
        toApiChallengeScore(row, i + 1, provisional.get(row.user_id) ?? null, modRequirement)
      )
    );
  } catch (err) {
    fail(res, err, 'leaderboard');
  }
});

// GET /api/challenge/my?submissionId= — the caller's own score for a beatmap.
router.get('/my', requireAuth, async (req, res) => {
  try {
    const round = await findCurrent();
    if (!round) { res.json(null); return; }
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const submissionId = req.query.submissionId !== undefined
      ? parsePositiveInt(req.query.submissionId)
      : null;

    const row = await findForUser(round.id, req.user.id, submissionId);
    if (!row) { res.json(null); return; }

    let challengeRequirement = '';
    let modRequirement = '';

    if (row.submission_id !== null) {
      const cb = await findChallengeBeatmap(round.id, row.submission_id);
      if (cb) {
        challengeRequirement = cb.challenge_requirement;
        modRequirement = cb.mod_requirement;
      }
    } else {
      const winner = round.winning_submission_id === null
        ? null
        : await findSubmission(round.winning_submission_id);
      challengeRequirement = winner?.challenge_requirement ?? '';
      modRequirement = winner?.mod_requirement ?? '';
    }

    const rows = await listForRound(round.id, challengeRequirement, row.submission_id);
    const index = rows.findIndex((s) => s.user_id === row.user_id);
    const ranked = scoreRound(
      rows.map((s) => toRoundPlay(s, false, false, modRequirement, challengeRequirement))
    );
    const result = ranked.find((s) => s.userId === row.user_id);
    res.json(
      toApiChallengeScore(row, index >= 0 ? index + 1 : 0, result?.finalDzpp ?? null, modRequirement)
    );
  } catch (err) {
    fail(res, err, 'my challenge score');
  }
});

// GET /api/challenge/scores/available?submissionId= — osu! scores the player can import.
router.get('/scores/available', requireAuth, async (req, res) => {
  try {
    const context = await resolveChallenge(null);
    if (!context) { res.status(409).json({ error: 'No round is open' }); return; }
    const { round } = context;

    if (round.phase !== 'challenge') {
      res.status(409).json({
        error: `This round is in the ${round.phase} phase, so there is no challenge to play`,
      });
      return;
    }
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const submissionId = req.query.submissionId !== undefined
      ? parsePositiveInt(req.query.submissionId)
      : null;
    if (req.query.submissionId !== undefined && submissionId === null) {
      res.status(400).json({ error: 'submissionId must be a positive integer' });
      return;
    }

    let difficultyId: number | null = null;
    const challengeStartedAt = round.winner_approved_at;

    if (submissionId !== null) {
      const cb = await findChallengeBeatmap(round.id, submissionId);
      if (!cb) {
        res.status(404).json({ error: 'That submission is not a challenge beatmap for this round' });
        return;
      }
      difficultyId = Number(cb.difficulty_id);
    } else {
      if (!context.winner) {
        res.status(409).json({ error: 'This round has no recorded winner, so there is no challenge map' });
        return;
      }
      difficultyId = Number(context.winner.difficulty_id);
    }

    if (!challengeStartedAt) {
      res.status(409).json({ error: 'This challenge has no recorded start time' });
      return;
    }

    const plays = await fetchUserRecentScoresForDifficulty(difficultyId, Number(req.user.osu_id));
    const availableScores = plays.filter((play) => {
      if (!play.endedAt) return false;
      return new Date(play.endedAt) >= challengeStartedAt!;
    });

    res.json({
      scores: availableScores.map((play) => ({
        osuScoreId: play.osuScoreId,
        score: play.score,
        accuracy: play.accuracy,
        misses: play.misses,
        mods: play.mods,
        pp: play.pp,
        rank: play.rank,
        passed: play.passed,
        endedAt: play.endedAt,
      })),
    });
  } catch (err) {
    if (err instanceof ScoreNotFound) { res.json({ scores: [] }); return; }
    fail(res, err, 'available challenge scores');
  }
});

const importLimit = rateLimit({ limit: 20, windowMs: 60_000, what: 'score imports' });

// POST /api/challenge/scores — import a score for a specific challenge beatmap.
// Body: { osuScoreId, submissionId }
router.post('/scores', requireCanChallenge, importLimit, async (req, res) => {
  try {
    const context = await resolveChallenge(null);
    if (!context) { res.status(409).json({ error: 'No round is open' }); return; }
    const { round } = context;

    if (round.phase !== 'challenge') {
      res.status(409).json({
        error: `This round is in the ${round.phase} phase, so scores cannot be imported`,
      });
      return;
    }
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { osuScoreId, submissionId: rawSubmissionId } = req.body ?? {};
    const parsedOsuScoreId = parsePositiveSafeInt(osuScoreId);
    if (parsedOsuScoreId === null) {
      res.status(400).json({ error: 'A valid osuScoreId is required' });
      return;
    }
    const submissionId = parsePositiveInt(rawSubmissionId);
    if (submissionId === null) {
      res.status(400).json({ error: 'A valid submissionId is required' });
      return;
    }

    const cb = await findChallengeBeatmap(round.id, submissionId);
    if (!cb) {
      res.status(404).json({ error: 'That submission is not a challenge beatmap for this round' });
      return;
    }

    const difficultyId = Number(cb.difficulty_id);
    const modRequirement = cb.mod_requirement;
    const challengeRequirement = cb.challenge_requirement;

    let play;
    try {
      const plays = await fetchUserRecentScoresForDifficulty(difficultyId, Number(req.user.osu_id));
      play = plays.find((candidate) => candidate.osuScoreId === parsedOsuScoreId);
      if (!play) {
        res.status(404).json({ error: 'That score is not available in your eligible challenge scores.' });
        return;
      }
    } catch (err) {
      if (err instanceof ScoreNotFound) {
        res.status(404).json({ error: 'No eligible challenge scores were found.' });
        return;
      }
      console.error('[challenge] osu! score fetch failed:', err instanceof Error ? err.message : err);
      res.status(503).json({ error: 'Could not reach the osu! API' });
      return;
    }

    if (play.osuUserId !== Number(req.user.osu_id)) {
      res.status(403).json({ error: 'That score does not belong to your osu! account.' });
      return;
    }
    if (play.beatmapId !== difficultyId) {
      res.status(422).json({ error: 'That score was not set on the challenge beatmap.' });
      return;
    }
    if (play.ruleset !== 'osu') {
      res.status(422).json({ error: 'Only Standard scores can be imported for this challenge.' });
      return;
    }
    if (!play.passed) {
      res.status(422).json({ error: 'Only passed scores can be imported.' });
      return;
    }

    const challengeStartedAt = round.winner_approved_at;
    if (!play.endedAt || !challengeStartedAt) {
      res.status(422).json({
        error: 'Your score has no timestamp and cannot be verified. Set a new score and try again.',
      });
      return;
    }
    if (new Date(play.endedAt) < challengeStartedAt) {
      res.status(422).json({
        error:
          'This score was set before the challenge started. ' +
          'Only scores set during the challenge phase count. ' +
          'Set a new score on the beatmap and import it again.',
      });
      return;
    }

    const challengeBeatmap = await fetchBeatmapAnyStatus(difficultyId);
    if (challengeBeatmap.maxCombo === null) {
      res.status(503).json({ error: 'The challenge beatmap has no authoritative maximum combo.' });
      return;
    }

    const row = await upsert({
      roundId: round.id,
      submissionId,
      userId: req.user.id,
      score: play.score,
      accuracy: play.accuracy,
      misses: play.misses,
      maxCombo: play.maxCombo,
      beatmapMaxCombo: challengeBeatmap.maxCombo,
      mods: play.mods,
      pp: play.pp,
      qualified: qualifies(
        { mods: play.mods, misses: play.misses, maxCombo: play.maxCombo, beatmapMaxCombo: challengeBeatmap.maxCombo },
        { modRequirement, challengeRequirement }
      ),
      osuScoreId: play.osuScoreId === 0 ? null : play.osuScoreId,
    });

    void addActivity('challenge_score_imported', { submissionId, score: row.score, accuracy: row.accuracy, mods: row.mods }, req.user.id, round.id).catch(() => undefined);
    res.json({ ok: true, score: toApiChallengeScore(row, 0, null, modRequirement) });
  } catch (err) {
    fail(res, err, 'import score');
  }
});

export default router;
