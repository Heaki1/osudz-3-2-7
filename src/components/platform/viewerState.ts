/**
 * Centralized viewer-state derivation.
 *
 * Spec §16: item lifecycle is stored; viewer state is computed per request.
 * This is the ONLY place viewer state is derived. Components call this and
 * render the result; they never re-derive it from ownership + balance inline.
 *
 * This function SELECTS the applicable server-authoritative price. It never
 * computes one. There is no arithmetic on money in this file, by design.
 */

import type { ShopItem, Viewer } from './shop.types';

export type ViewerState =
  /** Viewer holds this item. Wins over every other state, including `retired`. */
  | 'owned_by_you'
  /** Lifecycle is not `active`, and the viewer does not hold it. */
  | 'unavailable'
  /** Stealable, held by someone else, and stealing is blocked for a non-funds reason. */
  | 'owned_by_other'
  /** Action is otherwise permitted, but the balance is short. */
  | 'insufficient_funds'
  /** Stealable, held by someone else, affordable, and actionable. */
  | 'stealable'
  /** Purchasable and affordable. */
  | 'available';

export interface ViewerStateResult {
  state: ViewerState;
  canPurchase: boolean;
  canSteal: boolean;
  /**
   * The viewer's current server-provided DZP balance.
   * Read-only passthrough; no money is derived here.
   */
  viewerBalanceDzp: number;
  actionPriceDzp: number | null;
  shortfallDzp: number | null;
  requiresAuth: boolean;
  ownerUserId: string | null;
  ownerUsername: string | null;
}

/**
 * Selects the price the viewer would pay. Reads only; no derivation.
 *
 * Normal items -> initialPriceDzp.
 * Stealable, unowned -> initialPriceDzp (first acquisition).
 * Stealable, owned -> currentPriceDzp (the steal price the server holds).
 */
function selectActionPrice(item: ShopItem): number | null {
  if (item.ownershipType === 'normal') {
    return item.initialPriceDzp;
  }
  if (item.currentOwner === null) {
    return item.initialPriceDzp;
  }
  return item.currentPriceDzp;
}

function base(
  item: ShopItem,
  viewer: Viewer | null,
): ViewerStateResult {
  return {
    state: 'unavailable',
    canPurchase: false,
    canSteal: false,
    viewerBalanceDzp: viewer?.balanceDzp ?? 0,
    actionPriceDzp: null,
    shortfallDzp: null,
    requiresAuth: false,
    ownerUserId: item.currentOwner?.userId ?? null,
    ownerUsername: item.currentOwner?.username ?? null,
  };
}

export function deriveViewerState(
  item: ShopItem,
  viewer: Viewer | null,
  ownedItemIds: readonly string[],
): ViewerStateResult {
  const result = base(item, viewer);

  // 1. Ownership wins outright. A retired item you own still reads as yours,
  //    because retiring never removes the current owner's item (§10, §13).
  const ownsNormal = ownedItemIds.includes(item.id);
  const ownsStealable =
    viewer !== null && item.currentOwner?.userId === viewer.userId;

  if (ownsNormal || ownsStealable) {
    return { ...result, state: 'owned_by_you' };
  }

  // 2. Anything not `active` is unpurchasable. Artwork is a hard gate: an item
  //    without a valid active asset must never be actionable (§20).
  if (item.lifecycle !== 'active' || item.artwork === null) {
    // Surface the owner for a disabled-but-held title so the card can still
    // show who has it, rather than reading as an ownerless dead item.
    if (item.ownershipType === 'stealable' && item.currentOwner !== null) {
      return { ...result, state: 'owned_by_other' };
    }
    return result;
  }

  const price = selectActionPrice(item);
  if (price === null) {
    return result;
  }

  // 3. Signed out. The item is genuinely available; the viewer just isn't known.
  if (viewer === null) {
    const isHeld =
      item.ownershipType === 'stealable' && item.currentOwner !== null;
    return {
      ...result,
      state: isHeld ? 'owned_by_other' : 'available',
      actionPriceDzp: price,
      requiresAuth: true,
    };
  }

  // 4. Funds.
  if (viewer.balanceDzp < price) {
    return {
      ...result,
      state: 'insufficient_funds',
      actionPriceDzp: price,
      shortfallDzp: price - viewer.balanceDzp,
    };
  }

  // 5. Actionable.
  const isSteal = item.ownershipType === 'stealable';

  return {
    ...result,
    state: isSteal ? 'stealable' : 'available',
    canPurchase: !isSteal,
    canSteal: isSteal,
    actionPriceDzp: price,
  };
}

/**
 * Items the Shop grid should render at all. `draft` never reaches players;
 * `ready` is staged but not yet public. Retired items remain visible so owners
 * and history stay discoverable.
 */
export function isVisibleInShop(item: ShopItem): boolean {
  return item.lifecycle === 'active' || item.lifecycle === 'retired';
}
