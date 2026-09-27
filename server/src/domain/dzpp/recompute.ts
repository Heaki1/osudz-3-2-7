import { DZPP_FORMULA_VERSION, type DzppRoundResult, type DzppBeatmapResult } from './formula.js';

export type FinalizeRefusal = 'not-ended' | 'already-finalized';
export type FinalizeFailure = FinalizeRefusal | 'gone';

export function refuseFinalize(round: {
  phase: string;
  dzpp_finalized_at: Date | null;
}): FinalizeRefusal | null {
  if (round.phase !== 'ended') return 'not-ended';
  if (round.dzpp_finalized_at !== null) return 'already-finalized';
  return null;
}

export type FinalizeOutcome =
  | { ok: true; results: DzppRoundResult[] }
  | { ok: false; reason: FinalizeFailure };

export type RecomputeRefusal = 'not-ended';
export type RecomputeFailure = RecomputeRefusal | 'gone';

export function refuseRecompute(round: {
  phase: string;
  dzpp_finalized_at: Date | null;
}): RecomputeRefusal | null {
  return round.phase === 'ended' ? null : 'not-ended';
}

export interface RecomputeSummary {
  roundId: number;
  previousRows: number;
  newRows: number;
  previousTotal: number;
  newTotal: number;
  previousFormulaVersion: number | null;
  newFormulaVersion: number;
  firstTime: boolean;
}

export type RecomputeOutcome =
  | { ok: true; summary: RecomputeSummary; results: DzppRoundResult[] }
  | { ok: false; reason: RecomputeFailure };

export function mergeBestBeatmapResults(
  results: readonly DzppBeatmapResult[]
): DzppBeatmapResult[] {
  const best = new Map<number, DzppBeatmapResult>();
  for (const result of results) {
    const existing = best.get(result.userId);
    if (
      existing === undefined ||
      result.finalDzpp > existing.finalDzpp ||
      (result.finalDzpp === existing.finalDzpp && result.voteRank < existing.voteRank)
    ) {
      best.set(result.userId, result);
    }
  }
  return [...best.values()];
}

export { DZPP_FORMULA_VERSION };
