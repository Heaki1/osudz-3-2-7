import type { ApiPlayerDzppMap, ApiPlayerDzppRound, ApiPlayerProfile } from '../types/player';
import type {
  DzpLedgerEntry,
  OwnershipTransfer,
  ShopArtwork,
  ShopItem,
  ShopProfile,
  ShopSnapshot,
  TransactionResult,
} from '../components/platform/shop/shop.types';
export interface ApiUser {
  id: number;
  osuId: number;
  username: string;
  country: string;
  avatarUrl: string;
  /** osu! global rank at last login; null for unranked accounts. */
  globalRank: number | null;
  isAdmin: boolean;
  /**
   * Whether this account may vote. Computed server-side by the same function the gate
   * that refuses the write uses, so the client never re-derives eligibility from
   * `country` and cannot drift from it.
   */
  canVote: boolean;
  /**
   * Whether this account may submit. Separate from canVote because an administrator
   * controls the two independently (C5) — a blocked voter may still be able to enter a
   * beatmap, and the reverse.
   */
  canSubmit: boolean;
  /**
   * Whether this account may post a challenge score. DERIVED from the two capabilities
   * above rather than stored: the country rule decides unless an administrator has blocked
   * or granted BOTH, which is the only unambiguous statement about taking part. See
   * canEnterChallenge in server/src/repo/users.ts.
   */
  canChallenge: boolean;
}

export interface ApiDuel {
  id: number;
  status: 'open' | 'live' | 'settled';
  challenger: string;
  challengerAvatar?: string;
  opponent?: string;
  opponentAvatar?: string;
  title: string;
  artist: string;
  difficulty: string;
  stars: number;
  mods: string;
  requirement: string;
  stake: number;
  endsAt: string;
  challengerScore?: number;
  opponentScore?: number;
  challengerAccuracy?: number;
  opponentAccuracy?: number;
  challengerMisses?: number;
  opponentMisses?: number;
  challengerScoreId?: number;
  opponentScoreId?: number;
  difficultyId: number;
  beatmapsetId?: number;
  coverUrl?: string;
  previewUrl?: string;
  mapper?: string;
  bpm?: number;
  lengthSeconds?: number;
  cs?: number | null;
  ar?: number | null;
  od?: number | null;
  hp?: number | null;
  maxCombo?: number | null;
  mapStatus?: string;
  challengerUserId: number;
  opponentUserId?: number;
  challengerReplayReady?: boolean;
  opponentReplayReady?: boolean;
}

export interface ApiRound {
  id: number;
  roundNumber: number;
  phase: "submission" | "voting" | "challenge" | "ended";
  month: string;
  year: number;
  reward: string;
  /**
   * Scheduled phase ends, ISO 8601. Null when the round was created without
   * durations. These are a schedule, not a clock: advancing a phase early leaves
   * the later ends where they were unless the admin overrides them.
   */
  submissionEndsAt: string | null;
  votingEndsAt: string | null;
  challengeEndsAt: string | null;
  /**
   * How far this round's winner has got. The phase stays 'voting' while the winner
   * is 'pending' or 'tiebreak', so this is what says whether the ballot is open.
   */
  winnerStatus: "none" | "pending" | "tiebreak" | "official";
  /** Null until the winner is determined, and while a tie is unresolved. */
  winningSubmissionId: number | null;
  /** Frozen when voting closed. On a tie, the count each tied entry reached. */
  winnerVoteCount: number | null;
  /** Votes cast in the round, frozen alongside winnerVoteCount. */
  totalVotes: number | null;
  winnerApprovedAt: string | null;
  /**
   * When this round's DZPP was frozen, or null when it never was — the admin recompute panel
   * needs to tell "scored" from "never scored", and a round can be finalized to zero rows.
   */
  dzppFinalizedAt: string | null;
}

/**
 * One challenge beatmap in an archived round, with its own leaderboard.
 *
 * A round may have multiple challenge beatmaps (the top-N most-voted entries).
 * Each carries its own mod/challenge requirement and its own ordered leaderboard.
 */
export interface ApiArchivedBeatmap extends ApiChallengeBeatmap {
  /** Scores for this beatmap only, ordered by this beatmap's challenge requirement. */
  leaderboard: ApiChallengeScore[];
}

/**
 * A round with everything the archive shows. Served by GET /rounds and GET /rounds/:id;
 * GET /rounds/current stays lean, because every page loads that one on every render.
 */
