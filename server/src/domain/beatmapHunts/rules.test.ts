import { describe, expect, it } from 'vitest';
import { classifyHuntTier, qualifyAttempt, splitModAcronyms } from './rules.js';

const tierRules = [
  { tier: 'BEGINNER' as const, tier_order: 1, min_stars: 0, min_bounty_dzp: 100 },
  { tier: 'ADVANCED' as const, tier_order: 2, min_stars: 5, min_bounty_dzp: 250 },
  { tier: 'ELITE' as const, tier_order: 3, min_stars: 7, min_bounty_dzp: 1000 },
  { tier: 'LEGENDARY_MASTER' as const, tier_order: 4, min_stars: 8.5, min_bounty_dzp: 5000 },
];

describe('Adventurer Guild hunt rules', () => {
  it('classifies by both star difficulty and bounty, preventing bounty-only tier inflation', () => {
    expect(classifyHuntTier(4.8, 5000, tierRules)).toBe('BEGINNER');
    expect(classifyHuntTier(5.4, 300, tierRules)).toBe('ADVANCED');
    expect(classifyHuntTier(7.2, 1000, tierRules)).toBe('ELITE');
    expect(classifyHuntTier(8.7, 5000, tierRules)).toBe('LEGENDARY_MASTER');
  });

  it('requires the exact target mods for score hunts', () => {
    const result = qualifyAttempt(
      { requiredMods: ['HD', 'HR'], exactMods: true, minAccuracy: 98 },
      { score: 1_000_000, accuracy: 98.2, maxCombo: 1000, misses: 0, mods: 'HDHR', pp: 300, passed: true },
    );
    expect(result.qualifies).toBe(true);
  });

  it('keeps near misses failed without applying the terrible-score classification', () => {
    const result = qualifyAttempt(
      { requiredMods: ['HD', 'HR'], exactMods: true, minAccuracy: 98, fullCombo: true },
      { score: 900_000, accuracy: 97.8, maxCombo: 990, misses: 1, mods: 'HDHR', pp: 250, passed: true },
    );
    expect(result.qualifies).toBe(false);
    expect(result.terrible).toBe(false);
  });

  it('recognizes concatenated osu! mod strings', () => {
    expect(splitModAcronyms('HDHR')).toEqual(['HD', 'HR']);
    expect(splitModAcronyms('NCHDPF')).toEqual(['HD', 'NC', 'PF']);
  });

  it('treats FM and No Mod requirements as permissive mod requirements', () => {
    expect(qualifyAttempt({ requiredMods: ['FM'], exactMods: true }, { score: 1_000_000, accuracy: 98, maxCombo: 1000, misses: 0, mods: 'HDHR', pp: 300, passed: true }).qualifies).toBe(true);
    expect(qualifyAttempt({ requiredMods: ['NM'], exactMods: true }, { score: 1_000_000, accuracy: 98, maxCombo: 1000, misses: 0, mods: '', pp: 300, passed: true }).qualifies).toBe(true);
    expect(qualifyAttempt({ requiredMods: ['No Mod'], exactMods: true }, { score: 1_000_000, accuracy: 98, maxCombo: 1000, misses: 0, mods: 'DT', pp: 300, passed: true }).qualifies).toBe(true);
  });
});
