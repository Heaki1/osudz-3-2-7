// Shop read repository.
//
// Monetary values, ownership, and the current season are server-authoritative.
// This file intentionally contains no purchase/steal mutations yet.

import { pool } from '../db.js';
import crypto from 'node:crypto';

const SEASON_SIZE = 3;

export interface ShopSeasonRow {
  season: number;
  label: string;
  ends_at: string | null;
}

export interface ShopViewerRow {
  user_id: number;
  username: string;
  balance_dzp: number;
}

export interface ShopItemRow {
  id: string;
  name: string;
  description: string;
  category: string;
  ownership_type: 'normal' | 'stealable';
  lifecycle: 'draft' | 'ready' | 'active' | 'retired';
  profile_slot: string | null;
  display_order: number;
  initial_price_dzp: number;
  current_price_dzp: number | null;

  asset_id: string;
  asset_url: string;
  asset_type: 'png' | 'webp' | 'gif' | 'apng' | 'svg';
  asset_alt_text: string;
  asset_is_animated: boolean;
  asset_frame_inner_diameter_ratio: number | null;

  owner_user_id: number | null;
  owner_username: string | null;
  owner_acquisition_price_dzp: number | null;
  owner_acquired_at_season: number | null;
  owner_acquired_at: string | null;

  transfer_count: number;
}


export interface ShopOwnershipHistoryRow {
  id: string;
  item_id: string;
  user_id: number;
  username: string;
  acquisition_price_dzp: number;
  compensation_received_dzp: number | null;
  season: number;
  acquired_at: Date;
  lost_at: Date | null;
}

export interface ShopStealCommit {
  itemId: string;
  season: number;
  priceDzp: number;
  newPriceDzp: number;
  previousOwnerUserId: number | null;
  previousOwnerUsername: string | null;
  compensationDzp: number;
  purchaseLedgerId: string;
  purchaseLedgerCreatedAt: string;
  compensationLedgerId: string | null;
  compensationLedgerCreatedAt: string | null;
}

export function nextShopStealPrice(currentPriceDzp: number): number {
  return Math.ceil(currentPriceDzp * 1.5);
}

export function shopStealCompensation(
  previousOwnerAcquisitionPriceDzp: number,
): number {
  return Math.floor(previousOwnerAcquisitionPriceDzp * 0.5);
}

