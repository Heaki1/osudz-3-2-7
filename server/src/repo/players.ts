/**
 * repo/players.ts
 *
 * Read-only queries for the public player profile page.
 *
 * Column names are taken directly from 025_shop.sql and the existing dzpp.ts
 * queries (RankingRow, PlayerRoundRow, insertRoundDzpp*). Nothing here modifies
 * data, recomputes DZPP, or touches the Shop purchase / steal / equip flow.
 *
 * Country filter: reuses RANKING_COUNTRY = 'DZ' from repo/dzpp so the rule
 * is defined in exactly one place, matching the comment in dzpp.ts §820.
 *
 * osu_id is bigint in the DB. node-postgres returns bigint columns as strings
 * to avoid silent precision loss (same as dzpp.ts asPp and toApiRankingEntry).
 * The route handler converts with Number() before sending JSON.
 *
 * country_code is char(2) and Postgres blank-pads char columns. Every read
 * trims before comparing or returning (same as dzpp.ts RANKED_JOINS + toApiRankingEntry).
 */

import { pool } from '../db.js';
import { RANKING_COUNTRY } from './dzpp.js';

// ── Player profile ─────────────────────────────────────────────────────────

export interface PlayerProfileRow {
  user_id: number;
  /** bigint → string from node-postgres. Convert with Number() before JSON. */
  osu_id: string;
  username: string;
  /** char(2), may have trailing space — trim before use. */
  country_code: string;
  avatar_url: string | null;
  profile_banner_url: string | null;
  global_rank: number | null;
  /** All-time DZPP total among DZ players. 0 when no scored rounds. */
  dzpp: number;
  /**
   * Position in the all-time DZ leaderboard.
   * NULL when the player has no scored rounds (not in round_dzpp at all).
   */
  dzpp_rank: number | null;
  rounds_played: number;
  first_places: number;
  best_placement: number | null;
  qualified_score_total: string;
  challenge_plays: number;
  total_challenge_score: string;
  approved_beatmaps: number;
  votes_received: number;
  /** Cumulative stake earned from winning settled duels. */
  duel_pp: number;
  duel_pp_rank: number | null;
  duel_history: Array<{ duel_id: number; created_at: string; amount: number }>;
}

/**
 * Resolves a username to a full public profile row.
 *
 * Returns null when no account with that username exists (the route sends 404).
 * Username matching is case-insensitive via lower().
 *
 * The DZPP rank is computed over DZ players only, using the same country filter
 * as listRankings / RANKED_JOINS in repo/dzpp.ts. A non-DZ player resolves
 * to a row but dzpp_rank is NULL because they are not in the ranked set.
 *
 * The CTE structure mirrors listRankings ('all-time' branch) so the rank value
 * here is the same number the leaderboard would show for this player.
 * No formula is recomputed: all values are read from round_dzpp.final_dzpp.
 */
export async function getPlayerByUsername(
  username: string,
): Promise<PlayerProfileRow | null> {
  const { rows } = await pool.query<PlayerProfileRow>(
    `WITH dz_totals AS (
       -- All-time DZPP totals for DZ players only, with rank.
       -- Mirrors the 'all-time' branch of listRankings in repo/dzpp.ts:
       --   same RANKED_JOINS, same SUM(final_dzpp), same RANK() OVER.
       SELECT
         d.user_id,
         SUM(d.final_dzpp)::int                                 AS dzpp,
         count(*)::int                                          AS rounds_played,
         count(*) FILTER (WHERE d.placement = 1)::int           AS first_places,
         min(d.placement)                                       AS best_placement,
         RANK() OVER (ORDER BY SUM(d.final_dzpp) DESC)::int     AS dzpp_rank
       FROM round_dzpp d
       JOIN rounds r ON r.id = d.round_id
       JOIN users  u ON u.id = d.user_id
       WHERE upper(trim(u.country_code)) = $2
       GROUP BY d.user_id
     )
     SELECT
       u.id                            AS user_id,
       u.osu_id::text                  AS osu_id,
       u.username,
       u.country_code,
       u.avatar_url,
       u.profile_banner_url,
       u.global_rank,
       COALESCE(t.dzpp, 0)             AS dzpp,
       t.dzpp_rank,
       COALESCE(t.rounds_played, 0)    AS rounds_played,
       COALESCE(t.first_places, 0)     AS first_places,
       t.best_placement,
       -- One row is the player's current imported score for a challenge beatmap.
       -- Count only rows whose stored qualification result is true: this is the
       -- number of challenge scores the player actually played and qualified on,
       -- not qualification points or qualified rounds.
       (SELECT COALESCE(SUM(cs.score), 0)::bigint FROM challenge_scores cs
         WHERE cs.user_id = u.id
           AND cs.qualified IS TRUE) AS qualified_score_total,
       (SELECT COUNT(*)::int FROM challenge_scores cs
         WHERE cs.user_id = u.id) AS challenge_plays,
       (SELECT COALESCE(SUM(cs.score), 0)::bigint FROM challenge_scores cs
         WHERE cs.user_id = u.id) AS total_challenge_score,
       (SELECT COUNT(*)::int FROM submissions s
         WHERE s.user_id = u.id AND s.status = 'approved') AS approved_beatmaps,
       (SELECT COUNT(*)::int FROM votes v
         JOIN submissions s ON s.id = v.submission_id
         WHERE s.user_id = u.id) AS votes_received,
       0::int AS duel_pp,
       NULL::int AS duel_pp_rank,
       '[]'::json AS duel_history
     FROM users u
     LEFT JOIN dz_totals t ON t.user_id = u.id
     WHERE lower(u.username) = lower($1)
     LIMIT 1`,
    [username, RANKING_COUNTRY],
  );

  const row = rows[0];
  if (!row) return null;

  // Duels were introduced after the original profile tables. Keep the public
  // profile readable while an older database is waiting for migration 033.
  try {
    const duel = await pool.query<{ duel_pp: number; duel_pp_rank: number | null }>(
      `WITH duel_totals AS (
         SELECT
           l.user_id,
           COALESCE(SUM(CASE WHEN l.transaction_type = 'payout' THEN d.stake ELSE 0 END), 0)::int AS duel_pp,
           RANK() OVER (
             ORDER BY COALESCE(SUM(CASE WHEN l.transaction_type = 'payout' THEN d.stake ELSE 0 END), 0) DESC
           )::int AS duel_pp_rank
         FROM duel_ledger l
         JOIN duels d ON d.id = l.duel_id
         WHERE d.status = 'settled'
         GROUP BY l.user_id
       )
       SELECT duel_pp, duel_pp_rank
       FROM duel_totals
       WHERE user_id = $1`,
      [row.user_id],
    );
    row.duel_pp = duel.rows[0]?.duel_pp ?? 0;
    row.duel_pp_rank = duel.rows[0]?.duel_pp_rank ?? null;
    const history = await pool.query<{ duel_id: number; created_at: string; amount: number }>(
      `SELECT DISTINCT ON (d.id)
         d.id AS duel_id,
         d.created_at::text AS created_at,
         d.stake::int AS amount
       FROM duels d
       JOIN duel_ledger l ON l.duel_id = d.id
       WHERE d.status = 'settled'
         AND l.user_id = $1
         AND l.transaction_type = 'payout'
       ORDER BY d.id, d.created_at ASC`,
      [row.user_id],
    );
    row.duel_history = history.rows;
  } catch {
    row.duel_pp = 0;
    row.duel_pp_rank = null;
    row.duel_history = [];
  }

  return row;
}

