import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Beatmap, Phase, PlatformPage } from '../../../types';
import { ApiChallengeBeatmap, ApiChallengeScore, ApiSubmission } from '../../../api/client';
import { api } from '../../../api/client';
import { CurrentRound, isBallotOpen, roundLabel, useCountdown } from '../../../lib/round';
import { beatmapUrl } from '../../../lib/submission';
import { BeatmapCardPlatform } from '../BeatmapCardPlatform';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { AuthUser } from '../NavHeader';
import { ChallengeChat } from '../ChallengeChat';
import { ChallengeLeaderboard, MyChallengeScore } from './DashboardChallengePanels';
import { ImportFavoritesButton, SubmissionRequirements, SubmissionStatusBand, YourSubmission } from './DashboardSubmissionPanels';
import { DashboardChallengeHero } from './DashboardChallengeHero';
import { DashboardLevelRush } from './DashboardLevelRush';
import {
  Trophy, Crown, Upload, ChevronRight,
  CheckCircle2, AlertCircle, Clock, LogIn, X, Ban, Heart, Info,
} from 'lucide-react';

function PersonalProgress({ user, phase }: { user: AuthUser | null; phase: Phase }) {
  const [data, setData] = useState<import('../../../api/client').ApiProgression | null>(null);
  const [activity, setActivity] = useState<import('../../../api/client').ApiActivityEvent[] | null>(null);
  const [recap, setRecap] = useState<{
    roundNumber: number; month: string; year: number;
    winner: { title: string; artist: string; difficultyName: string; coverUrl: string } | null;
    winnerVoteCount: number | null; totalVotes: number | null; archiveAt: string | null;
  } | null>(null);
  const [levelRush, setLevelRush] = useState<import('../../../api/client').ApiLevelRushEntry[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void Promise.all([api.platform.progression(user.id), api.platform.activity(8), api.platform.recap(), api.platform.levelRush(10)]).then(([progress, feed, latestRecap, rush]) => {
      if (!live) return;
      setData(progress.ok ? progress.data : null);
      setActivity(feed.ok ? feed.data : null);
      setRecap(latestRecap.ok ? latestRecap.data : null);
      setLevelRush(rush.ok ? rush.data : null);
    });
    return () => { live = false; };
  }, [user]);

  if (!user || !data) return null;
  const p = data.progression;
  const percent = Math.round(p.levelProgress * 100);
  const activityText = (type: string, payload: Record<string, unknown>) => {
    if (type === 'submission_created') return `Submitted ${String(payload.title ?? 'a beatmap')}`;
    if (type === 'vote_cast') return 'Cast a round vote';
    if (type === 'challenge_score_imported') return `Imported ${Number(payload.score ?? 0).toLocaleString()} score`;
    if (type === 'round_winner_approved') return `Round winner approved: ${String(payload.title ?? 'challenge')}`;
    if (type === 'round_phase_changed') return `Round moved to ${String(payload.phase ?? 'a new phase')}`;
    return type.split('_').join(' ');
  };

  return (
    <>
    {phase !== 'challenge' && (
    <section className="mb-12 overflow-hidden rounded-2xl border border-slate-800/90 bg-[#09111f] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="relative border-b border-slate-800/80 px-5 py-4 sm:px-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(251,191,36,0.08),transparent_30%),radial-gradient(circle_at_92%_100%,rgba(59,130,246,0.05),transparent_28%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-400/80 font-mono">Player intelligence</p>
            <h2 className="mt-1 text-base font-black tracking-tight text-white">Your dashboard pulse</h2>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-slate-600 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3">
        <section className="relative border-b lg:border-b-0 lg:border-r border-slate-800/80 p-5 sm:p-6">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <div className="mt-2 flex items-baseline gap-3">
                <h3 className="text-3xl font-black tracking-tight text-white">Level {p.level}</h3>
                <span className="font-mono text-xs font-bold text-amber-400">{p.dzpp.toLocaleString()} DZPP</span>
              </div>
            </div>
            <div className="text-right">
              <span className="rounded-full border border-amber-400/15 bg-amber-400/5 px-2.5 py-1 text-[9px] font-bold text-amber-400/80 font-mono">{percent}%</span>
              {p.challengeWinLevels > 0 && <p className="mt-2 text-[8px] font-black uppercase tracking-wider text-emerald-400/80">+{p.challengeWinLevels} win levels</p>}
            </div>
          </div>

          <div className="relative h-2 overflow-hidden rounded-full bg-slate-950">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-amber-300" style={{ width: percent + '%' }} />
            <div className="absolute inset-y-0 left-0 bg-white/10" style={{ width: percent + '%' }} />
          </div>
          <div className="mt-2 flex justify-between gap-4 font-mono text-[9px] uppercase tracking-wider text-slate-600">
            <span>{percent}% to next level</span>
            <span>{Math.max(0, p.nextLevelDzpp - p.dzpp).toLocaleString()} DZPP to next level</span>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-400/10 bg-emerald-400/[0.025] px-3.5 py-3">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.16em] text-emerald-400/70">Challenge milestone</p>
              <p className="mt-1 text-[10px] text-slate-500">
                Every challenge win permanently adds <span className="font-black text-emerald-400">+5 levels</span>.
              </p>
            </div>
            <span className="ml-4 whitespace-nowrap font-mono text-xs font-black text-white">
              {p.challengeWins} {p.challengeWins === 1 ? 'win' : 'wins'}
            </span>
          </div>

          {p.level50Reward && (
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-3.5 py-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-amber-400/80">Level 50 reward</p>
                <p className="mt-1 text-[10px] font-bold text-slate-300">{p.level50Reward}</p>
              </div>
              <span className="whitespace-nowrap rounded-full border border-amber-400/15 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-amber-400">
                Unlocked
              </span>
            </div>
          )}

          <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-800/80 border-y border-slate-800/70">
            {[
              ['Win streak', data.streak.currentWins],
              ['Best streak', data.streak.bestWins],
              ['Rounds', p.rounds],
              ['Wins', p.wins],
            ].map(([label, value]) => (
              <div key={String(label)} className="px-2 py-4 first:pl-0 last:pr-0">
                <p className="text-xl font-black font-mono tabular-nums text-white">{value}</p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-600">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b lg:border-b-0 lg:border-r border-slate-800/80 p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h3 className="mt-1 text-sm font-black text-white">Recent movement</h3>
            </div>
          </div>
          <div className="relative pl-4">
            <div className="absolute bottom-1 left-[3px] top-1 w-px bg-gradient-to-b from-emerald-400/50 via-slate-800 to-transparent" />
            <div className="space-y-4">
              {(activity ?? []).slice(0, 5).map((event) => (
                <div key={event.id} className="relative">
                  <span className="absolute -left-[15px] top-1.5 h-[7px] w-[7px] rounded-full border border-[#09111f] bg-slate-600" />
                  <p className="text-[11px] leading-snug text-slate-300">
                    <span className="font-bold text-white">{event.username ?? 'System'}</span>{' '}
                    <span className="text-slate-500">{activityText(event.type, event.payload)}</span>
                  </p>
                  <p className="mt-1 text-[9px] font-mono text-slate-700">{new Date(event.createdAt).toLocaleString()}</p>
                </div>
              ))}
              {(activity ?? []).length === 0 && <p className="text-xs text-slate-600">No recent activity.</p>}
            </div>
          </div>
        </section>

      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <DashboardLevelRush entries={levelRush} user={user} />
      </div>

      {recap && (
        <div className="border-t border-amber-400/15 bg-amber-400/[0.025] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-400/60 font-mono">Round recap</p>
              <p className="mt-0.5 text-sm font-black text-white">Round {recap.roundNumber} · {recap.month} {recap.year}</p>
            </div>
            {recap.winner && <p className="text-xs text-slate-500">Winner <span className="font-bold text-slate-300">{recap.winner.artist} — {recap.winner.title} [{recap.winner.difficultyName}]</span></p>}
            <p className="text-[9px] text-slate-700 font-mono">ARCHIVE WINDOW PENDING</p>
          </div>
        </div>
      )}
    </section>
    )}
    </>
  );
}

// ── INLINE LOGIN NUDGE ────────────────────────────────────────────────────────

function LoginNudge({ message, onLogin }: { message: string; onLogin?: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="flex items-center gap-3 bg-amber-400/8 border border-amber-400/20 rounded-xl px-4 py-3 mb-6">
      <LogIn className="w-4 h-4 text-amber-400 flex-shrink-0" />
      <p className="text-xs text-amber-400/80 flex-1">{message}</p>
      <button
        type="button"
        onClick={onLogin}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-black rounded-lg transition-all flex-shrink-0"
      >
        Login with osu!
      </button>
      <button type="button" onClick={() => setDismissed(true)} className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── ROUND HEADER ─────────────────────────────────────────────────────────────

const roundMeta: Record<Phase, { label: string; color: string; bar: string; desc: string }> = {
  submission: {
    label: 'SUBMISSION PHASE',
    color: 'text-amber-400',
    bar: 'bg-amber-400',
    desc: 'Submit the beatmap you want as this month\'s community challenge. The community votes to decide the winner.',
  },
  voting: {
    label: 'VOTING PHASE',
    color: 'text-blue-400',
    bar: 'bg-blue-500',
    desc: 'Cast your vote for the beatmap you want as the monthly challenge. Eligible players get one vote each.',
  },
  challenge: {
    label: 'CHALLENGE PHASE',
    color: 'text-purple-400',
    bar: 'bg-purple-500',
    desc: 'The winning beatmap has been chosen. Submit your best score to qualify and compete for the monthly bounty.',
  },
};

function RoundHeader({ round, countdown }: { round: CurrentRound; countdown: string }) {
  const cfg = roundMeta[round.phase];
  // Same rule as the nav badge and the vote page: a closed ballot has nothing left to
  // count down to, and the phase alone cannot tell you the ballot is closed.
  const frozen = round.phase === 'voting' && !isBallotOpen(round);

  return (
    <div className="mb-10">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className={`text-[10px] font-black tracking-widest uppercase font-mono ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-[10px] text-slate-500 font-mono">{roundLabel(round)}</span>
            {/* The bounty is the challenge prize, so it belongs where the round is
                introduced rather than only on the challenge hero — a player deciding
                whether to enter is the one who wants to know it. */}
            {round.reward && (
              <>
                <span className="text-slate-700">·</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-400/90">
                  <Trophy className="w-3 h-3" />
                  {round.reward}
                </span>
              </>
            )}
          </div>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">{cfg.desc}</p>
        </div>
        <div className="flex-shrink-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 text-right">
            {frozen ? 'Ballot' : 'Ends in'}
          </div>
          <div className={`text-2xl font-black font-mono ${frozen ? 'text-slate-400' : cfg.color}`}>
            {frozen ? 'closed' : countdown}
          </div>
        </div>
      </div>
      <div className={`mt-5 h-px w-full ${cfg.bar} opacity-20 rounded-full`} />
    </div>
  );
}

// ── MY CHALLENGE SCORE ───────────────────────────────────────────────────────
//
// Replaces a card that was entirely fabricated — an invented username, rank, score
// and a hardcoded "you need 0 misses to qualify" line that had nothing to do with the
// round's actual requirement.
//
// The score is read from osu! rather than typed in: the player's play on a public
// beatmap is public data, so there is nothing for them to assert and nothing to
// dispute. Importing again picks up a better play.

interface DashboardPageProps {
  round: CurrentRound | null;
  /** Approved submissions in the open round. Empty until an admin approves one. */
  maps: Beatmap[];
  /** The caller's favorites, both sources, server-held (A4). Empty when signed out. */
  favorites: Beatmap[];
  /** Takes the map, not its id: favoriting addresses the osu! beatmap (A4). */
  onFavorite: (map: Beatmap) => void;
  /** Imports the osu! profile favourites (A5). Resolves to an error message, or null. */
  onImportFavorites: () => Promise<string | null>;
  /**
   * "Submit" on a favorite card. Carries the beatmap, where this used to be onNavigate('submit')
   * and carried nothing — so the player landed on an empty URL box and had to find it again.
   */
  onSubmitBeatmap: (map: Beatmap) => void;
  /** The signed-in user's own entry, whatever its review status. */
  mySubmission: ApiSubmission | null;
  /** Resolves to an error message, or null once the entry is withdrawn. */
  onWithdraw: (submissionId: number) => Promise<string | null>;
  /** Submission id the caller voted for in the open round, or null. Server-held. */
  myVote: number | null;
  /** Beatmap id whose cast or retract is in flight. */
  voteBusy: string | null;
  voteError: string | null;
  onVote: (id: string) => void;
  onDismissVoteError: () => void;
  /** All challenge beatmaps for the open round, in vote-rank order. */
  challengeBeatmaps: ApiChallengeBeatmap[];
  /** The submission id of the currently selected challenge beatmap. */
  selectedChallengeId: number | null;
  onSelectChallenge: (id: number) => void;
  /** Imports the caller's osu! score for a specific challenge beatmap. */
  onImportScore: (osuScoreId: number, submissionId: number) => Promise<string | null>;
  onNavigate: (page: PlatformPage) => void;
  user: AuthUser | null;
  onLogin?: () => void;
}

function NoActiveRound() {
  return (
    <div className="bg-[#0d1526] border border-slate-800 rounded-2xl px-8 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-5">
        <Clock className="w-7 h-7 text-slate-700" />
      </div>
      <p className="text-white font-bold mb-1">No round is running</p>
      <p className="text-sm text-slate-500 max-w-md mx-auto">
        The next monthly round has not been opened yet. Submissions, voting, and the challenge
        leaderboard all appear here once it starts.
      </p>
    </div>
  );
}

export function DashboardPage({
  round,
  maps,
  favorites,
  onFavorite,
  onImportFavorites,
  onSubmitBeatmap,
  mySubmission,
  onWithdraw,
  myVote,
  voteBusy,
  voteError,
  onVote,
  onDismissVoteError,
  challengeBeatmaps,
  selectedChallengeId,
  onSelectChallenge,
  onImportScore,
  onNavigate,
  user,
  onLogin,
}: DashboardPageProps) {
  // One ticking countdown for the page, called before the early return below so
  // Challenge leaderboard state belongs to the selected challenge beatmap.
  const [challengeScores, setChallengeScores] = useState<ApiChallengeScore[]>([]);
  const [challengeLoaded, setChallengeLoaded] = useState(false);
  const [myScore, setMyScore] = useState<ApiChallengeScore | null>(null);
  const loadScoresRequestRef = useRef(0);

  const loadScores = useCallback(async (submissionId: number) => {
    const requestId = ++loadScoresRequestRef.current;
    setChallengeLoaded(false);

    const [scores, mine] = await Promise.all([
      api.challenge.scores(submissionId),
      api.challenge.my(submissionId),
    ]);

    // A player can move between challenge beatmaps before the previous requests
    // finish. Only the latest selection is allowed to update the dashboard.
    if (requestId !== loadScoresRequestRef.current) return;

    setChallengeScores(scores.ok ? scores.data : []);
    setChallengeLoaded(true);
    setMyScore(mine.ok ? mine.data : null);
  }, []);

  useEffect(() => {
    if (selectedChallengeId !== null && round?.phase === 'challenge') {
      void loadScores(selectedChallengeId);
    } else {
      setChallengeScores([]);
      setChallengeLoaded(false);
      setMyScore(null);
    }
  }, [selectedChallengeId, round?.phase, loadScores]);

  /**
   * Wraps onImportScore so the leaderboard reloads immediately after a successful
   * import without waiting for a full App refresh. The global refresh still runs
   * (via App.handleImportScore) to keep vote counts and other state in sync.
   */
  const handleImportScore = useCallback(
    async (osuScoreId: number, submissionId: number): Promise<string | null> => {
      const error = await onImportScore(osuScoreId, submissionId);
      if (error === null) {
        // Reload the leaderboard for the beatmap the score was just imported for.
        await loadScores(submissionId);
      }
      return error;
    },
    [onImportScore, loadScores]
  );
  // the hook order never changes. Both the header and the challenge hero use it.
  const countdown = useCountdown(round?.endsAt);

  // The vote lives on the server. This page used to keep its own useState for it,
  // which reset on every mount and never agreed with the vote page.
  const canVote = user?.canVote ?? false;
  // The ballot closes on winnerStatus while the phase is still 'voting', so every
  // vote surface below asks this rather than reading the phase.
  const ballotOpen = isBallotOpen(round);
  const myMapId = myVote === null ? null : String(myVote);
  const votedMap = myMapId === null ? null : maps.find((b) => b.id === myMapId) ?? null;
  const ownMapId = mySubmission === null ? null : String(mySubmission.id);

  /**
   * Why this entry cannot be voted for, or undefined when it can. The closed ballot
   * comes first: it is the one refusal that applies to everybody, including the
   * retraction of a vote already cast.
   */
  const refusal = (id: string): string | undefined => {
    if (!ballotOpen) return 'Voting has closed for this round';
    if (!canVote) return 'Your account is not eligible to vote in this round';
    if (id === ownMapId) return 'You cannot vote for your own submission';
    return undefined;
  };

  // Null whenever nothing is approved yet, so every use below is guarded.
  const leadingMap: Beatmap | null = maps.length
    ? maps.reduce((best, m) => ((m.voteCount ?? 0) > (best.voteCount ?? 0) ? m : best))
    : null;

  /**
   * The entry the server recorded, not the one leading a live count. Once the ballot
   * closes the two can differ — a vote retracted before the freeze, an entry rejected
   * after winning — and the recorded one is the fact. Null while a tie is unresolved,
   * or when the winner is no longer among the approved entries this page was given.
   */
  const recordedWinner: Beatmap | null =
    round?.winningSubmissionId == null
      ? null
      : maps.find((m) => m.id === String(round.winningSubmissionId)) ?? null;

  /**
   * The panel beside "Your Vote": the live leader while the ballot is open, the
   * recorded winner and its frozen count once it is closed, and an honest line while
   * a tie is unresolved. One derivation so the heading, the count and the card cannot
   * disagree about which of those three the round is in.
   */
  const standing: { label: string; map: Beatmap | null; votes: number | null; empty: string } =
    ballotOpen
      ? {
          label: 'Currently Leading',
          map: leadingMap,
          votes: leadingMap?.voteCount ?? null,
          empty: 'Nothing has been approved for voting yet.',
        }
      : round?.winnerStatus === 'tiebreak'
        ? {
            label: 'Tied at the top',
            map: null,
            votes: round.winnerVoteCount,
            empty: 'Voting ended level. An administrator picks the winner.',
          }
        : {
            label: 'Winner pending approval',
            map: recordedWinner,
            votes: round?.winnerVoteCount ?? null,
            empty: 'Voting is closed. No winning entry is on record for this round.',
          };
  // Aliased so the vote callback below closes over a narrowed const rather than
  // re-reading standing.map, which narrowing does not follow into a closure.
  const topEntry = standing.map;

  /**
   * The caller's own score. Preferred from the leaderboard, because that copy carries
   * the rank the server computed; GET /challenge/my has no rank to give, since a rank
   * only exists relative to the other plays.
   */
  const myRow =
    (user === null ? null : challengeScores.find((s) => s.userId === user.id) ?? null) ?? myScore;

  const selectedBeatmap =
    challengeBeatmaps.find((b) => b.submissionId === selectedChallengeId) ?? null;

  if (!round) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 pb-16">
        <NoActiveRound />
      </div>
    );
  }

  const phase = round.phase;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 pb-16">
      <RoundHeader round={round} countdown={countdown} />
      <PersonalProgress user={user} phase={phase} />

      {/* ── SUBMISSION PHASE ──────────────────────────────────────────── */}
      {phase === 'submission' && (
        <div className="space-y-10">
          {!user && (
            <LoginNudge
              message="Login with your osu! account to submit a beatmap for this round."
              onLogin={onLogin}
            />
          )}

          <SubmissionStatusBand round={round} approvedCount={maps.length} countdown={countdown} />

          {user && (
            <YourSubmission
              submission={mySubmission}
              onWithdraw={onWithdraw}
              onNavigate={onNavigate}
            />
          )}

          {/* Submit CTA — dropped once there is an entry to show above. */}
          {!mySubmission && (
          <div className="relative overflow-hidden bg-gradient-to-r from-amber-400/10 via-amber-400/5 to-transparent border border-amber-400/20 rounded-2xl p-6 flex items-center justify-between gap-6">
            <div className="absolute right-0 top-0 bottom-0 w-64 opacity-5">
              <Trophy className="w-full h-full text-amber-400" />
            </div>
            <div className="relative">
              <p className="text-[10px] uppercase tracking-widest font-mono text-amber-400/70 mb-1">This month's challenge</p>
              <h2 className="text-lg font-black text-white mb-1">Have a beatmap to propose?</h2>
              <p className="text-sm text-slate-400 max-w-lg">
                Submit a Ranked, Loved, or Approved beatmap. Players vote for their favourite — the winner becomes the monthly challenge.
              </p>
            </div>
            {user ? (
              <button
                type="button"
                onClick={() => onNavigate('submit')}
                className="flex items-center gap-2 px-6 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm rounded-xl transition-all flex-shrink-0 active:scale-[0.98]"
              >
                <Upload className="w-4 h-4" />
                Submit a Beatmap
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onLogin}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-700 hover:border-amber-400/40 text-slate-300 hover:text-white font-black text-sm rounded-xl transition-all flex-shrink-0"
              >
                <LogIn className="w-4 h-4" />
                Login to Submit
              </button>
            )}
          </div>
          )}

          <SubmissionRequirements onNavigate={onNavigate} />

          {/* Favorites */}
          <section>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-600 font-mono mb-1">My Collection</p>
                <h2 className="text-xl font-black text-white">Favorite Beatmaps</h2>
              </div>
              <ImportFavoritesButton onImport={onImportFavorites} disabled={!user} />
            </div>
            {favorites.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 border border-dashed border-slate-800 rounded-2xl">
                <Heart className="w-9 h-9 text-slate-700" />
                <p className="text-slate-500 text-sm font-medium">No favorites yet.</p>
                <p className="text-xs text-slate-600">
                  {user
                    ? 'Favorite a beatmap from Search, or import the ones on your osu! profile.'
                    : 'Log in to keep a list of beatmaps you like.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {favorites.map((b) => (
                  <BeatmapCardPlatform
                    key={b.id}
                    beatmap={b}
                    showSubmitButton
                    onFavorite={() => onFavorite(b)}
                    onSubmit={() => onSubmitBeatmap(b)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── VOTING PHASE ──────────────────────────────────────────────── */}
      {phase === 'voting' && (
        <div className="space-y-10">
          {!user && (
            <LoginNudge
              message="Login with your osu! account to cast your vote for this round."
              onLogin={onLogin}
            />
          )}

          {voteError && (
            <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" />
              <p className="text-xs text-rose-300 flex-1">{voteError}</p>
              <button
                type="button"
                onClick={onDismissVoteError}
                className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <X className="w-3.5 h-3.5 text-rose-300" />
              </button>
            </div>
          )}

          {/* My vote + leading */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* My vote */}
            <div className="bg-[#0d1526] border border-slate-800/80 rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-widest text-slate-600 font-mono mb-4">My Vote</p>
              {!user ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
                    <LogIn className="w-7 h-7 text-slate-700" />
                  </div>
                  <p className="text-white font-bold mb-1">Login to vote</p>
                  <p className="text-sm text-slate-500 mb-5">
                    Eligible players get one vote per round.
                  </p>
                  <button
                    type="button"
                    onClick={onLogin}
                    className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm rounded-xl transition-all"
                  >
                    Login with osu!
                  </button>
                </div>
              ) : !canVote ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
                    <Ban className="w-7 h-7 text-slate-700" />
                  </div>
                  <p className="text-white font-bold mb-1">Your account cannot vote in this round.</p>
                  <p className="text-sm text-slate-500">
                    Eligibility comes from your osu! profile country, read when you log in, and can
                    be granted or withdrawn per player by an administrator.
                  </p>
                </div>
              ) : votedMap ? (
                <>
                  <p className="text-xs text-emerald-400 font-bold mb-4 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    {ballotOpen ? 'You have voted' : 'Your vote is locked in'}
                  </p>
                  {/* Retracting is a write too, so it goes through the same refusal —
                      the server stops honouring it the moment the ballot closes. */}
                  <BeatmapCardPlatform
                    beatmap={votedMap}
                    voted
                    showVoteButton
                    onVote={() => onVote(votedMap.id)}
                    voteBusy={voteBusy === votedMap.id}
                    voteDisabled={refusal(votedMap.id) !== undefined}
                    voteDisabledReason={refusal(votedMap.id)}
                  />
                </>
              ) : !ballotOpen ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
                    <Trophy className="w-7 h-7 text-slate-700" />
                  </div>
                  <p className="text-white font-bold mb-1">Voting has closed</p>
                  <p className="text-sm text-slate-500">
                    You did not vote in this round. The result is with the administrators now.
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-4">
                    <Trophy className="w-7 h-7 text-slate-700" />
                  </div>
                  <p className="text-white font-bold mb-1">Your vote is waiting</p>
                  <p className="text-sm text-slate-500 mb-5">
                    Pick the beatmap you want as this month's challenge.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('vote')}
                    className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm rounded-xl transition-all"
                  >
                    Vote Now
                  </button>
                </div>
              )}
            </div>

            {/* Currently leading */}
            <div className="bg-[#0d1526] border border-amber-400/25 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-3 right-3 opacity-5">
                <Crown className="w-20 h-20 text-amber-400" />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-4 h-4 text-amber-400" />
                <p className="text-[10px] uppercase tracking-widest text-amber-400/80 font-mono font-bold">{standing.label}</p>
                {standing.votes !== null && (
                  <span className="ml-auto text-[10px] font-mono text-slate-600">{standing.votes} votes</span>
                )}
              </div>
              {topEntry ? (
                <BeatmapCardPlatform
                  beatmap={topEntry}
                  showVoteButton={Boolean(user)}
                  voted={myMapId === topEntry.id}
                  onVote={() => onVote(topEntry.id)}
                  voteBusy={voteBusy === topEntry.id}
                  voteDisabled={refusal(topEntry.id) !== undefined}
                  voteDisabledReason={refusal(topEntry.id)}
                />
              ) : (
                <p className="text-sm text-slate-500 py-8 text-center">{standing.empty}</p>
              )}
            </div>
          </div>

          {/* All submissions */}
          <section>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-600 font-mono mb-1">{roundLabel(round)}</p>
                <h2 className="text-xl font-black text-white">All Submitted Beatmaps</h2>
              </div>
              <span className="text-xs text-slate-600 font-mono">{maps.length} beatmaps</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {maps.map((b) => (
                <BeatmapCardPlatform
                  key={b.id}
                  beatmap={b}
                  showVoteButton={Boolean(user)}
                  voted={myMapId === b.id}
                  onVote={() => onVote(b.id)}
                  voteBusy={voteBusy === b.id}
                  voteDisabled={refusal(b.id) !== undefined}
                  voteDisabledReason={refusal(b.id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── CHALLENGE PHASE ───────────────────────────────────────────── */}
      {phase === 'challenge' && (
        <div className="space-y-6">

          <DashboardChallengeHero
            round={round}
            selectedBeatmap={selectedBeatmap}
            challengeBeatmaps={challengeBeatmaps}
            selectedChallengeId={selectedChallengeId}
            onSelectChallenge={onSelectChallenge}
            countdown={countdown}
          />

          {/* ── SCORE + LEADERBOARD ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
            <MyChallengeScore
              // Each challenge beatmap owns its score-import state. Remounting on
              // selection change prevents available scores from the previous map
              // from remaining selectable for the new submissionId.
              key={selectedChallengeId ?? 'none'}
              score={myRow}
              requirement={selectedBeatmap?.challengeRequirement ?? null}
              modRequirement={selectedBeatmap?.modRequirement ?? null}
              submissionId={selectedChallengeId}
              onImportScore={handleImportScore}
              user={user}
              onLogin={onLogin}
            />

            <ChallengeLeaderboard
              roundNumber={round.roundNumber}
              scores={challengeScores}
              loaded={challengeLoaded}
              myUserId={user?.id ?? null}
              requirement={selectedBeatmap?.challengeRequirement ?? null}
            />
          </div>

          {/* ── LIVE CHAT ── */}
          <div>
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/80 font-mono">Live room</p>
                  </div>
                  <h2 className="text-xl font-black text-white">Challenge chat</h2>
                  <p className="text-xs text-slate-500 mt-1">Talk through the current map with the community. Messages are not archived.</p>
                </div>
              </div>
              <ChallengeChat user={user} onLogin={onLogin} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