export async function stealShopItem(
  userId: number,
  itemId: string,
): Promise<ShopStealCommit> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the item first. Every steal involving this item therefore observes
    // one authoritative price and one authoritative ownership state.
    const { rows: itemRows } = await client.query<{
      id: string;
      name: string;
      ownership_type: 'normal' | 'stealable';
      lifecycle: 'draft' | 'ready' | 'active' | 'retired';
      initial_price_dzp: number;
      current_price_dzp: number | null;
    }>(
      `
        SELECT
          id,
          name,
          ownership_type,
          lifecycle,
          initial_price_dzp,
          current_price_dzp
        FROM shop_items
        WHERE id = $1
        FOR UPDATE
      `,
      [itemId],
    );

    const item = itemRows[0];

    if (!item) {
      await client.query('ROLLBACK');
      const error = new Error('Item not found');
      error.name = 'ITEM_NOT_FOUND';
      throw error;
    }

    if (item.lifecycle !== 'active') {
      await client.query('ROLLBACK');
      const error = new Error('Item is not available');
      error.name = 'ITEM_UNAVAILABLE';
      throw error;
    }

    if (item.ownership_type !== 'stealable') {
      await client.query('ROLLBACK');
      const error = new Error('This item is not stealable');
      error.name = 'NOT_STEALABLE';
      throw error;
    }

    if (item.current_price_dzp === null || item.current_price_dzp <= 0) {
      await client.query('ROLLBACK');
      const error = new Error('This item has no valid steal price');
      error.name = 'ITEM_UNAVAILABLE';
      throw error;
    }

    // Lock the current ownership row, if one exists. Because the item row is
    // already locked, another steal cannot change ownership between these reads.
    const { rows: ownerRows } = await client.query<{
      id: number;
      user_id: number;
      username: string;
      acquisition_price_dzp: number;
    }>(
      `
        SELECT
          t.id,
          t.user_id,
          u.username,
          t.acquisition_price_dzp
        FROM shop_item_transfers t
        JOIN users u ON u.id = t.user_id
        WHERE t.item_id = $1
          AND t.lost_at IS NULL
        FOR UPDATE
      `,
      [item.id],
    );

    const previousOwner = ownerRows[0] ?? null;

    if (previousOwner?.user_id === userId) {
      await client.query('ROLLBACK');
      const error = new Error('You already own this title');
      error.name = 'ALREADY_OWNED';
      throw error;
    }

    const { rows: seasonRows } = await client.query<{
      round_number: number | null;
    }>(
      `
        SELECT COALESCE(
          (
            SELECT round_number
            FROM rounds
            WHERE phase <> 'ended'
            ORDER BY round_number DESC
            LIMIT 1
          ),
          (
            SELECT MAX(round_number)
            FROM rounds
          )
        ) AS round_number
      `,
    );

    const roundNumber = seasonRows[0]?.round_number ?? null;
    const season =
      roundNumber === null ? 1 : Math.max(1, Math.ceil(roundNumber / SEASON_SIZE));

    const price = item.current_price_dzp;
    const compensation =
      previousOwner === null
        ? 0
        : shopStealCompensation(previousOwner.acquisition_price_dzp);

    // Price only moves upward. The next price is based on the price actually
    // paid by this transaction, not on initial_price_dzp.
    const newPrice = nextShopStealPrice(price);

    const { rows: balanceRows } = await client.query<{
      balance_dzp: number;
    }>(
      `
        SELECT COALESCE(SUM(amount_dzp), 0)::int AS balance_dzp
        FROM dzp_ledger
        WHERE user_id = $1
          AND season = $2
      `,
      [userId, season],
    );

    const balance = balanceRows[0]?.balance_dzp ?? 0;

    if (balance < price) {
      await client.query('ROLLBACK');
      const error = new Error('Insufficient DZP');
      error.name = 'INSUFFICIENT_FUNDS';
      throw error;
    }

    const timestamp = new Date();

    if (previousOwner !== null) {
      const updated = await client.query(
        `
          UPDATE shop_item_transfers
          SET
            lost_at = $1,
            compensation_received_dzp = $2
          WHERE id = $3
            AND lost_at IS NULL
        `,
        [timestamp, compensation, previousOwner.id],
      );

      if (updated.rowCount !== 1) {
        throw new Error('Current title owner could not be closed');
      }

      // A stolen title must stop being presented by its previous holder in the
      // same transaction that ends ownership; profile choices never outlive it.
      await client.query(
        'DELETE FROM user_shop_profile_equipment WHERE user_id = $1 AND item_id = $2',
        [previousOwner.user_id, item.id],
      );
    }

    await client.query(
      `
        INSERT INTO shop_item_transfers (
          item_id,
          user_id,
          acquisition_price_dzp,
          season,
          acquired_at
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [item.id, userId, price, season, timestamp],
    );

    await client.query(
      `
        UPDATE shop_items
        SET current_price_dzp = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [item.id, newPrice],
    );

    const { rows: purchaseLedgerRows } = await client.query<{
      id: string;
      created_at: string;
    }>(
      `
        INSERT INTO dzp_ledger (
          user_id,
          round_id,
          item_id,
          season,
          amount_dzp,
          transaction_type,
          reference_id,
          description
        )
        VALUES (
          $1,
          NULL,
          $2,
          $3,
          $4,
          'steal_purchase',
          $5,
          $6
        )
        RETURNING id::text, created_at
      `,
      [
        userId,
        item.id,
        season,
        -price,
        `steal:${item.id}:${timestamp.toISOString()}`,
        `Acquired ${item.name} for ${price} DZP`,
      ],
    );

    const purchaseLedger = purchaseLedgerRows[0];

    if (!purchaseLedger) {
      throw new Error('Steal purchase ledger entry was not created');
    }

    let compensationLedgerId: string | null = null;
    let compensationLedgerCreatedAt: string | null = null;

    if (previousOwner !== null && compensation > 0) {
      const { rows: compensationRows } = await client.query<{
        id: string;
        created_at: string;
      }>(
        `
          INSERT INTO dzp_ledger (
            user_id,
            round_id,
            item_id,
            season,
            amount_dzp,
            transaction_type,
            reference_id,
            description
          )
          VALUES (
            $1,
            NULL,
            $2,
            $3,
            $4,
            'steal_compensation',
            $5,
            $6
          )
          RETURNING id::text, created_at
        `,
        [
          previousOwner.user_id,
          item.id,
          season,
          compensation,
          `steal-compensation:${item.id}:${timestamp.toISOString()}`,
          `Compensation for ${item.name}`,
        ],
      );

      const compensationLedger = compensationRows[0];

      if (!compensationLedger) {
        throw new Error('Steal compensation ledger entry was not created');
      }

      compensationLedgerId = compensationLedger.id;
      compensationLedgerCreatedAt = compensationLedger.created_at;
    }

    await client.query('COMMIT');

    return {
      itemId: item.id,
      season,
      priceDzp: price,
      newPriceDzp: newPrice,
      previousOwnerUserId: previousOwner?.user_id ?? null,
      previousOwnerUsername: previousOwner?.username ?? null,
      compensationDzp: compensation,
      purchaseLedgerId: purchaseLedger.id,
      purchaseLedgerCreatedAt: purchaseLedger.created_at,
      compensationLedgerId,
      compensationLedgerCreatedAt,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface ShopAdminItemRow {
  id: string;
  name: string;
  description: string;
  category: string;
  ownership_type: 'normal' | 'stealable';
  lifecycle: 'draft' | 'ready' | 'active' | 'retired';
  profile_slot: string | null;
  display_order: number;
  initial_price_dzp: number;
  current_price_dzp: number | null;

  asset_id: string | null;
  asset_url: string | null;
  asset_type: 'png' | 'webp' | 'gif' | 'apng' | 'svg' | null;
  asset_alt_text: string | null;
  asset_is_animated: boolean | null;

  owner_user_id: number | null;
  owner_username: string | null;
  owner_acquisition_price_dzp: number | null;
  owner_acquired_at_season: number | null;
  owner_acquired_at: string | null;

  transfer_count: number;
}

export async function listShopItemsAdmin(): Promise<ShopAdminItemRow[]> {
  const { rows } = await pool.query<ShopAdminItemRow>(
    `
      SELECT
        si.id,
        si.name,
        si.description,
        si.category,
        si.ownership_type,
        si.lifecycle,
        si.profile_slot,
        si.display_order,
        si.initial_price_dzp,
        si.current_price_dzp,

        asset.asset_id,
        asset.asset_url,
        asset.asset_type,
        asset.asset_alt_text,
        asset.asset_is_animated,
        asset.asset_frame_inner_diameter_ratio,

        owner.owner_user_id,
        owner.owner_username,
        owner.owner_acquisition_price_dzp,
        owner.owner_acquired_at_season,
        owner.owner_acquired_at,

        transfers.transfer_count
      FROM shop_items si

      LEFT JOIN LATERAL (
        SELECT
          sia.id::text AS asset_id,
          sia.url AS asset_url,
          sia.asset_type,
          sia.alt_text AS asset_alt_text,
          sia.is_animated AS asset_is_animated,
          sia.frame_inner_diameter_ratio AS asset_frame_inner_diameter_ratio
        FROM shop_item_assets sia
        WHERE sia.item_id = si.id
          AND sia.is_active = true
        ORDER BY sia.id DESC
        LIMIT 1
      ) asset ON true

      LEFT JOIN LATERAL (
        SELECT
          t.user_id AS owner_user_id,
          u.username AS owner_username,
          t.acquisition_price_dzp AS owner_acquisition_price_dzp,
          t.season AS owner_acquired_at_season,
          t.acquired_at AS owner_acquired_at
        FROM shop_item_transfers t
        JOIN users u ON u.id = t.user_id
        WHERE t.item_id = si.id
          AND t.lost_at IS NULL
        LIMIT 1
      ) owner ON true

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS transfer_count
        FROM shop_item_transfers t
        WHERE t.item_id = si.id
      ) transfers ON true

      ORDER BY si.display_order ASC, si.id ASC
    `,
  );

  return rows;
}

export async function getShopOwnershipHistory(
  itemId: string,
): Promise<ShopOwnershipHistoryRow[]> {
  const { rows } = await pool.query<ShopOwnershipHistoryRow>(
    `
      SELECT
        t.id::text AS id,
        t.item_id,
        t.user_id,
        u.username,
        t.acquisition_price_dzp,
        t.compensation_received_dzp,
        t.season,
        t.acquired_at,
        t.lost_at
      FROM shop_item_transfers t
      JOIN users u ON u.id = t.user_id
      WHERE t.item_id = $1
      ORDER BY t.acquired_at ASC, t.id ASC
    `,
    [itemId],
  );

  return rows;
}

export type ShopLedgerTransactionType =
  | 'challenge_reward'
  | 'challenge_reward_adjustment'
  | 'purchase'
  | 'steal_purchase'
  | 'steal_compensation'
  | 'refund'
  | 'admin_adjustment';

export interface DzpHistoryRow {
  id: string;
  season: number;
  amount_dzp: number;
  transaction_type: ShopLedgerTransactionType;
  description: string;
  created_at: Date;
  spendable: boolean;
}


export interface AdminDzpAdjustmentCommit {
  ledgerId: string;
  userId: number;
  amountDzp: number;
  season: number;
  description: string;
  createdBy: number;
  createdAt: string;
}

export async function addAdminDzpAdjustment(
  userId: number,
  amountDzp: number,
  description: string,
  adminUserId: number,
): Promise<AdminDzpAdjustmentCommit> {
  const seasonInfo = await getCurrentShopSeason();

  const { rows } = await pool.query<{
    id: string;
    season: number;
    created_at: string;
  }>(
    `
      INSERT INTO dzp_ledger (
        user_id,
        round_id,
        item_id,
        season,
        amount_dzp,
        transaction_type,
        reference_id,
        description,
        created_by
      )
      VALUES (
        $1,
        NULL,
        NULL,
        $2,
        $3,
        'admin_adjustment',
        $4,
        $5,
        $6
      )
      RETURNING
        id::text,
        season,
        created_at
    `,
    [
      userId,
      seasonInfo.season,
      amountDzp,
      `admin-adjustment:${crypto.randomUUID()}`,
      description,
      adminUserId,
    ],
  );

  const row = rows[0];

  if (!row) {
    throw new Error('DZP adjustment ledger entry was not created');
  }

  return {
    ledgerId: row.id,
    userId,
    amountDzp,
    season: row.season,
    description,
    createdBy: adminUserId,
    createdAt: row.created_at,
  };
}

export interface AdminShopItemUpdate {
  name: string;
  description: string;
  displayOrder: number;
  initialPriceDzp: number;
  currentPriceDzp: number | null;
}

export interface AdminShopItemDraftCreate {
  name: string;
  description: string;
  category: 'title' | 'badge' | 'frame' | 'username_decoration' | 'profile_decoration';
  ownershipType: 'normal' | 'stealable';
  displayOrder: number;
  initialPriceDzp: number;
}

/**
 * Creates an unpublishable Shop draft. Artwork and lifecycle transitions are
 * intentionally separate admin operations, so a new record can never appear
 * in the player Shop before its asset and activation validation are complete.
 */
export async function createShopItemDraft(
  input: AdminShopItemDraftCreate,
): Promise<{ id: string }> {
  const name = input.name.trim();
  const description = input.description.trim();

  if (name.length === 0 || name.length > 120) {
    throw new Error('Item name must be between 1 and 120 characters');
  }

  if (description.length === 0 || description.length > 2000) {
    throw new Error('Item description must be between 1 and 2000 characters');
  }

  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) {
    throw new Error('Display order must be a non-negative integer');
  }

  if (!Number.isInteger(input.initialPriceDzp) || input.initialPriceDzp <= 0) {
    throw new Error('Initial price must be a positive integer');
  }

  const profileSlot = input.category === 'profile_decoration'
    ? null
    : input.category;
  const id = `itm-${crypto.randomUUID()}`;

  await pool.query(
    `
      INSERT INTO shop_items (
        id,
        name,
        description,
        category,
        ownership_type,
        lifecycle,
        profile_slot,
        display_order,
        initial_price_dzp,
        current_price_dzp
      )
      VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9)
    `,
    [
      id,
      name,
      description,
      input.category,
      input.ownershipType,
      profileSlot,
      input.displayOrder,
      input.initialPriceDzp,
      input.ownershipType === 'stealable' ? input.initialPriceDzp : null,
    ],
  );

  return { id };
}

