import { get, send, BASE } from './clientCore';
import type * as T from './types';

export const duelsApi = {
    rules: () => get<{ accepted: boolean }>('/duels/rules'),
    acceptRules: () => send<{ accepted: boolean }>('POST', '/duels/rules/accept'),
    lookup: (url: string) => send<T.ApiBeatmapPreview>("POST", "/duels/lookup", { url }),
    list: () => get<{ duels: T.ApiDuel[]; balance: number }>('/duels'),
    create: (body: { difficultyId: number; title: string; artist: string; difficulty: string; stars: number; mods: string; requirement: string; stake: number }) =>
      send<{ id: number }>('POST', '/duels', body),
    accept: (id: number) => send<{ ok: boolean }>('POST', '/duels/' + id + '/accept'),
    importScore: (id: number) => send<{ score: number; duel: T.ApiDuel }>('POST', '/duels/' + id + '/import'),
    replayStatus: (id: number) => get<{
      duelId: number;
      challenger: string;
      opponent?: string;
      challengerReplayReady: boolean;
      opponentReplayReady: boolean;
      bothReady: boolean;
      beatmapUrl: string;
      challengerReplayUrl: string | null;
      opponentReplayUrl: string | null;
    }>('/duels/' + id + '/replays'),
    uploadReplay: async (id: number, file: File): Promise<T.ApiResult<{ ok: boolean; duel: T.ApiDuel; challengerReplayReady: boolean; opponentReplayReady: boolean }>> => {
      try {
        const formData = new FormData();
        formData.append('replay', file);
        const res = await fetch(BASE + '/duels/' + id + '/replay', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const error = typeof payload?.error === 'string' ? payload.error : 'Request failed (' + res.status + ')';
          return { ok: false, kind: 'http', status: res.status, error };
        }
        return { ok: true, data: payload };
      } catch {
        return { ok: false, kind: 'network', status: 0, error: 'Cannot reach the API — is the server running?' };
      }
    },
    uploadMockOpponentReplay: async (id: number, file: File): Promise<T.ApiResult<{ ok: boolean; mockOpponent: { username: string; score: number; accuracy: number; misses: number; maxCombo: number; mods: number }; duel: T.ApiDuel }>> => {
      try {
        const formData = new FormData();
        formData.append('replay', file);
        const res = await fetch(BASE + '/duels/' + id + '/mock-opponent-replay', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const error = typeof payload?.error === 'string' ? payload.error : 'Request failed (' + res.status + ')';
          return { ok: false, kind: 'http', status: res.status, error };
        }
        return { ok: true, data: payload };
      } catch {
        return { ok: false, kind: 'network', status: 0, error: 'Cannot reach the API — is the server running?' };
      }
    },
};
