/** Shared player-facing API models. These describe existing response payloads. */

export interface ApiPlayerDzppMap {
  submissionId: number;
  voteRank: number;

  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  difficultyId: number;
  beatmapsetId: number;
  stars: number;
  bpm: number;
  length: string;
  mapStatus: string;
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
  coverUrl: string;

  modRequirement: string;
  challengeRequirement: string;

  score: number;
  accuracy: number;
  misses: number;
  maxCombo: number;
  beatmapMaxCombo: number;
  mods: string;
  osuScoreId: number | null;

  performanceValue: number | null;
  completionPoints: number;
  qualificationPoints: number;
  placementPoints: number;
  modCompliancePoints: number | null;
  requirementAchievementPoints: number | null;
  placement: number | null;
  qualified: boolean;
  fieldSize: number;
  finalDzpp: number;

  /** True when this map produced the player's authoritative round total. */
  counted: boolean;
}

export interface ApiPlayerDzppRound {
  roundId: number;
  roundNumber: number;
  month: string;
  year: number;
  /** osu! pp for the play. Null when osu! reported none — a Loved map, or unranked mods. */
  performanceValue: number | null;
  completionPoints: number;
  qualificationPoints: number;
  /** Already multiplied by the field factor. */
  placementPoints: number;
  /** Null when the play did not qualify — only qualified players are placed. */
  placement: number | null;
  qualified: boolean;
  /** Qualified players in the round: the field factor's input. */
  fieldSize: number;
  finalDzpp: number;

 /** Frozen result for every challenge beatmap the player played in this round. */
maps: ApiPlayerDzppMap[];
}

export interface ApiPlayerProfile {
  userId: number;
  osuId: number;
  username: string;
  /** ISO 3166-1 alpha-2, upper-case. */
  country: string;
  avatarUrl: string;
  profileBannerUrl: string;
  /** osu! global rank at last login. Null for unranked accounts. */
  globalRank: number | null;
  /** Current osu! country performance rank. */
  countryRank: number | null;
  /** Current osu! performance points. */
  osuPp: number | null;
  /** Cumulative all-time DZPP. Zero when the player has no scored rounds. */
  dzpp: number;
  /** Position in the all-time DZPP leaderboard. Null when dzpp is zero. */
  dzppRank: number | null;
  /** Challenge rounds in which this player has a frozen DZPP result. */
  roundsPlayed: number;
  /** Rounds the player finished #1 in the qualified field. */
  firstPlaces: number;
  /** Best ever placement among qualified players. Null if never qualified. */
  bestPlacement: number | null;
  /** Sum of the actual score values from qualified challenge plays. */
  qualifiedScores: number;
  /** Imported scores across challenge beatmaps. */
  challengePlays: number;
  /** Sum of all imported challenge scores, including non-qualified attempts. */
  totalChallengeScore: number;
  /** Approved beatmap submissions authored by this player. */
  approvedBeatmaps: number;
  /** Votes received across this player's submissions. */
  votesReceived: number;
  /** Cumulative PP Duel earned as the stake from winning settled duels. */
  duelPp: number;
  /** Rank by cumulative PP Duel earned from wins. */
  duelPpRank: number | null;
  duelHistory: Array<{ duelId: number; createdAt: string; amount: number }>;
}
