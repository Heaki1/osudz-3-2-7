import { get, send } from './clientCore';

export type HuntType = 'BEAT_MY_SCORE' | 'SNIPE_SCORE' | 'BEATMAP_CHALLENGE';
export type HuntTier = 'BEGINNER' | 'ADVANCED' | 'ELITE' | 'LEGENDARY_MASTER';

export interface ApiHunt {
  id: string;
  poster: { userId: number; username: string };
  huntType: HuntType;
  status: string;
  tier: HuntTier;
  autoTier: HuntTier;
  adminTier: HuntTier | null;
  beatmap: {
    difficultyId: number;
    beatmapsetId: number;
    title: string;
    artist: string;
    mapper: string;
    difficultyName: string;
    coverUrl: string | null;
    previewUrl: string | null;
    stars: number;
    cs: number | null;
    ar: number | null;
    od: number | null;
    hp: number | null;
    maxCombo: number | null;
  };
  bountyDzp: number;
  escrowedDzp: number;
  requirements: Record<string, unknown>;
  description: string;
  targetScore: {
    id: number;
    userId: number;
    username: string;
    score: number;
    accuracy: number;
    maxCombo: number;
    misses: number;
    mods: string;
    pp: number | null;
  } | null;
  upgradeRequiredDzp: number;
  expiresAt: string;
  publishedAt: string;
  completedAt: string | null;
  winner: { userId: number; username: string } | null;
}

export interface ApiHuntAttempt {
  id: string;
  hunt_id: string;
  user_id: number;
  username: string;
  avatar_url: string | null;
  osu_score_id: number;
  score: number;
  accuracy: number;
  max_combo: number;
  misses: number;
  mods: string;
  pp: number | null;
  passed: boolean;
  qualifies: boolean;
  failure_reason: string | null;
  penalty_reason: string | null;
  guild_exp_delta: number;
  final_placement: number | null;
  deleted_at: string | null;
  submitted_at: string;
}

const listPath = (base: string, tier?: HuntTier) => tier ? base + '?tier=' + encodeURIComponent(tier) : base;

export const beatmapHuntsApi = {
  list: (tier?: HuntTier) => get<ApiHunt[]>(listPath('/beatmap-hunts', tier)),
  claimed: (tier?: HuntTier) => get<ApiHunt[]>(listPath('/beatmap-hunts/claimed', tier)),
  get: (id: string) => get<{ hunt: ApiHunt; leaderboard: ApiHuntAttempt[]; myHistory: ApiHuntAttempt[] }>('/beatmap-hunts/' + id),
  targetScores: (difficultyId: number) => get<Array<{ osuScoreId: number; score: number; accuracy: number; maxCombo: number; misses: number; mods: string; pp: number | null; rank: string; endedAt: string | null }>>('/beatmap-hunts/target-scores?difficultyId=' + difficultyId),
  create: (body: Record<string, unknown>) => send<ApiHunt>('POST', '/beatmap-hunts', body),
  importScore: (huntId: string, score: string) => send<Record<string, unknown>>('POST', '/beatmap-hunts/' + huntId + '/import', { score }),
  deleteAttempt: (huntId: string, attemptId: string) => send<{ ok: boolean }>('DELETE', '/beatmap-hunts/' + huntId + '/attempts/' + attemptId),
  cancel: (huntId: string) => send<{ ok: boolean }>('POST', '/beatmap-hunts/' + huntId + '/cancel'),
  payUpgrade: (huntId: string) => send<{ ok: boolean }>('POST', '/beatmap-hunts/' + huntId + '/upgrade/pay'),
  takeUpgradeLoan: (huntId: string) => send<{ loanId: string; amountDzp: number; installmentPercent: number }>('POST', '/beatmap-hunts/' + huntId + '/upgrade/loan'),
  reportAttempt: (attemptId: string, reason: string) => send<{ ok: boolean }>('POST', '/beatmap-hunts/attempts/' + attemptId + '/report', { reason }),
};
