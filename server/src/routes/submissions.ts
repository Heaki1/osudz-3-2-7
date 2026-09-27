// Submission endpoints.
//
// The client never supplies beatmap metadata. It sends a URL (or a difficulty id)
// and the server reads title, artist, stars and the rest from the osu! API — so a
// crafted request cannot invent a 1-star "ranked" map. The lookup runs twice: once
// for the preview, once again at submit time, because the preview is only a hint
// and the row must be built from a fresh read.

import { Router } from 'express';
import { fetchBeatmapGenre } from '../services/osu.js';
import { addActivity } from '../repo/platform.js';
import type { Response } from 'express';
import { requireAuth, requireCanSubmit } from '../middleware/auth.js';
import { parsePositiveInt } from '../lib/validation.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { findCurrent } from '../repo/rounds.js';
import { checkBeatmapRules, settings } from '../repo/siteSettings.js';
import {
  create,
  findApprovedById,
  findById,
  countActiveByUserAndRound,
  listActiveByUserAndRound,
  listForRound,
  removeByUserAndRound,
  removeByIdForUserAndRound,
  toApiSubmission,
} from '../repo/submissions.js';
import {
  BeatmapNotFound,
  BeatmapRejected,
  fetchBeatmap,
  parseDifficultyId,
  type OsuBeatmap,
} from '../services/osu.js';

const router = Router();

function fail(res: Response, err: unknown, where: string): void {
  console.error(`[submissions] ${where} failed:`, err instanceof Error ? err.message : err);
  res.status(503).json({ error: 'Something went wrong reading the beatmap. Try again.' });
}

/** Turns a lookup failure into the right status instead of a blanket 503. */
function beatmapError(res: Response, err: unknown, where: string): void {
  if (err instanceof BeatmapNotFound) {
    res.status(404).json({ error: 'osu! has no beatmap difficulty with that id' });
    return;
  }
  if (err instanceof BeatmapRejected) {
    res.status(422).json({ error: err.message });
    return;
  }
  fail(res, err, where);
}

// GET /api/submissions — approved submissions for the open round.
// Returns [] rather than 404 when no round is open, so the vote page renders an
// empty state instead of an error.
router.get('/', async (_req, res) => {
  try {
    const round = await findCurrent();
    if (!round) {
      res.json([]);
      return;
    }
    const rows = await listForRound(round.id, 'approved');
    const response = await Promise.all(rows.map(async (row) => {
      try {
        return toApiSubmission(row, await fetchBeatmapGenre(Number(row.difficulty_id)));
      } catch {
        return toApiSubmission(row);
      }
    }));
    res.json(response);
  } catch (err) {
    fail(res, err, 'list');
  }
});

// GET /api/submissions/mine — the caller's active entries in the open round.
// Separate from GET / because pending submissions are invisible there, and the
// submitter still needs to see them while they await review.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const round = await findCurrent();
    if (!round || !req.user) {
      res.json([]);
      return;
    }

    const rows = await listActiveByUserAndRound(req.user.id, round.id);
    res.json(rows.map(toApiSubmission));
  } catch (err) {
    fail(res, err, 'mine');
  }
});
// DELETE /api/submissions/:id — withdraw one of the caller's submissions.
//
// Submission phase only. Past it the entry is in the ballot, and
// votes.submission_id cascades, so withdrawing would delete votes cast for it and
// move every other entry's standing.
router.delete('/:id', requireCanSubmit, async (req, res) => {
  try {
    const round = await findCurrent();
    if (!round) {
      res.status(409).json({ error: 'No round is open' });
      return;
    }
    if (round.phase !== 'submission') {
      res.status(409).json({
        error: 'Submissions are closed — this round is in the ' + round.phase + ' phase',
      });
      return;
    }

    // requireCanSubmit guarantees req.user, but the type does not know that.
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const submissionId = Number(req.params.id);
    if (!Number.isInteger(submissionId) || submissionId < 1) {
      res.status(400).json({ error: 'Invalid submission id' });
      return;
    }

    const removed = await removeByIdForUserAndRound(
      submissionId,
      user.id,
      round.id
    );

    if (!removed) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    fail(res, err, 'withdraw');
  }
});
// POST /api/submissions/lookup — resolve a pasted URL to beatmap metadata.
// Read-only: nothing is written, so this needs a session but no phase check.
// Limited harder than the rest: every call reaches out to the osu! API on the
// application's own token, so an authenticated account could otherwise spend the whole
// quota in a loop. Twenty a minute is far more than pasting links by hand needs.
const lookupLimit = rateLimit({ limit: 20, windowMs: 60_000, what: 'beatmap lookups' });

