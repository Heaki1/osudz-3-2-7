import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requestJson } from '../http.js';

const mocks = vi.hoisted(() => ({
  purchaseShopItem: vi.fn(),
  setShopProfileItem: vi.fn(),
  getCurrentShopSeason: vi.fn(),
  getShopItems: vi.fn(),
  getShopViewer: vi.fn(),
  getShopProfileForUser: vi.fn(),
}));

vi.mock(import('../../src/middleware/auth.js'), () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 42, osu_id: '4242', is_admin: false };
    next();
  },
  optionalAuth: (req: any, _res: any, next: any) => next(),
}));

vi.mock(import('../../src/repos/shop.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    purchaseShopItem: mocks.purchaseShopItem,
    setShopProfileItem: mocks.setShopProfileItem,
    getCurrentShopSeason: mocks.getCurrentShopSeason,
    getShopItems: mocks.getShopItems,
    getShopViewer: mocks.getShopViewer,
    getShopProfileForUser: mocks.getShopProfileForUser,
  };
});

import shopRouter from '../../src/routes/shop.js';

function appForShop() {
  const app = express();
  app.use(express.json());
  app.use('/api/shop', shopRouter);
  return app;
}

describe('shop route/service boundary', () => {
  it('rejects malformed purchase input without entering the purchase service', async () => {
    const response = await requestJson(appForShop(), 'POST', '/api/shop/purchase', { itemId: '' });
    expect(response.status).toBe(400);
    expect(response.json).toEqual({ error: 'A valid itemId is required' });
    expect(mocks.purchaseShopItem).not.toHaveBeenCalled();
  });

  it('returns the committed purchase state supplied by the repository', async () => {
    mocks.purchaseShopItem.mockResolvedValueOnce({
      itemId: 'itm-1', season: 2, priceDzp: 50, ledgerId: 'ledger-1', ledgerCreatedAt: '2026-09-27T00:00:00.000Z',
    });
    mocks.getCurrentShopSeason.mockResolvedValueOnce({ season: 2, label: 'Season 2', ends_at: null });
    mocks.getShopViewer.mockResolvedValueOnce({ user_id: 42, username: 'Heaki', balance_dzp: 75 });
    mocks.getShopItems.mockResolvedValueOnce([{
      id: 'itm-1', name: 'Title', description: 'Test', category: 'title', ownership_type: 'normal',
      lifecycle: 'active', profile_slot: 'title', display_order: 1, initial_price_dzp: 50, current_price_dzp: null,
      asset_id: 'asset-1', asset_url: '/x.png', asset_type: 'png', asset_alt_text: 'x', asset_is_animated: false,
      asset_frame_inner_diameter_ratio: null, owner_user_id: null, owner_username: null,
      owner_acquisition_price_dzp: null, owner_acquired_at_season: null, owner_acquired_at: null, transfer_count: 0,
    }]);

    const response = await requestJson(appForShop(), 'POST', '/api/shop/purchase', { itemId: 'itm-1' });
    expect(response.status).toBe(200);
    expect(response.json.paidDzp).toBe(50);
    expect(response.json.viewer.balanceDzp).toBe(75);
    expect(mocks.purchaseShopItem).toHaveBeenCalledWith(42, 'itm-1');
  });

  it('rejects an invalid equipment slot at the route boundary', async () => {
    const response = await requestJson(appForShop(), 'PUT', '/api/shop/profile/not-a-slot', { itemId: 'itm-1' });
    expect(response.status).toBe(400);
    expect(response.json).toEqual({ error: 'Invalid profile equipment request' });
    expect(mocks.setShopProfileItem).not.toHaveBeenCalled();
  });
});
