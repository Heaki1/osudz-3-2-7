import { get, send } from './clientCore';

export const guildAdminApi = {
  hunts: () => get<any[]>('/admin/guild/hunts'),
  setHuntTier: (id: string, tier: string, reason: string) => send<any>('POST', '/admin/guild/hunts/' + id + '/tier', { tier, reason }),
  reports: () => get<any[]>('/admin/guild/reports'),
  resolveReport: (id: string, status: 'RESOLVED_BANNED' | 'RESOLVED_CLEARED', note: string) => send<any>('POST', '/admin/guild/reports/' + id + '/resolve', { status, note }),
  setPlayerRank: (userId: number, rank: string, reason: string) => send<any>('POST', '/admin/guild/players/' + userId + '/rank', { rank, reason }),
  rankReviews: () => get<any[]>('/admin/guild/rank-reviews'),
  approveRankReview: (id: string, note: string) => send<any>('POST', '/admin/guild/rank-reviews/' + id + '/approve', { note }),
  rejectRankReview: (id: string, note: string) => send<any>('POST', '/admin/guild/rank-reviews/' + id + '/reject', { note }),
  rankRules: () => get<any[]>('/admin/guild/rank-rules'),
  updateRankRule: (rank: string, body: Record<string, unknown>) => send<any>('PUT', '/admin/guild/rank-rules/' + rank, body),
  tierRules: () => get<any[]>('/admin/guild/tier-rules'),
  updateTierRule: (tier: string, body: Record<string, unknown>) => send<any>('PUT', '/admin/guild/tier-rules/' + tier, body),
  examTemplates: () => get<any[]>('/admin/guild/exam/templates'),
  updateExamTemplate: (testNumber: number, body: Record<string, unknown>) => send<any>('PUT', '/admin/guild/exam/templates/' + testNumber, body),
  examBeatmap: (difficultyId: number) => get<any>('/admin/guild/exam/beatmap/' + difficultyId),
  examReviews: () => get<any[]>('/admin/guild/exam/reviews'),
  approveExam: (userId: number, rank: string, note: string) => send<any>('POST', '/admin/guild/exam/reviews/' + userId + '/approve', { rank, note }),
  reconcileLoans: () => send<any>('POST', '/admin/guild/loans/reconcile'),
};
