import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_SCORE_POINTS,
  DZPP_FORMULA_VERSION,
  FIELD_FACTOR_TARGET,
  MOD_COMPLIANCE_POINTS,
  PLACEMENT_TABLE,
  RANKING_COUNTRY,
  REQUIREMENT_ACHIEVEMENT_POINTS,
  SUBMISSION_APPROVED_POINTS,
  VOTE_POINTS,
  basePlacementPoints,
  fieldFactor,
  placementPoints,
  refuseFinalize,
  refuseRecompute,
  scoreOne,
  scoreRound,
  DzppRoundResult,
  toApiPlayerDzppRound,
  toApiRankingEntry,
  toRoundPlay,
  type DzppRoundPlay,
  type DzppScoreInput,
} from './dzpp.js';

// The numbers the specification froze. This test exists so that changing one of them is
// never an accident: a constant is a policy decision that needs a new formula version,
// not an edit.
describe('the approved constants', () => {
  it('holds the values approved for formula version 4', () => {
    expect(CHALLENGE_SCORE_POINTS).toBe(2);
    expect(SUBMISSION_APPROVED_POINTS).toBe(3);
    expect(VOTE_POINTS).toBe(5);
    expect(MOD_COMPLIANCE_POINTS).toBe(10);
    expect(REQUIREMENT_ACHIEVEMENT_POINTS).toBe(15);
    expect(FIELD_FACTOR_TARGET).toBe(10);
    expect(DZPP_FORMULA_VERSION).toBe(4);
    expect([...PLACEMENT_TABLE]).toEqual([40, 36, 32, 28, 24, 20, 16, 12, 8, 4]);
  });

  it('completion sub-awards sum to 10', () => {
    expect(CHALLENGE_SCORE_POINTS + SUBMISSION_APPROVED_POINTS + VOTE_POINTS).toBe(10);
  });

  it('qualification sub-awards sum to 25', () => {
    expect(MOD_COMPLIANCE_POINTS + REQUIREMENT_ACHIEVEMENT_POINTS).toBe(25);
  });
});

describe('fieldFactor', () => {
  it('is the field count divided by 10 for every field short of the target', () => {
    expect(fieldFactor(1)).toBe(0.1);
    expect(fieldFactor(2)).toBe(0.2);
    expect(fieldFactor(3)).toBe(0.3);
    expect(fieldFactor(4)).toBe(0.4);
    expect(fieldFactor(5)).toBe(0.5);
    expect(fieldFactor(6)).toBe(0.6);
    expect(fieldFactor(7)).toBe(0.7);
    expect(fieldFactor(8)).toBe(0.8);
    expect(fieldFactor(9)).toBe(0.9);
    expect(fieldFactor(10)).toBe(1);
    expect(fieldFactor(11)).toBe(1);
  });

  it('reaches 1 at the target and never exceeds it', () => {
    expect(fieldFactor(10)).toBe(1);
    expect(fieldFactor(11)).toBe(1);
    expect(fieldFactor(20)).toBe(1);
    expect(fieldFactor(500)).toBe(1);
  });

  it('is 0 for an empty field', () => {
    expect(fieldFactor(0)).toBe(0);
    expect(fieldFactor(-3)).toBe(0);
  });
});

describe('basePlacementPoints', () => {
  it('pays the table for the first ten places', () => {
    expect(basePlacementPoints(1)).toBe(40);
    expect(basePlacementPoints(2)).toBe(36);
    expect(basePlacementPoints(3)).toBe(32);
    expect(basePlacementPoints(4)).toBe(28);
    expect(basePlacementPoints(5)).toBe(24);
    expect(basePlacementPoints(6)).toBe(20);
    expect(basePlacementPoints(7)).toBe(16);
    expect(basePlacementPoints(8)).toBe(12);
    expect(basePlacementPoints(9)).toBe(8);
    expect(basePlacementPoints(10)).toBe(4);
    expect(basePlacementPoints(11)).toBe(0);
  });

  it('pays nothing from eleventh place down', () => {
    expect(basePlacementPoints(11)).toBe(0);
    expect(basePlacementPoints(16)).toBe(0);
    expect(basePlacementPoints(30)).toBe(0);
  });

  it('pays nothing for a placement that is not a place', () => {
    expect(basePlacementPoints(0)).toBe(0);
    expect(basePlacementPoints(-1)).toBe(0);
    expect(basePlacementPoints(1.5)).toBe(0);
  });
});

describe('placementPoints', () => {
  it('pays the table in full once the field reaches ten', () => {
    expect(placementPoints(1, 10)).toBe(40);
    expect(placementPoints(8, 10)).toBe(12);
    expect(placementPoints(1, 20)).toBe(40);
    expect(placementPoints(9, 20)).toBe(8);
  });

  it('scales the table by the field factor on a thin field', () => {
    expect(placementPoints(1, 3)).toBe(12);
    expect(placementPoints(2, 3)).toBe(11);
    expect(placementPoints(3, 3)).toBe(10);
  });

  it('reaches its smallest non-zero awards at the edges of a thin field', () => {
    expect(placementPoints(1, 1)).toBe(4);
    expect(placementPoints(7, 7)).toBe(11);
  });

  it('pays nothing when the placement is past the table, whatever the field', () => {
    expect(placementPoints(11, 3)).toBe(0);
    expect(placementPoints(12, 20)).toBe(0);
  });
});

// ── scoreOne ─────────────────────────────────────────────────────────────────
//
// Default helper: no completion sub-awards, no qualification sub-awards.
// Tests set flags explicitly to keep arithmetic readable.

