import { authApi } from './auth';
import { guildApi } from './guild';
import { beatmapHuntsApi } from './beatmapHunts';
import { guildAdminApi } from './guildAdmin';
import { duelsApi } from './duels';
import { roundsApi } from './rounds';
import { submissionsApi } from './submissions';
import { rankingsApi } from './rankings';
import { adminApi } from './admin';
import { shopApi } from './shop';
import { playersApi } from './players';
import { platformApi, statsApi, votesApi, challengeApi, searchApi, favoritesApi, chatApi, commentsApi, settingsApi, dzpApi, healthApi } from './platform';

export * from './types';

export const api = {
  auth: authApi,
  guild: guildApi,
  beatmapHunts: beatmapHuntsApi,
  guildAdmin: guildAdminApi,
  duels: duelsApi,
  rounds: roundsApi,
  stats: statsApi,
  submissions: submissionsApi,
  votes: votesApi,
  challenge: challengeApi,
  rankings: rankingsApi,
  search: searchApi,
  favorites: favoritesApi,
  chat: chatApi,
  comments: commentsApi,
  settings: settingsApi,
  dzp: dzpApi,
  admin: adminApi,
  shop: shopApi,
  players: playersApi,
  platform: platformApi,
  health: healthApi,
};
