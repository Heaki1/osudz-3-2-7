// DZ Performance Rankings — the public leaderboard.
//
// PUBLIC, NO SESSION, deliberately. The archive is already public (F1), and a ranking nobody
// can see without logging in is not a ranking. Points are the reason to compete, so this is
// the surface the whole DZPP feature exists for.
//
// READ-ONLY. Nothing here writes: the frozen rows are produced when a round ends, by
// repo/dzpp.ts, and the only thing that ever rewrites one is the deliberate, audited admin
// recompute. So there is no guard on these routes and nothing for a caller to assert.
//
// The Algeria rule lives in repo/dzpp.ts, in the query, rather than being applied to rows
// after the fact — a filter that runs in the database cannot be forgotten by a caller.

import { Router } from 'express';
import type { Response } from 'express';
import { parsePositiveInt } from '../lib/validation.js';
import {
  listPlayerRounds,
  listRankings,
  rankingMeta,
  toApiPlayerDzppRound,
  toApiRankingEntry,
  type RankingScope,
} from '../repo/dzpp.js';

const router = Router();

/**
 * Rows to a page. Fifty is osu!'s own rankings page size, and this table is modelled on it.
 * The client is told the size rather than having to assume it.
 */
const PAGE_SIZE = 50;

function dbDown(res: Response, err: unknown, where: string): void {
  console.error(`[rankings] ${where} failed:`, err instanceof Error ? err.message : err);
  res.status(503).json({ error: 'Database unavailable' });
}

/**
 * Parses ?year=. Absent or empty means ALL-TIME, which is the default view.
 *
 * Returns undefined for a value that is not a four-digit year, so the route can answer 400
 * rather than silently showing all-time to somebody who asked for something specific. Same
 * convention as readRoundId in routes/challenge.ts: undefined is "unusable", null is "not
 * asked for".
 */
function readYear(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}$/.test(raw)) return undefined;

  const year = Number(raw);
  return year >= 2020 && year <= 2100 ? year : undefined;
}
/** Parses ?scope=. Absent or unrecognised falls back to 'all-time'. */
function readScope(raw: unknown): RankingScope {
  if (raw === 'seasonal') return 'seasonal';
  if (raw === 'yearly')   return 'yearly';
  return 'all-time';
}

/** Parses ?page=. Absent means the first page. undefined for anything that is not one. */
function readPage(raw: unknown): number | undefined {
  if (raw === undefined || raw === '') return 1;
  const page = parsePositiveInt(raw);
  return page === null ? undefined : page;
}

// GET /api/rankings?scope=&year=&page= — the cumulative table, best first.
//
// An ENVELOPE rather than the bare array every other read in this project returns, and that is
// a deliberate departure: a bare array cannot carry the total, and a pager that does not know
// how many pages there are is a pager that guesses.
//
// `years` travels with it because the year selector has to have somewhere to come from, and
// deriving it from round_dzpp means the selector can never offer a season whose table is
// empty. It is not filtered by the requested year — the other options have to stay offered.
//
// scope=seasonal ignores ?year= entirely — the season is defined by round_number range in
// repo/dzpp.ts, not by a calendar year. scope=yearly requires ?year= to be a valid four-digit
// year. scope=all-time (the default) ignores both.
router.get('/', async (req, res) => {
  const scope = readScope(req.query.scope);

  const year = scope === 'yearly' ? readYear(req.query.year) : null;
  if (scope === 'yearly' && year === undefined) {
    res.status(400).json({ error: 'year must be a four-digit year' });
    return;
  }
  // TypeScript cannot narrow through the scope condition above, so we assert after the
  // only undefined exit path has returned.
  const safeYear = (year ?? null) as number | null;

  const page = readPage(req.query.page);
  if (page === undefined) {
    res.status(400).json({ error: 'page must be a positive integer' });
    return;
  }

  try {
    // TWO queries, issued together. It was three, and the count was awaited before the other
    // two, so one screen cost two serial round trips; the total and the season list now come
    // from one aggregate and travel alongside the page rather than in front of it.
    const [meta, rows] = await Promise.all([
      rankingMeta(scope, safeYear),
      listRankings(scope, safeYear, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    ]);

res.json({
  page,
  pageSize: PAGE_SIZE,
  total: meta.total,
  years: meta.years,
  currentSeason: meta.currentSeason,
  entries: rows.map(toApiRankingEntry),
});
  } catch (err) {
    dbDown(res, err, 'ranking');
  }
});

// GET /api/rankings/:userId?scope=&year= — one player's frozen rounds, newest first.
//
// 200 with [] for a player who has no counted rounds, whatever the reason: none finalized
// yet, outside the ranking's country, or no such account. That is the same choice
// GET /challenge/scores makes for a round that does not exist, and it means this endpoint
// cannot be used to discover which accounts exist.
//
// scope and year must match what was used to open the rankings table, so the detail panel
// only shows the rounds that were visible in the scope the player was clicked from.
router.get('/:userId', async (req, res) => {
  const userId = parsePositiveInt(req.params.userId);
  if (userId === null) {
    res.status(400).json({ error: 'userId must be a positive integer' });
    return;
  }

  const scope = readScope(req.query.scope);

  const year = scope === 'yearly' ? readYear(req.query.year) : null;
  if (scope === 'yearly' && year === undefined) {
    res.status(400).json({ error: 'year must be a four-digit year' });
    return;
  }
  const safeYear = (year ?? null) as number | null;

  try {
    const rows = await listPlayerRounds(Number(req.params.userId), scope, safeYear);
    res.json(rows.map(toApiPlayerDzppRound));
  } catch (err) {
    dbDown(res, err, 'player history');
  }
});

export default router;
