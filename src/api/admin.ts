import { get, send } from './clientCore';
import type * as T from './types';
import type { ShopArtwork, ShopItem } from '../components/platform/shop/shop.types';

export const adminApi = {
    /** `endsAt` overrides the scheduled end of the phase being entered. */
    setPhase: (phase: T.ApiRound["phase"], endsAt?: string | null) =>
      send<{ ok: boolean; round: T.ApiRound }>(
        "PATCH",
        "/admin/round/phase",
        endsAt === undefined ? { phase } : { phase, endsAt }
      ),
    /** Every field optional: month/year default to the current UTC month. */
    createRound: (body?: {
      month?: string;
      year?: number;
      reward?: string;
      submissionDays?: number;
      votingDays?: number;
      challengeDays?: number;
    }) => send<T.ApiRound>("POST", "/admin/rounds", body ?? {}),
    /** Every submission in a round, pending included. Defaults to the open round. */
    submissions: (roundId?: number) =>
      get<T.ApiSubmission[]>(roundId === undefined ? "/admin/submissions" : `/admin/submissions?roundId=${roundId}`),
    reviewSubmission: (id: number, status: "approved" | "rejected") =>
      send<{ ok: boolean; submission: T.ApiSubmission }>("PATCH", `/admin/submissions/${id}`, { status }),
    /** Ends the ballot and records a pending or tied winner. Does not advance the phase. */
    closeVoting: () =>
      send<{ ok: boolean; round: T.ApiRound; tied: number[] }>("POST", "/admin/round/close-voting"),
    /**
     * Ends a round whose voting phase has NOTHING approved to vote on.
     *
     * The round ends with no winner and no challenge — the honest outcome for a month
     * nobody entered. The server counts the approved entries itself and refuses with 409 if
     * there are any, so this cannot discard a real ballot; it is not an alternative to
     * closeVoting + approveWinner, which stay exactly as they were.
     */
    skipVoting: () =>
      send<{ ok: boolean; round: T.ApiRound }>("POST", "/admin/round/skip-voting"),
    /** Approves the winner and starts the challenge. submissionId is required on a tie. */
    approveWinner: (submissionId?: number) =>
      send<{ ok: boolean; round: T.ApiRound }>(
        "POST",
        "/admin/round/winner",
        submissionId === undefined ? {} : { submissionId }
      ),
    /**
     * Ends every session an account holds (G6). Separate from setting a block: a revocation
     * signs somebody out of every device, which is a different act from refusing them a vote.
     */
    revokeSessions: (userId: number) =>
      send<{ ok: boolean; sessionEpoch: number }>("POST", `/admin/users/${userId}/revoke`),
    /** Corrections applied to a round's recorded result. Defaults to the open round. */
    corrections: (roundId?: number) =>
      get<T.ApiResultCorrection[]>(
        roundId === undefined ? "/admin/round/corrections" : `/admin/round/corrections?roundId=${roundId}`
      ),
    /**
     * Overrides the recorded winner. The reason is required and stored — D4 exists so a
     * correction is explicit and visible rather than a silent UPDATE.
     */
    correctWinner: (submissionId: number, reason: string) =>
      send<{ ok: boolean; round: T.ApiRound }>("POST", "/admin/round/correction", { submissionId, reason }),
    /** One round's DZPP recompute history, newest first. roundId is required — see below. */
    dzppRecomputes: (roundId: number) =>
      get<T.ApiDzppRecompute[]>(`/admin/dzpp/recomputes?roundId=${roundId}`),
        /**
     * Rescores ONE ended round and records what changed.
     *
     * The round id is required and there is no bulk form on purpose: a single call that
     * rewrote every historical round would be one mistake away from reshaping the whole
     * leaderboard, and no audit row can undo that. The reason is required and stored.
     *
     * It rescores the plays AS STORED, through the same engine that froze them — so it
     * reflects a changed constant or a fixed bug, never a changed play. It also covers a round
     * that was never finalized at all, which is why there is no second endpoint for that.
     */
    recomputeDzpp: (roundId: number, reason: string) =>
      send<{ ok: boolean; summary: T.ApiDzppRecomputeSummary }>(
        "POST",
        "/admin/dzpp/recompute",
        { roundId, reason }
      ),

    /** Every Shop item for administration, including staged and retired items. */
    shopItems: () => get<ShopItem[]>("/admin/shop/items"),

    /** Creates an unpublished Shop draft. Artwork and lifecycle remain separate steps. */
    createShopItemDraft: (body: {
      name: string;
      description: string;
      category: ShopItem['category'];
      ownershipType: ShopItem['ownershipType'];
      displayOrder: number;
      initialPriceDzp: number;
    }) =>
      send<{ ok: boolean; draft: { id: string } }>("POST", "/admin/shop/items", body),

    /** All artwork records for one item, active first. */
    shopItemAssets: (itemId: string) =>
      get<T.ApiShopItemAsset[]>(`/admin/shop/items/${encodeURIComponent(itemId)}/assets`),

    /** Adds an artwork record; it may optionally become the selected artwork. */
    createShopItemAsset: (
      itemId: string,
      body: {
        assetType: ShopArtwork['assetType'];
        url: string;
        altText: string;
        frameInnerDiameterRatio: number | null;
        isAnimated: boolean;
        makeActive: boolean;
      },
    ) =>
      send<{ ok: boolean }>(
        "POST",
        `/admin/shop/items/${encodeURIComponent(itemId)}/assets`,
        body,
      ),

    /** Selects one existing artwork record as the player-facing artwork. */
    setShopItemAssetActive: (itemId: string, assetId: string) =>
      send<{ ok: boolean }>(
        "PATCH",
        `/admin/shop/items/${encodeURIComponent(itemId)}/assets/${encodeURIComponent(assetId)}/active`,
      ),

    /** Performs a validated one-way Shop lifecycle transition. */
    updateShopItemLifecycle: (
      itemId: string,
      lifecycle: 'ready' | 'active' | 'retired',
    ) =>
      send<{ ok: boolean }>(
        "PATCH",
        `/admin/shop/items/${encodeURIComponent(itemId)}/lifecycle`,
        { lifecycle },
      ),

    /** Updates editable Shop metadata. Server validates all price invariants. */
    updateShopItem: (
      itemId: string,
      body: {
        name: string;
        description: string;
        displayOrder: number;
        initialPriceDzp: number;
        currentPriceDzp: number | null;
      }
    ) =>
      send<{ ok: boolean }>(
        "PATCH",
        `/admin/shop/items/${encodeURIComponent(itemId)}`,
        body
      ),

    /** Read-only server configuration — what is set, never the secrets themselves. */
    config: () => get<T.ApiAdminConfig>("/admin/config"),
    discordTest: () => send<{ ok: boolean }>("POST", "/admin/discord/test"),

    /** The submission rules, with who last changed them. */
    settings: () => get<T.ApiAdminSiteSettings>("/admin/settings"),
    /**
     * Saves part of the rules. A PATCH, so the `rules` tab saving star limits cannot rewrite
     * the `challenge` tab's lists with whatever it last rendered.
     */
    saveSettings: (patch: Partial<T.ApiSiteSettings>) =>
      send<{ ok: boolean; settings: T.ApiAdminSiteSettings }>("PUT", "/admin/settings", patch),
    /** Every account, with the effective capability flags and any override. */
    users: () => get<T.ApiAdminUser[]>("/admin/users"),
    /** Only the accounts that carry an override — the exception list. */
    participants: () => get<T.ApiParticipantException[]>("/admin/participants"),
    /**
     * Sets one account's override. Pass null for a capability to leave it to the country
     * rule; at least one of the two must be true or false, since a row overriding nothing
     * records nothing.
     */
    setParticipant: (
      userId: number,
      body: { canSubmit: boolean | null; canVote: boolean | null; note?: string | null }
    ) => send<{ ok: boolean; override: T.ApiParticipantOverride }>("PUT", `/admin/participants/${userId}`, body),
    /** Clears the override, so the country rule applies to that account again. */
    clearParticipant: (userId: number) =>
      send<{ ok: boolean }>("DELETE", `/admin/participants/${userId}`),
    /**
     * The country allowlist. Every row, disabled ones included — the admin tab shows
     * both, and a disabled row is a decision rather than an absence.
     */
    countries: () => get<T.ApiAllowedCountry[]>("/admin/countries"),
    /** Adds a country, or flips one that is already listed. */
    setCountry: (code: string, enabled: boolean) =>
      send<{ ok: boolean; country: T.ApiAllowedCountry }>(
        "PUT",
        `/admin/countries/${code.toUpperCase()}`,
        { enabled }
      ),
    /** Removes the row outright — for a code typed by mistake, not for disabling one. */
    removeCountry: (code: string) =>
      send<{ ok: boolean }>("DELETE", `/admin/countries/${code.toUpperCase()}`),
    /**
     * Who voted for what, for moderation. Admin-only by construction — nothing public
     * exposes voter identity.
     */
    votes: (roundId?: number) =>
      get<T.ApiVoteAudit[]>(roundId === undefined ? "/admin/votes" : `/admin/votes?roundId=${roundId}`),
    /** Submission ids a tied round may be resolved to. */
    tiebreakEntries: () => get<number[]>("/admin/round/tiebreak"),
    /** Deletes a challenge chat message. Admin only. */
    deleteChatMessage: (id: number) =>
      send<{ ok: boolean }>('DELETE', `/challenge/chat/${id}`),
    /**
     * Records or overrides a challenge score by hand, for a play the osu! API will
     * not give up or a correction. The player is named by osu! id.
     */
    recordScore: (body: {
      osuId: number;
      score: number;
      accuracy: number;
      misses: number;
      mods?: string;
    }) => send<{ ok: boolean; score: T.ApiChallengeScore }>("POST", "/admin/challenge/scores", body),
};