export interface ApiRoundDetail extends ApiRound {
  /**
   * The recorded winner, pending or official — winnerStatus says which. Null when
   * nothing is recorded yet, and while a tie is unresolved.
   */
  winner: ApiSubmission | null;
  /**
   * That round's challenge scores for the winner beatmap, in the order the server
   * ordered them. Kept for backwards compatibility; prefer challengeBeatmaps.
   */
  leaderboard: ApiChallengeScore[];
  /**
   * All challenge beatmaps for this round, each with its own leaderboard.
   * Empty for rounds that pre-date the multi-beatmap feature.
   */
  challengeBeatmaps: ApiArchivedBeatmap[];
  /** Distinct people who entered, voted, or posted a challenge score in this round. */
  participants: number;
}

export type MapStatus = "ranked" | "loved" | "approved";

export interface ApiSubmission {
  id: number;
  beatmapsetId: number;
  difficultyId: number;
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  /** The beatmap's own osu! status. Distinct from reviewStatus below. */
  mapStatus: MapStatus;
  coverUrl: string;
  previewUrl: string;
  stars: number;
  bpm: number;
  /** Display string ("2:19"); the column stores seconds. */
  length: string;
  cs: number;
  ar: number;
  od: number;
  hp: number;
  genre?: string;
  challengeRequirement: string;
  modRequirement: string;
  submittedByName: string;
  voteCount: number;
  /** Admin review state. Only 'approved' rows come back from GET /submissions. */
  reviewStatus: "pending" | "approved" | "rejected";
  submittedAt: string;
  isFavorited?: boolean;
}

/**
 * What the server reads off the osu! API for a pasted URL. Not a submission yet —
 * it has no id, and the row is built from a fresh lookup at submit time rather
 * than from this.
 */
export interface ApiBeatmapPreview {
  difficultyId: number;
  beatmapsetId: number;
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  mapStatus: MapStatus;
  coverUrl: string;
  previewUrl: string;
  stars: number;
  bpm: number;
  lengthSeconds: number;
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
  modeInt?: number;
}

/**
 * One beatmap search hit.
 *
 * A hit is a beatmapSET, represented by its hardest difficulty — `difficultyCount` says
 * how many the set has, so a card can be honest about showing one of several rather
 * than implying the set is a single map.
 */