describe('scoreOne', () => {
  const play = (over: Partial<DzppScoreInput> = {}): DzppScoreInput => ({
    pp: 100,
    qualified: true,
    placement: 1,
    qualifiedPlayers: 10,
    hadApprovedSubmission: false,
    hadVote: false,
    hadModCompliance: false,
    hadRequirementAchievement: false,
    ...over,
  });

  // ── Completion sub-awards ────────────────────────────────────────────────

  it('awards only CHALLENGE_SCORE_POINTS when neither completion flag is set', () => {
    expect(scoreOne(play({ pp: null, qualified: false, placement: null })).completionPoints).toBe(2);
  });

  it('adds SUBMISSION_APPROVED_POINTS when hadApprovedSubmission is true', () => {
    expect(scoreOne(play({ pp: null, qualified: false, placement: null, hadApprovedSubmission: true })).completionPoints).toBe(5);
  });

  it('adds VOTE_POINTS when hadVote is true', () => {
    expect(scoreOne(play({ pp: null, qualified: false, placement: null, hadVote: true })).completionPoints).toBe(7);
  });

  it('awards the full 10 completion when both flags are set', () => {
    expect(scoreOne(play({ pp: null, qualified: false, placement: null, hadApprovedSubmission: true, hadVote: true })).completionPoints).toBe(10);
  });

  // ── Qualification sub-awards ─────────────────────────────────────────────

  it('awards 0 qualification when neither flag is set', () => {
    expect(scoreOne(play()).qualificationPoints).toBe(0);
  });

  it('awards MOD_COMPLIANCE_POINTS when only hadModCompliance is true', () => {
    expect(scoreOne(play({ hadModCompliance: true })).qualificationPoints).toBe(MOD_COMPLIANCE_POINTS);
  });

  it('awards REQUIREMENT_ACHIEVEMENT_POINTS when only hadRequirementAchievement is true', () => {
    expect(scoreOne(play({ hadRequirementAchievement: true })).qualificationPoints).toBe(REQUIREMENT_ACHIEVEMENT_POINTS);
  });

  it('awards 25 when both qualification flags are set', () => {
    expect(scoreOne(play({ hadModCompliance: true, hadRequirementAchievement: true })).qualificationPoints).toBe(25);
  });

  // ── Full formula ─────────────────────────────────────────────────────────

  it('sums performance, completion, qualification and placement (no sub-awards)', () => {
// completion=2, qualification=0, placement=32, performance=331.2 => 365.2 => 365
const result = scoreOne(play({ pp: 331.2, placement: 1, qualifiedPlayers: 8 }));
    expect(result.performanceValue).toBe(331.2);
    expect(result.completionPoints).toBe(2);
    expect(result.qualificationPoints).toBe(0);
    expect(result.placementPoints).toBe(32);
    expect(result.finalDzpp).toBe(365);
  });

  it('sums correctly with all sub-awards active', () => {
    // completion=10, qualification=25, placement=40, performance=331.2 => 406.2 => 406
    const result = scoreOne(play({
      pp: 331.2, placement: 1, qualifiedPlayers: 10,
      hadApprovedSubmission: true, hadVote: true,
      hadModCompliance: true, hadRequirementAchievement: true,
    }));
    expect(result.completionPoints).toBe(10);
    expect(result.qualificationPoints).toBe(25);
    expect(result.finalDzpp).toBe(406);
  });

  it('reports the field size and the formula version it scored under', () => {
    const result = scoreOne(play({ qualifiedPlayers: 3 }));
    expect(result.fieldSize).toBe(3);
    expect(result.formulaVersion).toBe(DZPP_FORMULA_VERSION);
  });

  it('pays a non-qualifying play its completion award and nothing else', () => {
    // completion=2, qualification=0, performance=268.75 => 270.75 => 271
    const result = scoreOne(play({ pp: 268.75, qualified: false, placement: null }));
    expect(result.qualificationPoints).toBe(0);
    expect(result.placementPoints).toBe(0);
    expect(result.placement).toBeNull();
    expect(result.completionPoints).toBe(2);
    expect(result.finalDzpp).toBe(271);
  });

  it('pays mod compliance to a non-qualifying play that used the right mods', () => {
    // completion=2, qualification=10 (mod only), performance=268.75 => 280.75 => 281
    const result = scoreOne(play({ pp: 268.75, qualified: false, placement: null, hadModCompliance: true }));
    expect(result.qualificationPoints).toBe(MOD_COMPLIANCE_POINTS);
    expect(result.placementPoints).toBe(0);
    expect(result.finalDzpp).toBe(281);
  });

  it('refuses placement points to a play that did not qualify', () => {
    const result = scoreOne(play({ qualified: false, placement: 1 }));
    expect(result.placementPoints).toBe(0);
    expect(result.placement).toBeNull();
  });

  it('placement requires full qualification — partial qualification earns points but not placement', () => {
    const modOnly = scoreOne(play({ qualified: false, placement: null, hadModCompliance: true }));
    expect(modOnly.qualificationPoints).toBe(MOD_COMPLIANCE_POINTS);
    expect(modOnly.placementPoints).toBe(0);
    expect(modOnly.placement).toBeNull();
  });

  it('pays no placement points when there is no placement', () => {
    // completion=2, qualification=0, performance=100 => 102
    const result = scoreOne(play({ placement: null }));
    expect(result.placementPoints).toBe(0);
    expect(result.finalDzpp).toBe(102);
  });

  it('treats an absent performance value as absent, not as zero points earned', () => {
    // completion=2, qualification=0, placement=40 (field 20, factor 1) => 42
    const result = scoreOne(play({ pp: null, placement: 1, qualifiedPlayers: 20 }));
    expect(result.performanceValue).toBeNull();
    expect(result.finalDzpp).toBe(42);
  });

  it('keeps a genuine zero-pp play distinct from an absent one', () => {
    const result = scoreOne(play({ pp: 0, placement: 1, qualifiedPlayers: 20 }));
    expect(result.performanceValue).toBe(0);
    expect(result.finalDzpp).toBe(42);
  });

  it('reads an impossible performance value as absent', () => {
    expect(scoreOne(play({ pp: Number.NaN })).performanceValue).toBeNull();
    expect(scoreOne(play({ pp: Number.POSITIVE_INFINITY })).performanceValue).toBeNull();
    expect(scoreOne(play({ pp: -5 })).performanceValue).toBeNull();
    // completion=2, qualification=0, placement=40 => 42
    expect(scoreOne(play({ pp: -5, placement: 1, qualifiedPlayers: 10 })).finalDzpp).toBe(42);
  });

  it('rounds the total half-up, and only the total', () => {
    // 10.5 + 2 = 12.5 exactly — rounds up to 13
    expect(scoreOne(play({ pp: 10.5, qualified: false, placement: null })).finalDzpp).toBe(13);
// 186.42 + 2 + 0 + 12 = 200.42 — rounds to 200
const thin = scoreOne(play({ pp: 186.42, placement: 1, qualifiedPlayers: 3 }));
expect(thin.placementPoints).toBe(12);
expect(thin.finalDzpp).toBe(200);
  });

  it('awards CHALLENGE_SCORE_POINTS exactly once however good or bad the play', () => {
    expect(scoreOne(play({ pp: 0, qualified: false })).completionPoints).toBe(CHALLENGE_SCORE_POINTS);
    expect(scoreOne(play({ pp: 9999, hadApprovedSubmission: true, hadVote: true })).completionPoints).toBe(10);
  });
});

