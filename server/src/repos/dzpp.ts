// DZPP repository: persistence and orchestration only.

import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { listForRound } from './challengeScores.js';
import {
  DZPP_FORMULA_VERSION,
  CHALLENGE_SCORE_POINTS,
  SUBMISSION_APPROVED_POINTS,
  VOTE_POINTS,
  MOD_COMPLIANCE_POINTS,
  REQUIREMENT_ACHIEVEMENT_POINTS,
  scoreOne,
  asPp,
  type DzppBeatmapResult,
  type DzppScoreInput,
  type DzppBreakdown,
  type DzppRoundPlay,
  type DzppRoundResult,
} from '../domain/dzpp/formula.js';
import {
  FIELD_FACTOR_TARGET,
  PLACEMENT_TABLE,
  fieldFactor,
  basePlacementPoints,
  placementPoints,
} from '../domain/dzpp/placement.js';
import { scoreRound, toRoundPlay, qualificationAwards } from '../domain/dzpp/qualification.js';
import {
  calculateRoundDzpRewards,
  seasonNumberForRound,
  type DzpPlayerReward,
} from '../domain/dzpp/rewards.js';
import {
  RANKING_COUNTRY,
  SEASON_SIZE,
  seasonBounds,
  type CurrentSeason,
  type RankingMeta,
  type RankingRow,
  type RankingScope,
  type PlayerRoundMapRow,
  type PlayerRoundRow,
} from '../domain/dzpp/rankings.js';
import {
  refuseFinalize,
  type FinalizeFailure,
  type FinalizeOutcome,
  refuseRecompute,
  type RecomputeFailure,
  type RecomputeOutcome,
  type RecomputeSummary,
  mergeBestBeatmapResults,
} from '../domain/dzpp/recompute.js';

export {
  DZPP_FORMULA_VERSION,
  CHALLENGE_SCORE_POINTS,
  SUBMISSION_APPROVED_POINTS,
  VOTE_POINTS,
  MOD_COMPLIANCE_POINTS,
  REQUIREMENT_ACHIEVEMENT_POINTS,
  scoreOne,
  scoreRound,
  toRoundPlay,
  asPp,
  FIELD_FACTOR_TARGET,
  PLACEMENT_TABLE,
  fieldFactor,
  basePlacementPoints,
  placementPoints,
  RANKING_COUNTRY,
  SEASON_SIZE,
  seasonBounds,
  refuseFinalize,
  refuseRecompute,
  mergeBestBeatmapResults,
};
export { qualificationAwards } from '../domain/dzpp/qualification.js';
export { toApiRankingEntry, toApiPlayerDzppRound } from '../domain/dzpp/rankings.js';
export type {
  DzppScoreInput,
  DzppBreakdown,
  DzppRoundPlay,
  DzppRoundResult,
  DzppBeatmapResult,
  CurrentSeason,
  RankingMeta,
  RankingRow,
  RankingScope,
  PlayerRoundMapRow,
  PlayerRoundRow,
  FinalizeFailure,
  FinalizeOutcome,
  RecomputeFailure,
  RecomputeOutcome,
  RecomputeSummary,
};

