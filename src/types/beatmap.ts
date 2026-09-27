export type BeatmapStatus = 'ranked' | 'loved' | 'approved';

export interface BeatmapComment {
  id: string;
  userId: number;
  user: string;
  avatar: string;
  time: string;
  text: string;
  rating?: number;
  parentId?: string;
}

/** Canonical client-side beatmap model. API-specific shapes remain DTOs in api/client.ts. */
export interface Beatmap {
  id: string;
  difficultyId?: number;
  beatmapsetId?: number;
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  stars: number;
  starRating?: number;
  bpm: number;
  length: string;
  status: BeatmapStatus;
  mapStatus?: BeatmapStatus;
  coverUrl?: string;
  previewUrl?: string;
  cs?: number;
  ar?: number;
  od?: number;
  hp?: number;
  genre?: string;
  previewSeconds?: number;
  lengthSeconds?: number;
  voteCount?: number;
  isVoted?: boolean;
  isFavorited?: boolean;
  modRequirement?: string;
  challengeType?: string;
  challengeRequirement?: string;
  submittedByName?: string;
  submissionId?: number;
  description?: string;
  comments?: BeatmapComment[];
}