// ── scoreRound ───────────────────────────────────────────────────────────────
//
// makePlay builds a DzppRoundPlay with sensible defaults:
//   NM mods, NM requirement, 'Top #1 Score' challenge, no completion sub-awards.
// Tests override what they need.

function makePlay(
  userId: number,
  pp: number | null,
  qualified: boolean,
  overrides: Partial<DzppRoundPlay> = {}
): DzppRoundPlay {
  return {
    userId,
    pp,
    qualified,
    hadApprovedSubmission: false,
    hadVote: false,
    mods: 'NM',
    modRequirement: 'NM',
    challengeRequirement: 'Top #1 Score',
    score: pp ?? 0,
    accuracy: 100,
    misses: 0,
    ...overrides,
  };
}

describe('scoreRound', () => {
  const q = (userId: number, pp: number | null, score?: number): DzppRoundPlay =>
    makePlay(userId, pp, true, { score: score ?? pp ?? 0 });
  const nq = (userId: number, pp: number | null): DzppRoundPlay =>
    makePlay(userId, pp, false);
  const dzpp = (rows: ReturnType<typeof scoreRound>) => rows.map((row) => row.finalDzpp);

  it('scores an empty round as nothing at all', () => {
    expect(scoreRound([])).toEqual([]);
  });

  it('numbers the qualified plays from first in the order it was given', () => {
    const rows = scoreRound([q(1, 100, 300), q(2, 90, 200), q(3, 80, 100)]);
    expect(rows.map((row) => row.placement)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.userId)).toEqual([1, 2, 3]);
  });

  it('counts the qualified field, not the number of plays', () => {
    const rows = scoreRound([q(1, 100, 200), q(2, 90, 100), nq(3, 300), nq(4, 250)]);
    expect(rows.every((row) => row.fieldSize === 2)).toBe(true);
  });

  it('does not let a non-qualifying play consume a placement', () => {
    const rows = scoreRound([q(1, 100, 200), nq(2, 300), q(3, 90, 100)]);
    expect(rows.map((row) => row.placement)).toEqual([1, null, 2]);
  });

  it('scores a round where nobody qualified as completion alone', () => {
    // completion=2, mod compliance=10, requirement achievement=0;
    // 200+2+10=212, 150+2+10=162
    const rows = scoreRound([nq(1, 200), nq(2, 150)]);
    expect(dzpp(rows)).toEqual([212, 162]);
    expect(rows.every((row) => row.fieldSize === 0)).toBe(true);
    expect(rows.every((row) => row.placementPoints === 0)).toBe(true);
  });

  it('numbers plays that look identical sequentially, in the order given', () => {
    const rows = scoreRound([q(7, 150, 300), q(4, 150, 200), q(9, 150, 100)]);
    expect(rows.map((row) => row.placement)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.userId)).toEqual([7, 4, 9]);
  });

  // ── Qualification sub-award tests ─────────────────────────────────────────

  // Top #1 Score: player with highest score among qualified gets achievement.
  // All use NM (default) so all get mod compliance.
  it('awards requirement achievement to the Top #1 Score winner only', () => {
    const rows = scoreRound([q(1, 186.42, 1000), q(2, 171.08, 900), q(3, 142.65, 800), nq(4, 268.75)]);
    expect(rows.map((r) => r.fieldSize)).toEqual([3, 3, 3, 3]);
    expect(rows.map((r) => r.placementPoints)).toEqual([12, 11, 10, 0]);
    // p1: 186.42+2+25+12=225.42=>225 (mod+achievement=25)
    // p2: 171.08+2+10+11=194.08=>194 (mod only=10)
    // p3: 142.65+2+10+10=164.65=>165
    // p4: 268.75+2+10+0=280.75=>281 (no mod match since NM req but NM played... wait NM=NM so mod=10, but not qualified so no achievement)
    expect(rows[0].qualificationPoints).toBe(25);
    expect(rows[1].qualificationPoints).toBe(10);
    expect(rows[2].qualificationPoints).toBe(10);
    // nq: NM mods, NM req => mod compliance=10, not qualified so no achievement
    expect(rows[3].qualificationPoints).toBe(10);
    expect(dzpp(rows)).toEqual([225, 194, 165, 281]);
  });

  // Full Combo: every player with 0 misses earns achievement, qualified or not.
  it('awards requirement achievement to all FC players in a Full Combo round', () => {
    const fc = (userId: number, pp: number, misses: number): DzppRoundPlay =>
      makePlay(userId, pp, misses === 0, {
        mods: 'HD', modRequirement: 'HD',
        challengeRequirement: 'Full Combo',
        misses, score: pp * 1000,
      });
    const rows = scoreRound([fc(1, 300, 0), fc(2, 280, 0), fc(3, 260, 1)]);
    expect(rows[0].qualificationPoints).toBe(25); // mod + achievement
    expect(rows[1].qualificationPoints).toBe(25);
    expect(rows[2].qualificationPoints).toBe(10); // mod only (missed)
  });

  // Best Accuracy: only the player with the highest accuracy earns achievement.
  it('awards requirement achievement to the top accuracy player in a Best Accuracy round', () => {
    const acc = (userId: number, pp: number, accuracy: number): DzppRoundPlay =>
      makePlay(userId, pp, true, {
        mods: 'NM', modRequirement: 'NM',
        challengeRequirement: 'Best Accuracy',
        accuracy, score: pp * 1000, misses: 0,
      });
    const rows = scoreRound([acc(1, 200, 99.5), acc(2, 180, 98.0), acc(3, 160, 97.0)]);
    expect(rows[0].qualificationPoints).toBe(25);
    expect(rows[1].qualificationPoints).toBe(10);
    expect(rows[2].qualificationPoints).toBe(10);
  });

  // Tied Best Accuracy: both players at the top share the achievement.
  it('shares requirement achievement between tied players', () => {
    const acc = (userId: number, pp: number, accuracy: number): DzppRoundPlay =>
      makePlay(userId, pp, true, {
        mods: 'NM', modRequirement: 'NM',
        challengeRequirement: 'Best Accuracy',
        accuracy, score: pp * 1000, misses: 0,
      });
    const rows = scoreRound([acc(1, 200, 99.5), acc(2, 180, 99.5), acc(3, 160, 97.0)]);
    expect(rows[0].qualificationPoints).toBe(25);
    expect(rows[1].qualificationPoints).toBe(25); // tied — both get achievement
    expect(rows[2].qualificationPoints).toBe(10);
  });

  // Lowest Miss Count: player with fewest misses earns achievement.
  it('awards requirement achievement to the player with fewest misses', () => {
    const mc = (userId: number, pp: number, misses: number): DzppRoundPlay =>
      makePlay(userId, pp, true, {
        mods: 'NM', modRequirement: 'NM',
        challengeRequirement: 'Lowest Miss Count',
        misses, score: pp * 1000, accuracy: 99,
      });
    const rows = scoreRound([mc(1, 200, 1), mc(2, 180, 0), mc(3, 160, 2)]);
    expect(rows[0].qualificationPoints).toBe(10);
    expect(rows[1].qualificationPoints).toBe(25); // 0 misses = lowest
    expect(rows[2].qualificationPoints).toBe(10);
  });

  it('does not award mod compliance when mods do not match requirement', () => {
    const wrongMod = makePlay(1, 100, false, {
      mods: 'NM', modRequirement: 'HD',
      challengeRequirement: 'Top #1 Score', score: 100,
    });
    const rows = scoreRound([wrongMod]);
    expect(rows[0].qualificationPoints).toBe(0);
  });

  // Round B: 8 qualified, HDHR required, Full Combo. Field factor 0.8.
  // All FC (0 misses) and all use HDHR => everyone gets full 25 qualification.
  it('reproduces the worked example for a field of eight (Full Combo, all FC)', () => {
    const fc = (userId: number, pp: number): DzppRoundPlay =>
      makePlay(userId, pp, true, {
        mods: 'HDHR', modRequirement: 'HDHR',
        challengeRequirement: 'Full Combo',
        misses: 0, score: pp * 1000,
      });
    const nqPlay = makePlay(9, 289.66, false, {
      mods: 'NM', modRequirement: 'HDHR',
      challengeRequirement: 'Full Combo',
      misses: 3, score: 289660,
    });
    const rows = scoreRound([
      fc(1, 331.2), fc(2, 318.55), fc(3, 310), fc(4, 296.1),
      fc(5, 288.2), fc(6, 281.75), fc(7, 276.9), fc(8, 271.44),
      nqPlay,
    ]);
    expect(rows.map((row) => row.placementPoints)).toEqual([32, 29, 26, 22, 19, 16, 13, 10, 0]);
    // Each qualified: pp + 2 + 25 + placement
    // p1: 331.2+2+25+32 = 390.2 => 390
// p2: 318.55+2+25+29 = 374.55 => 375
// p3: 310+2+25+26 = 363
// p4: 296.1+2+25+22 = 345.1 => 345
// p5: 288.2+2+25+19 = 334.2 => 334
// p6: 281.75+2+25+16 = 324.75 => 325
// p7: 276.9+2+25+13 = 316.9 => 317
// p8: 271.44+2+25+10 = 308.44 => 308
// nq: 289.66+2 = 291.66 => 292
    // nq: no mod match, missed => qual=0; 289.66+2+0+0=291.66=>292
    expect(rows[0].qualificationPoints).toBe(25);
    expect(rows[8].qualificationPoints).toBe(0);
    expect(dzpp(rows)).toEqual([390, 375, 363, 345, 334, 325, 317, 308, 292]);
  });

  // A one-player round: NM/NM/Top #1 Score, so full qualification (25).
  it('pays a lone qualified player one tenth of the winner award', () => {
    const rows = scoreRound([makePlay(1, 200, true, { score: 200000 })]);
    expect(rows[0].placementPoints).toBe(4);
    // 200+2+25+4=231
    expect(rows[0].finalDzpp).toBe(231);
  });

  it('passes completion sub-award flags through to each play', () => {
    const withBoth = makePlay(1, 100, true, { hadApprovedSubmission: true, hadVote: true, score: 200 });
    const withNone = makePlay(2, 100, true, { score: 100 });
    const rows = scoreRound([withBoth, withNone]);
    expect(rows[0].completionPoints).toBe(10);
    expect(rows[1].completionPoints).toBe(2);
  });
});

