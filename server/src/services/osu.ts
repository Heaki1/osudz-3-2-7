// osu! OAuth2 + API v2 client.
//
// Two kinds of token live here. The authorization-code flow produces a *user*
// token, used once at login to read the account; it is not stored. Beatmap
// lookups instead use a *client-credentials* token, which represents the
// application rather than any user, and is cached until it expires.
//
// Nothing here touches the database or Express — it is just the outbound half.

import { env } from '../env.js';

const AUTHORIZE_URL = 'https://osu.ppy.sh/oauth/authorize';
const TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
const API_BASE = 'https://osu.ppy.sh/api/v2';
const SCOPES = 'identify public';

/** The subset of the osu! User object this project reads. */
export interface OsuMe {
  id: number;
  username: string;
  country_code: string;
  avatar_url?: string | null;
  /** Present on /me because the token is the user's own. Restricted accounts are refused. */
  is_restricted?: boolean | null;
  statistics?: {
    global_rank?: number | null;
    country_rank?: number | null;
    pp?: number | null;
    hit_accuracy?: number | null;
    play_count?: number | null;
    play_time?: number | null;
    total_score?: number | null;
    ranked_score?: number | null;
    maximum_combo?: number | null;
    total_hits?: number | null;
    replays_watched_by_others?: number | null;
    level?: { current?: number | null; progress?: number | null } | null;
    grade_counts?: { ss?: number; ssh?: number; s?: number; sh?: number; a?: number } | null;
  } | null;
}

export interface OsuBestScoreSummary {
  id: number;
  pp: number | null;
  accuracy: number;
  score: number;
  maxCombo: number | null;
  mods: string[];
  beatmap: { id: number; title: string; version: string; difficultyRating: number | null };
}

type OsuScoreRecord = Record<string, unknown>;

function asRecord(value: unknown): OsuScoreRecord {
  return value !== null && typeof value === 'object' ? value as OsuScoreRecord : {};
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.osuClientId,
    redirect_uri: env.osuRedirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchanges the callback code for an access token. Throws on any non-2xx. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.osuClientId,
      client_secret: env.osuClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: env.osuRedirectUri,
    }),
  });

  if (!res.ok) {
    // Body is logged server-side only; it can name the misconfigured field
    // (usually a redirect_uri that does not match the registered one).
    throw new Error(`osu! token exchange failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('osu! token exchange returned no access_token');
  return body.access_token;
}

export async function fetchMe(accessToken: string): Promise<OsuMe> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`osu! GET /me failed: ${res.status}`);

  const me = (await res.json()) as OsuMe;
  if (!Number.isInteger(me.id) || !me.username) {
    throw new Error('osu! GET /me returned an unexpected shape');
  }
  return me;
}

export async function fetchPublicUser(username: string): Promise<OsuMe> {
  const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}/osu`, {
    headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`osu! GET /users/${username}/osu failed: ${res.status}`);
  const user = (await res.json()) as OsuMe;
  if (!Number.isInteger(user.id) || !user.username) throw new Error('osu! user response was invalid');
  return user;
}

export async function fetchPublicUserBestScores(userId: number | string, limit = 5): Promise<OsuBestScoreSummary[]> {
  const params = new URLSearchParams({
    legacy_only: '0',
    include_fails: '0',
    mode: 'osu',
    limit: String(Math.min(Math.max(limit, 1), 10)),
    offset: '0',
  });
  const res = await fetch(`${API_BASE}/users/${encodeURIComponent(String(userId))}/scores/best?${params.toString()}`, {
    headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`osu! GET /users/${userId}/scores/best failed: ${res.status}`);
  const scores = (await res.json()) as unknown[];
  return scores.map((score) => {
    const scoreRecord = asRecord(score);
    const beatmap = asRecord(scoreRecord.beatmap);
    const beatmapset = asRecord(scoreRecord.beatmapset);
    const rawMods = Array.isArray(scoreRecord.mods) ? scoreRecord.mods : [];
    return {
      id: Number(scoreRecord.id),
      pp: typeof scoreRecord.pp === 'number' ? scoreRecord.pp : null,
      accuracy: Number(scoreRecord.accuracy ?? 0),
      score: Number(scoreRecord.score ?? 0),
      maxCombo: scoreRecord.max_combo == null ? null : Number(scoreRecord.max_combo),
      mods: rawMods.map((mod) => {
        if (typeof mod === 'string') return mod;
        const modRecord = asRecord(mod);
        return typeof modRecord.acronym === 'string' ? modRecord.acronym : null;
      }).filter((mod): mod is string => mod !== null),
      beatmap: {
        id: Number(beatmap.id),
        title: String(beatmap.full_name ?? asRecord(beatmap.beatmapset).title ?? beatmapset.title ?? 'Unknown beatmap'),
        version: String(beatmap.version ?? ''),
        difficultyRating: typeof beatmap.difficulty_rating === 'number' ? beatmap.difficulty_rating : null,
      },
    };
  });
}

// ── Beatmap lookup (client-credentials) ──────────────────────────────────────

/** Ranked statuses a submission is allowed to use, per docs/my_plan.txt. */
export const SUBMITTABLE_STATUSES = ['ranked', 'loved', 'approved'] as const;
export type SubmittableStatus = (typeof SUBMITTABLE_STATUSES)[number];

/** Raised when the beatmap exists but is not eligible, so routes can answer 422. */
export class BeatmapRejected extends Error {}

/** Raised when osu! has no such difficulty, so routes can answer 404. */
export class BeatmapNotFound extends Error {}

/** The fields this project reads off a BeatmapExtended, flattened and validated. */
export interface OsuBeatmap {
  difficultyId: number;
  beatmapsetId: number;
  modeInt: number;
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  mapStatus: SubmittableStatus;
  coverUrl: string;
  previewUrl: string;
  /** Rounded for numeric(4,2). */
  stars: number;
  /** Rounded: the API returns fractional BPM (360.3) and the column is integer. */
  bpm: number;
  lengthSeconds: number;
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
  genre: string;
  /** osu!'s authoritative maximum combo for this difficulty. */
  maxCombo: number | null;
  checksum: string | null;
}

let appToken: { value: string; expiresAt: number } | null = null;

/**
 * A token for the application itself. Cached with a minute of slack so a lookup
 * never races the expiry it just checked.
 */
async function getAppToken(): Promise<string> {
  if (appToken && Date.now() < appToken.expiresAt) return appToken.value;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.osuClientId,
      client_secret: env.osuClientSecret,
      grant_type: 'client_credentials',
      scope: 'public',
    }),
  });

  if (!res.ok) {
    throw new Error(`osu! client_credentials grant failed: ${res.status}`);
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('osu! client_credentials returned no access_token');

  const ttlMs = Math.max(60, (body.expires_in ?? 86_400) - 60) * 1000;
  appToken = { value: body.access_token, expiresAt: Date.now() + ttlMs };
  return appToken.value;
}

