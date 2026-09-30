export type PartyMemberOutcome = 'ACTIVE' | 'LEECH';

export interface PartyMemberContribution {
  userId: number;
  outcome: PartyMemberOutcome;
  contribution: number;
}

export interface PartyExpShare {
  userId: number;
  exp: number;
  outcome: PartyMemberOutcome;
}

/**
 * A successful Party Quest adds 25% to the configured EXP bounty. Every
 * non-participating member receives 5% of that total; qualifying members
 * divide the remainder in proportion to their contribution.
 */
export function calculatePartyExpShares(baseExp: number, members: readonly PartyMemberContribution[]): PartyExpShare[] {
  if (!Number.isFinite(baseExp) || baseExp <= 0) throw new Error('Party Quest EXP bounty must be positive.');
  if (members.length === 0) throw new Error('A Party Quest requires at least one party member.');

  const active = members.filter((member) => member.outcome === 'ACTIVE' && member.contribution > 0);
  if (active.length < 2) throw new Error('A Party Quest requires at least two qualifying members.');

  const total = Math.round(baseExp * 1.25);
  const leeches = members.filter((member) => member.outcome === 'LEECH');
  const leechShare = Math.floor(total * 0.05);
  if (leechShare * leeches.length >= total) throw new Error('Party Quest has too many passive members for the 5% share rule.');

  const passiveTotal = leechShare * leeches.length;
  const activeTotal = total - passiveTotal;
  const contributionTotal = active.reduce((sum, member) => sum + member.contribution, 0);
  if (contributionTotal <= 0) throw new Error('Qualifying party contributions must be positive.');

  const shares = active.map((member) => ({
    userId: member.userId,
    outcome: member.outcome,
    exp: Math.floor(activeTotal * member.contribution / contributionTotal),
  }));

  let remainder = activeTotal - shares.reduce((sum, share) => sum + share.exp, 0);
  for (let i = 0; i < shares.length && remainder > 0; i++, remainder--) shares[i].exp++;

  return [
    ...shares,
    ...leeches.map((member) => ({ userId: member.userId, outcome: member.outcome, exp: leechShare })),
  ];
}
