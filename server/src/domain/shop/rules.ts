export type ShopOwnershipType = 'normal' | 'stealable';
export type ShopLifecycle = 'draft' | 'ready' | 'active' | 'retired';

export interface ShopDraftInput {
  name: string;
  description: string;
  displayOrder: number;
  initialPriceDzp: number;
}

export interface ShopItemUpdateInput extends ShopDraftInput {
  currentPriceDzp: number | null;
}

export function validateDraftInput(input: ShopDraftInput): { name: string; description: string } {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length === 0 || name.length > 120) {
    throw new Error('Item name must be between 1 and 120 characters');
  }
  if (description.length === 0 || description.length > 2000) {
    throw new Error('Item description must be between 1 and 2000 characters');
  }
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) {
    throw new Error('Display order must be a non-negative integer');
  }
  if (!Number.isInteger(input.initialPriceDzp) || input.initialPriceDzp <= 0) {
    throw new Error('Initial price must be a positive integer');
  }
  return { name, description };
}

export function validateShopItemUpdateInput(input: ShopItemUpdateInput): {
  name: string;
  description: string;
} {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length === 0) throw new Error('Item name is required');
  if (name.length > 120) throw new Error('Item name must be 120 characters or fewer');
  if (description.length > 2000) {
    throw new Error('Item description must be 2000 characters or fewer');
  }
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) {
    throw new Error('Display order must be a non-negative integer');
  }
  if (!Number.isInteger(input.initialPriceDzp) || input.initialPriceDzp <= 0) {
    throw new Error('Initial price must be a positive integer');
  }
  if (
    input.currentPriceDzp !== null &&
    (!Number.isInteger(input.currentPriceDzp) || input.currentPriceDzp <= 0)
  ) {
    throw new Error('Current price must be a positive integer or null');
  }
  return { name, description };
}

export function assertShopItemActive(lifecycle: ShopLifecycle): void {
  if (lifecycle !== 'active') {
    const error = new Error('Item is not available');
    error.name = 'ITEM_UNAVAILABLE';
    throw error;
  }
}

export function assertStealableItem(
  ownershipType: ShopOwnershipType,
  currentPriceDzp: number | null,
): void {
  if (ownershipType !== 'stealable') {
    const error = new Error('This item is not stealable');
    error.name = 'NOT_STEALABLE';
    throw error;
  }
  if (currentPriceDzp === null || currentPriceDzp <= 0) {
    const error = new Error('This item has no valid steal price');
    error.name = 'ITEM_UNAVAILABLE';
    throw error;
  }
}

export function assertPurchasableItem(ownershipType: ShopOwnershipType): void {
  if (ownershipType !== 'normal') {
    const error = new Error('This item must be acquired through the steal flow');
    error.name = 'NOT_PURCHASABLE';
    throw error;
  }
}

export function assertNotAlreadyOwned(alreadyOwned: boolean, message: string): void {
  if (alreadyOwned) {
    const error = new Error(message);
    error.name = 'ALREADY_OWNED';
    throw error;
  }
}

export function assertSufficientBalance(balance: number, price: number): void {
  if (balance < price) {
    const error = new Error('Insufficient DZP');
    error.name = 'INSUFFICIENT_FUNDS';
    throw error;
  }
}

export function assertLifecycleTransition(
  current: ShopLifecycle,
  target: ShopLifecycle,
): void {
  const permitted =
    (current === 'draft' && (target === 'ready' || target === 'retired')) ||
    (current === 'ready' && (target === 'active' || target === 'retired')) ||
    (current === 'active' && target === 'retired');
  if (!permitted) {
    throw new Error(`Cannot change Shop item lifecycle from ${current} to ${target}`);
  }
}

export function assertAdminPriceRules(
  ownershipType: ShopOwnershipType,
  initialPriceDzp: number,
  currentPriceDzp: number | null,
  storedInitialPriceDzp: number,
  storedCurrentPriceDzp: number | null,
  hasTransferHistory: boolean,
): void {
  if (ownershipType === 'normal') {
    if (currentPriceDzp !== null) {
      throw new Error('Normal items cannot have a current steal price');
    }
    return;
  }
  if (currentPriceDzp === null) {
    throw new Error('Stealable items require a current price');
  }
  if (currentPriceDzp < storedCurrentPriceDzp!) {
    throw new Error('Stealable item price cannot decrease');
  }
  if (currentPriceDzp < initialPriceDzp) {
    throw new Error('Current price cannot be below the initial price');
  }
  if (hasTransferHistory && initialPriceDzp !== storedInitialPriceDzp) {
    throw new Error('Initial price cannot change after a stealable item has transfer history');
  }
}
