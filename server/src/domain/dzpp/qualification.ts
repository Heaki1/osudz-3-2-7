import {
  MOD_COMPLIANCE_POINTS,
  REQUIREMENT_ACHIEVEMENT_POINTS,
  scoreOne,
  asPp,
  type DzppRoundPlay,
  type DzppRoundResult,
} from './formula.js';

const IGNORED_MOD_ACRONYMS = ['CL'];

function splitModAcronyms(mods: string): string[] {
  const text = mods.trim().toUpperCase();
  if (text === '' || text === 'NM') return [];
  return (text.match(/.{1,2}/g) ?? []).filter((a) => !IGNORED_MOD_ACRONYMS.includes(a));
}

interface DzppQualificationAwards {
  modCompliancePoints: number;
  requirementAchievementPoints: number;
}

export function qualificationAwards(
  playsInLeaderboardOrder: readonly DzppRoundPlay[]
): Map<number, DzppQualificationAwards> {
  const challengeRequirement = playsInLeaderboardOrder[0]?.challengeRequirement ?? '';
  const qualifiedPlays = playsInLeaderboardOrder.filter((p) => p.qualified);
  let achievementWinnerIds: Set<number>;

  if (challengeRequirement === 'Full Combo') {
    achievementWinnerIds = new Set(qualifiedPlays.map((p) => p.userId));
  } else if (challengeRequirement === 'Best Accuracy') {
    const best = qualifiedPlays.reduce<number | null>(
      (max, p) => (max === null || p.accuracy > max ? p.accuracy : max), null
    );
    achievementWinnerIds = new Set(
      best === null ? [] : qualifiedPlays.filter((p) => p.accuracy === best).map((p) => p.userId)
    );
  } else if (challengeRequirement === 'Lowest Miss Count') {
    const best = qualifiedPlays.reduce<number | null>(
      (min, p) => (min === null || p.misses < min ? p.misses : min), null
    );
    achievementWinnerIds = new Set(
      best === null ? [] : qualifiedPlays.filter((p) => p.misses === best).map((p) => p.userId)
    );
  } else {
    const best = qualifiedPlays.reduce<number | null>(
      (max, p) => (max === null || p.score > max ? p.score : max), null
    );
    achievementWinnerIds = new Set(
      best === null ? [] : qualifiedPlays.filter((p) => p.score === best).map((p) => p.userId)
    );
  }

  const awards = new Map<number, DzppQualificationAwards>();
  for (const play of playsInLeaderboardOrder) {
    const isFm = play.modRequirement.trim().toUpperCase() === 'FM';
    let hadModCompliance: boolean;
    if (isFm) {
      hadModCompliance = true;
    } else {
      const requiredAcronyms = splitModAcronyms(play.modRequirement);
      const playedAcronyms = splitModAcronyms(play.mods);
      hadModCompliance =
        requiredAcronyms.length === playedAcronyms.length &&
        requiredAcronyms.every((a) => playedAcronyms.includes(a));
    }
    awards.set(play.userId, {
      modCompliancePoints: hadModCompliance ? MOD_COMPLIANCE_POINTS : 0,
      requirementAchievementPoints: achievementWinnerIds.has(play.userId)
        ? REQUIREMENT_ACHIEVEMENT_POINTS
        : 0,
    });
  }
  return awards;
}

export function scoreRound(playsInLeaderboardOrder: readonly DzppRoundPlay[]): DzppRoundResult[] {
  const qualifiedPlayers = playsInLeaderboardOrder.filter((play) => play.qualified).length;
  const awardsByUser = qualificationAwards(playsInLeaderboardOrder);
  let placed = 0;

  return playsInLeaderboardOrder.map((play) => {
    const awards = awardsByUser.get(play.userId) ?? {
      modCompliancePoints: 0,
      requirementAchievementPoints: 0,
    };
    return {
      userId: play.userId,
      ...scoreOne({
        pp: play.pp,
        qualified: play.qualified,
        placement: play.qualified ? ++placed : null,
        qualifiedPlayers,
        hadApprovedSubmission: play.hadApprovedSubmission,
        hadVote: play.hadVote,
        hadModCompliance: awards.modCompliancePoints > 0,
        hadRequirementAchievement: awards.requirementAchievementPoints > 0,
      }),
    };
  });
}

export function toRoundPlay(
  row: {
    user_id: number;
    pp: string | null;
    qualified: boolean;
    mods: string;
    score: string;
    accuracy: string;
    misses: number;
  },
  hadApprovedSubmission: boolean,
  hadVote: boolean,
  modRequirement: string,
  challengeRequirement: string
): DzppRoundPlay {
  return {
    userId: row.user_id,
    pp: asPp(row.pp),
    qualified: row.qualified,
    hadApprovedSubmission,
    hadVote,
    mods: row.mods,
    modRequirement,
    challengeRequirement,
    score: Number(row.score),
    accuracy: Number(row.accuracy),
    misses: row.misses,
  };
}