// ── Player owned Shop items ─────────────────────────────────────────────────

export interface PlayerOwnedItemRow {
  item_id: string;
  name: string;
  description: string;
  /** Matches shop_items.category CHECK constraint values. */
  category: string;
  /** Matches shop_items.profile_slot CHECK constraint values, or NULL. */
  profile_slot: string | null;
  /** NULL when the item has no active asset (shop_item_assets.is_active). */
  artwork_url: string | null;
  artwork_alt_text: string | null;
  artwork_asset_type: 'png' | 'webp' | 'gif' | 'apng' | 'svg' | null;
  artwork_is_animated: boolean | null;
  artwork_frame_inner_diameter_ratio: number | null;
  acquired_at: Date;
  season: number;
}

/**
 * All Shop items the player currently owns, for the public Collection tab.
 *
 * Two sources:
 *
 *   user_shop_items  — normal items (permanent, one row per user+item).
 *   shop_item_transfers WHERE lost_at IS NULL — the stealable title the player
 *     currently holds. The unique index shop_item_transfers_one_current_owner
 *     guarantees at most one open transfer per item, so this safely adds ≤1
 *     stealable row per item.
 *
 * The LEFT JOIN on shop_item_assets uses the same is_active = true filter that
 * the existing getShopItems query in repo/shop.ts uses, so the artwork shown
 * here is always the active asset.
 *
 * Results are ordered newest-acquired first, matching the Collection tab's
 * default display intent.
 *
 * This query NEVER touches dzp_ledger, purchase logic, steal logic, or
 * the equip state (user_profile_equipment or equivalent). It is strictly read.
 */
export async function getPlayerOwnedItems(
  userId: number,
): Promise<PlayerOwnedItemRow[]> {
  const { rows } = await pool.query<PlayerOwnedItemRow>(
    `-- Normal items purchased by this user (permanent ownership).
     SELECT
       usi.item_id,
       si.name,
       si.description,
       si.category,
       si.profile_slot,
       sia.url          AS artwork_url,
       sia.alt_text     AS artwork_alt_text,
       sia.asset_type AS artwork_asset_type,
       sia.is_animated AS artwork_is_animated,
       sia.frame_inner_diameter_ratio AS artwork_frame_inner_diameter_ratio,
       usi.acquired_at,
       usi.acquired_at_season AS season
     FROM user_shop_items usi
     JOIN shop_items si
       ON si.id = usi.item_id
     LEFT JOIN shop_item_assets sia
       ON sia.item_id = usi.item_id
      AND sia.is_active = true
     WHERE usi.user_id = $1

     UNION ALL

     -- Stealable title currently held by this user (lost_at IS NULL).
     -- The unique index shop_item_transfers_one_current_owner ensures this
     -- returns at most one open transfer per item, so no duplicates arise.
     SELECT
       sit.item_id,
       si.name,
       si.description,
       si.category,
       si.profile_slot,
       sia.url          AS artwork_url,
       sia.alt_text     AS artwork_alt_text,
       sia.asset_type AS artwork_asset_type,
       sia.is_animated AS artwork_is_animated,
       sia.frame_inner_diameter_ratio AS artwork_frame_inner_diameter_ratio,
       sit.acquired_at,
       sit.season
     FROM shop_item_transfers sit
     JOIN shop_items si
       ON si.id = sit.item_id
     LEFT JOIN shop_item_assets sia
       ON sia.item_id = sit.item_id
      AND sia.is_active = true
     WHERE sit.user_id = $1
       AND sit.lost_at IS NULL

     ORDER BY acquired_at DESC`,
    [userId],
  );

  return rows;
}
