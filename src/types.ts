// Shared types for the osu!dz platform.
//
// One beatmap model (`Beatmap`) covers every surface: dashboard, submit, vote,
// search, and archive. Field names deliberately match `ApiSubmission` in
// src/api/client.ts so that swapping sample data for real server DTOs is a
// rename, not a translation layer.

export type Phase = 'submission' | 'voting' | 'challenge';
export type BeatmapStatus = 'ranked' | 'loved' | 'approved';
export type PlatformPage =
  | 'landing'
  | 'dashboard'
  | 'submit'
  | 'vote'
  | 'rankings'
  | 'search'
  | 'shop'
  | 'player'
  | 'admin'
  | 'archive'
  | 'compare'
  | 'duels';

export interface BeatmapComment {
  id: string;
  userId: number;
  user: string;
  avatar: string;
  time: string;
  text: string;
  rating?: number;
  /** Set when this comment is a reply — the id of the parent comment. */
  parentId?: string;
}

export interface Beatmap {
  // ── Identity + metadata ──
  id: string;
  /**
   * The osu! difficulty id. Absent only on a shape that has none to give.
   *
   * `id` above is this app's own key and is not interchangeable with it — a submission's is
   * its submission id, a search hit's is prefixed. Favoriting addresses the beatmap, so it
   * needs the osu! id rather than the local one.
   */
  difficultyId?: number;
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  stars: number;
  bpm: number;
  length: string;
  status: BeatmapStatus;
  coverUrl: string;
  previewUrl?: string;

  // ── Difficulty spec (rendered as bars on the vote card) ──
  cs?: number;
  ar?: number;
  od?: number;
  hp?: number;
  genre?: string;
  previewSeconds?: number;

  // ── Round / submission context ──
  voteCount?: number;
  isVoted?: boolean;
  isFavorited?: boolean;
  modRequirement?: string;
  challengeType?: string;
  submittedByName?: string;
  description?: string;
  comments?: BeatmapComment[];
}


