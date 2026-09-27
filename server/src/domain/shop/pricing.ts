export const SHOP_SEASON_SIZE = 3;

export function seasonForRoundNumber(roundNumber: number | null): number {
  return roundNumber === null ? 1 : Math.max(1, Math.ceil(roundNumber / SHOP_SEASON_SIZE));
}

export function nextShopStealPrice(currentPriceDzp: number): number {
  return Math.ceil(currentPriceDzp * 1.5);
}

export function shopStealCompensation(previousOwnerAcquisitionPriceDzp: number): number {
  return Math.floor(previousOwnerAcquisitionPriceDzp * 0.5);
}

export function calculateStealPricing(
  currentPriceDzp: number,
  previousOwnerAcquisitionPriceDzp: number | null,
): { compensationDzp: number; newPriceDzp: number } {
  return {
    compensationDzp:
      previousOwnerAcquisitionPriceDzp === null
        ? 0
        : shopStealCompensation(previousOwnerAcquisitionPriceDzp),
    newPriceDzp: nextShopStealPrice(currentPriceDzp),
  };
}