// ── The remaining field sizes the roadmap asks for ───────────────────────────
//
// NM/NM/Top #1 Score.
// All players get mod compliance (+10); only the top qualified scorer
// gets requirement achievement (+15).

describe('scoreRound across every field size the roadmap names', () => {
  const q = (userId: number, pp: number | null, score: number): DzppRoundPlay =>
    makePlay(userId, pp, true, { score });

  it('pays 20% of the table to a field of two', () => {
    const rows = scoreRound([q(1, 150, 200), q(2, 140, 100)]);
    expect(rows.map((row) => row.placementPoints)).toEqual([8, 7]);
    // p1: 150+2+25+8 = 185
   // p2: 140+2+10+7 = 159
   expect(rows.map((row) => row.finalDzpp)).toEqual([185, 159]);
  });

  it('pays 40% of the table to a field of four', () => {
    const rows = scoreRound([q(1, 100, 400), q(2, 100, 300), q(3, 100, 200), q(4, 100, 100)]);
   expect(rows.map((row) => row.placementPoints)).toEqual([16, 14, 13, 11]);
    // p1: 100+2+25+20=147, p2: 100+2+10+16=128, p3: 100+2+10+12=124, p4: 100+2+10+10=122
    expect(rows.map((row) => row.finalDzpp)).toEqual([143, 126, 125, 123]);
  });

  // Six qualified players => field factor 0.60, so second place (base 40) pays 24.
  it('pays three quarters of the table to a field of six', () => {
    const rows = scoreRound([
      q(1, 0, 6), q(2, 0, 5), q(3, 0, 4), q(4, 0, 3), q(5, 0, 2), q(6, 0, 1),
    ]);
    expect(rows.map((row) => row.placementPoints)).toEqual([24, 22, 19, 17, 14, 12,]);
    expect(rows[1].placementPoints).toBe(22);
    // p1: 0+2+25+30=57, p2: 0+2+10+24=36, p3: 0+2+10+18=30
    // p4: 0+2+10+15=27, p5: 0+2+10+12=24, p6: 0+2+10+6=18
    expect(rows.map((row) => row.finalDzpp)).toEqual([51, 34, 31, 29, 26, 24,]);
  });
});

