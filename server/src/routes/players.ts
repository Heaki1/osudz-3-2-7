/**
 * routes/players.ts
 *
 * Public player-profile API.  Registered in index.ts as:
 *   app.use('/api/players', playersRouter);
 *
 * Routes:
 *   GET /api/players/:userId/shop-items   — owned Shop items (registered first,
 *                                           so Express never mistakes a numeric
 *                                           userId for a username — though path
 *                                           depth alone already prevents that)
 *   GET /api/players/:username            — public profile + all-time DZPP summary
 *
 * Both routes are intentionally public (no requireAuth) — they are the
 * read-only identity surface the profile page is built on.
 *
 * Neither route changes data, recomputes DZPP, or touches the Shop purchase /
 * steal / equip flow.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getChallengeMapCollection, transferChallengeMap } from '../repo/challengeMapOwnership.js';
import multer from 'multer';
import { pool } from '../db.js';
import { getPlayerByUsername, getPlayerOwnedItems } from '../repo/players.js';
import { getLivePlayerDzpp } from '../repo/dzpp.js';
import { findCurrent } from '../repo/rounds.js';
import { fetchPublicUser } from '../services/osu.js';

const router = Router();

router.get('/:userId/challenge-collection', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  try {
    const rows = await getChallengeMapCollection(userId);
    res.json(rows.map((row) => ({
      roundId: row.round_id,
      submissionId: row.submission_id,
      roundNumber: row.round_number,
      month: row.month,
      year: row.year,
      title: row.title,
      artist: row.artist,
      mapper: row.mapper,
      difficultyName: row.difficulty_name,
      difficultyId: row.difficulty_id,
      beatmapsetId: row.beatmapset_id,
      stars: Number(row.stars),
      bpm: row.bpm,
      length: `${Math.floor(row.length_seconds / 60)}:${String(row.length_seconds % 60).padStart(2, '0')}`,
      mapStatus: row.map_status,
      cs: row.cs === null ? null : Number(row.cs),
      ar: row.ar === null ? null : Number(row.ar),
      od: row.od === null ? null : Number(row.od),
      hp: row.hp === null ? null : Number(row.hp),
      coverUrl: row.cover_url,
      previewUrl: row.preview_url,
      modRequirement: row.mod_requirement,
      challengeRequirement: row.challenge_requirement,
      finalDzpp: row.final_dzpp,
      placement: row.placement,
      perfectionEligible: row.perfection_eligible,
      acquiredAt: row.acquired_at,
      ownerUserId: row.owner_user_id,
      ownerUsername: row.owner_username,
    })));
  } catch (err) {
    console.error('[players] challenge collection failed:', err);
    res.status(503).json({ error: 'Challenge collection unavailable' });
  }
});

router.post('/challenge-collection/gift', requireAuth, async (req, res) => {
  const roundId = Number(req.body?.roundId);
  const submissionId = Number(req.body?.submissionId);
  const recipientUsername = typeof req.body?.recipientUsername === 'string'
    ? req.body.recipientUsername.trim()
    : '';

  if (!Number.isInteger(roundId) || !Number.isInteger(submissionId) || !recipientUsername) {
    res.status(400).json({ error: 'roundId, submissionId, and recipientUsername are required' });
    return;
  }

  try {
    await transferChallengeMap(req.user!.id, roundId, submissionId, recipientUsername);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not gift challenge map';
    res.status(400).json({ error: message });
  }
});

const PROFILE_BANNER_DIR = join(process.cwd(), 'uploads', 'profile-banners');
const PROFILE_BANNER_MAX_BYTES = 5 * 1024 * 1024;

const profileBannerUpload = multer({
  dest: PROFILE_BANNER_DIR,
  limits: {
    fileSize: PROFILE_BANNER_MAX_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);

    if (!allowed.has(file.mimetype)) {
      callback(new Error('Profile banner must be JPEG, PNG, WebP, or GIF'));
      return;
    }

    callback(null, true);
  },
});

const runProfileBannerUpload = (
  req: Parameters<ReturnType<typeof profileBannerUpload.single>>[0],
  res: Parameters<ReturnType<typeof profileBannerUpload.single>>[1],
  next: Parameters<ReturnType<typeof profileBannerUpload.single>>[2],
) => {
  profileBannerUpload.single('banner')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Banner image must be 5 MB or smaller'
          : 'Invalid banner upload';

      res.status(400).json({ error: message });
      return;
    }

    res.status(400).json({
      error: err instanceof Error ? err.message : 'Invalid banner upload',
    });
  });
};

router.put(
  '/:userId/banner',
  requireAuth,
  (req, res, next) => {
    const userId = Number(req.params.userId);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(400).json({ error: 'userId must be a positive integer' });
      return;
    }

    if (req.user!.id !== userId) {
      res.status(403).json({
        error: 'You can only edit your own profile banner',
      });
      return;
    }

    void mkdir(PROFILE_BANNER_DIR, { recursive: true })
      .then(() => next())
      .catch(next);
  },
  runProfileBannerUpload,
  async (req, res) => {
    const userId = Number(req.params.userId);
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'Banner image is required' });
      return;
    }

    const extensionByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };

    const extension = extensionByMime[file.mimetype];

    if (!extension) {
      await unlink(file.path).catch(() => undefined);
      res.status(400).json({
        error: 'Unsupported banner image type',
      });
      return;
    }

    const previous = await pool.query<{
      profile_banner_url: string | null;
    }>(
      'SELECT profile_banner_url FROM users WHERE id = $1',
      [userId],
    );

    if (previous.rowCount === 0) {
      await unlink(file.path).catch(() => undefined);
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const filename = `${userId}-${randomUUID()}${extension}`;
    const newPath = join(PROFILE_BANNER_DIR, filename);
    const bannerUrl = `/uploads/profile-banners/${filename}`;

    try {
      await rename(file.path, newPath);

      await pool.query(
        'UPDATE users SET profile_banner_url = $1 WHERE id = $2',
        [bannerUrl, userId],
      );
    } catch (err) {
      await unlink(newPath).catch(() => undefined);
      await unlink(file.path).catch(() => undefined);

      console.error(
        '[players] banner upload failed:',
        err instanceof Error
          ? (err.stack ?? err.message)
          : err,
      );

      res.status(500).json({ error: 'Banner upload failed' });
      return;
    }

    const oldUrl = previous.rows[0].profile_banner_url;

    if (oldUrl) {
      const prefix = '/uploads/profile-banners/';

      if (oldUrl.startsWith(prefix)) {
        const oldFilename = basename(
          oldUrl.slice(prefix.length),
        );

        const oldPath = join(
          PROFILE_BANNER_DIR,
          oldFilename,
        );

        await unlink(oldPath).catch((err) => {
          console.error(
            '[players] failed to remove previous banner:',
            err instanceof Error ? err.message : err,
          );
        });
      }
    }

    res.json({ profileBannerUrl: bannerUrl });
  },
);

// ── GET /api/players/:userId/shop-items ────────────────────────────────────
//
// Registered BEFORE /:username so Express matches the two-segment path first.
// (Path depth already prevents ambiguity: /:username only matches one segment,
// /:userId/shop-items matches two. Explicit ordering is a belt-and-suspenders.)

router.get('/:userId/shop-items', async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json({ error: 'userId must be a positive integer' });
    return;
  }

  try {
    const rows = await getPlayerOwnedItems(userId);

    res.json(
      rows.map((row) => ({
        itemId: row.item_id,
        name: row.name,
        description: row.description,
        category: row.category,
        profileSlot: row.profile_slot,
        artwork:
          row.artwork_url === null
            ? null
            : {
                url: row.artwork_url,
                altText: row.artwork_alt_text ?? '',
                assetType: row.artwork_asset_type,
                isAnimated: row.artwork_is_animated,
                frameInnerDiameterRatio: row.artwork_frame_inner_diameter_ratio ?? undefined,
              },
        acquiredAt: row.acquired_at.toISOString(),
        season: row.season,
      })),
    );
  } catch (err) {
    console.error(
      '[players] owned items failed:',
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
    res.status(503).json({ error: 'Player items unavailable' });
  }
});

// ── GET /api/players/:username ─────────────────────────────────────────────
//
// Username matching is case-insensitive (lower() on both sides in the query).
// Returns 404 when no account with that username exists.
// Does not expose password hashes, session data, email, or any private field.

router.get('/:username', async (req, res) => {
  const username = req.params.username.trim();

  if (username === '') {
    res.status(400).json({ error: 'username is required' });
    return;
  }

  try {
    const row = await getPlayerByUsername(username);

    if (row === null) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    const currentRound = await findCurrent();
    const liveDzpp = currentRound?.phase === 'challenge'
      ? await getLivePlayerDzpp(currentRound.id, row.user_id)
      : 0;

    let countryRank: number | null = null;
    let osuPp: number | null = null;
    let globalRank = row.global_rank;
    try {
      const osuUser = await fetchPublicUser(row.osu_id);
      globalRank = osuUser.statistics?.global_rank ?? globalRank;
      countryRank = osuUser.statistics?.country_rank ?? null;
      osuPp = osuUser.statistics?.pp ?? null;
    } catch (err) {
      console.warn(
        '[players] live osu! profile stats unavailable:',
        username,
        err instanceof Error ? err.message : err,
      );
    }

    res.json({
      userId: row.user_id,
      /** osu_id is bigint → string from node-postgres; convert to number for JSON. */
      osuId: Number(row.osu_id),
      username: row.username,
      /** trim() matches the toApiRankingEntry pattern in repo/dzpp.ts. */
      country: row.country_code.trim(),
      avatarUrl: row.avatar_url ?? '',
      profileBannerUrl: row.profile_banner_url ?? '',
      globalRank,
      countryRank,
      osuPp,
      dzpp: row.dzpp + liveDzpp,
      liveDzpp,
      dzppRank: row.dzpp_rank,
      roundsPlayed: row.rounds_played,
      firstPlaces: row.first_places,
      bestPlacement: row.best_placement,
      qualifiedScores: Number(row.qualified_score_total),
      challengePlays: row.challenge_plays,
      totalChallengeScore: Number(row.total_challenge_score),
      approvedBeatmaps: row.approved_beatmaps,
      votesReceived: row.votes_received,
      duelPp: row.duel_pp,
      duelPpRank: row.duel_pp_rank,
      duelHistory: row.duel_history.map((entry) => ({
        duelId: entry.duel_id,
        createdAt: entry.created_at,
        amount: entry.amount,
      })),
    });
  } catch (err) {
    console.error(
      '[players] profile lookup failed:',
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
    res.status(503).json({ error: 'Player profile unavailable' });
  }
});

export default router;
