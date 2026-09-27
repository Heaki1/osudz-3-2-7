// Shop API.
//
// GET  /api/shop
// POST /api/shop/purchase

import { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  getCurrentShopSeason,
  getOwnedShopItemIds,
  getShopItem,
  getShopItems,
  getShopOwnershipHistory,
  getShopProfileForUser,
  getShopViewer,
  purchaseShopItem,
  setShopProfileItem,
  stealShopItem,
} from '../repo/shop.js';

const router = Router();

function frameRatio(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const season = await getCurrentShopSeason();

    const [rows, viewerRow] = await Promise.all([
      getShopItems(),
      req.user ? getShopViewer(req.user.id, season.season) : Promise.resolve(null),
    ]);

    const ownedItemIds = req.user
      ? await getOwnedShopItemIds(req.user.id)
      : [];

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      ownershipType: row.ownership_type,
      lifecycle: row.lifecycle,
      profileSlot: row.profile_slot,
      displayOrder: row.display_order,
      artwork: {
  assetId: row.asset_id,
  url: row.asset_url,
  assetType: row.asset_type,
  altText: row.asset_alt_text,
  isAnimated: row.asset_is_animated,
  frameInnerDiameterRatio: frameRatio(row.asset_frame_inner_diameter_ratio),
},
      initialPriceDzp: row.initial_price_dzp,
      currentPriceDzp: row.current_price_dzp,
      currentOwner:
        row.owner_user_id === null
          ? null
          : {
              userId: String(row.owner_user_id),
              username: row.owner_username ?? '',
              acquisitionPriceDzp: row.owner_acquisition_price_dzp ?? 0,
              acquiredAtSeason: row.owner_acquired_at_season ?? season.season,
              acquiredAt: row.owner_acquired_at ?? '',
            },
      transferCount: row.transfer_count,
    }));

    res.json({
      season: {
        season: season.season,
        label: season.label,
        endsAt: season.ends_at,
      },
      viewer: viewerRow
        ? {
            userId: String(viewerRow.user_id),
            username: viewerRow.username,
            balanceDzp: viewerRow.balance_dzp,
          }
        : null,
      items,
      ownedItemIds,
    });
  } catch (err) {
    console.error(
      '[shop] snapshot failed:',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    res.status(503).json({ error: 'Shop data unavailable' });
  }
});

function profileJson(rows: Awaited<ReturnType<typeof getShopProfileForUser>>) {
  return rows.map((row) => ({
    profileSlot: row.profile_slot,
    itemId: row.id,
    name: row.name,
    artwork: {
  url: row.artwork_url,
  altText: row.artwork_alt_text,
  assetType: row.artwork_asset_type,
  isAnimated: row.artwork_is_animated,
  frameInnerDiameterRatio: frameRatio(row.artwork_frame_inner_diameter_ratio),
},
  }));
}

// The caller's editable profile equipment.
router.get('/profile', requireAuth, async (req, res) => {
  try {
    res.json({ equipped: profileJson(await getShopProfileForUser(req.user!.id)) });
  } catch (err) {
    console.error('[shop] profile equipment read failed:', err);
    res.status(503).json({ error: 'Profile equipment unavailable' });
  }
});

// Public profile decorations, used by ranking detail pages.
router.get('/profile/:userId', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json({ error: 'A valid userId is required' });
    return;
  }

  try {
    res.json({ equipped: profileJson(await getShopProfileForUser(userId)) });
  } catch (err) {
    console.error('[shop] public profile equipment read failed:', err);
    res.status(503).json({ error: 'Profile equipment unavailable' });
  }
});

