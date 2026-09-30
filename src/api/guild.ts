import { get, send } from './clientCore';
import type { ApiResult } from './types';

export interface ApiGuildProfile {
  profile: {
    user_id: number;
    registration_status: 'UNREGISTERED' | 'ACTIVE';
    guild_rank: string;
    guild_exp: number;
    attempted_hunts: number;
    successful_hunts: number;
    failed_hunts: number;
    exam_used: boolean;
    registered_at: string | null;
    adventurer_name: string | null;
    onboarding_completed: boolean;
    kingdom: string | null;
    travel_started_at: string | null;
    travel_arrives_at: string | null;
    travel_destination: string | null;
    kingdom_cooldown_until: string | null;
  };
  nextRank: string | null;
  nextRankExp: number | null;
  progressPercent: number | null;
  rankMultiplier: number;
  demotionWarning: { startedAt: string; expiresAt: string; targetRank: string | null } | null;
  rankReview: { id: string; requestedRank: string; status: string; requestedAt: string } | null;
  badgeAsset: string;
  loan: { id: string; remainingDzp: number; dueAt: string; installmentPercent: number } | null;
}

export interface ApiGuildExam {
  id: string;
  user_id: number;
  current_test_number: number;
  highest_cleared_test: number;
  started_at: string;
  expires_at: string;
  status: string;
  assigned_rank: string | null;
  reward_dzp: number;
  currentTemplate?: {
    test_number: number;
    difficulty_id: number;
    requirements: Record<string, unknown>;
    reward_rank: string | null;
    reward_dzp: number;
  } | null;
}

export const guildApi = {
  profile: () => get<ApiGuildProfile>('/guild/profile'),
  registerIron: () => send<{ user_id: number; guild_rank: string }>('POST', '/guild/register/iron'),
  notifications: () => get<Array<{ id: number; kind: string; title: string; body: string; payload: Record<string, unknown>; read_at: string | null; created_at: string }>>('/guild/notifications'),
  readNotification: (id: number) => send<{ ok: boolean }>('POST', '/guild/notifications/' + id + '/read'),
  exam: () => get<ApiGuildExam | null>('/guild/exam'),
  startExam: () => send<{ id: string; startedAt: string; expiresAt: string; currentTestNumber: number; highestClearedTest: number }>('POST', '/guild/exam/start'),
  importExamScore: (score: string) => send<Record<string, unknown>>('POST', '/guild/exam/import', { score }),
  cashOutExam: () => send<Record<string, unknown>>('POST', '/guild/exam/cashout'),
  kingdoms: () => get<Array<{ kingdom: string; display_name: string; capital: string; lore: string; travel_cost_dzp: number; travel_duration_hours: number; cooldown_months: number }>>('/guild/kingdoms'),
  onboarding: (adventurerName: string, kingdom: string, path: 'IRON' | 'EXAM') => send<Record<string, unknown>>('POST', '/guild/onboarding', { adventurerName, kingdom, path }),
  travel: (kingdom: string) => send<Record<string, unknown>>('POST', '/guild/travel', { kingdom }),
  kingdom: (kingdom: string) => get<Record<string, unknown>>('/guild/kingdom/' + kingdom),
  war: () => get<any>('/guild/war'),
  submitTrump: (cycleId: string, body: Record<string, unknown>) => send<any>('POST', '/guild/war/' + cycleId + '/trump', body),
  useWarSummons: (cycleId: string) => send<any>('POST', '/guild/war/' + cycleId + '/summons'),
  warSummons: (cycleId: string) => get<any>('/guild/war/' + cycleId + '/summons'),
  party: () => get<any>('/guild/party'),
  createParty: (name: string) => send<any>('POST', '/guild/parties', { name }),
  joinParty: (partyId: string) => send<any>('POST', '/guild/parties/' + partyId + '/join'),
  acceptPartyQuest: (partyId: string, templateId: string) => send<any>('POST', '/guild/parties/' + partyId + '/quests', { templateId }),
};

export type { ApiResult };
