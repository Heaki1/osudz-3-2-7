import { placementPoints } from './placement.js';

export const DZPP_FORMULA_VERSION = 4;
export const CHALLENGE_SCORE_POINTS = 2;
export const SUBMISSION_APPROVED_POINTS = 3;
export const VOTE_POINTS = 5;
export const MOD_COMPLIANCE_POINTS = 10;
export const REQUIREMENT_ACHIEVEMENT_POINTS = 15;

export interface DzppScoreInput {
  pp: number | null;
  qualified: boolean;
  placement: number | null;
  qualifiedPlayers: number;
  hadApprovedSubmission: boolean;
  hadVote: boolean;
  hadModCompliance: boolean;
  hadRequirementAchievement: boolean;
}

export interface DzppBreakdown {
  performanceValue: number | null;
  completionPoints: number;
  qualificationPoints: number;
  placementPoints: number;
  placement: number | null;
  qualified: boolean;
  fieldSize: number;
  finalDzpp: number;
  formulaVersion: number;
}

export interface DzppRoundPlay {
  userId: number;
  pp: number | null;
  qualified: boolean;
  hadApprovedSubmission: boolean;
  hadVote: boolean;
  mods: string;
  modRequirement: string;
  challengeRequirement: string;
  score: number;
  accuracy: number;
  misses: number;
}

export interface DzppRoundResult extends DzppBreakdown {
  userId: number;
}

export interface DzppBeatmapResult extends DzppRoundResult {
  submissionId: number;
  voteRank: number;
  score: number;
  accuracy: number;
  misses: number;
  maxCombo: number;
  beatmapMaxCombo: number;
  mods: string;
  osuScoreId: number | null;
  modCompliancePoints: number;
  requirementAchievementPoints: number;
}

const usablePerformance = (pp: number | null): number | null =>
  pp !== null && Number.isFinite(pp) && pp >= 0 ? pp : null;

export function scoreOne(input: DzppScoreInput): DzppBreakdown {
  const performanceValue = usablePerformance(input.pp);
  const placement = input.qualified ? input.placement : null;
  const placementAward = placement === null ? 0 : placementPoints(placement, input.qualifiedPlayers);
  const qualificationAward =
    (input.hadModCompliance ? MOD_COMPLIANCE_POINTS : 0) +
    (input.hadRequirementAchievement ? REQUIREMENT_ACHIEVEMENT_POINTS : 0);
  const completionPoints =
    CHALLENGE_SCORE_POINTS +
    (input.hadApprovedSubmission ? SUBMISSION_APPROVED_POINTS : 0) +
    (input.hadVote ? VOTE_POINTS : 0);

  return {
    performanceValue,
    completionPoints,
    qualificationPoints: qualificationAward,
    placementPoints: placementAward,
    placement,
    qualified: input.qualified,
    fieldSize: input.qualifiedPlayers,
    finalDzpp: Math.round(
      (performanceValue ?? 0) + completionPoints + qualificationAward + placementAward
    ),
    formulaVersion: DZPP_FORMULA_VERSION,
  };
}

export const asPp = (value: string | null): number | null => {
  if (value === null || value.trim() === '') return null;
  const pp = Number(value);
  return Number.isFinite(pp) ? pp : null;
};
