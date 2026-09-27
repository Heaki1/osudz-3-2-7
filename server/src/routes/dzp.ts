// DZP history API.
//
// GET /api/dzp/history
// Authenticated user's complete ledger history. Closed-season entries remain
// visible but are marked non-spendable.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getCurrentShopSeason,
  getDzpHistoryForUser,
} from '../repo/shop.js';

const router = Router();

router.get('/history', requireAuth, async (req, res) => {
  try {
    const season = await getCurrentShopSeason();
    const rows = await getDzpHistoryForUser(
      req.user!.id,
      season.season,
    );

    res.json(
      rows.map((row) => ({
        id: row.id,
        season: row.season,
        amountDzp: row.amount_dzp,
        transactionType: row.transaction_type,
        description: row.description,
        createdAt: row.created_at.toISOString(),
        spendable: row.spendable,
      })),
    );
  } catch (err) {
    console.error(
      '[dzp] history failed:',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    res.status(503).json({ error: 'DZP history unavailable' });
  }
});

export default router;
