import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../http.js';

const mocks = vi.hoisted(() => ({
  claims: null as { osuId: number; epoch: number } | null,
  user: null as { osu_id: string; session_epoch: number; is_admin: boolean } | null,
}));

vi.mock(import('../../src/session.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readSessionClaims: vi.fn(() => mocks.claims) };
});

vi.mock(import('../../src/repos/users.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, findByOsuId: vi.fn(async () => mocks.user) };
});

import { requireAdmin } from '../../src/middleware/auth.js';

function appForAdmin() {
  const app = express();
  app.get('/admin-only', requireAdmin, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('authentication and role authorization boundary', () => {
  beforeEach(() => {
    mocks.claims = null;
    mocks.user = null;
  });

  it('rejects an unauthenticated request before the protected handler', async () => {
    const response = await requestJson(appForAdmin(), 'GET', '/admin-only');
    expect(response.status).toBe(401);
    expect(response.json).toEqual({ error: 'Not authenticated' });
  });

  it('rejects an authenticated non-admin with 403', async () => {
    mocks.claims = { osuId: 100, epoch: 3 };
    mocks.user = { osu_id: '100', session_epoch: 3, is_admin: false };
    const response = await requestJson(appForAdmin(), 'GET', '/admin-only');
    expect(response.status).toBe(403);
    expect(response.json).toEqual({ error: 'Admin access required' });
  });

  it('allows an authenticated admin through the role boundary', async () => {
    mocks.claims = { osuId: 100, epoch: 3 };
    mocks.user = { osu_id: '100', session_epoch: 3, is_admin: true };
    const response = await requestJson(appForAdmin(), 'GET', '/admin-only');
    expect(response.status).toBe(200);
    expect(response.json).toEqual({ ok: true });
  });
});
