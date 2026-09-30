import type { GuildRank, HuntTier } from './rules.js';

export const GUILD_RANK_MULTIPLIERS: Record<GuildRank, number> = {
  IRON: 1.0,
  COPPER: 1.4,
  SILVER: 2.0,
  GOLD: 2.8,
  PLATINUM: 3.8,
  MITHRIL: 5.0,
  ORICHALCUM: 7.0,
  ADAMANTITE: 10.0,
};

export const GUILD_EXP_POLICY = {
  beatmapChallenge: {
    qualifyingAttempt: 75,
    terribleAttempt: -15,
    winner: 100,
  },
  targetHunt: {
    qualifyingAttempt: 200,
    terribleAttempt: -15,
  },
  placementBonus: {
    2: 50,
    3: 30,
    4: 20,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1,
  } as Record<number, number>,
  unqualifiedPlacementMultiplier: 0.30,
} as const;

export interface RankRule {
  rank: GuildRank;
  rank_order: number;
  family?: HuntTier;
  min_exp: number | null;
  required_hunt_tier?: HuntTier | null;
  required_successes?: number | null;
}

export function rankMultiplier(rank: GuildRank): number {
  return GUILD_RANK_MULTIPLIERS[rank];
}

export function scaleGuildExp(baseExp: number, rank: GuildRank): number {
  if (!Number.isFinite(baseExp) || baseExp === 0) return 0;
  return Math.round(baseExp * rankMultiplier(rank));
}

export function placementExp(placement: number, qualified: boolean, rank: GuildRank): number {
  const base = GUILD_EXP_POLICY.placementBonus[placement] ?? 0;
  if (!base || placement < 2 || placement > 10) return 0;
  const adjusted = qualified ? base : base * GUILD_EXP_POLICY.unqualifiedPlacementMultiplier;
  return scaleGuildExp(adjusted, rank);
}

export function terribleAttemptBaseExp(failedPlacement: number): number {
  const placement = Math.max(1, Math.floor(failedPlacement));
  return GUILD_EXP_POLICY.beatmapChallenge.terribleAttempt * placement;
}

export function targetTerribleAttemptBaseExp(failedPlacement: number): number {
  const placement = Math.max(1, Math.floor(failedPlacement));
  return GUILD_EXP_POLICY.targetHunt.terribleAttempt * placement;
}

export function nextRank(rank: GuildRank, definitions: readonly RankRule[]): RankRule | null {
  const current = definitions.find((definition) => definition.rank === rank);
  if (!current) return null;
  return definitions.find((definition) => definition.rank_order === current.rank_order + 1) ?? null;
}

export function previousRank(rank: GuildRank, definitions: readonly RankRule[]): RankRule | null {
  const current = definitions.find((definition) => definition.rank === rank);
  if (!current) return null;
  return definitions.find((definition) => definition.rank_order === current.rank_order - 1) ?? null;
}

export function rankProgress(
  rank: GuildRank,
  exp: number,
  definitions: readonly RankRule[],
): { current: number; required: number | null; percent: number | null; nextRank: GuildRank | null } {
  const next = nextRank(rank, definitions);
  if (!next || next.min_exp === null) {
    return { current: exp, required: null, percent: null, nextRank: next?.rank ?? null };
  }

  const currentRule = definitions.find((definition) => definition.rank === rank);
  const floor = currentRule?.min_exp ?? 0;
  const span = Math.max(1, next.min_exp - floor);
  const percent = Math.max(0, Math.min(100, ((exp - floor) / span) * 100));
  return { current: exp, required: next.min_exp, percent, nextRank: next.rank };
}

export function isFamilyBoundary(from: GuildRank, to: GuildRank): boolean {
  const boundaries: Array<[GuildRank, GuildRank]> = [
    ['SILVER', 'COPPER'],
    ['PLATINUM', 'GOLD'],
    ['ORICHALCUM', 'MITHRIL'],
  ];
  return boundaries.some(([higher, lower]) => from === higher && to === lower);
}