export type AdminShopItemLifecycle = 'draft' | 'ready' | 'active' | 'retired';

export interface ShopItemAssetRow {
  id: string;
  item_id: string;
  asset_type: 'png' | 'webp' | 'gif' | 'apng' | 'svg';
  url: string;
  alt_text: string;
  frame_inner_diameter_ratio: number | null;
  is_animated: boolean;
  is_active: boolean;
  created_at: string;
}
export async function getShopItemAssetsAdmin(
  itemId: string,
): Promise<ShopItemAssetRow[]> {
  const { rows } = await pool.query<ShopItemAssetRow>(
    `
      SELECT
  id::text AS id,
  item_id,
  asset_type,
  url,
  alt_text,
  frame_inner_diameter_ratio,
  is_animated,
  is_active,
  created_at
FROM shop_item_assets
      WHERE item_id = $1
      ORDER BY is_active DESC, created_at DESC, id DESC
    `,
    [itemId],
  );

  return rows;
}

export interface AdminShopItemAssetCreate {
  assetType: 'png' | 'webp' | 'gif' | 'apng' | 'svg';
  url: string;
  altText: string;
  frameInnerDiameterRatio: number | null;
  isAnimated: boolean;
  makeActive: boolean;
}

export async function createShopItemAssetAdmin(
  itemId: string,
  input: AdminShopItemAssetCreate,
): Promise<void> {
  const url = input.url.trim();
  const altText = input.altText.trim();
  const frameInnerDiameterRatio = input.frameInnerDiameterRatio;
if (
  frameInnerDiameterRatio !== null &&
  (!Number.isFinite(frameInnerDiameterRatio) ||
    frameInnerDiameterRatio <= 0 ||
    frameInnerDiameterRatio > 1)
) {
  throw new Error('Frame inner diameter ratio must be between 0 and 1');
}

  if (url.length === 0 || url.length > 2000) {
    throw new Error('Artwork URL must be between 1 and 2000 characters');
  }

  if (altText.length === 0 || altText.length > 500) {
    throw new Error('Artwork alt text must be between 1 and 500 characters');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const itemResult = await client.query(
      'SELECT id FROM shop_items WHERE id = $1 FOR UPDATE',
      [itemId],
    );

    if (itemResult.rowCount === 0) {
      throw new Error('Shop item not found');
    }

    if (input.makeActive) {
      await client.query(
        'UPDATE shop_item_assets SET is_active = false WHERE item_id = $1 AND is_active = true',
        [itemId],
      );
    }

    await client.query(
      `
        INSERT INTO shop_item_assets (
  item_id,
  asset_type,
  url,
  alt_text,
  frame_inner_diameter_ratio,
  is_animated,
  is_active
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
  itemId,
  input.assetType,
  url,
  altText,
  frameInnerDiameterRatio,
  input.isAnimated,
  input.makeActive,
],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setShopItemAssetActiveAdmin(
  itemId: string,
  assetId: string,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const itemResult = await client.query(
      'SELECT id FROM shop_items WHERE id = $1 FOR UPDATE',
      [itemId],
    );

    if (itemResult.rowCount === 0) {
      throw new Error('Shop item not found');
    }

    const assetResult = await client.query(
      'SELECT id FROM shop_item_assets WHERE id = $1 AND item_id = $2 FOR UPDATE',
      [assetId, itemId],
    );

    if (assetResult.rowCount === 0) {
      throw new Error('Shop artwork asset not found');
    }

    await client.query(
      'UPDATE shop_item_assets SET is_active = false WHERE item_id = $1 AND is_active = true',
      [itemId],
    );
    await client.query(
      'UPDATE shop_item_assets SET is_active = true WHERE id = $1 AND item_id = $2',
      [assetId, itemId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Advances an item through its one-way publishing lifecycle. Activation is
 * guarded here, rather than in the client, so no caller can expose an item
 * without a valid selected artwork asset.
 */
export async function updateShopItemLifecycleAdmin(
  itemId: string,
  target: AdminShopItemLifecycle,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const itemResult = await client.query<{
      lifecycle: AdminShopItemLifecycle;
    }>(
      `
        SELECT lifecycle
        FROM shop_items
        WHERE id = $1
        FOR UPDATE
      `,
      [itemId],
    );

    if (itemResult.rowCount === 0) {
      throw new Error('Shop item not found');
    }

    const current = itemResult.rows[0].lifecycle;
    const permitted =
      (current === 'draft' && (target === 'ready' || target === 'retired')) ||
      (current === 'ready' && (target === 'active' || target === 'retired')) ||
      (current === 'active' && target === 'retired');

    if (!permitted) {
      throw new Error(`Cannot change Shop item lifecycle from ${current} to ${target}`);
    }

    if (target === 'active') {
      const artworkResult = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM shop_item_assets
          WHERE item_id = $1
            AND is_active = true
            AND length(trim(url)) > 0
            AND length(trim(alt_text)) > 0
          LIMIT 1
        `,
        [itemId],
      );

      if (artworkResult.rowCount === 0) {
        throw new Error('An active Shop item requires active artwork with URL and alt text');
      }
    }

    await client.query(
      `
        UPDATE shop_items
        SET lifecycle = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [itemId, target],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Updates the editable administration fields for one Shop item.
 *
 * Ownership type, category, profile slot and lifecycle are deliberately not changed here.
 * Lifecycle and artwork have their own validation path, because activating an item has
 * stronger invariants than ordinary metadata edits.
 */
export async function updateShopItemAdmin(
  itemId: string,
  input: AdminShopItemUpdate,
): Promise<void> {
  const name = input.name.trim();
  const description = input.description.trim();

  if (name.length === 0) {
    throw new Error('Item name is required');
  }

  if (name.length > 120) {
    throw new Error('Item name must be 120 characters or fewer');
  }

  if (description.length > 2000) {
    throw new Error('Item description must be 2000 characters or fewer');
  }

  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) {
    throw new Error('Display order must be a non-negative integer');
  }

  if (!Number.isInteger(input.initialPriceDzp) || input.initialPriceDzp <= 0) {
    throw new Error('Initial price must be a positive integer');
  }

  if (
    input.currentPriceDzp !== null &&
    (!Number.isInteger(input.currentPriceDzp) || input.currentPriceDzp <= 0)
  ) {
    throw new Error('Current price must be a positive integer or null');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const itemResult = await client.query<{
      ownership_type: 'normal' | 'stealable';
      initial_price_dzp: number;
      current_price_dzp: number | null;
    }>(
      `
        SELECT ownership_type, initial_price_dzp, current_price_dzp
        FROM shop_items
        WHERE id = $1
        FOR UPDATE
      `,
      [itemId],
    );

    if (itemResult.rowCount === 0) {
      throw new Error('Shop item not found');
    }

    const item = itemResult.rows[0];

    if (item.ownership_type === 'normal') {
      if (input.currentPriceDzp !== null) {
        throw new Error('Normal items cannot have a current steal price');
      }
    } else {
      if (input.currentPriceDzp === null) {
        throw new Error('Stealable items require a current price');
      }

      if (input.currentPriceDzp < item.current_price_dzp!) {
        throw new Error('Stealable item price cannot decrease');
      }

      if (input.currentPriceDzp < input.initialPriceDzp) {
        throw new Error('Current price cannot be below the initial price');
      }

      const historyResult = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM shop_item_transfers
          WHERE item_id = $1
        `,
        [itemId],
      );

      const hasTransferHistory = Number(historyResult.rows[0].count) > 0;

      if (
        hasTransferHistory &&
        input.initialPriceDzp !== item.initial_price_dzp
      ) {
        throw new Error(
          'Initial price cannot change after a stealable item has transfer history',
        );
      }
    }

    await client.query(
      `
        UPDATE shop_items
        SET
          name = $2,
          description = $3,
          display_order = $4,
          initial_price_dzp = $5,
          current_price_dzp = $6
        WHERE id = $1
      `,
      [
        itemId,
        name,
        description,
        input.displayOrder,
        input.initialPriceDzp,
        input.currentPriceDzp,
      ],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getDzpHistoryForUser(
  userId: number,
  currentSeasonNumber: number,
): Promise<DzpHistoryRow[]> {
  const { rows } = await pool.query<DzpHistoryRow>(
    `
      SELECT
        id::text AS id,
        season,
        amount_dzp,
        transaction_type::text AS transaction_type,
        description,
        created_at,
        (season = $2) AS spendable
      FROM dzp_ledger
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [userId, currentSeasonNumber],
  );

  return rows;
}

export async function getCurrentShopSeason(): Promise<ShopSeasonRow> {
  const { rows } = await pool.query<{ round_number: number | null }>(
    `
      SELECT COALESCE(
        (
          SELECT round_number
          FROM rounds
          WHERE phase <> 'ended'
          ORDER BY round_number DESC
          LIMIT 1
        ),
        (
          SELECT MAX(round_number)
          FROM rounds
        )
      ) AS round_number
    `
  );

  const roundNumber = rows[0]?.round_number;

  if (roundNumber === null || roundNumber === undefined) {
    return {
      season: 1,
      label: 'Season 1',
      ends_at: null,
    };
  }

  const season = Math.ceil(roundNumber / SEASON_SIZE);
  const finalRoundNumber = season * SEASON_SIZE;

  const { rows: endRows } = await pool.query<{ challenge_ends_at: string | null }>(
    `
      SELECT challenge_ends_at
      FROM rounds
      WHERE round_number = $1
      LIMIT 1
    `,
    [finalRoundNumber]
  );

  return {
    season,
    label: `Season ${season}`,
    ends_at: endRows[0]?.challenge_ends_at ?? null,
  };
}

export async function getShopItems(): Promise<ShopItemRow[]> {
  const { rows } = await pool.query<ShopItemRow>(
    `
      SELECT
        si.id,
        si.name,
        si.description,
        si.category,
        si.ownership_type,
        si.lifecycle,
        si.profile_slot,
        si.display_order,
        si.initial_price_dzp,
        si.current_price_dzp,

        asset.asset_id,
        asset.asset_url,
        asset.asset_type,
        asset.asset_alt_text,
        asset.asset_is_animated,
        asset.asset_frame_inner_diameter_ratio,

        owner.owner_user_id,
        owner.owner_username,
        owner.owner_acquisition_price_dzp,
        owner.owner_acquired_at_season,
        owner.owner_acquired_at,

        transfers.transfer_count
      FROM shop_items si

      LEFT JOIN LATERAL (
        SELECT
          sia.id::text AS asset_id,
          sia.url AS asset_url,
          sia.asset_type,
          sia.alt_text AS asset_alt_text,
          sia.is_animated AS asset_is_animated,
          sia.frame_inner_diameter_ratio AS asset_frame_inner_diameter_ratio
        FROM shop_item_assets sia
        WHERE sia.item_id = si.id
          AND sia.is_active = true
        ORDER BY sia.id DESC
        LIMIT 1
      ) asset ON true

      LEFT JOIN LATERAL (
        SELECT
          t.user_id AS owner_user_id,
          u.username AS owner_username,
          t.acquisition_price_dzp AS owner_acquisition_price_dzp,
          t.season AS owner_acquired_at_season,
          t.acquired_at AS owner_acquired_at
        FROM shop_item_transfers t
        JOIN users u ON u.id = t.user_id
        WHERE t.item_id = si.id
          AND t.lost_at IS NULL
        LIMIT 1
      ) owner ON true

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS transfer_count
        FROM shop_item_transfers t
        WHERE t.item_id = si.id
      ) transfers ON true

      WHERE si.lifecycle = 'active'
        AND asset.asset_id IS NOT NULL

      ORDER BY si.display_order ASC, si.id ASC
    `
  );

  return rows;
}

export async function getShopViewer(
  userId: number,
  season: number
): Promise<ShopViewerRow | null> {
  const { rows } = await pool.query<ShopViewerRow>(
    `
      SELECT
        u.id AS user_id,
        u.username,
        COALESCE(
          (
            SELECT SUM(l.amount_dzp)
            FROM dzp_ledger l
            WHERE l.user_id = u.id
              AND l.season = $2
          ),
          0
        )::int AS balance_dzp
      FROM users u
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId, season]
  );

  return rows[0] ?? null;
}