/** Downloads the raw .osr for a public osu! score. */
export async function fetchScoreReplay(scoreId: number, ruleset: 'osu' | 'mania' = 'osu'): Promise<Buffer> {
  const res = await fetch(`${API_BASE}/scores/${ruleset}/${scoreId}/download`, {
    headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`osu! GET /scores/${ruleset}/${scoreId}/download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Downloads the .osz archive containing the beatmap needed to render a replay. */
export async function fetchBeatmapsetArchive(beatmapsetId: number): Promise<Buffer> {
  const apiRes = await fetch(`${API_BASE}/beatmapsets/${beatmapsetId}/download`, {
    headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: 'application/octet-stream' },
  });
  if (apiRes.ok) return Buffer.from(await apiRes.arrayBuffer());

  // The osu! API download route is documented but is restricted to lazer clients.
  // Use a maintained public .osz mirror instead of Chimu, which is no longer a
  // dependable source. The mirror returns the actual .osz bytes, not preview audio.
  const mirrorRes = await fetch(`https://mirror.hinamizawa.ai/api/v1/hinai/d/${beatmapsetId}`, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'osuDZ/3.2.7 (+https://github.com/osu-dz)',
    },
  });
  if (mirrorRes.ok) return Buffer.from(await mirrorRes.arrayBuffer());

  throw new Error(`Could not download beatmapset ${beatmapsetId}: osu! ${apiRes.status}, mirror ${mirrorRes.status}`);
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

/** Same fields, but the status is whatever osu! reported — see fetchBeatmapAnyStatus. */
export interface OsuBeatmapAnyStatus extends Omit<OsuBeatmap, 'mapStatus'> {
  mapStatus: string;
}

/**
 * Reads one difficulty and flattens it, WHATEVER ITS STATUS. Throws BeatmapNotFound when
 * osu! has no such difficulty.
 *
 * Favorites need this (A4): a player may legitimately favorite a graveyard or pending map,
 * and the ranked-status rule belongs to the submit path rather than to what somebody is
 * allowed to like. fetchBeatmap is this plus that rule, so there is one fetch and one
 * flatten rather than two copies that could disagree about, say, BPM rounding.
 */
