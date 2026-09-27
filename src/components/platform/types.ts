/**
 * types.ts — application-wide shared types.
 *
 * NOTE FOR INTEGRATION: the only change here compared to the existing file is
 * the addition of 'player' to the PlatformPage union (marked below).
 * Every other type is kept exactly as-is.
 */

// ── Page routing ──────────────────────────────────────────────────────────────

/**
 * All top-level pages the app can be on.
 *
 * getPageFromPath() in App.tsx maps window.location.pathname to one of these.
 * navigate() and navigateToPlayer() in App.tsx set the active page.
 *
 * 'player' was added to support the dedicated player profile page at
 * /player/:username. Unlike every other page, player profiles carry a second
 * piece of state (the username), which App.tsx holds in profileUsername.
 */
export type PlatformPage =
  | 'landing'
  | 'dashboard'
  | 'submit'
  | 'vote'
  | 'search'
  | 'rankings'
  | 'archive'
  | 'admin'
  | 'shop'
  | 'player'; // ← NEW

// ── Round phase ───────────────────────────────────────────────────────────────

export type Phase = 'submission' | 'voting' | 'challenge' | 'ended';

// ── Beatmap ───────────────────────────────────────────────────────────────────

/**
 * The client-side representation of a beatmap, used by the submit, vote, and
 * dashboard pages. Entries come from either the submissions list or the
 * favorites list; some fields are optional because not every source provides
 * every field.
 */
export interface Beatmap {
  id: string;
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  /** osu! difficulty id. Undefined for sample / placeholder entries. */
  difficultyId?: number;
  /** osu! beatmapset id. Undefined for sample entries. */
  beatmapsetId?: number;
  coverUrl?: string;
  previewUrl?: string;
  starRating?: number;
  bpm?: number;
  length?: number;
  /** True when the viewer has favorited this beatmap. */
  isFavorited?: boolean;
  /** True when this is the submission the viewer voted for. */
  isVoted?: boolean;
  /** Submission id when this beatmap was submitted by someone in the round. */
  submissionId?: number;
  modRequirement?: string;
  challengeRequirement?: string;
}