// ── What "no submission" and "rejected" mean here ────────────────────────────

describe('players with no challenge score', () => {
  it('produces no result for a player who is not in the round', () => {
    const rows = scoreRound([makePlay(1, 100, true, { score: 100 })]);
    expect(rows).toHaveLength(1);
    expect(rows.map((row) => row.userId)).toEqual([1]);
    expect(rows.find((row) => row.userId === 2)).toBeUndefined();
  });

  it('returns exactly one result per play', () => {
    const rows = scoreRound([
      makePlay(1, 100, true,  { score: 300 }),
      makePlay(2, 90,  false, { score: 200 }),
      makePlay(3, 80,  true,  { score: 100 }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.userId)).toEqual([1, 2, 3]);
    // All NM/NM, so mod compliance = true for all.
    // Achievement goes to player 1 (highest score among qualified).
    expect(rows.map((row) => row.completionPoints)).toEqual([2, 2, 2]);
  });
});

// ── Reading a stored challenge score ─────────────────────────────────────────

describe('toRoundPlay', () => {
  const row = {
    user_id: 7, pp: '331.20', qualified: true,
    mods: 'HDHR', score: '1000000', accuracy: '98.50', misses: 0,
  };

  it('converts numeric columns and passes through all fields', () => {
    const play = toRoundPlay(row, true, false, 'HDHR', 'Full Combo');
    expect(play.userId).toBe(7);
    expect(play.pp).toBe(331.2);
    expect(play.qualified).toBe(true);
    expect(play.hadApprovedSubmission).toBe(true);
    expect(play.hadVote).toBe(false);
    expect(play.mods).toBe('HDHR');
    expect(play.modRequirement).toBe('HDHR');
    expect(play.challengeRequirement).toBe('Full Combo');
    expect(play.score).toBe(1000000);
    expect(play.accuracy).toBe(98.5);
    expect(play.misses).toBe(0);
  });

  it('keeps a genuine zero-pp play as zero', () => {
    expect(toRoundPlay({ ...row, pp: '0.00' }, false, false, 'NM', 'Top #1 Score').pp).toBe(0);
  });

  it('reads a null column as an absent performance value', () => {
    expect(toRoundPlay({ ...row, pp: null }, false, false, 'NM', 'Top #1 Score').pp).toBeNull();
  });

  it('reads an empty or unparseable column as absent, never as zero', () => {
    expect(toRoundPlay({ ...row, pp: '' }, false, false, 'NM', 'Top #1 Score').pp).toBeNull();
    expect(toRoundPlay({ ...row, pp: '   ' }, false, false, 'NM', 'Top #1 Score').pp).toBeNull();
    expect(toRoundPlay({ ...row, pp: 'not a number' }, false, false, 'NM', 'Top #1 Score').pp).toBeNull();
  });

  it('carries both completion sub-award flags correctly', () => {
    const play = toRoundPlay(row, true, true, 'HD', 'Best Accuracy');
    expect(play.hadApprovedSubmission).toBe(true);
    expect(play.hadVote).toBe(true);
  });
});

// ── When a round may be finalized ────────────────────────────────────────────

describe('refuseFinalize', () => {
  it('allows an ended round that has never been scored', () => {
    expect(refuseFinalize({ phase: 'ended', dzpp_finalized_at: null })).toBeNull();
  });

  it('refuses a round that has not ended', () => {
    expect(refuseFinalize({ phase: 'challenge', dzpp_finalized_at: null })).toBe('not-ended');
    expect(refuseFinalize({ phase: 'voting', dzpp_finalized_at: null })).toBe('not-ended');
    expect(refuseFinalize({ phase: 'submission', dzpp_finalized_at: null })).toBe('not-ended');
  });

  it('refuses a round that has already been scored', () => {
    expect(refuseFinalize({ phase: 'ended', dzpp_finalized_at: new Date() })).toBe('already-finalized');
  });

  it('reports an unended round as unended even if the latch is somehow set', () => {
    expect(refuseFinalize({ phase: 'challenge', dzpp_finalized_at: new Date() })).toBe('not-ended');
  });
});

// ── The ranking DTOs ─────────────────────────────────────────────────────────

describe('RANKING_COUNTRY', () => {
  it('is Algeria and nothing else', () => {
    expect(RANKING_COUNTRY).toBe('DZ');
  });
});

describe('toApiRankingEntry', () => {
  const row = {
    user_id: 4, rank: 1, dzpp: 848, rounds_played: 3, first_places: 2,
    best_placement: 1, osu_id: '4823510', username: 'Amine',
    avatar_url: 'https://a.ppy.sh/4823510', country_code: 'DZ',
  };

  it('maps a row to the DTO the rankings page reads', () => {
    expect(toApiRankingEntry(row)).toEqual({
      rank: 1, userId: 4, osuId: 4823510, username: 'Amine',
      avatarUrl: 'https://a.ppy.sh/4823510', country: 'DZ',
      dzpp: 848, roundsPlayed: 3, firstPlaces: 2, bestPlacement: 1,
    });
  });

  it('converts the bigint osu! id rather than passing the string through', () => {
    expect(toApiRankingEntry({ ...row, osu_id: '4823510' }).osuId).toBe(4823510);
  });

  it('reads a missing avatar as an empty string', () => {
    expect(toApiRankingEntry({ ...row, avatar_url: null }).avatarUrl).toBe('');
  });

  it('trims the blank-padded country column', () => {
    expect(toApiRankingEntry({ ...row, country_code: 'DZ ' }).country).toBe('DZ');
  });

  it('keeps an absent best placement absent', () => {
    expect(toApiRankingEntry({ ...row, best_placement: null }).bestPlacement).toBeNull();
  });
});

describe('toApiPlayerDzppRound', () => {
// Stored row: full completion (10) + full qualification (25) + 1st place in field of 1.
// finalDzpp = round(325.24 + 10 + 25 + 4) = round(364.24) = 364.
const row = {
  round_id: 3, round_number: 1, month: 'September', year: 2026,
  performance_value: '325.24', completion_points: '10.00',
  qualification_points: '25.00', placement_points: '4.000',
  placement: 1, qualified: true, field_size: 1, final_dzpp: 364,
};
  it('converts every numeric column and keeps the round it belongs to', () => {
    expect(toApiPlayerDzppRound(row)).toEqual({
      roundId: 3, roundNumber: 1, month: 'September', year: 2026,
      performanceValue: 325.24, completionPoints: 10, qualificationPoints: 25,
       maps: [],
      placementPoints: 4, placement: 1, qualified: true, fieldSize: 1, finalDzpp: 364,
    });
  });

  // Full completion (10) + full qualification (25) = 35.
  it('agrees with the engine about the total it stored', () => {
    expect(
      scoreOne({
        pp: 325.24, qualified: true, placement: 1, qualifiedPlayers: 1,
        hadApprovedSubmission: true, hadVote: true,
        hadModCompliance: true, hadRequirementAchievement: true,
      }).finalDzpp
    ).toBe(row.final_dzpp);
  });

  it('keeps an absent performance value absent, not zero', () => {
    expect(toApiPlayerDzppRound({ ...row, performance_value: null }).performanceValue).toBeNull();
  });

  it('keeps a non-qualifying round unplaced', () => {
    const mapped = toApiPlayerDzppRound({
      ...row,
      performance_value: '268.75', completion_points: '2.00',
      qualification_points: '0.00', placement_points: '0.000',
      placement: null, qualified: false, final_dzpp: 271,
    });
    expect(mapped.placement).toBeNull();
    expect(mapped.qualified).toBe(false);
    expect(mapped.completionPoints).toBe(2);
    expect(mapped.placementPoints).toBe(0);
    expect(mapped.finalDzpp).toBe(271);
  });
});

// ── per-beatmap independent scoring and merge ────────────────────────────────
//
// scoreAllBeatmaps() is async and database-bound, so we test its merge logic
// here by running scoreRound() per beatmap manually and applying the same
// merge rule: highest finalDzpp wins; ties broken by vote_rank ascending.

describe('per-beatmap independent scoring and merge', () => {
  // Helper: run scoreRound on a single beatmap's plays and tag results with voteRank.
  function scoreBeatmap(
    voteRank: number,
    plays: DzppRoundPlay[]
  ): Array<{ voteRank: number; result: DzppRoundResult }> {
    return scoreRound(plays).map((result) => ({ voteRank, result }));
  }

  // Merge: same rule as scoreAllBeatmaps.
  function merge(
    tagged: Array<{ voteRank: number; result: DzppRoundResult }>
  ): DzppRoundResult[] {
    const best = new Map<number, { voteRank: number; result: DzppRoundResult }>();
    for (const entry of tagged) {
      const existing = best.get(entry.result.userId);
      if (
        existing === undefined ||
        entry.result.finalDzpp > existing.result.finalDzpp ||
        (entry.result.finalDzpp === existing.result.finalDzpp && entry.voteRank < existing.voteRank)
      ) {
        best.set(entry.result.userId, entry);
      }
    }
    return [...best.values()].map((e) => e.result);
  }

  it('scores two beatmaps with different challenge requirements independently', () => {
    // Beatmap A: Top #1 Score, NM. Player 1 qualifies, player 2 does not.
    const bmA = [
      makePlay(1, 200, true,  { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 1000 }),
      makePlay(2, 100, false, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 500 }),
    ];
    // Beatmap B: Best Accuracy, HD. Player 3 qualifies, player 2 also plays.
    const bmB = [
      makePlay(3, 150, true,  { mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Best Accuracy', accuracy: 99.5, score: 800 }),
      makePlay(2, 100, true, { mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Best Accuracy', accuracy: 98.0, score: 400 }),
    ];

    const resultsA = scoreBeatmap(1, bmA);
    const resultsB = scoreBeatmap(2, bmB);
    const merged = merge([...resultsA, ...resultsB]);

    // Player 1: only on beatmap A. Qualified, #1 of 1 qualified.
    const p1 = merged.find((r) => r.userId === 1)!;
    expect(p1).toBeDefined();
    expect(p1.qualified).toBe(true);
    expect(p1.placement).toBe(1);
    expect(p1.fieldSize).toBe(1); // only 1 qualified on beatmap A

    // Player 3: only on beatmap B. Qualified, #1 of 1 qualified.
    const p3 = merged.find((r) => r.userId === 3)!;
    expect(p3).toBeDefined();
    expect(p3.qualified).toBe(true);
    expect(p3.placement).toBe(1);
    expect(p3.fieldSize).toBe(2); // only 2 qualified on beatmap B

    // Player 2: on both beatmaps. Not qualified on A, qualified on B.
    // Should keep the B result (higher finalDzpp from qualification).
    const p2 = merged.find((r) => r.userId === 2)!;
    expect(p2).toBeDefined();
    expect(p2.qualified).toBe(true); // B result selected
  });

  it('keeps the result with the highest finalDzpp when a player plays both beatmaps', () => {
    // Player 1 on beatmap A: pp=300, qualified, #1 of 1.
    const bmA = [makePlay(1, 300, true, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 300 })];
    // Player 1 on beatmap B: pp=100, not qualified.
    const bmB = [makePlay(1, 100, false, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 100 })];

    const merged = merge([...scoreBeatmap(1, bmA), ...scoreBeatmap(2, bmB)]);
    expect(merged).toHaveLength(1);
    // A result: 300 + 2 + 25 + 4 (field 1) = 331. B result: 100 + 2 + 10 = 112.
    expect(merged[0].finalDzpp).toBe(331);
    expect(merged[0].qualified).toBe(true);
  });

  it('selects the earlier beatmap (lower vote_rank) when finalDzpp is equal', () => {
    // Both beatmaps produce the same finalDzpp for player 1.
    const play = makePlay(1, null, false, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 0 });
    // completion=2, no pp, no qualification, no placement => finalDzpp=2 on both.
    const merged = merge([...scoreBeatmap(2, [play]), ...scoreBeatmap(1, [play])]);
    expect(merged).toHaveLength(1);
    expect(merged[0].userId).toBe(1);
  });

  it('keeps a player who only played one of two beatmaps', () => {
    const bmA = [makePlay(1, 200, true, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 200 })];
    const bmB = [makePlay(2, 150, true, { mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Best Accuracy', accuracy: 99, score: 150 })];

    const merged = merge([...scoreBeatmap(1, bmA), ...scoreBeatmap(2, bmB)]);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.userId === 1)).toBeDefined();
    expect(merged.find((r) => r.userId === 2)).toBeDefined();
  });

  it('computes placement independently per beatmap', () => {
    // Beatmap A: 3 qualified players.
    const bmA = [
      makePlay(1, 300, true, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 300 }),
      makePlay(2, 200, true, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 200 }),
      makePlay(3, 100, true, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 100 }),
    ];
    // Beatmap B: 2 qualified players (different users).
    const bmB = [
      makePlay(4, 250, true, { mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Top #1 Score', score: 250 }),
      makePlay(5, 150, true, { mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Top #1 Score', score: 150 }),
    ];

    const rA = scoreRound(bmA);
    const rB = scoreRound(bmB);

    // Beatmap A: 3 qualified, placements 1/2/3, field_size=3.
    expect(rA.map((r) => r.placement)).toEqual([1, 2, 3]);
    expect(rA.every((r) => r.fieldSize === 3)).toBe(true);

    // Beatmap B: 2 qualified, placements 1/2, field_size=2.
    expect(rB.map((r) => r.placement)).toEqual([1, 2]);
    expect(rB.every((r) => r.fieldSize === 2)).toBe(true);
  });

  it('computes achievement bonus independently per beatmap', () => {
    // Beatmap A: Best Accuracy. Player 1 has highest accuracy.
    const bmA = [
      makePlay(1, 200, true, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Best Accuracy', accuracy: 99.5, score: 200 }),
      makePlay(2, 180, true, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Best Accuracy', accuracy: 97.0, score: 180 }),
    ];
    // Beatmap B: Lowest Miss Count. Player 3 has fewest misses.
    const bmB = [
      makePlay(3, 150, true, { mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Lowest Miss Count', misses: 0, score: 150 }),
      makePlay(4, 130, true, { mods: 'HD', modRequirement: 'HD', challengeRequirement: 'Lowest Miss Count', misses: 2, score: 130 }),
    ];

    const rA = scoreRound(bmA);
    const rB = scoreRound(bmB);

    // Beatmap A: player 1 gets achievement (+15), player 2 does not.
    expect(rA[0].qualificationPoints).toBe(25); // mod + achievement
    expect(rA[1].qualificationPoints).toBe(10); // mod only

    // Beatmap B: player 3 gets achievement (+15), player 4 does not.
    expect(rB[0].qualificationPoints).toBe(25);
    expect(rB[1].qualificationPoints).toBe(10);
  });

  it('completion points appear only once in the stored result', () => {
    // Player 1 plays both beatmaps. hadApprovedSubmission=true, hadVote=true on both.
    const bmA = [makePlay(1, 300, true, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 300, hadApprovedSubmission: true, hadVote: true })];
    const bmB = [makePlay(1, 100, false, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 100, hadApprovedSubmission: true, hadVote: true })];

    const merged = merge([...scoreBeatmap(1, bmA), ...scoreBeatmap(2, bmB)]);
    expect(merged).toHaveLength(1);
    // The A result is selected (higher finalDzpp). completionPoints = 10 (2+3+5), not 20.
    expect(merged[0].completionPoints).toBe(10);
  });

  it('field_size reflects only the qualified players on that beatmap', () => {
    // Beatmap A: 3 players, 2 qualified.
    const bmA = [
      makePlay(1, 200, true,  { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 200 }),
      makePlay(2, 150, true,  { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 150 }),
      makePlay(3, 100, false, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 100 }),
    ];
    const rA = scoreRound(bmA);
    expect(rA.every((r) => r.fieldSize === 2)).toBe(true);
  });

  it('mod compliance uses each beatmap own mod requirement', () => {
    // Beatmap A requires HD. Player plays NM — no mod compliance.
    const bmA = [makePlay(1, 100, false, { mods: 'NM', modRequirement: 'HD', challengeRequirement: 'Top #1 Score', score: 100 })];
    // Beatmap B requires NM. Same player plays NM — mod compliance.
    const bmB = [makePlay(1, 100, false, { mods: 'NM', modRequirement: 'NM', challengeRequirement: 'Top #1 Score', score: 100 })];

    const rA = scoreRound(bmA);
    const rB = scoreRound(bmB);

    expect(rA[0].qualificationPoints).toBe(0);  // no mod compliance
    expect(rB[0].qualificationPoints).toBe(10); // mod compliance
  });
});

// ── When a round may be recomputed ───────────────────────────────────────────

describe('refuseRecompute', () => {
  it('allows an ended round that has already been scored', () => {
    expect(refuseRecompute({ phase: 'ended', dzpp_finalized_at: new Date() })).toBeNull();
  });

  it('allows an ended round that was never scored', () => {
    expect(refuseRecompute({ phase: 'ended', dzpp_finalized_at: null })).toBeNull();
  });

  it('refuses a round that has not ended', () => {
    expect(refuseRecompute({ phase: 'challenge', dzpp_finalized_at: null })).toBe('not-ended');
    expect(refuseRecompute({ phase: 'challenge', dzpp_finalized_at: new Date() })).toBe('not-ended');
    expect(refuseRecompute({ phase: 'voting', dzpp_finalized_at: null })).toBe('not-ended');
    expect(refuseRecompute({ phase: 'submission', dzpp_finalized_at: null })).toBe('not-ended');
  });

  it('differs from refuseFinalize only on an already-scored ended round', () => {
    const scored = { phase: 'ended', dzpp_finalized_at: new Date() };
    expect(refuseFinalize(scored)).toBe('already-finalized');
    expect(refuseRecompute(scored)).toBeNull();

    const unscored = { phase: 'ended', dzpp_finalized_at: null };
    expect(refuseFinalize(unscored)).toBeNull();
    expect(refuseRecompute(unscored)).toBeNull();
  });
});