export async function fetchBeatmapAnyStatus(difficultyId: number): Promise<OsuBeatmapAnyStatus> {
  const res = await fetch(`${API_BASE}/beatmaps/${difficultyId}`, {
    headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: 'application/json' },
  });

  if (res.status === 404) throw new BeatmapNotFound('No such beatmap difficulty');
  if (!res.ok) throw new Error(`osu! GET /beatmaps/${difficultyId} failed: ${res.status}`);

  const b = (await res.json()) as Record<string, unknown>;
  const set = (b.beatmapset ?? {}) as Record<string, unknown>;
  const covers = (set.covers ?? {}) as Record<string, unknown>;

  const status = typeof b.status === 'string' ? b.status : '';
  const beatmapsetId = asNumber(b.beatmapset_id);
  const modeInt = asNumber(b.mode_int);
  const stars = asNumber(b.difficulty_rating);
  const bpm = asNumber(b.bpm);
  const lengthSeconds = asNumber(b.total_length);
  const title = typeof set.title === 'string' ? set.title : '';
  const artist = typeof set.artist === 'string' ? set.artist : '';
  const mapper = typeof set.creator === 'string' ? set.creator : '';
  const difficultyName = typeof b.version === 'string' ? b.version : '';
  const genreRecord = (set.genre ?? {}) as Record<string, unknown>;
  const genre = typeof genreRecord.name === 'string' ? genreRecord.name : 'Unspecified';
  const checksum = typeof b.checksum === 'string' ? b.checksum : null;

  if (beatmapsetId === null || modeInt === null || stars === null || bpm === null || lengthSeconds === null ||
      !title || !artist || !mapper || !difficultyName) {
    throw new Error(`osu! GET /beatmaps/${difficultyId} returned an unexpected shape`);
  }

return {
  difficultyId,
  beatmapsetId,
  modeInt,
  title,
  artist,
  mapper,
  difficultyName,
  mapStatus: status,
  coverUrl: typeof covers.cover === 'string' ? covers.cover : '',
  previewUrl: typeof set.preview_url === 'string' ? set.preview_url : '',
  stars: Math.round(stars * 100) / 100,
  bpm: Math.round(bpm),
  lengthSeconds: Math.round(lengthSeconds),
  cs: asNumber(b.cs),
  ar: asNumber(b.ar),
  od: asNumber(b.accuracy),
  hp: asNumber(b.drain),
  genre,
  maxCombo: asNumber(b.max_combo),
  checksum,
};
}

const genreCache = new Map<number, { value: string; expiresAt: number }>();

/** Reads and briefly caches osu!'s authoritative beatmap genre metadata. */
export async function fetchBeatmapGenre(difficultyId: number): Promise<string> {
  const cached = genreCache.get(difficultyId);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const beatmap = await fetchBeatmapAnyStatus(difficultyId);
  genreCache.set(difficultyId, {
    value: beatmap.genre,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  });
  return beatmap.genre;
}

/**
 * Reads one difficulty for the SUBMIT path. Throws BeatmapNotFound when osu! has no such
 * difficulty and BeatmapRejected when it exists but cannot be submitted.
 *
 * The status rule lives here rather than in the fetch, so favorites and search can read
 * the same beatmap without inheriting a rule that is not theirs.
 */
export async function fetchBeatmap(difficultyId: number): Promise<OsuBeatmap> {
  const beatmap = await fetchBeatmapAnyStatus(difficultyId);
  if (!(SUBMITTABLE_STATUSES as readonly string[]).includes(beatmap.mapStatus)) {
    throw new BeatmapRejected(
      `This beatmap is ${beatmap.mapStatus || 'of an unknown status'}. Only Ranked, Loved and Approved beatmaps can be submitted.`
    );
  }
  return beatmap as OsuBeatmap;
}

/**
 * Pulls the difficulty id out of an osu! beatmap URL. Returns null when the link
 * names only a beatmapset, because a submission is one difficulty and picking one
 * for the user would be guessing.
 *
 * Handles: /beatmapsets/41823#osu/131891, /beatmaps/131891, /b/131891,
 * and a bare numeric id.
 */