export async function getOwnedShopItemIds(userId: number): Promise<string[]> {
  const { rows } = await pool.query<{ item_id: string }>(
    `
      SELECT item_id::text AS item_id
      FROM user_shop_items
      WHERE user_id = $1

      UNION

      SELECT item_id::text AS item_id
      FROM shop_item_transfers
      WHERE user_id = $1
        AND lost_at IS NULL

      ORDER BY item_id ASC
    `,
    [userId]
  );

  return rows.map((row) => row.item_id);
}

export type ShopProfileSlot = 'title' | 'frame' | 'badge' | 'username_decoration';

export interface ShopProfileItemRow {
  profile_slot: ShopProfileSlot;
  id: string;
  name: string;
  artwork_url: string;
  artwork_alt_text: string;
  artwork_asset_type: 'png' | 'webp' | 'gif' | 'apng' | 'svg';
  artwork_is_animated: boolean;
  artwork_frame_inner_diameter_ratio: number | null;
 }

/** Public, equipped-only profile presentation. Ownership is rechecked in the
 * query so a title disappears as soon as it is stolen, even before cleanup. */
export async function getShopProfileForUser(userId: number): Promise<ShopProfileItemRow[]> {
  const { rows } = await pool.query<ShopProfileItemRow>(
    `
      SELECT
        equipment.profile_slot,
        item.id,
        item.name,
        artwork.url AS artwork_url,
        artwork.alt_text AS artwork_alt_text,
        artwork.asset_type AS artwork_asset_type,
        artwork.is_animated AS artwork_is_animated,
        artwork.frame_inner_diameter_ratio AS artwork_frame_inner_diameter_ratio
      FROM user_shop_profile_equipment equipment
      JOIN shop_items item ON item.id = equipment.item_id
      JOIN LATERAL (
        SELECT url, alt_text, asset_type, is_animated, frame_inner_diameter_ratio
        FROM shop_item_assets
        WHERE item_id = item.id AND is_active = true
        LIMIT 1
      ) artwork ON true
      WHERE equipment.user_id = $1
        AND (
          EXISTS (
            SELECT 1
            FROM user_shop_items ownership
            WHERE ownership.item_id = item.id AND ownership.user_id = equipment.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM shop_item_transfers transfer
            WHERE transfer.item_id = item.id
              AND transfer.user_id = equipment.user_id
              AND transfer.lost_at IS NULL
          )
        )
      ORDER BY equipment.profile_slot
    `,
    [userId],
  );

  return rows;
}