router.put('/profile/:profileSlot', requireAuth, async (req, res) => {
  const { profileSlot } = req.params;
  const itemId = req.body?.itemId;
  const validSlot =
    profileSlot === 'title' ||
    profileSlot === 'frame' ||
    profileSlot === 'badge' ||
    profileSlot === 'username_decoration';

  if (!validSlot || (itemId !== null && typeof itemId !== 'string')) {
    res.status(400).json({ error: 'Invalid profile equipment request' });
    return;
  }

  try {
    await setShopProfileItem(req.user!.id, profileSlot, itemId);
    res.json({ equipped: profileJson(await getShopProfileForUser(req.user!.id)) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile equipment update failed';
    res.status(409).json({ error: message });
  }
});

router.get('/items/:itemId', async (req, res) => {
  const itemId = req.params.itemId;

  if (!itemId) {
    res.status(400).json({ error: 'A valid itemId is required' });
    return;
  }

  try {
    const row = await getShopItem(itemId);

    if (!row) {
      res.status(404).json({ error: 'Shop item not found' });
      return;
    }

    res.json({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      ownershipType: row.ownership_type,
      lifecycle: row.lifecycle,
      profileSlot: row.profile_slot,
      displayOrder: row.display_order,
      artwork:
  row.asset_id === null
    ? null
    : {
        assetId: row.asset_id,
        url: row.asset_url,
        assetType: row.asset_type,
        altText: row.asset_alt_text,
        isAnimated: row.asset_is_animated,
        frameInnerDiameterRatio: frameRatio(row.asset_frame_inner_diameter_ratio),
      },
      initialPriceDzp: row.initial_price_dzp,
      currentPriceDzp: row.current_price_dzp,
      currentOwner:
        row.owner_user_id === null
          ? null
          : {
              userId: String(row.owner_user_id),
              username: row.owner_username ?? '',
              acquisitionPriceDzp: row.owner_acquisition_price_dzp ?? 0,
              acquiredAtSeason: row.owner_acquired_at_season ?? 1,
              acquiredAt: row.owner_acquired_at ?? '',
            },
      transferCount: row.transfer_count,
    });
  } catch (err) {
    console.error(
      '[shop] item read failed:',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    res.status(503).json({ error: 'Shop item unavailable' });
  }
});

router.get('/items/:itemId/history', async (req, res) => {
  const itemId = req.params.itemId;

  if (!itemId) {
    res.status(400).json({ error: 'A valid itemId is required' });
    return;
  }

  try {
    const rows = await getShopOwnershipHistory(itemId);

    res.json(
      rows.map((row) => ({
        id: row.id,
        itemId: row.item_id,
        userId: String(row.user_id),
        username: row.username,
        acquisitionPriceDzp: row.acquisition_price_dzp,
        compensationReceivedDzp: row.compensation_received_dzp,
        season: row.season,
        acquiredAt: row.acquired_at.toISOString(),
        lostAt: row.lost_at?.toISOString() ?? null,
      })),
    );
  } catch (err) {
    console.error(
      '[shop] ownership history failed:',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    res.status(503).json({ error: 'Ownership history unavailable' });
  }
});

router.post('/purchase', requireAuth, async (req, res) => {
  const itemId = req.body?.itemId;

  if (typeof itemId !== 'string' || itemId.trim() === '') {
    res.status(400).json({ error: 'A valid itemId is required' });
    return;
  }

  try {
    const result = await purchaseShopItem(req.user!.id, itemId);

    const season = await getCurrentShopSeason();
    const [rows, viewerRow] = await Promise.all([
      getShopItems(),
      getShopViewer(req.user!.id, season.season),
    ]);

    const item = rows.find((row) => row.id === result.itemId);

    if (!item || !viewerRow) {
      res.status(503).json({ error: 'Purchase completed but Shop state could not be read' });
      return;
    }

    res.json({
      item: {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        ownershipType: item.ownership_type,
        lifecycle: item.lifecycle,
        profileSlot: item.profile_slot,
        displayOrder: item.display_order,
        artwork: {
  assetId: item.asset_id,
  url: item.asset_url,
  assetType: item.asset_type,
  altText: item.asset_alt_text,
  isAnimated: item.asset_is_animated,
  frameInnerDiameterRatio: frameRatio(item.asset_frame_inner_diameter_ratio),
},
        initialPriceDzp: item.initial_price_dzp,
        currentPriceDzp: item.current_price_dzp,
        currentOwner: null,
        transferCount: item.transfer_count,
      },
      viewer: {
        userId: String(viewerRow.user_id),
        username: viewerRow.username,
        balanceDzp: viewerRow.balance_dzp,
      },
      paidDzp: result.priceDzp,
      ledgerEntries: [
        {
          id: result.ledgerId,
          season: result.season,
          amountDzp: -result.priceDzp,
          transactionType: 'purchase',
          description: `Purchased ${item.name}`,
          createdAt: result.ledgerCreatedAt,
          spendable: true,
        },
      ],
      previousOwner: null,
    });
  } catch (err) {
    const code = err instanceof Error ? err.name : '';

    if (code === 'ITEM_NOT_FOUND') {
      res.status(404).json({ error: 'Shop item not found' });
      return;
    }

    if (code === 'ITEM_UNAVAILABLE') {
      res.status(409).json({ error: 'Shop item is not available' });
      return;
    }

    if (code === 'NOT_PURCHASABLE') {
      res.status(400).json({ error: 'This item is not purchasable' });
      return;
    }

    if (code === 'ALREADY_OWNED') {
      res.status(409).json({ error: 'You already own this item' });
      return;
    }

    if (code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: 'Insufficient DZP' });
      return;
    }

    console.error(
      '[shop] purchase failed:',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    res.status(503).json({ error: 'Purchase could not be completed' });
  }
});

router.post('/steal', requireAuth, async (req, res) => {
  const itemId = req.body?.itemId;

  if (typeof itemId !== 'string' || itemId.trim() === '') {
    res.status(400).json({ error: 'A valid itemId is required' });
    return;
  }

  try {
    const result = await stealShopItem(req.user!.id, itemId);

    const season = await getCurrentShopSeason();
    const [rows, viewerRow] = await Promise.all([
      getShopItems(),
      getShopViewer(req.user!.id, season.season),
    ]);

    const item = rows.find((row) => row.id === result.itemId);

    if (!item || !viewerRow) {
      res.status(503).json({
        error: 'Steal completed but Shop state could not be read',
      });
      return;
    }

    res.json({
      item: {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        ownershipType: item.ownership_type,
        lifecycle: item.lifecycle,
        profileSlot: item.profile_slot,
        displayOrder: item.display_order,
        artwork: {
  assetId: item.asset_id,
  url: item.asset_url,
  assetType: item.asset_type,
  altText: item.asset_alt_text,
  isAnimated: item.asset_is_animated,
  frameInnerDiameterRatio: frameRatio(item.asset_frame_inner_diameter_ratio),
},
        initialPriceDzp: item.initial_price_dzp,
        currentPriceDzp: item.current_price_dzp,
        currentOwner:
          item.owner_user_id === null
            ? null
            : {
                userId: String(item.owner_user_id),
                username: item.owner_username ?? '',
                acquisitionPriceDzp: item.owner_acquisition_price_dzp ?? 0,
                acquiredAtSeason: item.owner_acquired_at_season ?? season.season,
                acquiredAt: item.owner_acquired_at ?? '',
              },
        transferCount: item.transfer_count,
      },
      viewer: {
        userId: String(viewerRow.user_id),
        username: viewerRow.username,
        balanceDzp: viewerRow.balance_dzp,
      },
      paidDzp: result.priceDzp,
      ledgerEntries: [
        {
          id: result.purchaseLedgerId,
          season: result.season,
          amountDzp: -result.priceDzp,
          transactionType: 'steal_purchase',
          description: `Acquired ${item.name} for ${result.priceDzp} DZP`,
          createdAt: result.purchaseLedgerCreatedAt,
          spendable: true,
        },
      ],
      previousOwner:
        result.previousOwnerUserId === null ||
        result.previousOwnerUsername === null
          ? null
          : {
              username: result.previousOwnerUsername,
              compensationDzp: result.compensationDzp,
            },
    });
  } catch (err) {
    const code = err instanceof Error ? err.name : '';

    if (code === 'ITEM_NOT_FOUND') {
      res.status(404).json({ error: 'Shop item not found' });
      return;
    }

    if (code === 'ITEM_UNAVAILABLE') {
      res.status(409).json({ error: 'Shop item is not available' });
      return;
    }

    if (code === 'NOT_STEALABLE') {
      res.status(400).json({ error: 'This item is not stealable' });
      return;
    }

    if (code === 'ALREADY_OWNED') {
      res.status(409).json({ error: 'You already own this item' });
      return;
    }

    if (code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: 'Insufficient DZP' });
      return;
    }

    console.error(
      '[shop] steal failed:',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    res.status(503).json({ error: 'Steal could not be completed' });
  }
});

export default router;