export interface ApiSearchDifficulty {
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

export interface ApiSearchHit {
  beatmapsetId: number;
  title: string;
  artist: string;
  mapper: string;
  mapStatus: MapStatus;
  coverUrl: string;
  previewUrl: string;
  difficulties: ApiSearchDifficulty[];
}

/**
 * One player's play on a round's winning beatmap.
 *
 * `qualified` is what the play can be judged on by itself — the required mods, and a
 * full combo where that was the requirement. The other three challenge requirements
 * are relative, so they are expressed by the order the server returns rather than by
 * this flag; see server/src/repo/challengeScores.ts.
 */
export interface ApiChallengeScore {
  /** 1-based position in the order the server returned. 0 for a single score read. */
  rank: number;
  userId: number;
  osuId: number;
  username: string;
  avatarUrl: string;
  score: number;
  /** A percentage, 0-100. */
  accuracy: number;
  misses: number;
  /** Maximum combo achieved by the play. */
  maxCombo: number;
  /** Maximum combo of the challenge beatmap. */
  beatmapMaxCombo: number;
  /** Joined acronyms ('HDHR'), or 'NM'. */
  mods: string;
  qualified: boolean;
  /** True when the play used every mod required by the round, even if the challenge requirement failed. */
  modCompliant: boolean;
  /**
   * DZPP this play is worth as the round stands, or null when the read could not know it —
   * a single-score read has no field size, and an archived round's real answer is the frozen
   * row rather than a recomputation.
   *
   * PROVISIONAL while the challenge is open: placement and the field factor both move as
   * scores arrive. The server computes it with the same engine that freezes round_dzpp, so it
   * is never a second formula.
   */
  dzpp: number | null;
  /** Null when an administrator entered this by hand rather than importing it. */
  osuScoreId: number | null;
  submittedAt: string;
}

/**
 * One row of the DZ Performance Rankings.
 *
 * Algeria only. The filter runs inside the query in server/src/repo/dzpp.ts, so a player
 * outside the ranking never reaches this shape at all.
 */
export interface ApiRankingEntry {
  /** Shared by players level on points, the way osu!'s own rankings do it. */
  rank: number;
  userId: number;
  osuId: number;
  username: string;
  avatarUrl: string;
  country: string;
  /** Cumulative DZPP — a plain sum of every frozen round in the selected period. */
  dzpp: number;
  /** Provisional DZPP from the currently active challenge; zero outside challenge phase. */
  liveDzpp?: number;
  roundsPlayed: number;
  firstPlaces: number;
  /** Null for a player who has never qualified in a counted round. */
  bestPlacement: number | null;
}

/**
 * A page of the ranking.
 *
 * An envelope rather than the bare array every other read here returns, because a bare array
 * cannot carry the total, and a pager that does not know how many pages exist is a pager that
 * guesses.
 */
export interface ApiRankingPage {
  page: number;
  pageSize: number;
  /** Players in the whole filtered table, not on this page. */
  total: number;
  /** Seasons that actually hold DZPP, newest first — the year selector's options. */
  years: number[];
  currentSeason: {
    number: number;
    label: string;
    first: number;
    last: number;
  } | null;
  entries: ApiRankingEntry[];
}

/**
 * One frozen round in a player's DZPP history, with the whole breakdown.
 *
 * The terms travel with the total on purpose: a table of totals with no visible derivation is
 * a table people argue with rather than chase.
 */


export interface ApiChallengeCollectionItem {
  roundId: number;
  submissionId: number;
  roundNumber: number;
  month: string;
  year: number;
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  difficultyId: number;
  beatmapsetId: number;
  coverUrl: string;
  previewUrl: string;
  modRequirement: string;
  challengeRequirement: string;
  finalDzpp: number;
  placement: number | null;
  perfectionEligible: boolean;
  acquiredAt: string;
  ownerUserId: number;
  ownerUsername: string;
}



export interface ApiActivityEvent {
  id: number;
  userId: number | null;
  username: string | null;
  avatarUrl: string | null;
  roundId: number | null;
  roundNumber: number | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ApiProgression {
  progression: {
    dzpp: number;
    rounds: number;
    wins: number;
    best: number | null;
    submissions: number;
    votes: number;
    level: number;
    baseLevel: number;
    challengeWins: number;
  challengeWinLevels: number;
  levelProgress: number;
  nextLevelDzpp: number;
  level50Reward: string | null;
};
  streak: { currentWins: number; bestWins: number; rounds: number };
  mapping: { submissions: number; approved: number; votes_received: number; rounds: number };
}

export interface ApiLevelRushEntry {
  rank: number;
  userId: number;
  username: string;
  avatarUrl: string;
  level: number;
  baseLevel: number;
  dzpp: number;
  challengeWins: number;
  challengeWinLevels: number;
  levelProgress: number;
  level50Reward: string | null;
}

/**
 * One vote with the account that cast it — GET /admin/votes only.
 *
 * Ballot secrecy is a rule, not an oversight: no public endpoint carries voter identity,
 * and this shape exists so an administrator can investigate a dispute. Do not reuse it
 * on a public surface.
 */
export interface ApiVoteAudit {
  voteId: number;
  userId: number;
  username: string;
  osuId: number;
  avatarUrl: string;
  country: string;
  submissionId: number;
  submissionTitle: string;
  submissionArtist: string;
  difficultyName: string;
  castAt: string;
  /**
   * When the vote was last moved (B9). Equal to castAt until it is moved, so a vote that
   * changed is distinguishable from one that was cast and left alone.
   *
   * Only the time is recorded, not the previous choice — that would need a history table.
   */
  movedAt: string;
}


/**
 * One country on the submit-and-vote allowlist.
 *
 * A row with enabled false is kept rather than deleted: it records that an administrator
 * considered the country and refused it, which an absent row does not say. The country
 * NAME is not stored — the client derives it from the code with Intl.DisplayNames, so
 * adding a country is two letters rather than a code change.
 */
export interface ApiAllowedCountry {
  /** ISO 3166-1 alpha-2, upper case. */
  country: string;
  enabled: boolean;
  /** The administrator who last changed this decision; null if their account is gone. */
  addedBy: number | null;
  addedAt: string;
}

/**
 * A per-player permission override — the "exception" an administrator sets after an
 * investigation (C5).
 *
 * Each flag is THREE-VALUED: null means no override for that capability, so the country
 * allowlist decides it; true grants it; false refuses it. An override wins in both
 * directions, which is why this is not a ban list.
 */
export interface ApiParticipantOverride {
  canSubmit: boolean | null;
  canVote: boolean | null;
  note: string | null;
  setBy: number | null;
  setAt: string | null;
}

/**
 * One account as the admin Users tab sees it.
 *
 * canSubmit and canVote are the EFFECTIVE answers — what the gates would actually decide.
 * `countryAllowed` and `override` are the two inputs that produced them, so the tab can
 * show why an account is allowed rather than guessing at it.
 */
export interface ApiAdminUser {
  id: number;
  osuId: number;
  username: string;
  country: string;
  avatarUrl: string;
  profileBannerUrl: string;
  globalRank: number | null;
  isAdmin: boolean;
  canSubmit: boolean;
  canVote: boolean;
  /** The effective challenge answer, so the tab can show that a full block reached it. */
  canChallenge: boolean;
  countryAllowed: boolean;
  override: ApiParticipantOverride | null;
}

/** One override with the account it applies to, for the Eligibility tab's exception list. */
export interface ApiParticipantException extends ApiParticipantOverride {
  userId: number;
  username: string;
  osuId: number;
  country: string;
  avatarUrl: string;
  /** The administrator who set it, by name; null if their account is gone. */
  setByName: string | null;
  setAt: string;
}

/**
 * One favorited beatmap.
 *
 * TWO SOURCES, ONE LIST. 'dz' is a map favorited on this site, 'osu' is one imported from
 * the player's osu! profile. They are presented together and distinguished by source; an
 * import never overwrites a 'dz' row, which the primary key enforces server-side.
 *
 * mapStatus is a plain string here, unlike everywhere else: a favorite may be graveyard or
 * pending, because the ranked-status rule belongs to the submit path.
 */
export interface ApiFavorite {
  difficultyId: number;
  beatmapsetId: number;
  source: "dz" | "osu";
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  mapStatus: string;
  coverUrl: string;
  previewUrl: string;
  stars: number;
  bpm: number;
  lengthSeconds: number;
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
  favoritedAt: string;
}

/**
 * The administrator-defined submission rules (C8 and C9).
 *
 * A null bound means no bound — which is what migration 011 seeded, so nothing changed on the
 * day the store landed. The three lists are what the submit page offers and what the server
 * validates against, so they cannot drift the way the hardcoded copies did.
 */
/**
 * One beatmap that advanced to the challenge phase for a round.
 * Returned by GET /api/challenge/beatmaps.
 */
export interface ApiChallengeBeatmap {
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
  /** Display string e.g. "2:19" */
  length: string;
  coverUrl: string;
  previewUrl: string;
  modRequirement: string;
  challengeRequirement: string;
  mapStatus: string;
}

export interface ApiSiteSettings {
  minStars: number | null;
  maxStars: number | null;
  minLengthSeconds: number | null;
  maxLengthSeconds: number | null;
  allowedStatuses: string[];
  allowedMods: string[];
  allowedChallengeTypes: string[];
  /**
   * Maximum number of approved submissions allowed per round. Null means no limit.
   * Enforced server-side when an administrator approves a submission.
   */
  maxChallengeBeatmaps: number | null; 
  /**
 * Maximum number of non-rejected submissions a user may have in one round.
 * Null means no limit.
 */
  maxSubmissionsPerUser: number | null;
}

/** The same rules plus who last changed them — GET /api/admin/settings only. */
export interface ApiAdminSiteSettings extends ApiSiteSettings {
  updatedBy: number | null;
  updatedAt: string;
}

/**
 * Read-only server configuration, for the admin config tab.
 *
 * Booleans and counts, never the values: the Discord webhook and the admin id list are
 * credentials, and an endpoint that returned them would put a secret on the wire to answer a
 * question that only needs a yes.
 */
export interface ApiAdminConfig {
  discordConfigured: boolean;
  clientOrigin: string;
  publicBaseUrl: string;
  secureCookies: boolean;
  adminCount: number;
}

/**
 * One administrator correction of a recorded result (D4).
 *
 * The only way a recorded winner ever changes. Append-only: the previous entry stays named
 * here rather than being overwritten, so a round corrected twice keeps both steps.
 */
/**
 * One audited DZPP recompute of one round.
 *
 * Append-only on the server: a row records what a round used to be worth so the change stays
 * legible, which is the whole reason freezing a round is safe.
 */
export interface ApiDzppRecompute {
  id: number;
  roundId: number;
  roundNumber: number;
  previousRows: number;
  newRows: number;
  previousTotal: number;
  newTotal: number;
  /** Null when the round had never been scored — a missed finalization, not a rescore. */
  previousFormulaVersion: number | null;
  newFormulaVersion: number;
  reason: string;
  recomputedBy: number | null;
  recomputedByName: string | null;
  recomputedAt: string;
}

/** What a recompute changed, returned by the write itself. */
export interface ApiDzppRecomputeSummary {
  roundId: number;
  previousRows: number;
  newRows: number;
  previousTotal: number;
  newTotal: number;
  previousFormulaVersion: number | null;
  newFormulaVersion: number;
  /** True when the round held no frozen rows at all before the call. */
  firstTime: boolean;
}

export interface ApiResultCorrection {
  id: number;
  roundId: number;
  previousSubmissionId: number | null;
  previousTitle: string | null;
  newSubmissionId: number | null;
  newTitle: string | null;
  previousWinnerStatus: string;
  reason: string;
  correctedBy: number | null;
  correctedByName: string | null;
  correctedAt: string;
}

/**
 * One message in the challenge-phase live chat.
 *
 * Scoped to one round. Never archived. Admins can delete any message.
 */
export interface ApiChatMessage {
  id: number;
  roundId: number;
  userId: number;
  username: string;
  avatarUrl: string;
  /** True when the author is an administrator — shown with a badge in the UI. */
  isAdmin: boolean;
  body: string;
  createdAt: string;
}

export interface ApiStats {
  players: number;
  submissions: number;
  votes: number;
  challenges: number;
  winners: number;
}

/**
 * One comment on a submission (B8).
 *
 * parentId is the comment being replied to, or null for a top-level one. The panel renders a
 * reply directly under its parent rather than a tree, so one level is what the shape supports
 * in practice even though the column would allow more.
 */
export interface ApiComment {
  id: number;
  submissionId: number;
  parentId: number | null;
  userId: number;
  username: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
}

export type { ApiPlayerDzppMap, ApiPlayerDzppRound, ApiPlayerProfile } from '../types/player';

export type ApiErrorKind = 'http' | 'network';

export interface ApiError {
  kind: ApiErrorKind;
  /** HTTP status for server responses; 0 when no response was received. */
  status: number;
  error: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | ({ ok: false } & ApiError);

export type ApiReadResult<T> = ApiResult<T>;

export interface ApiShopItemAsset {
  id: string;
  assetType: ShopArtwork['assetType'];
  url: string;
  altText: string;
  frameInnerDiameterRatio: number | null;
  isAnimated: boolean;
  isActive: boolean;
  createdAt: string;
}

// ── Player profile types ───────────────────────────────────────────────────────

/**
 * A player's public identity record, returned by GET /api/players/:username.
 *
 * Distinct from ApiRankingEntry in two ways:
 *   – It resolves ANY username, not just players already on the leaderboard.
 *   – It carries the osu! global rank, which the ranking table does not expose.
 *
 * `dzppRank` is null for players with no scored rounds (they exist as users
 * but have never appeared in a finalised round).
 */


/**
 * One owned Shop item as returned by GET /api/players/:userId/shop-items.
 *
 * Only items the player currently holds are included. For stealable titles the
 * server checks currentOwner.userId before including the row, so a lost title
 * is never surfaced here.
 *
 * `artwork` is null when the item has no active asset.
 */
export interface ApiPlayerShopItem {
  itemId: string;
  name: string;
  description: string;
  /** Mirrors ShopItem['category']. */
  category: ShopItem['category'];
  /** Mirrors ShopItem['profileSlot']. Null for profile_decoration items. */
 profileSlot: ShopItem['profileSlot'];
artwork: Pick<
  ShopArtwork,
  'url' | 'altText' | 'assetType' | 'isAnimated' | 'frameInnerDiameterRatio'
> | null;
  /** ISO 8601 timestamp of acquisition (purchase, steal, or admin grant). */
  acquiredAt: string;
  /** Season number in which the item was acquired. */
  season: number;
}
