import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requestJson } from '../http.js';

const mocks = vi.hoisted(() => ({
  createDuelForUser: vi.fn(),
  acceptDuelForUser: vi.fn(),
  uploadReplay: vi.fn(),
}));

vi.mock(import('../../src/middleware/auth.js'), () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 42, osu_id: '4242', is_admin: false };
    next();
  },
  optionalAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 42, osu_id: '4242', is_admin: false };
    next();
  },
}));

vi.mock(import('../../src/services/duels.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createDuelForUser: mocks.createDuelForUser,
    acceptDuelForUser: mocks.acceptDuelForUser,
    uploadReplay: mocks.uploadReplay,
  };
});

vi.mock(import('../../src/services/replay.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, runReplayUpload: (_req: any, _res: any, next: any) => next() };
});

import duelsRouter from '../../src/routes/duels.js';

function appForDuels() {
  const app = express();
  app.use(express.json());
  app.use('/api/duels', duelsRouter);
  return app;
}

describe('duel route/service boundary', () => {
  it('creates a duel only after route validation and passes normalized values to the service', async () => {
    mocks.createDuelForUser.mockResolvedValueOnce(17);
    const response = await requestJson(appForDuels(), 'POST', '/api/duels', {
      difficultyId: 5606522,
      stake: 10,
      mods: 'fm',
      requirement: 'Best Accuracy',
    });
    expect(response.status).toBe(201);
    expect(response.json).toEqual({ id: 17 });
    expect(mocks.createDuelForUser).toHaveBeenCalledWith(42, {
      difficultyId: 5606522,
      stake: 10,
      mods: 'FM',
      requirement: 'Best Accuracy',
    });
  });

  it('maps an acceptance service refusal to the documented HTTP response', async () => {
    const error = new Error('INSUFFICIENT_FUNDS');
    mocks.acceptDuelForUser.mockRejectedValueOnce(error);
    const response = await requestJson(appForDuels(), 'POST', '/api/duels/17/accept');
    expect(response.status).toBe(402);
    expect(response.json).toEqual({ error: 'Insufficient Duel DZPP' });
  });

  it('rejects a replay upload request without a replay file before the service call', async () => {
    const response = await requestJson(appForDuels(), 'POST', '/api/duels/17/replay', {});
    expect(response.status).toBe(400);
    expect(response.json).toEqual({ error: 'Replay file is required' });
    expect(mocks.uploadReplay).not.toHaveBeenCalled();
  });
});
