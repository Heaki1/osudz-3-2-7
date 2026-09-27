/** Pure placement math for DZPP. */
export const PLACEMENT_TABLE = [40, 36, 32, 28, 24, 20, 16, 12, 8, 4] as const;
export const FIELD_FACTOR_TARGET = 10;

export function fieldFactor(qualifiedPlayers: number): number {
  if (!(qualifiedPlayers > 0)) return 0;
  return Math.min(1, qualifiedPlayers / FIELD_FACTOR_TARGET);
}

export function basePlacementPoints(placement: number): number {
  if (!Number.isInteger(placement) || placement < 1) return 0;
  return PLACEMENT_TABLE[placement - 1] ?? 0;
}

export function placementPoints(placement: number, qualifiedPlayers: number): number {
  const base = basePlacementPoints(placement);
  if (base === 0) return 0;
  return Math.round(base * fieldFactor(qualifiedPlayers));
}
