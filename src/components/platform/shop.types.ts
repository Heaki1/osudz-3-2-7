/**
 * Shop domain types.
 *
 * These mirror the shapes returned by the shop API.
 *
 * Invariant reflected in these types: every monetary field below is
 * server-authoritative. The client reads prices; it never derives them.
 */

export type ItemLifecycle = 'draft' | 'ready' | 'active' | 'retired';

export type OwnershipType = 'normal' | 'stealable';

export type ItemCategory =
  | 'title'
  | 'badge'
  | 'frame'
  | 'username_decoration'
  | 'profile_decoration';

export type ProfileSlot =
  | 'title'
  | 'frame'
  | 'badge'
  | 'username_decoration'
  | null;

export type AssetType = 'png' | 'webp' | 'gif' | 'apng' | 'svg';

/**
 * Artwork is kept as its own object rather than flattened onto the item, to keep
 * artwork / item identity / shop behaviour conceptually separate.
 *
 * The 16:9 aspect ratio is the design contract with Figma. It is stated here so
 * there is exactly one place it is defined for the client.
 */
export const ARTWORK_ASPECT_RATIO = '16 / 9' as const;

export interface ShopArtwork {
  assetId: string;
  url: string;
  assetType: AssetType;
  /** Human-readable alt text; required for an item to reach `active`. */
  altText: string;
  /** True when the asset itself contains a frame-by-frame animation. */
  isAnimated?: boolean;

  /**
   * For profile frames only.
   * Ratio of the inner circular opening to the source artwork width.
   * Example: test3.png ≈ 852 / 1254 = 0.6794.
   */
  frameInnerDiameterRatio?: number;
}

export interface ShopItemOwner {
  userId: string;
  username: string;
  /**
   * What THIS owner paid. Immutable. Compensation on a future steal is derived
   * from this, never from the item's current price.
   */
  acquisitionPriceDzp: number;
  acquiredAtSeason: number;
  acquiredAt: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  ownershipType: OwnershipType;
  lifecycle: ItemLifecycle;
  profileSlot: ProfileSlot;
  displayOrder: number;

  /** Null until artwork is uploaded. An item cannot be `active` with null artwork. */
  artwork: ShopArtwork | null;

  /**
   * Normal items: the purchase price.
   * Stealable titles: the first-acquisition price. This is also the price a
   * fresh successor title would launch at if this one is retired.
   */
  initialPriceDzp: number;

  /**
   * Stealable titles only: what the next acquirer pays right now. This only
   * ever increases — see `nextStealPrice` in the service. Null for normal items.
   */
  currentPriceDzp: number | null;

  /** Stealable titles only. Null when unowned. */
  currentOwner: ShopItemOwner | null;

  /** Stealable titles only. */
  transferCount: number;
}

export interface OwnershipTransfer {
  id: string;
  itemId: string;
  userId: string;
  username: string;
  /** What this owner paid on acquisition. Immutable. */
  acquisitionPriceDzp: number;
  /** Compensation this owner received when the title was later taken from them. */
  compensationReceivedDzp: number | null;
  season: number;
  acquiredAt: string;
  lostAt: string | null;
}

export type LedgerTransactionType =
  | 'challenge_reward'
  | 'challenge_reward_adjustment'
  | 'purchase'
  | 'steal_purchase'
  | 'steal_compensation'
  | 'refund'
  | 'admin_adjustment';

export interface DzpLedgerEntry {
  id: string;
  season: number;
  /** Signed. Negative for spends. */
  amountDzp: number;
  transactionType: LedgerTransactionType;
  description: string;
  createdAt: string;
  /**
   * False for entries belonging to a closed season. Such entries remain visible
   * in history but do not contribute to the spendable balance.
   */
  spendable: boolean;
}

export interface Viewer {
  userId: string;
  username: string;
  /** Sum of current-season spendable ledger entries. Computed server-side. */
  balanceDzp: number;
}

export interface SeasonInfo {
  season: number;
  label: string;
  endsAt: string | null;
}

export interface ShopSnapshot {
  season: SeasonInfo;
  /** Null when the request is unauthenticated. */
  viewer: Viewer | null;
  items: ShopItem[];
  /** Item ids the viewer owns. Empty when unauthenticated. */
  ownedItemIds: string[];
}

/** One selected player-profile item. Ownership is verified by the server before
 * it can enter this list, and rechecked whenever the public profile is read. */
export interface EquippedProfileItem {
  profileSlot: Exclude<ProfileSlot, null>;
  itemId: string;
  name: string;
  artwork: Pick<
    ShopArtwork,
    'url' | 'altText' | 'assetType' | 'isAnimated' | 'frameInnerDiameterRatio'
  >;
}

export interface ShopProfile {
  equipped: EquippedProfileItem[];
}

export interface TransactionResult {
  /** The item in its post-transaction state, as returned by the server. */
  item: ShopItem;
  /** The viewer's balance after the transaction, as returned by the server. */
  viewer: Viewer;
  paidDzp: number;
  /** Ledger entries created by this transaction. */
  ledgerEntries: DzpLedgerEntry[];
  /**
   * Steals only. Who held the title before this transaction, and what they
   * were compensated. The number is computed and returned by the service —
   * components display it, they never compute it. Null for a first
   * acquisition (no previous owner) and for normal purchases.
   */
  previousOwner: { username: string; compensationDzp: number } | null;
}

export type ShopErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_UNAVAILABLE'
  | 'ARTWORK_MISSING'
  | 'NOT_STEALABLE'
  | 'NOT_PURCHASABLE'
  | 'ALREADY_OWNED'
  | 'INSUFFICIENT_FUNDS'
  | 'NETWORK_ERROR';

export class ShopError extends Error {
  readonly code: ShopErrorCode;

  constructor(code: ShopErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ShopError';
    this.code = code;
  }
}
