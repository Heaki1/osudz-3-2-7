export const HUNT_TYPES = [
  'BEAT_MY_SCORE',
  'SNIPE_SCORE',
  'BEATMAP_CHALLENGE',
] as const;

export type HuntType = (typeof HUNT_TYPES)[number];

export const HUNT_TIERS = [
  'BEGINNER',
  'ADVANCED',
  'ELITE',
  'LEGENDARY_MASTER',
] as const;

export type HuntTier = (typeof HUNT_TIERS)[number];

export const GUILD_RANKS = [
  'IRON',
  'COPPER',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'MITHRIL',
  'ORICHALCUM',
  'ADAMANTITE',
] as const;

export type GuildRank = (typeof GUILD_RANKS)[number];

export interface HuntRequirements {
  requiredMods?: string[];
  exactMods?: boolean;
  minAccuracy?: number;
  maxMisses?: number;
  minCombo?: number;
  minScore?: number;
  minPp?: number;
  fullCombo?: boolean;
}

export interface ScoreSnapshot {
  id: number;
  userId: number;
  username: string;
  beatmapId: number;
  beatmapsetId: number | null;
  title: string;
  artist: string;
  difficultyName: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  misses: number;
  mods: string;
  pp: number | null;
  rank: string;
  ruleset: string;
  passed: boolean;
  endedAt: string | null;
}

export interface QualificationResult {
  qualifies: boolean;
  failureReason: string | null;
  terrible: boolean;
}

const normaliseMods = (mods: string): string[] => splitModAcronyms(mods);

export function splitModAcronyms(mods: string): string[] {
  const known = ['NC', 'PF', 'HD', 'HR', 'DT', 'HT', 'EZ', 'FL', 'SD', 'NF', 'SO', 'RX', 'AP', 'AT', 'DA', 'FI', 'MR', 'NM', 'FM'];
  const value = mods.toUpperCase();
  const result: string[] = [];
  for (const mod of known) {
    if (value.includes(mod)) result.push(mod);
  }
  return result.sort();
}

const sameMods = (actual: string, required: string[], exact: boolean): boolean => {
  const freeModRequirement = required.some((mod) => ['FM', 'NM', 'NO MOD', 'NO_MOD'].includes(mod.toUpperCase()));
  if (freeModRequirement) return true;
  const a = [...new Set(normaliseMods(actual))].sort();
  const r = [...new Set(required.map((mod) => mod.toUpperCase()))].sort();
  return exact ? a.join(',') === r.join(',') : r.every((mod) => a.includes(mod));
};

export function qualifyAttempt(
  requirements: HuntRequirements,
  score: Pick<ScoreSnapshot, 'score' | 'accuracy' | 'maxCombo' | 'misses' | 'mods' | 'pp' | 'passed'>,
): QualificationResult {
  const failures: string[] = [];

  if (!score.passed) failures.push('Score did not pass the beatmap');

  if (requirements.requiredMods && requirements.requiredMods.length > 0) {
    if (!sameMods(score.mods, requirements.requiredMods, requirements.exactMods === true)) {
      failures.push(
        requirements.exactMods
          ? 'Required exact mods: ' + requirements.requiredMods.join('')
          : 'Required mods: ' + requirements.requiredMods.join(''),
      );
    }
  }

  if (requirements.minAccuracy !== undefined && score.accuracy < requirements.minAccuracy) {
    failures.push('Accuracy below ' + requirements.minAccuracy.toFixed(2) + '%');
  }

  if (requirements.maxMisses !== undefined && score.misses > requirements.maxMisses) {
    failures.push('More than ' + requirements.maxMisses + ' misses');
  }

  if (requirements.minCombo !== undefined && score.maxCombo < requirements.minCombo) {
    failures.push('Combo below ' + requirements.minCombo + 'x');
  }

  if (requirements.minScore !== undefined && score.score < requirements.minScore) {
    failures.push('Score below ' + requirements.minScore.toLocaleString());
  }

  if (requirements.minPp !== undefined && (score.pp === null || score.pp < requirements.minPp)) {
    failures.push('PP below ' + requirements.minPp);
  }

  if (requirements.fullCombo && score.misses > 0) {
    failures.push('Full Combo required');
  }

  return {
    qualifies: failures.length === 0,
    failureReason: failures.length > 0 ? failures.join(' · ') : null,
    terrible:
      failures.length > 0 &&
      failures.length >= countMeaningfulRequirements(requirements) &&
      !isNearMiss(requirements, score),
  };
}

