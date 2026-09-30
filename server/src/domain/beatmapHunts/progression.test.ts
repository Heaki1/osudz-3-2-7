import { describe, expect, it } from 'vitest';
import {
  GUILD_RANK_MULTIPLIERS,
  GUILD_EXP_POLICY,
  isFamilyBoundary,
  nextRank,
  placementExp,
  previousRank,
  rankMultiplier,
  scaleGuildExp,
  terribleAttemptBaseExp,
  targetTerribleAttemptBaseExp,
} from './progression.js';

describe('Guild progression economy', () => {
  it('uses the canonical per-rank multipliers', () => {
    expect(GUILD_RANK_MULTIPLIERS).toEqual({
      IRON: 1,
      COPPER: 1.4,
      SILVER: 2,
      GOLD: 2.8,
      PLATINUM: 3.8,
      MITHRIL: 5,
      ORICHALCUM: 7,
      ADAMANTITE: 10,
    });
  });

  it('scales positive and negative base events immediately', () => {
    expect(scaleGuildExp(75, 'COPPER')).toBe(105);
    expect(scaleGuildExp(200, 'PLATINUM')).toBe(760);
    expect(scaleGuildExp(-15, 'ORICHALCUM')).toBe(-105);
    expect(rankMultiplier('ADAMANTITE')).toBe(10);
  });

  it('applies the 70% reduction to unqualified placement rewards', () => {
    expect(placementExp(2, true, 'IRON')).toBe(50);
    expect(placementExp(2, false, 'IRON')).toBe(15);
    expect(placementExp(10, true, 'COPPER')).toBe(1);
    expect(placementExp(10, false, 'COPPER')).toBe(0); // 1 × 30% rounds to zero
  });

  it('uses the explicit descending 6th-10th continuation', () => {
    expect(GUILD_EXP_POLICY.placementBonus).toEqual({ 2: 50, 3: 30, 4: 20, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 });
  });

  it('scales terrible attempts by failed placement', () => {
    expect(terribleAttemptBaseExp(1)).toBe(-15);
    expect(terribleAttemptBaseExp(4)).toBe(-60);
    expect(targetTerribleAttemptBaseExp(3)).toBe(-45);
  });

  it('identifies the three family boundaries', () => {
    expect(isFamilyBoundary('SILVER', 'COPPER')).toBe(true);
    expect(isFamilyBoundary('PLATINUM', 'GOLD')).toBe(true);
    expect(isFamilyBoundary('ORICHALCUM', 'MITHRIL')).toBe(true);
    expect(isFamilyBoundary('GOLD', 'SILVER')).toBe(false);
  });

  it('finds adjacent ranks from ordered definitions', () => {
    const rules = [
      { rank: 'IRON' as const, rank_order: 1, min_exp: 0 },
      { rank: 'COPPER' as const, rank_order: 2, min_exp: 300 },
      { rank: 'SILVER' as const, rank_order: 3, min_exp: 1000 },
    ];
    expect(nextRank('IRON', rules)?.rank).toBe('COPPER');
    expect(previousRank('SILVER', rules)?.rank).toBe('COPPER');
    expect(nextRank('SILVER', rules)).toBeNull();
  });
});
