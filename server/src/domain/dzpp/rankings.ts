import { asPp } from './formula.js';

export const RANKING_COUNTRY = 'DZ';
export const SEASON_SIZE = 3;

export interface CurrentSeason {
  number: number;
  label: string;
  first: number;
  last: number;
}

export function seasonBounds(seasonNumber: number): { first: number; last: number } {
  const first = (seasonNumber - 1) * SEASON_SIZE + 1;
  const last = seasonNumber * SEASON_SIZE;
  return { first, last };
}

export type RankingScope = 'all-time' | 'yearly' | 'seasonal';

export interface RankingRow {
  user_id: number;
  rank: number;
  dzpp: number;
  rounds_played: number;
  first_places: number;
  best_placement: number | null;
  osu_id: string;
  username: string;
  avatar_url: string | null;
  country_code: string;
}

export interface PlayerRoundMapRow {
  round_id: number;
  submission_id: number;
  vote_rank: number;
  title: string;
  artist: string;
  mapper: string;
  difficulty_name: string;
  difficulty_id: string;
  beatmapset_id: string;
  cover_url: string | null;
  mod_requirement: string;
  challenge_requirement: string;
  score: string;
  accuracy: string;
  misses: number;
  max_combo: number;
  beatmap_max_combo: number;
  mods: string;
  osu_score_id: string | null;
  performance_value: string | null;
  completion_points: string;
  qualification_points: string;
  mod_compliance_points: string | null;
  requirement_achievement_points: string | null;
  placement_points: string;
  placement: number | null;
  qualified: boolean;
  field_size: number;
  final_dzpp: number;
  counted: boolean;
}

export interface PlayerRoundRow {
  round_id: number;
  round_number: number;
  month: string;
  year: number;
  performance_value: string | null;
  completion_points: string;
  qualification_points: string;
  placement_points: string;
  placement: number | null;
  qualified: boolean;
  field_size: number;
  final_dzpp: number;
  maps?: PlayerRoundMapRow[];
}

export interface RankingMeta {
  total: number;
  years: number[];
  currentSeason: CurrentSeason | null;
}

export function toApiRankingEntry(row: RankingRow) {
  return {
    rank: row.rank,
    userId: row.user_id,
    osuId: Number(row.osu_id),
    username: row.username,
    avatarUrl: row.avatar_url ?? '',
    country: row.country_code.trim(),
    dzpp: row.dzpp,
    roundsPlayed: row.rounds_played,
    firstPlaces: row.first_places,
    bestPlacement: row.best_placement,
  };
}

export function toApiPlayerDzppRound(row: PlayerRoundRow) {
  return {
    roundId: row.round_id,
    roundNumber: row.round_number,
    month: row.month,
    year: row.year,
    performanceValue: asPp(row.performance_value),
    completionPoints: Number(row.completion_points),
    qualificationPoints: Number(row.qualification_points),
    placementPoints: Number(row.placement_points),
    placement: row.placement,
    qualified: row.qualified,
    fieldSize: row.field_size,
    finalDzpp: row.final_dzpp,
    maps: (row.maps ?? []).map((map) => ({
      submissionId: map.submission_id,
      voteRank: map.vote_rank,
      title: map.title,
      artist: map.artist,
      mapper: map.mapper,
      difficultyName: map.difficulty_name,
      difficultyId: Number(map.difficulty_id),
      beatmapsetId: Number(map.beatmapset_id),
      coverUrl: map.cover_url ?? '',
      modRequirement: map.mod_requirement,
      challengeRequirement: map.challenge_requirement,
      score: Number(map.score),
      accuracy: Number(map.accuracy),
      misses: map.misses,
      maxCombo: map.max_combo,
      beatmapMaxCombo: map.beatmap_max_combo,
      mods: map.mods,
      osuScoreId: map.osu_score_id === null ? null : Number(map.osu_score_id),
      performanceValue: asPp(map.performance_value),
      completionPoints: Number(map.completion_points),
      qualificationPoints: Number(map.qualification_points),
      modCompliancePoints:
        map.mod_compliance_points === null ? null : Number(map.mod_compliance_points),
      requirementAchievementPoints:
        map.requirement_achievement_points === null
          ? null
          : Number(map.requirement_achievement_points),
      placementPoints: Number(map.placement_points),
      placement: map.placement,
      qualified: map.qualified,
      fieldSize: map.field_size,
      finalDzpp: map.final_dzpp,
      counted: map.counted,
    })),
  };
}