function countMeaningfulRequirements(requirements: HuntRequirements): number {
  return [
    requirements.requiredMods?.length ? 1 : 0,
    requirements.minAccuracy !== undefined ? 1 : 0,
    requirements.maxMisses !== undefined ? 1 : 0,
    requirements.minCombo !== undefined ? 1 : 0,
    requirements.minScore !== undefined ? 1 : 0,
    requirements.minPp !== undefined ? 1 : 0,
    requirements.fullCombo ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function isNearMiss(requirements: HuntRequirements, score: Pick<ScoreSnapshot, 'accuracy' | 'misses' | 'maxCombo'>): boolean {
  if (requirements.minAccuracy !== undefined && score.accuracy >= requirements.minAccuracy - 0.5) {
    return true;
  }
  if (requirements.maxMisses !== undefined && score.misses === requirements.maxMisses + 1) {
    return true;
  }
  if (requirements.minCombo !== undefined && score.maxCombo >= requirements.minCombo * 0.95) {
    return true;
  }
  return false;
}

export function classifyHuntTier(
  stars: number,
  bountyDzp: number,
  rules: ReadonlyArray<{ tier: HuntTier; tier_order: number; min_stars: number; min_bounty_dzp: number }>,
): HuntTier {
  const ordered = [...rules].sort((a, b) => b.tier_order - a.tier_order);
  for (const rule of ordered) {
    if (stars >= rule.min_stars && bountyDzp >= rule.min_bounty_dzp) return rule.tier;
  }
  return 'BEGINNER';
}

export function effectiveTier(autoTier: HuntTier, adminTier: HuntTier | null): HuntTier {
  return adminTier ?? autoTier;
}

export function tierDisplayName(tier: HuntTier): string {
  switch (tier) {
    case 'BEGINNER': return 'Beginner';
    case 'ADVANCED': return 'Advanced';
    case 'ELITE': return 'Elite / Mithril';
    case 'LEGENDARY_MASTER': return 'Legendary Master';
  }
}

export function rankDisplayName(rank: GuildRank): string {
  return rank.charAt(0) + rank.slice(1).toLowerCase();
}

export function rankFamily(rank: GuildRank): HuntTier {
  if (rank === 'IRON' || rank === 'COPPER') return 'BEGINNER';
  if (rank === 'SILVER' || rank === 'GOLD') return 'ADVANCED';
  if (rank === 'PLATINUM' || rank === 'MITHRIL') return 'ELITE';
  return 'LEGENDARY_MASTER';
}

export function validateBounty(value: number): void {
  if (!Number.isInteger(value) || value < 100) {
    throw new Error('Bounty must be an integer of at least 100 DZP');
  }
}

export function huntExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function examExpiresAt(startedAt: Date): Date {
  return new Date(startedAt.getTime() + 72 * 60 * 60 * 1000);
}

export const EXAM_REWARDS: Record<number, { rank: GuildRank | null; dzp: number }> = {
  1: { rank: 'SILVER', dzp: 500 },
  2: { rank: 'GOLD', dzp: 750 },
  3: { rank: 'GOLD', dzp: 750 },
  4: { rank: 'PLATINUM', dzp: 2000 },
  5: { rank: 'MITHRIL', dzp: 3000 },
  6: { rank: null, dzp: 5000 },
};

export const LOAN_DEFAULT_INSTALLMENT_PERCENT = 25;