router.post('/lookup', requireCanSubmit, lookupLimit, async (req, res) => {
  const { url } = (req.body ?? {}) as { url?: unknown };
  if (typeof url !== 'string' || url.trim() === '') {
    res.status(400).json({ error: 'Paste an osu! beatmap URL' });
    return;
  }

  const difficultyId = parseDifficultyId(url);
  if (difficultyId === null) {
    res.status(400).json({
      error:
        'That link does not name a difficulty. Open the beatmap, pick the difficulty you mean, and copy the URL again.',
    });
    return;
  }

  try {
    const beatmap = await fetchBeatmap(difficultyId);

    // The administrator's rules are checked HERE as well as on submit (C8), so a player is
    // told before they pick a mod and a challenge requirement rather than after. 422 is the
    // same answer an unsubmittable status already gets, since this is the same kind of no.
    const broken = checkBeatmapRules(beatmap, await settings());
    if (broken !== null) {
      res.status(422).json({ error: broken });
      return;
    }

    res.json(beatmap);
  } catch (err) {
    beatmapError(res, err, 'lookup');
  }
});

// POST /api/submissions — enter a beatmap in the open round.
// Requires an eligible session, the submission phase, and no existing entry.
const submitLimit = rateLimit({ limit: 10, windowMs: 60_000, what: 'submission attempts' });

router.post('/', requireCanSubmit, submitLimit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const difficultyId =
    typeof body.difficultyId === 'number' || typeof body.difficultyId === 'string'
      ? parseDifficultyId(String(body.difficultyId))
      : null;
  if (difficultyId === null) {
    res.status(400).json({ error: 'difficultyId must be an osu! beatmap difficulty id' });
    return;
  }

  const { modRequirement, challengeRequirement } = body;
  if (typeof modRequirement !== 'string' || typeof challengeRequirement !== 'string') {
    res.status(400).json({ error: 'modRequirement and challengeRequirement are required' });
    return;
  }

  try {
    // C9: both lists are administrator-defined now, so they are validated against the store
    // rather than against the constants this file used to own — which the admin `challenge`
    // tab also duplicated by hand, giving two copies of the same list, one of them a lie.
    const rules = await settings();
    if (!rules.allowedMods.includes(modRequirement)) {
      res.status(400).json({ error: `modRequirement must be one of ${rules.allowedMods.join(', ')}` });
      return;
    }
    if (!rules.allowedChallengeTypes.includes(challengeRequirement)) {
      res.status(400).json({
        error: `challengeRequirement must be one of ${rules.allowedChallengeTypes.join(', ')}`,
      });
      return;
    }

    const round = await findCurrent();
    if (!round) {
      res.status(409).json({ error: 'No round is open' });
      return;
    }
    if (round.phase !== 'submission') {
      res.status(409).json({ error: 'Submissions are closed — this round is in the ' + round.phase + ' phase' });
      return;
    }

    // requireCanSubmit guarantees req.user, but the type does not know that.
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const activeSubmissionCount = await countActiveByUserAndRound(user.id, round.id);

if (rules.maxSubmissionsPerUser !== null &&
    activeSubmissionCount >= rules.maxSubmissionsPerUser) {
  res.status(409).json({
    error:
      `You already have the maximum of ${rules.maxSubmissionsPerUser} ` +
      `${rules.maxSubmissionsPerUser === 1 ? 'submission' : 'submissions'} in this round.`,
  });
  return;
}
    let beatmap: OsuBeatmap;
    try {
      beatmap = await fetchBeatmap(difficultyId);
    } catch (err) {
      beatmapError(res, err, 'submit lookup');
      return;
    }

    // Re-checked here rather than trusted from the preview (C8). The lookup is a courtesy;
    // this is the gate, and a caller can reach this route without ever calling that one.
    const broken = checkBeatmapRules(beatmap, rules);
    if (broken !== null) {
      res.status(422).json({ error: broken });
      return;
    }

    const row = await create({
      roundId: round.id,
      userId: user.id,
      beatmapsetId: beatmap.beatmapsetId,
      difficultyId: beatmap.difficultyId,
      title: beatmap.title,
      artist: beatmap.artist,
      mapper: beatmap.mapper,
      difficultyName: beatmap.difficultyName,
      mapStatus: beatmap.mapStatus,
      coverUrl: beatmap.coverUrl,
      previewUrl: beatmap.previewUrl,
      stars: beatmap.stars,
      bpm: beatmap.bpm,
      lengthSeconds: beatmap.lengthSeconds,
      cs: beatmap.cs,
      ar: beatmap.ar,
      od: beatmap.od,
      hp: beatmap.hp,
      modRequirement,
      challengeRequirement,
    });

    void addActivity('submission_created', { title: row.title, artist: row.artist, difficultyName: row.difficulty_name }, user.id, round.id).catch(() => undefined);
    res.status(201).json(toApiSubmission(row));
} catch (err) {
  fail(res, err, 'submit');
}
});

// GET /api/submissions/:id — one submission, whatever its review status.
router.get('/:id', async (req, res) => {
const id = parsePositiveInt(req.params.id);
if (id === null) {
  res.status(400).json({ error: 'Submission id must be a positive integer' });
  return;
}
    try {
      const row = await findApprovedById(id);

    if (!row) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    res.json(toApiSubmission(row));
  } catch (err) {
    fail(res, err, 'get');
  }
});

export default router;


