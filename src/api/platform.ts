import { get, send } from './clientCore';
import type * as T from './types';
import type { DzpLedgerEntry } from '../components/platform/shop/shop.types';

export const platformApi = {
    activity: (limit = 30) => get<T.ApiActivityEvent[]>(`/platform/activity?limit=${limit}`),
    levelRush: (limit = 10) => get<T.ApiLevelRushEntry[]>(`/platform/level-rush?limit=${limit}`),
    progression: (userId: number) => get<T.ApiProgression>(`/platform/players/${userId}/progression`),
    mappingStats: () => get<{ submissions: number; approved: number; votes_received: number; rounds: number }>('/platform/mapping-stats'),
    recap: () => get<{ roundNumber: number; month: string; year: number; winner: { title: string; artist: string; difficultyName: string; coverUrl: string } | null; winnerVoteCount: number | null; totalVotes: number | null; archiveAt: string | null } | null>('/platform/recap'),
    compare: (a: string, b: string) => get<{
      platform: Array<{ user_id: number; username: string; osu_id: string; avatar_url: string | null; global_rank: number | null; dzpp: number; rounds: number; wins: number; best: number | null; registered: boolean }>;
      osu: Array<{
        id: number; username: string; country: string; avatarUrl: string; globalRank: number | null; countryRank: number | null;
        pp: number | null; accuracy: number | null; playCount: number | null; playTime: number | null; totalScore: number | null;
        rankedScore: number | null; maxCombo: number | null; totalHits: number | null; level: { current?: number | null; progress?: number | null } | null;
        grades: { ss?: number; ssh?: number; s?: number; sh?: number; a?: number } | null; replaysWatched: number | null;
        best: Array<{ id: number; pp: number | null; accuracy: number; score: number; maxCombo: number | null; mods: string[]; beatmap: { id: number; title: string; version: string; difficultyRating: number | null } }>;
      }>;
      warnings?: Array<{ code: string; player: string }>;
    }>(`/platform/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
};

export const statsApi = {
    get: () => get<T.ApiStats>("/stats"),
};

export const votesApi = {
    my: () => get<{ submissionId: number } | null>("/votes/my"),
    cast: (submissionId: number) => send<{ ok: boolean }>("POST", "/votes", { submissionId }),
    retract: () => send<{ ok: boolean }>("DELETE", "/votes"),
};

export const challengeApi = {
    /** All challenge beatmaps for the open round (or a specific roundId). */
    beatmaps: (roundId?: number) =>
      get<T.ApiChallengeBeatmap[]>(
        roundId === undefined ? '/challenge/beatmaps' : `/challenge/beatmaps?roundId=${roundId}`
      ),
    /** Leaderboard for one challenge beatmap. */
    scores: (submissionId: number, roundId?: number) => {
      const params = new URLSearchParams({ submissionId: String(submissionId) });
      if (roundId !== undefined) params.set('roundId', String(roundId));
      return get<T.ApiChallengeScore[]>(`/challenge/scores?${params.toString()}`);
    },
    /** The caller's own recorded score for a specific challenge beatmap, or null. */
    my: (submissionId?: number) =>
      get<T.ApiChallengeScore | null>(
        submissionId === undefined
          ? '/challenge/my'
          : `/challenge/my?submissionId=${submissionId}`
      ),
    /** Candidate osu! scores the caller can import for a specific challenge beatmap. */
    available: (submissionId: number) =>
      get<{
        scores: Array<{
          osuScoreId: number;
          score: number;
          accuracy: number;
          misses: number;
          mods: string;
          pp: number | null;
          rank: string;
          passed: boolean;
          endedAt: string | null;
        }>;
      }>(`/challenge/scores/available?submissionId=${submissionId}`),
    /** Imports one specific osu! score for a specific challenge beatmap. */
    importMine: (osuScoreId: number, submissionId: number) =>
      send<{ ok: boolean; score: T.ApiChallengeScore }>(
        'POST',
        '/challenge/scores',
        { osuScoreId, submissionId }
      ),
};

export const searchApi = {
    /**
     * Beatmap search over the osu! API.
     *
     * send() rather than get(), against this file's read convention and deliberately:
     * a search has four failures the page has to tell apart — signed out, rate
     * limited, osu! unavailable, and simply no matches — and get()'s `null` collapses
     * all four into the last one, which is the only one that is not an error.
     */
    beatmaps: (params: {
      q?: string;
      /** A mapper name. The server turns it into osu!'s own creator clause. */
      mapper?: string;
      status?: T.MapStatus | "any";
      sort?: "relevance" | "newest" | "stars" | "bpm";
      minStars?: number;
      maxStars?: number;
      minBpm?: number;
      maxBpm?: number;
    }) => {
      // Built key by key rather than handed straight to URLSearchParams: an absent bound must not
      // travel as the string "undefined", which the server would refuse as a bad number.
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === "") continue;
        query.set(key, String(value));
      }
      return send<{ results: T.ApiSearchHit[] }>("GET", `/search/beatmaps?${query.toString()}`);
    },
};

export const favoritesApi = {
    /** The caller's favorites, both sources, newest first. [] when signed out. */
    list: () => get<T.ApiFavorite[]>("/favorites"),
    /**
     * Favorites a beatmap as source 'dz'. The server looks the beatmap up itself, so the
     * id is all this sends — metadata in a request body is metadata a request can invent.
     */
    add: (difficultyId: number) =>
      send<{ ok: boolean; favorite: T.ApiFavorite }>("PUT", `/favorites/${difficultyId}`),
    /** Removes it across BOTH sources — the heart means "not in my favorites here". */
    remove: (difficultyId: number) =>
      send<{ ok: boolean; removed: number }>("DELETE", `/favorites/${difficultyId}`),
    /**
     * Pulls the caller's osu! profile favourites in as source 'osu'. The body is empty: the
     * account comes from the session, and the server reads the list with its own token, so
     * there is nothing for a caller to assert.
     *
     * A MIRROR of that half — community favorites are untouched, and pressing it twice does
     * not double the list.
     */
    import: () =>
      send<{ ok: boolean; imported: number; favorites: T.ApiFavorite[] }>("POST", "/favorites/import"),
};

export const chatApi = {
    /** All messages for the open round's challenge chat. [] when not in challenge phase. */
    list: () => get<T.ApiChatMessage[]>('/challenge/chat'),
    /** Post a message. requireAuth. */
    post: (body: string) =>
      send<{ ok: boolean; message: T.ApiChatMessage }>('POST', '/challenge/chat', { body }),
};

export const commentsApi = {
    /**
     * A round's whole discussion, oldest first. Defaults to the open round.
     *
     * One request for a page of a dozen cards, grouped by submission on the client — a request
     * per card would be a dozen round trips to render one page.
     */
    forRound: (roundId?: number) =>
      get<T.ApiComment[]>(roundId === undefined ? "/comments" : `/comments?roundId=${roundId}`),
    /** One entry's discussion, oldest first. */
    forSubmission: (submissionId: number) =>
      get<T.ApiComment[]>(`/comments?submissionId=${submissionId}`),
    /** Posts a comment, or a reply when parentId is given. requireAuth, not eligibility. */
    post: (submissionId: number, body: string, parentId?: number) =>
      send<{ ok: boolean; comment: T.ApiComment }>(
        "POST",
        "/comments",
        parentId === undefined ? { submissionId, body } : { submissionId, body, parentId }
      ),
};

export const settingsApi = {
    /** The submission rules. Public: a player has to know what they must satisfy. */
    get: () => get<T.ApiSiteSettings>("/settings"),
};

export const dzpApi = {
    /** Complete ledger history for the authenticated viewer. */
    history: () => get<DzpLedgerEntry[]>("/dzp/history"),
};

export const healthApi = {
    health: () => get<{ ok: boolean }>("/health"),
};