async function insertInitialDzpRewards(
  client: PoolClient,
  roundId: number,
  roundNumber: number,
  rewards: readonly DzpPlayerReward[]
): Promise<void> {
  const payable = rewards.filter((reward) => reward.totalDzp !== 0);
  if (payable.length === 0) return;

  const season = seasonNumberForRound(roundNumber);
  const values: unknown[] = [roundId, season];
  const placeholders: string[] = [];

  for (const reward of payable) {
    const base = values.length;

    values.push(
      reward.userId,
      reward.totalDzp,
      `round:${roundId}:user:${reward.userId}`,
      `Round ${roundNumber} DZP reward`
    );

    placeholders.push(
      `($1, $${base + 1}, $2, $${base + 2}, 'challenge_reward', $${base + 3}, $${base + 4})`
    );
  }

  await client.query(
    `INSERT INTO dzp_ledger
       (round_id, user_id, season, amount_dzp, transaction_type, reference_id, description)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

async function getEffectiveDzpRewardsForRound(
  client: PoolClient,
  roundId: number
): Promise<Map<number, number>> {
  const { rows } = await client.query<{
    user_id: number;
    total_dzp: number;
  }>(
    `
      SELECT
        user_id,
        COALESCE(SUM(amount_dzp), 0)::int AS total_dzp
      FROM dzp_ledger
      WHERE round_id = $1
        AND user_id IS NOT NULL
        AND transaction_type IN (
          'challenge_reward',
          'challenge_reward_adjustment'
        )
      GROUP BY user_id
    `,
    [roundId]
  );

  return new Map(rows.map((row) => [row.user_id, row.total_dzp]));
}

async function insertDzpAdjustments(
  client: PoolClient,
  roundId: number,
  roundNumber: number,
  recomputeId: number,
  previous: Map<number, number>,
  rewards: readonly DzpPlayerReward[]
): Promise<void> {
  const next = new Map(
    rewards.map((reward) => [reward.userId, reward.totalDzp])
  );

  const userIds = new Set<number>([
    ...previous.keys(),
    ...next.keys(),
  ]);

  const deltas: Array<{ userId: number; delta: number }> = [];

  for (const userId of userIds) {
    const before = previous.get(userId) ?? 0;
    const after = next.get(userId) ?? 0;
    const delta = after - before;

    if (delta !== 0) {
      deltas.push({ userId, delta });
    }
  }

  if (deltas.length === 0) return;

  const season = seasonNumberForRound(roundNumber);
  const values: unknown[] = [roundId, season, recomputeId];
  const placeholders: string[] = [];

  for (const delta of deltas) {
    const base = values.length;

    values.push(
      delta.userId,
      delta.delta,
      `round:${roundId}:recompute:${recomputeId}:user:${delta.userId}`,
      `Round ${roundNumber} DZP correction (recompute #${recomputeId})`
    );

    placeholders.push(
      `($1, $${base + 1}, $2, $${base + 2}, 'challenge_reward_adjustment', $3::text || ':' || $${base + 3}, $${base + 4})`
    );
  }

  await client.query(
    `INSERT INTO dzp_ledger
       (round_id, user_id, season, amount_dzp, transaction_type, reference_id, description)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

// ── Freezing a round ─────────────────────────────────────────────────────────

export async function finalizeRound(roundId: number): Promise<FinalizeOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: locked } = await client.query<{
  phase: string;
  dzpp_finalized_at: Date | null;
  winning_submission_id: number | null;
  round_number: number;
}>(
  `SELECT phase, dzpp_finalized_at, winning_submission_id, round_number
     FROM rounds WHERE id = $1 FOR UPDATE`,
      [roundId]
    );

    const current = locked[0];
    if (!current) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'gone' };
    }

    const refusal = refuseFinalize(current);
    if (refusal !== null) {
      await client.query('ROLLBACK');
      return { ok: false, reason: refusal };
    }

    // Completion sub-awards: which players had an approved submission and which held a vote.
    // Read on the pool (outside the transaction) for the same reason listForRound is: no
    // write to this round's submissions or votes is possible once the round has ended.
    const approvedSubmitters = await fetchApprovedSubmitters(roundId);
    const voters = await fetchVoters(roundId);

    // Score each challenge beatmap independently, then merge to one result per user.
   const detailed = await scoreAllBeatmapsDetailed(
  roundId,
  current.winning_submission_id,
  approvedSubmitters,
  voters
);

const deduped = mergeBestBeatmapResults(detailed);

await insertRoundDzppMaps(client, roundId, detailed, deduped);
await insertRoundDzpp(client, roundId, deduped);

const dzpRewards = calculateRoundDzpRewards(
  detailed,
  approvedSubmitters,
  voters
);

await insertInitialDzpRewards(
  client,
  roundId,
  current.round_number,
  dzpRewards
);

    // Stamped in the same transaction as the rows, so the latch and the data can never
    // disagree about whether this round was scored.
    await client.query('UPDATE rounds SET dzpp_finalized_at = now() WHERE id = $1', [roundId]);

    await client.query('COMMIT');
    return { ok: true, results: deduped };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * finalizeRound, but it never throws and never needs its outcome read.
 *
 * THE CALL SITES ARE ALL DOING SOMETHING ELSE AS THEIR REAL JOB. A round reaches
 * phase = 'ended' in exactly three places: the clock in applyDueTransitions, which
 * findCurrent() runs on every page load; the admin phase endpoint; and skipEmptyVoting. None
 * of them should fail because the ranking did — the round IS ended either way, and reporting
 * that as a failed phase change would be a lie about what happened.
 *
 * A failure therefore leaves dzpp_finalized_at NULL on an ended round, which is exactly the
 * state the Phase 7 admin recompute exists to find and repair. That is the cost of approved
 * decision 5: finalization in its own transaction rather than threaded through three others.
 *
 * 'already-finalized' is not logged. Ending a round the clock has just ended is an ordinary
 * race between two callers, and the latch answering "done" is the system working.
 */
export async function freezeEndedRound(roundId: number): Promise<void> {
  try {
    const outcome = await finalizeRound(roundId);
    if (!outcome.ok && outcome.reason !== 'already-finalized') {
      console.error(`[dzpp] round ${roundId} was not frozen: ${outcome.reason}`);
    }
  } catch (err) {
    console.error(
      `[dzpp] freezing round ${roundId} failed:`,
      err instanceof Error ? err.message : err
    );
  }
}
export async function currentSeason(): Promise<CurrentSeason> {
  const { rows } = await pool.query<{ max_round_number: number | null }>(
    'SELECT MAX(round_number)::int AS max_round_number FROM rounds'
  );

  const maxRoundNumber = rows[0]?.max_round_number ?? 0;
  const number = Math.max(1, Math.ceil(maxRoundNumber / SEASON_SIZE));
  const { first, last } = seasonBounds(number);

  return {
    number,
    label: `Season ${number}`,
    first,
    last,
  };
}
/** The inclusive round_number range for a given season number. */
export async function rankingMeta(
  scope: RankingScope,
  year: number | null
): Promise<RankingMeta> {
  if (scope === 'seasonal') {
  const season = await currentSeason();
  const { first, last } = seasonBounds(season.number);
    const { rows } = await pool.query<{ total: number; years: number[] }>(
      `SELECT count(DISTINCT d.user_id) FILTER (WHERE r.round_number BETWEEN $2 AND $3)::int AS total,
              COALESCE(array_agg(DISTINCT r.year ORDER BY r.year DESC), '{}') AS years
         ${RANKED_JOINS}`,
      [RANKING_COUNTRY, first, last]
    );
    return {
  total: rows[0]?.total ?? 0,
  years: rows[0]?.years ?? [],
  currentSeason: season,
};
  }

  // all-time and yearly share the same query shape; year=null means no year filter.
  const { rows } = await pool.query<{ total: number; years: number[] }>(
    `SELECT count(DISTINCT d.user_id) FILTER (WHERE $2::int IS NULL OR r.year = $2)::int AS total,
            COALESCE(array_agg(DISTINCT r.year ORDER BY r.year DESC), '{}') AS years
       ${RANKED_JOINS}`,
    [RANKING_COUNTRY, year]
  );
  return {
  total: rows[0]?.total ?? 0,
  years: rows[0]?.years ?? [],
  currentSeason: null,
};
}

/**
 * One page of the ranking, best first.
 *
 * TotalPoints is a PLAIN SUM — no decay, no best-N-of-M. osu! weights pp by 0.95^i because a
 * player has thousands of plays and ancient farm scores would otherwise dominate; here there
 * are twelve rounds a year, each unrepeatable, and the thing being rewarded IS sustained
 * monthly participation. Decay would punish exactly the loyalty this page exists to show.
 * The season filter, not decay, is what lets a newcomer compete with an early joiner.
 *
 * RANK() rather than the row number, so players level on points share a rank the way they do
 * on osu!'s own rankings. It is computed over the whole filtered set before LIMIT applies, so
 * a tie spanning a page boundary still reads correctly on both pages. Username breaks the
 * display order within a tie, which only decides who is printed first, not who ranks higher.
 */
export async function listRankings(
  scope: RankingScope,
  year: number | null,
  limit: number,
  offset: number
): Promise<RankingRow[]> {
  if (scope === 'seasonal') {
  const season = await currentSeason();
  const { first, last } = seasonBounds(season.number);
    const { rows } = await pool.query<RankingRow>(
      `WITH totals AS (
         SELECT d.user_id,
                SUM(d.final_dzpp)::int                       AS dzpp,
                count(*)::int                                AS rounds_played,
                count(*) FILTER (WHERE d.placement = 1)::int  AS first_places,
                min(d.placement)                             AS best_placement
           ${RANKED_JOINS} ${SEASON_FILTER}
          GROUP BY d.user_id
       )
       SELECT t.user_id, t.dzpp, t.rounds_played, t.first_places, t.best_placement,
              u.osu_id, u.username, u.avatar_url, u.country_code,
              RANK() OVER (ORDER BY t.dzpp DESC)::int AS rank
         FROM totals t
         JOIN users u ON u.id = t.user_id
        ORDER BY t.dzpp DESC, u.username ASC
        LIMIT $4 OFFSET $5`,
      [RANKING_COUNTRY, first, last, limit, offset]
    );
    return rows;
  }

  // all-time and yearly: year=null means no year filter.
  const { rows } = await pool.query<RankingRow>(
    `WITH totals AS (
       SELECT d.user_id,
              SUM(d.final_dzpp)::int                       AS dzpp,
              count(*)::int                                AS rounds_played,
              count(*) FILTER (WHERE d.placement = 1)::int  AS first_places,
              min(d.placement)                             AS best_placement
         ${RANKED_JOINS} ${YEAR_FILTER}
        GROUP BY d.user_id
     )
     SELECT t.user_id, t.dzpp, t.rounds_played, t.first_places, t.best_placement,
            u.osu_id, u.username, u.avatar_url, u.country_code,
            RANK() OVER (ORDER BY t.dzpp DESC)::int AS rank
       FROM totals t
       JOIN users u ON u.id = t.user_id
      ORDER BY t.dzpp DESC, u.username ASC
      LIMIT $3 OFFSET $4`,
    [RANKING_COUNTRY, year, limit, offset]
  );
  return rows;
}

/**
 * One player's frozen rounds, newest first — the detail panel behind their row.
 *
 * Carries the whole breakdown rather than the total alone, because the page has to be able to
 * say WHY a player has the points they have. An opaque formula in a small community produces
 * arguments rather than competition.
 *
 * The country rule applies here too, so a player outside the ranking reads as an empty
 * history rather than as a hidden row with a reachable detail page. Empty is also the answer
 * for a player who simply has no finalized rounds yet, which is why this is 200 with [] in
 * the route rather than a 404 — the same choice GET /challenge/scores makes, and it leaks
 * nothing about which accounts exist.
 *
 * For 'seasonal', only the current season's rounds are shown — matching the scope that was
 * active when the player row was opened.
 */
export async function listPlayerRounds(
  userId: number,
  scope: RankingScope,
  year: number | null
): Promise<PlayerRoundRow[]> {
  let rows: Omit<PlayerRoundRow, 'maps'>[];

  if (scope === 'seasonal') {
  const season = await currentSeason();
  const { first, last } = seasonBounds(season.number);

    const result = await pool.query<Omit<PlayerRoundRow, 'maps'>>(
      `SELECT d.round_id, r.round_number, r.month, r.year,
              d.performance_value, d.completion_points, d.qualification_points,
              d.placement_points, d.placement, d.qualified, d.field_size, d.final_dzpp
         ${RANKED_JOINS} ${SEASON_FILTER}
          AND d.user_id = $4
        ORDER BY r.round_number DESC`,
      [RANKING_COUNTRY, first, last, userId]
    );

    rows = result.rows;
  } else {
    const result = await pool.query<Omit<PlayerRoundRow, 'maps'>>(
      `SELECT d.round_id, r.round_number, r.month, r.year,
              d.performance_value, d.completion_points, d.qualification_points,
              d.placement_points, d.placement, d.qualified, d.field_size, d.final_dzpp
         ${RANKED_JOINS} ${YEAR_FILTER}
          AND d.user_id = $3
        ORDER BY r.round_number DESC`,
      [RANKING_COUNTRY, year, userId]
    );

    rows = result.rows;
  }

  if (rows.length === 0) return [];

  const roundIds = rows.map((row) => row.round_id);

  const { rows: mapRows } = await pool.query<PlayerRoundMapRow>(
    `SELECT rdm.submission_id,
            rdm.vote_rank,
            s.title,
            s.artist,
            s.mapper,
            s.difficulty_name,
            s.difficulty_id,
            s.beatmapset_id,
            s.cover_url,
            s.mod_requirement,
            s.challenge_requirement,
            rdm.score,
            rdm.accuracy,
            rdm.misses,
            rdm.max_combo,
            rdm.beatmap_max_combo,
            rdm.mods,
            rdm.osu_score_id,
            rdm.performance_value,rdm.completion_points,
            rdm.qualification_points,
            rdm.mod_compliance_points,
            rdm.requirement_achievement_points,
            rdm.placement_points,
            rdm.placement,
            rdm.qualified,
            rdm.field_size,
            rdm.final_dzpp,
            rdm.counted,
            rdm.round_id
       FROM round_dzpp_maps rdm
       JOIN submissions s ON s.id = rdm.submission_id
      WHERE rdm.user_id = $1
        AND rdm.round_id = ANY($2::int[])
      ORDER BY rdm.round_id DESC, rdm.vote_rank ASC`,
    [userId, roundIds]
  );

  const mapsByRound = new Map<number, PlayerRoundMapRow[]>();

  for (const map of mapRows) {
    const existing = mapsByRound.get(map.round_id);

    if (existing) {
      existing.push(map);
    } else {
      mapsByRound.set(map.round_id, [map]);
    }
  }

return rows.map((row) => ({
  ...row,
  maps: mapsByRound.get(row.round_id) ?? [],
}));
}
export async function recomputeRound(
  roundId: number,
  reason: string,
  adminUserId: number
): Promise<RecomputeOutcome> {
  const client = await pool.connect();
  try {
const { rows: locked } = await client.query<{
  phase: string;
  dzpp_finalized_at: Date | null;
  winning_submission_id: number | null;
  round_number: number;
}>(
  `SELECT phase, dzpp_finalized_at, winning_submission_id, round_number
     FROM rounds WHERE id = $1 FOR UPDATE`,
      [roundId]
    );

    const current = locked[0];
    if (!current) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'gone' };
    }

    const refusal = refuseRecompute(current);
    if (refusal !== null) {
      await client.query('ROLLBACK');
      return { ok: false, reason: refusal };
    }

    // What the round was worth, read inside the transaction so it describes exactly the rows
    // the DELETE below is about to remove.
    const { rows: before } = await client.query<{
      row_count: number;
      total: number;
      version: number | null;
    }>(
      `SELECT count(*)::int                       AS row_count,
              COALESCE(SUM(final_dzpp), 0)::int   AS total,
              MAX(formula_version)                AS version
         FROM round_dzpp WHERE round_id = $1`,
      [roundId]
    );
    const previous = before[0] ?? { row_count: 0, total: 0, version: null };
    const previousDzpRewards = await getEffectiveDzpRewardsForRound(
  client,
  roundId
);

    let requirement = '';
    let modRequirement = '';
    if (current.winning_submission_id !== null) {
      const { rows } = await client.query<{
        challenge_requirement: string;
        mod_requirement: string;
      }>(
        'SELECT challenge_requirement, mod_requirement FROM submissions WHERE id = $1',
        [current.winning_submission_id]
      );
      requirement = rows[0]?.challenge_requirement ?? '';
      modRequirement = rows[0]?.mod_requirement ?? '';
    }

    // Completion sub-awards: same logic as finalizeRound.
    const approvedSubmitters = await fetchApprovedSubmitters(roundId);
    const voters = await fetchVoters(roundId);

    // Score each challenge beatmap independently, then merge to one result per user.
    // Exact same pipeline as finalizeRound — no second implementation.
const detailed = await scoreAllBeatmapsDetailed(
  roundId,
  current.winning_submission_id,
  approvedSubmitters,
  voters
);

const deduped = mergeBestBeatmapResults(detailed);

// THIS round only. The WHERE clauses are the whole guarantee that a recompute cannot
// reach another month.
await client.query('DELETE FROM round_dzpp_maps WHERE round_id = $1', [roundId]);
await client.query('DELETE FROM round_dzpp WHERE round_id = $1', [roundId]);

await insertRoundDzppMaps(client, roundId, detailed, deduped);
await insertRoundDzpp(client, roundId, deduped);

    // Sum the deduped set — the rows actually inserted — not a pre-dedup intermediate.
    const newTotal = deduped.reduce((sum, result) => sum + result.finalDzpp, 0);
const dzpRewards = calculateRoundDzpRewards(
  detailed,
  approvedSubmitters,
  voters
);
const { rows: recomputeRows } = await client.query<{ id: number }>(
  `INSERT INTO dzpp_recomputes
     (round_id, previous_rows, new_rows, previous_total, new_total,
      previous_formula_version, new_formula_version, reason, recomputed_by)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
   RETURNING id`,
  [
    roundId,
    previous.row_count,
    deduped.length,
    previous.total,
    newTotal,
    previous.version,
    DZPP_FORMULA_VERSION,
    reason,
    adminUserId,
  ]
);

const recomputeId = recomputeRows[0]?.id;

if (recomputeId === undefined) {
  throw new Error('DZPP recompute audit row was not created');
}

if (previous.row_count === 0) {
  await insertInitialDzpRewards(
    client,
    roundId,
    current.round_number,
    dzpRewards
  );
} else {
  await insertDzpAdjustments(
    client,
    roundId,
    current.round_number,
    recomputeId,
    previousDzpRewards,
    dzpRewards
  );
}

    // Covers the round that was never finalized at all, without moving the timestamp on one
    // that was.
    await client.query(
      'UPDATE rounds SET dzpp_finalized_at = COALESCE(dzpp_finalized_at, now()) WHERE id = $1',
      [roundId]
    );

    await client.query('COMMIT');
    return {
      ok: true,
      results: deduped,
      summary: {
        roundId,
        previousRows: previous.row_count,
        newRows: deduped.length,
        previousTotal: previous.total,
        newTotal,
        previousFormulaVersion: previous.version,
        newFormulaVersion: DZPP_FORMULA_VERSION,
        firstTime: previous.row_count === 0,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Completion sub-award helpers ─────────────────────────────────────────────
//
// Both read from the pool (not a transaction client) because they are called after the
// round has ended, at which point no write to submissions or votes for this round is
// possible. Using the pool avoids holding the transaction open across two extra round
// trips while still reading a consistent snapshot of a table that cannot change.

/** User ids that submitted an approved beatmap for the given round. */
async function fetchApprovedSubmitters(roundId: number): Promise<Set<number>> {
  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM submissions WHERE round_id = $1 AND status = 'approved'`,
    [roundId]
  );
  return new Set(rows.map((r) => r.user_id));
}

