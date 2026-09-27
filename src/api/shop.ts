import { get, send } from './clientCore';
import type * as T from './types';
import type { ShopArtwork, ShopItem, ShopProfile, ShopSnapshot, OwnershipTransfer, TransactionResult } from '../components/platform/shop/shop.types';

export const shopApi = {
    /** Public catalog snapshot; viewer data is included when the session is valid. */
    get: () => get<ShopSnapshot>("/shop"),

    /** The signed-in player's equipped profile items. */
    profile: () => get<ShopProfile>("/shop/profile"),

    /** Public equipped Shop items for a player profile. */
    publicProfile: (userId: number) => get<ShopProfile>(`/shop/profile/${userId}`),

    /** Sets or clears one profile slot; ownership is verified by the server. */
    equipProfileItem: (
      profileSlot: Exclude<ShopItem['profileSlot'], null>,
      itemId: string | null,
    ) => send<ShopProfile>("PUT", `/shop/profile/${profileSlot}`, { itemId }),

    /** One Shop item by id. */
    getItem: (itemId: string) =>
      get<ShopItem>(`/shop/items/${encodeURIComponent(itemId)}`),

    /** Complete ownership timeline for one Shop item. */
    ownershipHistory: (itemId: string) =>
      get<OwnershipTransfer[]>(
        `/shop/items/${encodeURIComponent(itemId)}/history`
      ),

    /** Purchases a normal Shop item using the server-authoritative DZP balance. */
    purchase: (itemId: string) =>
      send<TransactionResult>("POST", "/shop/purchase", { itemId }),

    /** Takes a stealable title using the server-authoritative current price. */
    steal: (itemId: string) =>
      send<TransactionResult>("POST", "/shop/steal", { itemId }),
};