/** Sets or clears an equipped profile item. Item ownership and slot compatibility
 * are verified under the Shop-item lock shared with steal transactions. */
export async function setShopProfileItem(
  userId: number,
  profileSlot: ShopProfileSlot,
  itemId: string | null,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (itemId === null) {
      await client.query(
        'DELETE FROM user_shop_profile_equipment WHERE user_id = $1 AND profile_slot = $2',
        [userId, profileSlot],
      );
      await client.query('COMMIT');
      return;
    }

    const itemResult = await client.query<{
      profile_slot: ShopProfileSlot | null;
    }>(
      'SELECT profile_slot FROM shop_items WHERE id = $1 FOR UPDATE',
      [itemId],
    );

    if (itemResult.rowCount === 0) {
      throw new Error('Shop item not found');
    }

    if (itemResult.rows[0].profile_slot !== profileSlot) {
      throw new Error('Shop item does not belong in this profile slot');
    }

    const ownershipResult = await client.query<{ owned: boolean }>(
      `
        SELECT (
          EXISTS (
            SELECT 1 FROM user_shop_items
            WHERE item_id = $1 AND user_id = $2
          )
          OR EXISTS (
            SELECT 1 FROM shop_item_transfers
            WHERE item_id = $1 AND user_id = $2 AND lost_at IS NULL
          )
        ) AS owned
      `,
      [itemId, userId],
    );

    if (!ownershipResult.rows[0]?.owned) {
      throw new Error('You do not currently own this Shop item');
    }

    const artworkResult = await client.query(
      'SELECT id FROM shop_item_assets WHERE item_id = $1 AND is_active = true LIMIT 1',
      [itemId],
    );

    if (artworkResult.rowCount === 0) {
      throw new Error('Shop item needs active artwork before it can appear on a profile');
    }

    await client.query(
      `
        INSERT INTO user_shop_profile_equipment (user_id, profile_slot, item_id, equipped_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (user_id, profile_slot)
        DO UPDATE SET item_id = EXCLUDED.item_id, equipped_at = EXCLUDED.equipped_at
      `,
      [userId, profileSlot, itemId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface ShopPurchaseCommit {
  itemId: string;
  season: number;
  priceDzp: number;
  ledgerId: string;
  ledgerCreatedAt: string;
}

export async function getShopItem(itemId: string): Promise<ShopItemRow | null> {
  const { rows } = await pool.query<ShopItemRow>(
    `
      SELECT
        si.id,
        si.name,
        si.description,
        si.category,
        si.ownership_type,
        si.lifecycle,
        si.profile_slot,
        si.display_order,
        si.initial_price_dzp,
        si.current_price_dzp,

        asset.asset_id,
        asset.asset_url,
        asset.asset_type,
        asset.asset_alt_text,
        asset.asset_is_animated,

        owner.owner_user_id,
        owner.owner_username,
        owner.owner_acquisition_price_dzp,
        owner.owner_acquired_at_season,
        owner.owner_acquired_at,

        transfers.transfer_count
      FROM shop_items si

      LEFT JOIN LATERAL (
        SELECT
          sia.id::text AS asset_id,
          sia.url AS asset_url,
          sia.asset_type,
          sia.alt_text AS asset_alt_text,
          sia.is_animated AS asset_is_animated,
          sia.frame_inner_diameter_ratio AS asset_frame_inner_diameter_ratio
        FROM shop_item_assets sia
        WHERE sia.item_id = si.id
          AND sia.is_active = true
        ORDER BY sia.id DESC
        LIMIT 1
      ) asset ON true

      LEFT JOIN LATERAL (
        SELECT
          t.user_id AS owner_user_id,
          u.username AS owner_username,
          t.acquisition_price_dzp AS owner_acquisition_price_dzp,
          t.season AS owner_acquired_at_season,
          t.acquired_at AS owner_acquired_at
        FROM shop_item_transfers t
        JOIN users u ON u.id = t.user_id
        WHERE t.item_id = si.id
          AND t.lost_at IS NULL
        LIMIT 1
      ) owner ON true

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS transfer_count
        FROM shop_item_transfers t
        WHERE t.item_id = si.id
      ) transfers ON true

      WHERE si.id = $1
      LIMIT 1
    `,
    [itemId],
  );

  return rows[0] ?? null;
}

export async function purchaseShopItem(
  userId: number,
  itemId: string,
): Promise<ShopPurchaseCommit> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the item so two simultaneous purchases cannot both observe the
    // same available state and spend against it.
    const { rows: itemRows } = await client.query<{
      id: string;
      name: string;
      ownership_type: 'normal' | 'stealable';
      lifecycle: 'draft' | 'ready' | 'active' | 'retired';
      initial_price_dzp: number;
    }>(
      `
        SELECT
          id,
          name,
          ownership_type,
          lifecycle,
          initial_price_dzp
        FROM shop_items
        WHERE id = $1
        FOR UPDATE
      `,
      [itemId],
    );

    const item = itemRows[0];

    if (!item) {
      await client.query('ROLLBACK');
      const error = new Error('Item not found');
      error.name = 'ITEM_NOT_FOUND';
      throw error;
    }

    if (item.lifecycle !== 'active') {
      await client.query('ROLLBACK');
      const error = new Error('Item is not available');
      error.name = 'ITEM_UNAVAILABLE';
      throw error;
    }

    if (item.ownership_type !== 'normal') {
      await client.query('ROLLBACK');
      const error = new Error('This item must be acquired through the steal flow');
      error.name = 'NOT_PURCHASABLE';
      throw error;
    }

    // Permanent normal ownership.
    const { rows: ownedRows } = await client.query<{ id: number }>(
      `
        SELECT id
        FROM user_shop_items
        WHERE item_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [item.id, userId],
    );

    if (ownedRows.length > 0) {
      await client.query('ROLLBACK');
      const error = new Error('You already own this item');
      error.name = 'ALREADY_OWNED';
      throw error;
    }

    // The current season is derived from the platform's rounds. The client
    // never supplies it.
    const { rows: seasonRows } = await client.query<{
      round_number: number | null;
    }>(
      `
        SELECT COALESCE(
          (
            SELECT round_number
            FROM rounds
            WHERE phase <> 'ended'
            ORDER BY round_number DESC
            LIMIT 1
          ),
          (
            SELECT MAX(round_number)
            FROM rounds
          )
        ) AS round_number
      `,
    );

    const roundNumber = seasonRows[0]?.round_number ?? null;
    const season =
      roundNumber === null ? 1 : Math.ceil(roundNumber / SEASON_SIZE);

    const { rows: balanceRows } = await client.query<{
      balance_dzp: number;
    }>(
      `
        SELECT COALESCE(SUM(amount_dzp), 0)::int AS balance_dzp
        FROM dzp_ledger
        WHERE user_id = $1
          AND season = $2
      `,
      [userId, season],
    );

    const balance = balanceRows[0]?.balance_dzp ?? 0;
    const price = item.initial_price_dzp;

    if (balance < price) {
      await client.query('ROLLBACK');
      const error = new Error('Insufficient DZP');
      error.name = 'INSUFFICIENT_FUNDS';
      throw error;
    }

    const { rows: ownershipRows } = await client.query<{
      id: number;
    }>(
      `
        INSERT INTO user_shop_items (
          item_id,
          user_id,
          acquisition_price_dzp,
          acquired_at_season
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [item.id, userId, price, season],
    );

    if (ownershipRows.length !== 1) {
      throw new Error('Shop ownership was not recorded');
    }

    const { rows: ledgerRows } = await client.query<{
      id: string;
      created_at: string;
    }>(
      `
        INSERT INTO dzp_ledger (
          user_id,
          round_id,
          item_id,
          season,
          amount_dzp,
          transaction_type,
          reference_id,
          description
        )
        VALUES (
          $1,
          NULL,
          $2,
          $3,
          $4,
          'purchase',
          $5,
          $6
        )
        RETURNING id::text, created_at
      `,
      [
        userId,
        item.id,
        season,
        -price,
        `purchase:${item.id}:${userId}`,
        `Purchased ${item.name}`,
      ],
    );

    const ledger = ledgerRows[0];

    if (!ledger) {
      throw new Error('Shop ledger entry was not recorded');
    }

    await client.query('COMMIT');

    return {
      itemId: item.id,
      season,
      priceDzp: price,
      ledgerId: ledger.id,
      ledgerCreatedAt: ledger.created_at,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