/** User ids that held a vote for the given round at the time of the call. */
async function fetchVoters(roundId: number): Promise<Set<number>> {
  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM votes WHERE round_id = $1`,
    [roundId]
  );
  return new Set(rows.map((r) => r.user_id));
}

/**
 * Scores all challenge beatmaps for a round independently and merges the results
 * to one row per user.
 *
 * For each persisted challenge beatmap (in vote_rank order):
 *   1. Load only that beatmap's challenge_scores via listForRound(..., submissionId).
 *   2. Convert each row with toRoundPlay using that beatmap's own mod/challenge requirement.
 *   3. Run scoreRound() on that beatmap's plays only — so qualification, achievement
 *      winners, qualified field size, placement, and field factor are all per-beatmap.
 *
 * After all beatmaps are scored, merge per user:
 *   - Keep the result with the highest finalDzpp.
 *   - Ties broken by vote_rank order (lower rank = earlier beatmap wins), so the
 *     selection is deterministic and the winner's beatmap is preferred on a tie.
 *
 * Completion points (hadApprovedSubmission, hadVote) are passed to toRoundPlay for
 * every play and appear in the scoreOne result. The merge step preserves them from
 * whichever beatmap's result is selected — they are not re-applied after the merge.
 *
 * Falls back to the old single-leaderboard path when no round_challenge_beatmaps rows
 * exist (pre-020 rounds), using winning_submission_id's requirement.
 */
export async function scoreAllBeatmapsDetailed(
  roundId: number,
  winningSubmissionId: number | null,
  approvedSubmitters: Set<number>,
  voters: Set<number>
): Promise<DzppBeatmapResult[]> {
  const { listForRound: listChallengeBeatmaps } = await import('./challengeBeatmaps.js');
  const beatmaps = await listChallengeBeatmaps(roundId);

  if (beatmaps.length === 0) {
    // Pre-020 round: no round_challenge_beatmaps rows.
    // Associate the legacy leaderboard with its recorded winner submission.
    if (winningSubmissionId === null) return [];

    const { rows: requirements } = await pool.query<{
      challenge_requirement: string;
      mod_requirement: string;
    }>(
      'SELECT challenge_requirement, mod_requirement FROM submissions WHERE id = $1',
      [winningSubmissionId]
    );

    const requirement = requirements[0]?.challenge_requirement ?? '';
    const modRequirement = requirements[0]?.mod_requirement ?? '';
    const scores = await listForRound(roundId, requirement);

    const plays = scores.map((row) =>
      toRoundPlay(
        row,
        approvedSubmitters.has(row.user_id),
        voters.has(row.user_id),
        modRequirement,
        requirement
      )
    );

const results = scoreRound(plays);
const awardsByUser = qualificationAwards(plays);

return results.map((result, index) => {
  const row = scores[index];
  const awards = awardsByUser.get(result.userId);

  return {
    ...result,
    submissionId: winningSubmissionId,
    voteRank: 1,
    score: Number(row.score),
    accuracy: Number(row.accuracy),
    misses: row.misses,
    maxCombo: row.max_combo,
    beatmapMaxCombo: row.beatmap_max_combo,
    mods: row.mods,
    osuScoreId: row.osu_score_id === null ? null : Number(row.osu_score_id),
    modCompliancePoints: awards?.modCompliancePoints ?? 0,
    requirementAchievementPoints: awards?.requirementAchievementPoints ?? 0,
  };
});
  }

  const allResults: DzppBeatmapResult[] = [];

  for (const bm of beatmaps) {
    const scores = await listForRound(
      roundId,
      bm.challenge_requirement,
      bm.submission_id
    );

    const plays = scores.map((row) =>
      toRoundPlay(
        row,
        approvedSubmitters.has(row.user_id),
        voters.has(row.user_id),
        bm.mod_requirement,
        bm.challenge_requirement
      )
    );

const results = scoreRound(plays);
const awardsByUser = qualificationAwards(plays);

results.forEach((result, index) => {
  const row = scores[index];
  const awards = awardsByUser.get(result.userId);

  allResults.push({
    ...result,
    submissionId: bm.submission_id,
    voteRank: bm.vote_rank,
    score: Number(row.score),
    accuracy: Number(row.accuracy),
    misses: row.misses,
    maxCombo: row.max_combo,
    beatmapMaxCombo: row.beatmap_max_combo,
    mods: row.mods,
    osuScoreId: row.osu_score_id === null ? null : Number(row.osu_score_id),
    modCompliancePoints: awards?.modCompliancePoints ?? 0,
    requirementAchievementPoints: awards?.requirementAchievementPoints ?? 0,
  });
});
  }

  return allResults;
}

/** Provisional DZPP for the open challenge. This is intentionally not frozen into round_dzpp. */
export async function getLivePlayerDzpp(roundId: number, userId: number): Promise<number> {
  const round = (await pool.query<{ winning_submission_id: number | null }>(
    'SELECT winning_submission_id FROM rounds WHERE id = $1', [roundId]
  )).rows[0];
  if (!round) return 0;
  const detailed = await scoreAllBeatmapsDetailed(
    roundId,
    round.winning_submission_id,
    await fetchApprovedSubmitters(roundId),
    await fetchVoters(roundId),
  );
  return mergeBestBeatmapResults(detailed).find((result) => result.userId === userId)?.finalDzpp ?? 0;
}

/**
 * Selects the single map result that becomes the player's authoritative round_dzpp row.
 *
 * Highest final DZPP wins. Ties use the earlier vote-ranked challenge beatmap.
 */
export async function scoreAllBeatmaps(
  roundId: number,
  winningSubmissionId: number | null,
  approvedSubmitters: Set<number>,
  voters: Set<number>
): Promise<DzppRoundResult[]> {
  const detailed = await scoreAllBeatmapsDetailed(
    roundId,
    winningSubmissionId,
    approvedSubmitters,
    voters
  );

  return mergeBestBeatmapResults(detailed);
}

/**
 * Writes a round's frozen rows. One statement per player, the way closeVoting writes its
 * tiebreak entries: a round's field is a handful of people, so a giant VALUES list would buy
 * nothing and cost readability.
 *
 * Shared by finalizeRound and recomputeRound so the column list exists once. Two copies of an
 * eleven-column INSERT is two things to keep in step, and the compiler would not catch it if
 * they drifted.
 *
 * The INSERT is plain rather than ON CONFLICT DO NOTHING in both callers: finalization is
 * guarded by the latch and a recompute deletes first, so a primary-key collision would mean one
 * of those guarantees had failed, and that should be loud.
 */
async function insertRoundDzppMaps(
  client: PoolClient,
  roundId: number,
  results: readonly DzppBeatmapResult[],
  countedResults: readonly DzppBeatmapResult[]
): Promise<void> {
  if (results.length === 0) return;

  const counted = new Set(
    countedResults.map((result) => `${result.userId}:${result.submissionId}`)
  );

  const values: unknown[] = [roundId];
  const rowPlaceholders: string[] = [];

  for (const result of results) {
    const base = values.length;
values.push(
  result.submissionId,
  result.userId,
  result.voteRank,
  result.score,
  result.accuracy,
  result.misses,
  result.maxCombo,
  result.beatmapMaxCombo,
  result.mods,
  result.osuScoreId,
  result.performanceValue,
  result.completionPoints,
  result.qualificationPoints,
  result.modCompliancePoints,
  result.requirementAchievementPoints,
  result.placementPoints,
  result.placement,
  result.qualified,
  result.fieldSize,
  result.finalDzpp,
  result.formulaVersion,
  counted.has(`${result.userId}:${result.submissionId}`)
);
    rowPlaceholders.push(
  `($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, ` +
  `$${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, ` +
  `$${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, ` +
  `$${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, ` +
  `$${base + 20}, $${base + 21}, $${base + 22})`
);
  }

  await client.query(
    `INSERT INTO round_dzpp_maps
       (round_id, submission_id, user_id, vote_rank,
 score, accuracy, misses, max_combo, beatmap_max_combo, mods, osu_score_id,
 performance_value, completion_points, qualification_points,
 mod_compliance_points, requirement_achievement_points, placement_points,
 placement, qualified, field_size, final_dzpp, formula_version, counted)
     VALUES ${rowPlaceholders.join(', ')}`,
    values
  );
}

async function insertRoundDzpp(
  client: PoolClient,
  roundId: number,
  results: readonly DzppRoundResult[]
): Promise<void> {
  if (results.length === 0) return;

  // One multi-row INSERT instead of N round trips. Each player occupies 11 parameters;
  // the round_id is shared and prepended as $1 so it is not repeated per row.
  const values: unknown[] = [roundId];
  const rowPlaceholders: string[] = [];

  for (const result of results) {
    const base = values.length; // index of the first param for this row (1-based after push)
    values.push(
      result.userId,
      result.performanceValue,
      result.completionPoints,
      result.qualificationPoints,
      result.placementPoints,
      result.placement,
      result.qualified,
      result.fieldSize,
      result.finalDzpp,
      result.formulaVersion,
    );
    rowPlaceholders.push(
      `($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`
    );
  }

  await client.query(
    `INSERT INTO round_dzpp
       (round_id, user_id, performance_value, completion_points, qualification_points,
        placement_points, placement, qualified, field_size, final_dzpp, formula_version)
     VALUES ${rowPlaceholders.join(', ')}`,
    values
  );
}

export interface RecomputeRow {
  id: number;
  round_id: number;
  round_number: number;
  previous_rows: number;
  new_rows: number;
  previous_total: number;
  new_total: number;
  previous_formula_version: number | null;
  new_formula_version: number;
  reason: string;
  recomputed_by: number | null;
  recomputed_by_name: string | null;
  recomputed_at: Date;
}

/**
 * Every recompute applied to one round, newest first.
 *
 * LEFT JOIN on users for the same reason listCorrections does: the record has to survive the
 * administrator's account being deleted, so the name is optional and the row is not.
 */
export async function listRecomputes(roundId: number): Promise<RecomputeRow[]> {
  const { rows } = await pool.query<RecomputeRow>(
    `SELECT c.id, c.round_id, r.round_number, c.previous_rows, c.new_rows,
            c.previous_total, c.new_total, c.previous_formula_version, c.new_formula_version,
            c.reason, c.recomputed_by, u.username AS recomputed_by_name, c.recomputed_at
       FROM dzpp_recomputes c
       JOIN rounds r ON r.id = c.round_id
       LEFT JOIN users u ON u.id = c.recomputed_by
      WHERE c.round_id = $1
      ORDER BY c.recomputed_at DESC, c.id DESC`,
    [roundId]
  );
  return rows;
}

/** Maps a row to the ApiDzppRecompute DTO declared in src/api/client.ts. */
export function toApiDzppRecompute(row: RecomputeRow) {
  return {
    id: row.id,
    roundId: row.round_id,
    roundNumber: row.round_number,
    previousRows: row.previous_rows,
    newRows: row.new_rows,
    previousTotal: row.previous_total,
    newTotal: row.new_total,
    previousFormulaVersion: row.previous_formula_version,
    newFormulaVersion: row.new_formula_version,
    reason: row.reason,
    recomputedBy: row.recomputed_by,
    recomputedByName: row.recomputed_by_name,
    recomputedAt: row.recomputed_at.toISOString(),
  };
}

/**
 * Frozen DZPP for a set of rounds, as round id → user id → total.
 *
 * ONE QUERY FOR EVERY ROUND ASKED FOR, rather than one per round. The archive reads every month
 * the community has run, so a per-round lookup would grow a query per month forever — and the
 * archive already pays one query per round for its winner and one for its leaderboard, which is
 * enough of that pattern.
 *
 * These are the FROZEN values, read from round_dzpp rather than recomputed. An ended round's
 * DZPP is what was stored when it closed, and re-deriving it for display would put a second
 * answer on screen that could disagree with the ranking.
 */
export async function frozenDzpp(roundIds: number[]): Promise<Map<number, Map<number, number>>> {
  const byRound = new Map<number, Map<number, number>>();
  if (roundIds.length === 0) return byRound;

  const { rows } = await pool.query<{ round_id: number; user_id: number; final_dzpp: number }>(
    'SELECT round_id, user_id, final_dzpp FROM round_dzpp WHERE round_id = ANY($1::int[])',
    [roundIds]
  );

  for (const row of rows) {
    let round = byRound.get(row.round_id);
    if (round === undefined) {
      round = new Map<number, number>();
      byRound.set(row.round_id, round);
    }
    round.set(row.user_id, row.final_dzpp);
  }
  return byRound;
}