export function parseDifficultyId(input: string): number | null {
  const text = input.trim();
  if (/^\d+$/.test(text)) return Number(text);

  const patterns = [
    /beatmapsets\/\d+#[a-z]+\/(\d+)/i,
    /beatmapsets\/\d+\/(\d+)/i,
    /\/beatmaps\/(\d+)/i,
    /\/b\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}
export async function fetchUserRecentScoresForDifficulty(
  difficultyId: number,
  osuUserId: number,
  mode: 'osu' | 'mania' = 'osu'
): Promise<OsuScore[]> {
  const token = await getAppToken();

  const limit = 100;
  const offset = 0;

  const params = new URLSearchParams({
    mode,
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(
    `${API_BASE}/users/${osuUserId}/scores/recent?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (res.status === 404) {
    throw new ScoreNotFound('No recent scores found');
  }

  if (!res.ok) {
    throw new Error(
      `osu! GET /users/${osuUserId}/scores/recent failed: ${res.status}`
    );
  }

  const body = (await res.json()) as Array<Record<string, unknown>>;

  if (!Array.isArray(body)) {
    throw new Error(
      `osu! GET /users/${osuUserId}/scores/recent returned an unexpected shape`
    );
  }

 const matching = body.filter((s) => {
  const beatmap =
    s.beatmap && typeof s.beatmap === 'object'
      ? (s.beatmap as Record<string, unknown>)
      : null;

  return (
    asNumber(beatmap?.id) === difficultyId &&
    s.passed === true
  );
});

  return matching.map((s) => {
    const total = asNumber(s.total_score) ?? asNumber(s.score);
    const accuracy = asNumber(s.accuracy);

    if (total === null || accuracy === null) {
      throw new Error(
        'osu! returned a score with no usable total or accuracy'
      );
    }

    const stats = (s.statistics ?? {}) as Record<string, unknown>;
    const misses =
      asNumber(stats.count_miss) ?? asNumber(stats.miss) ?? 0;
    const id = asNumber(s.id);
return {
  osuScoreId: id ?? 0,
  score: Math.round(total),
  accuracy: Math.round(accuracy * 10_000) / 100,
  misses: Math.round(misses),
  maxCombo: Math.round(asNumber(s.max_combo) ?? 0),
  mods: readMods(s.mods),
  pp: asNumber(s.pp),
  rank: typeof s.rank === 'string' ? s.rank : '',
  passed: s.passed !== false,
  endedAt:
    typeof s.ended_at === 'string'
      ? s.ended_at
      : typeof s.created_at === 'string'
        ? s.created_at
        : null,

  osuUserId:
    s.user && typeof s.user === 'object'
      ? asNumber((s.user as Record<string, unknown>).id)
      : null,
  beatmapId:
    s.beatmap && typeof s.beatmap === 'object'
      ? asNumber((s.beatmap as Record<string, unknown>).id)
      : null,
  ruleset:
    typeof s.ruleset_id === 'string'
      ? s.ruleset_id
      : typeof s.mode === 'string'
        ? s.mode
        : null,
};
});
}

/** Reads public scores on one difficulty without the recent-100 limitation. */
export async function fetchUserScoresForDifficulty(
  difficultyId: number,
  osuUserId: number,
  mode: 'osu' | 'mania' = 'osu'
): Promise<OsuScore[]> {
  const res = await fetch(
    `${API_BASE}/beatmaps/${difficultyId}/scores/users/${osuUserId}?mode=${encodeURIComponent(mode)}`,
    { headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: 'application/json' } }
  );
  if (res.status === 404) throw new ScoreNotFound('No score found on this difficulty');
  if (!res.ok) throw new Error(`osu! GET /beatmaps/${difficultyId}/scores/users/${osuUserId} failed: ${res.status}`);
  const body = await res.json() as unknown;
  const scores = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).scores)
      ? (body as Record<string, unknown>).scores as unknown[]
      : [];
  return scores.map((raw) => {
    const s = asRecord(raw);
    const total = asNumber(s.total_score) ?? asNumber(s.score);
    const accuracy = asNumber(s.accuracy);
    if (total === null || accuracy === null) throw new Error('osu! returned a score with no usable total or accuracy');
    const stats = asRecord(s.statistics);
    return {
      osuScoreId: asNumber(s.id) ?? 0,
      score: Math.round(total),
      accuracy: Math.round(accuracy * 10_000) / 100,
      misses: Math.round(asNumber(stats.count_miss) ?? asNumber(stats.miss) ?? 0),
      maxCombo: Math.round(asNumber(s.max_combo) ?? 0),
      mods: readMods(s.mods),
      pp: asNumber(s.pp),
      rank: typeof s.rank === 'string' ? s.rank : '',
      passed: s.passed !== false,
      endedAt: typeof s.ended_at === 'string' ? s.ended_at : typeof s.created_at === 'string' ? s.created_at : null,
      osuUserId,
      beatmapId: difficultyId,
      ruleset: typeof s.ruleset_id === 'string' ? s.ruleset_id : mode,
    };
  }).filter((score) => score.passed);
}

// ── Challenge scores (client-credentials) ────────────────────────────────────
//
// A player's score on one difficulty is public data, and the application token reads
// it with no user context at all. That was verified against the live API before this
// was written — see docs/todo.txt E2 — and it is the reason nothing in this project
// stores a per-user osu! token.

/** The fields challenge_scores records, flattened out of one osu! score. */
export interface OsuScore {
  osuScoreId: number;
  score: number;
  /** A percentage, 0-100. The API reports a 0..1 fraction. */
  accuracy: number;
  misses: number;
  /** Maximum combo achieved by the play. */
  maxCombo: number;
  /** Acronyms joined ('HDHR'), or 'NM' when the play had none. */
  mods: string;
  /**
   * osu! pp for this play, or null when osu! reported none — a Loved beatmap, an unranked
   * mod combination, and anything else osu! declines to rate.
   *
   * THE DZPP PERFORMANCE TERM, and the only pp this project reads. It belongs to the play,
   * not to the player: nothing here or anywhere else imports a profile total or a global
   * rank into the ranking.
   */
  pp: number | null;
  rank: string;
  passed: boolean;
  endedAt: string | null;

  /** Internal osu! API metadata used to verify an imported score. */
  osuUserId: number | null;
  beatmapId: number | null;
  ruleset: string | null;
}

/** Raised when the player has no score on that difficulty, so routes can answer 404. */
export class ScoreNotFound extends Error {}

/**
 * Normalises the mods array. osu! returns plain acronyms on older scores and
 * { acronym, settings } objects on newer ones, and both shapes reach this project
 * because a challenge map can have plays from either era.
 */
function readMods(raw: unknown): string {
  if (!Array.isArray(raw)) return 'NM';
  const acronyms = raw
    .map((mod) => {
      if (typeof mod === 'string') return mod;
      if (mod && typeof mod === 'object' && typeof (mod as { acronym?: unknown }).acronym === 'string') {
        return (mod as { acronym: string }).acronym;
      }
      return '';
    })
    .filter((acronym) => acronym !== '');
  return acronyms.length === 0 ? 'NM' : acronyms.join('');
}


// ── Beatmap search (client-credentials) ──────────────────────────────────────
//
// GET /beatmapsets/search answers with SETS, and this project's card model is one
// difficulty, so each hit is represented by its set's hardest difficulty and carries a
// count of the rest. Rendering every difficulty of every set would put a dozen
// near-identical cards on screen per result.
//
// Hits are narrowed to SUBMITTABLE_STATUSES. This page exists to find a map worth
// entering, and offering a qualified or graveyard map that the submit path will refuse
// is a trap rather than a wider search.
//
// No game-mode filter, deliberately matching fetchBeatmap: the submit path does not
// restrict a submission to osu!standard either, and quietly narrowing search alone
// would make the two disagree about what this platform accepts.

/** Which statuses a search may ask for. 'any' means every submittable status. */
export type SearchStatus = 'any' | SubmittableStatus;

/**
 * How a page of hits is ordered.
 *
 * 'relevance' and 'newest' are osu!'s own orderings and are left exactly as it returned them —
 * it is the only party that knows what relevance means or when a set was ranked. 'stars' and
 * 'bpm' are applied here, because osu! cannot sort by BPM at all.
 */
export type SearchSort = 'relevance' | 'newest' | 'stars' | 'bpm';

export const SEARCH_SORTS = ['relevance', 'newest', 'stars', 'bpm'] as const;

export const isSearchSort = (value: unknown): value is SearchSort =>
  (SEARCH_SORTS as readonly unknown[]).includes(value);

/**
 * What a search is actually asking for.
 *
 * Every field is optional and an absent one is no constraint, which is what lets the search page
 * start with nothing filled in and still show osu!'s default listing.
 */
export interface SearchFilters {
  /** Free text. osu! matches it against title, artist and mapper. */
  q?: string;
  /** A mapper name, which becomes an explicit creator clause rather than more free text. */
  mapper?: string;
  minStars?: number;
  maxStars?: number;
  minBpm?: number;
  maxBpm?: number;
}

/** A bound that is not a finite number is not a bound. */
const usableBound = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Composes osu!'s own advanced-search string.
 *
 * THE RANGES GO INSIDE q, because that is where osu! takes them: `stars>=5 bpm<=200` filters the
 * WHOLE result set, where filtering the returned page would only narrow one screenful and call it
 * a search. A malformed clause is the risk — osu! does not error on one, it reads it as free text
 * and quietly answers something else — which is why this is a tested pure function and why
 * withinRange re-checks the page that comes back.
 */
export function buildSearchQuery(filters: SearchFilters): string {
  const clauses: string[] = [];

  const text = (filters.q ?? '').trim();
  if (text !== '') clauses.push(text);

  const mapper = (filters.mapper ?? '').trim();
  // Quoted when it contains whitespace, or the clause would end after the first word and the rest
  // would become free text.
  if (mapper !== '') clauses.push(`creator=${/\s/.test(mapper) ? `"${mapper}"` : mapper}`);

  const bounded = (key: string, min?: number, max?: number): void => {
    const low = usableBound(min);
    if (low !== null) clauses.push(`${key}>=${low}`);
    const high = usableBound(max);
    if (high !== null) clauses.push(`${key}<=${high}`);
  };
  bounded('stars', filters.minStars, filters.maxStars);
  bounded('bpm', filters.minBpm, filters.maxBpm);

  return clauses.join(' ');
}

/**
 * Whether the difficulty a card will show actually sits inside the requested ranges.
 *
 * The second line of defence behind the q clauses. Both bounds are inclusive, and it agrees with
 * buildSearchQuery about what counts as a bound so the two can never disagree about a hit.
 */
export function withinRange(hit: { stars: number; bpm: number }, filters: SearchFilters): boolean {
  const inside = (value: number, min?: number, max?: number): boolean => {
    const low = usableBound(min);
    if (low !== null && value < low) return false;
    const high = usableBound(max);
    if (high !== null && value > high) return false;
    return true;
  };
  return (
    inside(hit.stars, filters.minStars, filters.maxStars) &&
    inside(hit.bpm, filters.minBpm, filters.maxBpm)
  );
}

/** One search hit: a beatmapset, represented by one of its difficulties. */
export interface OsuSearchDifficulty {
  difficultyId: number;
  difficultyName: string;
  stars: number;
  bpm: number;
  lengthSeconds: number;
  cs: number;
  ar: number;
  od: number;
  hp: number;
}

export interface OsuSearchHit {
  beatmapsetId: number;
  title: string;
  artist: string;
  mapper: string;
  mapStatus: SubmittableStatus;
  coverUrl: string;
  previewUrl: string;
  difficulties: OsuSearchDifficulty[];
}

/**
 * osu!'s own `s` filter. 'leaderboard' is its "has leaderboard" set — ranked,
 * approved, qualified and loved — the widest filter that can contain a submittable
 * map. osu! search has no 'approved' value at all, approved being a legacy status, so
 * that one is served by searching the leaderboard set and keeping what came back
 * approved.
 */
const SEARCH_STATUS_PARAM: Record<SearchStatus, string> = {
  any: 'leaderboard',
  ranked: 'ranked',
  loved: 'loved',
  approved: 'leaderboard',
};

export const isSearchStatus = (value: unknown): value is SearchStatus =>
  value === 'any' || (SUBMITTABLE_STATUSES as readonly unknown[]).includes(value);

/**
 * The hardest RATED difficulty of a set — the one a search card represents. Returns
 * null when the set lists none usable, which is what makes the whole hit skippable.
 *
 * An entry with no id or no star rating is skipped rather than tolerated, because
 * OsuSearchHit requires both: a difficulty that cannot fill a card is not a candidate
 * for representing the set, and letting one through here only moves the rejection into
 * toSearchHit.
 */
export function pickDifficulty(
  beatmaps: unknown,
  range: Pick<SearchFilters, 'minStars' | 'maxStars'> = {}
): Record<string, unknown> | null {
  if (!Array.isArray(beatmaps)) return null;

  let best: Record<string, unknown> | null = null;
  let bestStars = -1;
  let inRange: Record<string, unknown> | null = null;
  let inRangeStars = -1;

  for (const raw of beatmaps) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    if (asNumber(b.id) === null) continue;
    const stars = asNumber(b.difficulty_rating);
    if (stars === null) continue;

    if (stars > bestStars) {
      best = b;
      bestStars = stars;
    }
    // bpm 0 with no BPM bound passed is always inside, so this checks the star range alone.
    if (stars > inRangeStars && withinRange({ stars, bpm: 0 }, range)) {
      inRange = b;
      inRangeStars = stars;
    }
  }

  // The in-range pick when there is one, so a 3-4 star search shows a 3-4 star card rather than
  // the set's 7.2 star top difficulty. Falling back rather than returning null keeps the decision
  // to DROP the hit with the caller's own range filter, so one place says no.
  return inRange ?? best;
}

/**
 * Orders a page of hits. The server owns the ordering for the same reason F1's
 * leaderboard read does — one implementation rather than a second one in the client
 * that could drift from it.
 *
 * 'stars' is the order osu! was asked for, so this only confirms it. 'bpm' is applied
 * here because osu! search cannot sort by BPM at all, which means a BPM order covers
 * the page that came back and not the whole result set. The page says so.
 */
export function orderHits(hits: OsuSearchHit[], by: SearchSort): OsuSearchHit[] {
  // osu! already ordered these, and for relevance and ranked date it is the only
  // party that can provide the correct ordering.
  if (by === 'relevance' || by === 'newest') return [...hits];

  return [...hits].sort((a, b) => {
    const aDifficulty = a.difficulties[0];
    const bDifficulty = b.difficulties[0];

    if (!aDifficulty || !bDifficulty) return 0;

    return by === 'bpm'
      ? bDifficulty.bpm - aDifficulty.bpm
      : bDifficulty.stars - aDifficulty.stars;
  });
}

/**
 * osu!'s own sort parameter for each of ours.
 *
 * 'bpm' borrows difficulty_desc because osu! has no BPM sort at all; orderHits then reorders the
 * page, and the search page says so rather than implying the whole result set was sorted.
 */
const SEARCH_SORT_PARAM: Record<SearchSort, string> = {
  relevance: 'relevance_desc',
  newest: 'ranked_desc',
  stars: 'difficulty_desc',
  bpm: 'difficulty_desc',
};

/**
 * Searches beatmapsets. One page — osu! paginates with a cursor and nothing on this
 * page asks for more than the first screenful, so a cursor would be state with no
 * reader.
 *
 * An empty query is legal and useful: osu! answers it with its own default listing,
 * which is what gives the search page something to show before anyone has typed.
 */
export async function searchBeatmapsets(
  filters: SearchFilters,
  status: SearchStatus,
  sort: SearchSort
): Promise<OsuSearchHit[]> {
  const params = new URLSearchParams({
    s: SEARCH_STATUS_PARAM[status],
    sort: SEARCH_SORT_PARAM[sort],
    m: '0',
  });

  const query = buildSearchQuery(filters);
  if (query !== '') params.set('q', query);

  const res = await fetch(`${API_BASE}/beatmapsets/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`osu! GET /beatmapsets/search failed: ${res.status}`);

  const body = (await res.json()) as { beatmapsets?: unknown };

  if (!Array.isArray(body.beatmapsets)) {
    throw new Error('osu! GET /beatmapsets/search returned an unexpected shape');
  }

  const hits: OsuSearchHit[] = [];

  for (const raw of body.beatmapsets) {
    const setHits = toSearchHits(raw, status, filters);
    hits.push(...setHits);
  }

  return orderHits(hits, sort);
}

/**
 * Flattens one set, or returns null when it is not something this page should offer: an
 * unsubmittable status, a status the caller filtered out, or a shape missing something
 * a card needs.
 *
 * Skipping a bad set is deliberate where fetchBeatmap throws on one. A lookup is about
 * one specific map the player named, so failing loudly is the only honest answer; a
 * search is fifty maps nobody named, and failing the whole page because one result is
 * odd would be worse than quietly showing forty-nine.
 */
function toSearchHits(
  raw: unknown,
  status: SearchStatus,
  filters: SearchFilters = {}
): OsuSearchHit[] {
  if (!raw || typeof raw !== 'object') return [];

  const set = raw as Record<string, unknown>;

  const mapStatus = typeof set.status === 'string' ? set.status : '';
  if (!(SUBMITTABLE_STATUSES as readonly string[]).includes(mapStatus)) return [];
  if (status !== 'any' && mapStatus !== status) return [];

  const beatmaps = Array.isArray(set.beatmaps) ? set.beatmaps : [];

  // Standard only.
  const standardBeatmaps = beatmaps.filter((beatmap) => {
    if (!beatmap || typeof beatmap !== 'object') return false;

    const difficulty = beatmap as Record<string, unknown>;
    return difficulty.mode_int === 0;
  });

  const covers = (set.covers ?? {}) as Record<string, unknown>;
  const beatmapsetId = asNumber(set.id);
  const title = typeof set.title === 'string' ? set.title : '';
  const artist = typeof set.artist === 'string' ? set.artist : '';
  const mapper = typeof set.creator === 'string' ? set.creator : '';

  if (beatmapsetId === null || !title || !artist || !mapper) return [];

  const difficulties: OsuSearchDifficulty[] = [];

  for (const rawDifficulty of standardBeatmaps) {
    const difficulty = rawDifficulty as Record<string, unknown>;

    const difficultyId = asNumber(difficulty.id);
    const stars = asNumber(difficulty.difficulty_rating);
    const bpm = asNumber(difficulty.bpm) ?? asNumber(set.bpm);
    const lengthSeconds = asNumber(difficulty.total_length);
    const cs = asNumber(difficulty.cs);
    const ar = asNumber(difficulty.ar);
    const od = asNumber(difficulty.accuracy);
    const hp = asNumber(difficulty.drain);
    const difficultyName =
  typeof difficulty.version === 'string' ? difficulty.version : '';

    if (
      difficultyId === null ||
      stars === null ||
      bpm === null ||
      lengthSeconds === null ||
      !difficultyName
    ) {
      continue;
    }

difficulties.push({
  difficultyId,
  difficultyName,
  stars: Math.round(stars * 100) / 100,
  bpm: Math.round(bpm),
  lengthSeconds: Math.round(lengthSeconds),
  cs: cs ?? 0,
  ar: ar ?? 0,
  od: od ?? 0,
  hp: hp ?? 0,
});
  }

  if (difficulties.length === 0) return [];

  // Keep the whole beatmapset when at least one Standard difficulty
  // satisfies the requested star/BPM range.
  const hasMatchingDifficulty = difficulties.some((difficulty) =>
    withinRange(difficulty, filters)
  );

  if (!hasMatchingDifficulty) return [];

  return [
    {
      beatmapsetId,
      title,
      artist,
      mapper,
      mapStatus: mapStatus as SubmittableStatus,
      coverUrl: typeof covers.cover === 'string' ? covers.cover : '',
      previewUrl: typeof set.preview_url === 'string' ? set.preview_url : '',
      difficulties,
    },
  ];
}

// ── The player's own osu! favourites (client-credentials) ────────────────────
//
// docs/todo.txt A5. A player's favourite beatmapsets are PUBLIC PROFILE DATA — probed
// against the live API before this was written — so the application token reads them and
// nothing per-user is stored. That is why this project has no token store: neither this nor
// the challenge score import needs one.
//
// ONE DIFFICULTY PER SET, the hardest rated one, through the same pickDifficulty the search
// page uses. osu! favourites are sets, and a set with twelve difficulties would otherwise
// become twelve near-identical favorites. A player who wants a specific difficulty can
// favorite it directly, which is what the heart on a card does.

/** Enough pages that a real player's whole list arrives; a bound so a loop cannot run away. */
const FAVOURITES_PAGE = 100;
const FAVOURITES_MAX_PAGES = 5;

/**
 * The caller's favourite beatmapsets, flattened to one difficulty each.
 *
 * A set that cannot be flattened is skipped rather than failing the import: one odd entry
 * in a list of two hundred should not cost the player the other hundred and ninety-nine.
 */
export async function fetchUserFavourites(osuUserId: number): Promise<OsuBeatmapAnyStatus[]> {
  const out: OsuBeatmapAnyStatus[] = [];

  for (let page = 0; page < FAVOURITES_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(FAVOURITES_PAGE),
      offset: String(page * FAVOURITES_PAGE),
    });
    const url = `${API_BASE}/users/${osuUserId}/beatmapsets/favourite?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: 'application/json' },
    });

    if (res.status === 404) throw new BeatmapNotFound('osu! has no such user');
    if (!res.ok) throw new Error(`osu! GET favourite beatmapsets failed: ${res.status}`);

    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new Error('osu! favourite beatmapsets returned an unexpected shape');
    }

    for (const raw of body) {
      const flattened = toFavouriteBeatmap(raw);
      if (flattened !== null) out.push(flattened);
    }

    // A short page is the last page, so there is no need to ask for one that is empty.
    if (body.length < FAVOURITES_PAGE) break;
  }

  return out;
}

/**
 * Flattens one favourite beatmapset into the same shape fetchBeatmapAnyStatus returns, so an
 * imported row goes through exactly the same repo path as a hand-favorited one. Returns null
 * when the set is missing anything a row needs.
 */
function toFavouriteBeatmap(raw: unknown): OsuBeatmapAnyStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const set = raw as Record<string, unknown>;

  const difficulty = pickDifficulty(set.beatmaps);
  if (difficulty === null) return null;

  const covers = (set.covers ?? {}) as Record<string, unknown>;
  const difficultyId = asNumber(difficulty.id);
  const beatmapsetId = asNumber(set.id);
  const modeInt = asNumber(difficulty.mode_int);
  const stars = asNumber(difficulty.difficulty_rating);
  const bpm = asNumber(difficulty.bpm) ?? asNumber(set.bpm);
  const lengthSeconds = asNumber(difficulty.total_length);
  const title = typeof set.title === 'string' ? set.title : '';
  const artist = typeof set.artist === 'string' ? set.artist : '';
  const mapper = typeof set.creator === 'string' ? set.creator : '';
  const difficultyName = typeof difficulty.version === 'string' ? difficulty.version : '';
  const genreRecord = (set.genre ?? {}) as Record<string, unknown>;
  const genre = typeof genreRecord.name === 'string' ? genreRecord.name : 'Unspecified';
  const checksum = typeof difficulty.checksum === 'string' ? difficulty.checksum : null;

  if (
    difficultyId === null || beatmapsetId === null || modeInt === null || stars === null || bpm === null ||
    lengthSeconds === null || !title || !artist || !mapper || !difficultyName
  ) {
    return null;
  }

  return {
    difficultyId,
    beatmapsetId,
    modeInt,
    title,
    artist,
    mapper,
    difficultyName,
    genre,
    checksum,
    // Whatever osu! says. A favourite is very often a graveyard map, and that is not an error.
    mapStatus: typeof set.status === 'string' ? set.status : '',
    coverUrl: typeof covers.cover === 'string' ? covers.cover : '',
    previewUrl: typeof set.preview_url === 'string' ? set.preview_url : '',
    stars: Math.round(stars * 100) / 100,
    bpm: Math.round(bpm),
    lengthSeconds: Math.round(lengthSeconds),
    cs: asNumber(difficulty.cs),
    ar: asNumber(difficulty.ar),
    od: asNumber(difficulty.accuracy),
    hp: asNumber(difficulty.drain),
    maxCombo: asNumber(difficulty.max_combo),
  };
}



