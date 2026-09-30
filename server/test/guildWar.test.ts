import { describe, expect, it } from 'vitest';
import { phaseFor, warScore, warSummonsOpen } from '../src/services/guildWar.js';

describe('Kingdoms War phase and scoring rules', () => {
  const start = new Date('2026-01-01T00:00:00Z');

  it('uses the exact 20-day phase boundaries', () => {
    expect(phaseFor(start, new Date('2026-01-07T00:00:00Z'))).toBe('TRUMP');
    expect(phaseFor(start, new Date('2026-01-09T00:00:00Z'))).toBe('REVIEW');
    expect(phaseFor(start, new Date('2026-01-11T00:00:00Z'))).toBe('REVEAL');
    expect(phaseFor(start, new Date('2026-01-12T00:00:00Z'))).toBe('MASCARA');
    expect(phaseFor(start, new Date('2026-01-21T00:00:00Z'))).toBe('COMPLETED');
  });

  it('applies the 30% attempt reduction to the placement bonus', () => {
    const bonuses = new Map([[1,10000],[2,7000],[9,1000],[10,750]]);
    expect(warScore(500, 1, 'QUALIFIED', bonuses)).toBe(10500);
    expect(warScore(500, 9, 'ATTEMPT', bonuses)).toBe(1200);
    expect(warScore(500, null, 'ATTEMPT', bonuses)).toBe(500);
  });

  it('opens War Summons during Mascara and for exactly two days afterward', () => {
    const end = new Date('2026-01-21T00:00:00Z');
    expect(warSummonsOpen(start, end, new Date('2026-01-09T00:00:00Z'))).toBe(false);
    expect(warSummonsOpen(start, end, new Date('2026-01-12T00:00:00Z'))).toBe(true);
    expect(warSummonsOpen(start, end, new Date('2026-01-22T00:00:00Z'))).toBe(true);
    expect(warSummonsOpen(start, end, new Date('2026-01-23T00:00:01Z'))).toBe(false);
  });
});
