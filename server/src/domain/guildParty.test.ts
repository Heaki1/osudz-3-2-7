import { describe, expect, it } from 'vitest';
import { calculatePartyExpShares } from './guildParty.js';

describe('calculatePartyExpShares', () => {
  it('requires two qualifying members', () => {
    expect(() => calculatePartyExpShares(1000, [
      { userId: 1, outcome: 'ACTIVE', contribution: 100 },
      { userId: 2, outcome: 'LEECH', contribution: 0 },
    ])).toThrow('at least two qualifying members');
  });

  it('applies the 25% bonus and gives each leech 5% of the total', () => {
    const shares = calculatePartyExpShares(1000, [
      { userId: 1, outcome: 'ACTIVE', contribution: 100 },
      { userId: 2, outcome: 'ACTIVE', contribution: 100 },
      { userId: 3, outcome: 'LEECH', contribution: 0 },
    ]);
    expect(shares).toEqual([
      { userId: 1, outcome: 'ACTIVE', exp: 594 },
      { userId: 2, outcome: 'ACTIVE', exp: 594 },
      { userId: 3, outcome: 'LEECH', exp: 62 },
    ]);
    expect(shares.reduce((sum, share) => sum + share.exp, 0)).toBe(1250);
  });

  it('splits the active remainder proportionally', () => {
    const shares = calculatePartyExpShares(1000, [
      { userId: 1, outcome: 'ACTIVE', contribution: 3 },
      { userId: 2, outcome: 'ACTIVE', contribution: 1 },
    ]);
    expect(shares.map((share) => share.exp)).toEqual([938, 312]);
  });
});
