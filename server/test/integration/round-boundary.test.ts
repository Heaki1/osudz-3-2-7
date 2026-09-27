import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requestJson } from '../http.js';
import { scoreRound } from '../../src/domain/dzpp/qualification.js';
import type { DzppRoundPlay } from '../../src/domain/dzpp/formula.js';

const mocks = vi.hoisted(() => ({
  findCurrent: vi.fn(),
  canTransition: vi.fn(),
  setPhase: vi.fn(),
  freezeEndedRound: vi.fn(),
  toApiRound: vi.fn(),
}));

vi.mock(import('../../src/middleware/auth.js'), () => ({
  requireAdmin: (req: any, _res: any, next: any) => {
    req.user = { id: 1, osu_id: '1', is_admin: true };
    next();
  },
}));

vi.mock(import('../../src/repos/rounds.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findCurrent: mocks.findCurrent,
    canTransition: mocks.canTransition,
    setPhase: mocks.setPhase,
    toApiRound: mocks.toApiRound,
  };
});

vi.mock(import('../../src/repos/dzpp.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, freezeEndedRound: mocks.freezeEndedRound };
});

vi.mock(import('../../src/services/discord.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, announcePhase: vi.fn() };
});

vi.mock(import('../../src/repos/platform.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, addActivity: vi.fn(async () => undefined) };
});

import adminRouter from '../../src/routes/admin.js';

function appForAdmin() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
}

describe('round finalization and scoring boundary', () => {
  it('finalizes an ended round through the DZPP freeze seam', async () => {
    const open = { id: 9, phase: 'challenge' };
    const ended = { id: 9, phase: 'ended' };
    mocks.findCurrent.mockResolvedValueOnce(open);
    mocks.canTransition.mockReturnValueOnce(true);
    mocks.setPhase.mockResolvedValueOnce(ended);
    mocks.freezeEndedRound.mockResolvedValueOnce({ ok: true });
    mocks.toApiRound.mockReturnValueOnce({ id: 9, phase: 'ended' });

    const response = await requestJson(appForAdmin(), 'PATCH', '/api/admin/round/phase', { phase: 'ended' });
    expect(response.status).toBe(200);
    expect(response.json).toEqual({ ok: true, round: { id: 9, phase: 'ended' } });
    expect(mocks.freezeEndedRound).toHaveBeenCalledWith(9);
  });

  it('keeps the approved DZPP scoring order and qualification math at the domain boundary', () => {
    const plays: DzppRoundPlay[] = [
      { userId: 10, pp: 100, qualified: true, hadApprovedSubmission: true, hadVote: true, mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Best Accuracy', score: 900000, accuracy: 0.98, misses: 2 },
      { userId: 11, pp: 90, qualified: true, hadApprovedSubmission: false, hadVote: false, mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Best Accuracy', score: 850000, accuracy: 0.99, misses: 1 },
    ];
    const results = scoreRound(plays);
    expect(results.map((result) => result.userId)).toEqual([10, 11]);
    expect(results[0].placement).toBe(1);
    expect(results[1].placement).toBe(2);
    expect(results[1].qualificationPoints).toBe(25);
    expect(results[1].completionPoints).toBe(2);
  });
});
