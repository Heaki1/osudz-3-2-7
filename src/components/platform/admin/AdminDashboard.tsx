import React, { useEffect, useState } from 'react';
import { Phase } from '../../../types';
import { PlayerAvatar } from '../player/PlayerAvatar';
import {
  api,
  ApiAllowedCountry,
  ApiParticipantException,
} from '../../../api/client';
import { CurrentRound, formatDeadline, roundLabel, useCountdown } from '../../../lib/round';
import { beatmapUrl } from '../../../lib/submission';
import { AuthUser } from '../NavHeader';
import { AdminSubmissionsTab as SubmissionsTab } from './AdminSubmissionsTab';
import { AdminEligibilityTab as EligibilityTab } from './AdminEligibilityTab';
import { Banner, Section } from './AdminDashboardPrimitives';
import { BeatmapRulesTab, ChallengeTab } from './AdminSiteSettings';
import { UsersTab } from './AdminUsersTab';
import { ShopTab } from './AdminShopTab';
import { DzppRecomputePanel } from './AdminDzppRecompute';
import { AdminGuildTab } from './AdminGuildTab';
import { ConfigTab } from './AdminConfigTab';
import { BallotModeration, CorrectionPanel, EmptyBallotPanel, WinnerPanel } from './AdminRoundDecisionPanels';
import { BallotCounts, countBallot } from './AdminRoundDecisionPanels';
import {
  Shield, ChevronRight, CheckCircle2, Circle, Clock,
  Star, Music2, AlertCircle, Users, Settings, Zap,
  ToggleLeft, ToggleRight, Plus, X, Globe, Inbox, Link as LinkIcon,
  Trophy, Scale, Eye, AlertTriangle, SkipForward, ShoppingBag,
} from 'lucide-react';

// ── TAB TYPES ────────────────────────────────────────────────────────────────

type AdminTab =
  | 'round'
  | 'submissions'
  | 'eligibility'
  | 'rules'
  | 'challenge'
  | 'users'
  | 'shop'
  | 'config'
  | 'guild';

/** Tabs backed by a real endpoint. The rest are still UI only. */
// Every tab is backed by a real endpoint as of C7 phase two, so the WIRED_TABS list and the
// "this tab is UI only" banner that read from it are both gone: there is nothing left for them
// to warn about, and a banner that can never render is dead UI of exactly the kind this work
// has been deleting. docs/todo.txt C7 carries the record of what each tab became.

const TABS: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
  { key: 'round',       label: 'Round Control', icon: <Clock className="w-4 h-4" /> },
  { key: 'submissions', label: 'Submissions',   icon: <Inbox className="w-4 h-4" /> },
  { key: 'eligibility', label: 'Eligibility',   icon: <Globe className="w-4 h-4" /> },
  { key: 'rules',       label: 'Beatmap Rules', icon: <Star className="w-4 h-4" /> },
  { key: 'challenge',   label: 'Challenge',     icon: <Zap className="w-4 h-4" /> },
  { key: 'users',       label: 'Users',         icon: <Users className="w-4 h-4" /> },
  { key: 'shop',        label: 'Shop',          icon: <ShoppingBag className="w-4 h-4" /> },
  { key: 'config',      label: 'Config',        icon: <Settings className="w-4 h-4" /> },
  { key: 'guild',       label: 'Guild',          icon: <Shield className="w-4 h-4" /> },
];

// ── SECTION WRAPPER ───────────────────────────────────────────────────────────

// ── PHASE TABLE & BANNERS ───────────────────────────────────────────────────────────

const PHASES: { key: Phase; label: string; color: string }[] = [
  { key: 'submission', label: 'Submission', color: 'text-amber-400' },
  { key: 'voting',     label: 'Voting',     color: 'text-blue-400' },
  { key: 'challenge',  label: 'Challenge',  color: 'text-purple-400' },
];

// ── WINNER APPROVAL ───────────────────────────────────────────────────────────
//
// The window between the ballot closing and the winner being official. The round is
// still in the 'voting' phase throughout — winner_status is what closed the ballot,
// not the phase — and this panel is the only way out of it: POST /admin/round/winner
// is the sole path to the challenge phase, because NEXT_PHASES deliberately omits
// voting → challenge so the generic phase endpoint cannot skip the approval.

/** One entry in the winner panel — the pending winner, or a tied candidate. */
function RoundControl({ round, onRoundChange }: { round: CurrentRound | null; onRoundChange: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [subDays, setSubDays]  = useState('7');
  const [voteDays, setVoteDays] = useState('3');
  const [chalDays, setChalDays] = useState('21');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [reward, setReward] = useState('');

  const countdown = useCountdown(round?.endsAt);

  /**
   * What the open round has to vote on, counted here rather than in EmptyBallotPanel so the
   * panel and the phase button cannot disagree — offering "Close Voting & Count the Ballot"
   * beside a panel saying there is no ballot would be two answers to one question.
   *
   * null while unread, and on a failed read: guessing would either hide the panel on a round
   * that needs it or accuse a healthy round of having no ballot, so an unknown count leaves
   * the normal controls exactly as they were.
   */
  const [ballot, setBallot] = useState<BallotCounts | null>(null);
  const roundId = round?.id ?? null;

 useEffect(() => {
  if (roundId === null) {
    setBallot(null);
    return;
  }

  let live = true;

  void (async () => {
    const rows = await api.admin.submissions(roundId);

    if (!live) return;

    if (!rows.ok) {
      setBallot(null);
      return;
    }

    setBallot(countBallot(rows.data));
  })();

  return () => {
    live = false;
  };
}, [roundId, round?.phase, round?.winnerStatus]);

  const describe = (result: { status: number; error: string }) =>
    result.status === 0 ? result.error : `${result.error} (HTTP ${result.status})`;

  // Blank fields are omitted so the server applies its own defaults (current UTC
  // month and year) rather than being sent empty strings.
  const newRoundBody = () => ({
    month: month.trim() || undefined,
    year: year.trim() ? Number(year) : undefined,
    reward: reward.trim() || undefined,
    submissionDays: Number(subDays),
    votingDays: Number(voteDays),
    challengeDays: Number(chalDays),
  });

  const advance = async (next: Phase) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await api.admin.setPhase(next);
    if (result.ok) setNotice(`Round ${result.data.round.roundNumber} is now in the ${next} phase.`);
    else setError(describe(result));
    await onRoundChange();
    setBusy(false);
  };

  // Closing the ballot does not advance the phase. The round stays in 'voting' with
  // the winner pending or tied, and only WinnerPanel below can move it on — counting
  // and freezing the totals happen server-side in one transaction.
  const closeBallot = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await api.admin.closeVoting();
    if (result.ok) {
      setNotice(
        result.data.tied.length > 1
          ? `Voting closed level between ${result.data.tied.length} entries — pick the winner below.`
          : 'Voting closed. The leading entry is waiting for your approval below.'
      );
    } else setError(describe(result));
    await onRoundChange();
    setBusy(false);
  };

  // Ending a round and opening the next are two writes: rounds_single_open means
  // one row cannot be both ended and open. If the second call fails the round is
  // closed with nothing open, which the "Open a Round" form below recovers.
  const archiveAndOpenNext = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const ended = await api.admin.setPhase('ended');
    if (!ended.ok) {
      setError(`Could not end the round: ${describe(ended)}`);
      await onRoundChange();
      setBusy(false);
      return;
    }
    const created = await api.admin.createRound(newRoundBody());
    if (created.ok) setNotice(`Round ${created.data.roundNumber} opened in the submission phase.`);
    else setError(`Round ended, but opening the next one failed: ${describe(created)}`);
    await onRoundChange();
    setBusy(false);
  };

  const openRound = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const created = await api.admin.createRound(newRoundBody());
    if (created.ok) setNotice(`Round ${created.data.roundNumber} opened in the submission phase.`);
    else setError(describe(created));
    await onRoundChange();
    setBusy(false);
  };

  const nextActions: Record<Phase, { label: string; color: string; run: () => Promise<void> }> = {
    submission: { label: 'Close Submissions & Start Voting', color: 'bg-blue-500 hover:bg-blue-400 text-white',       run: () => advance('voting') },
    voting:     { label: 'Close Voting & Count the Ballot',  color: 'bg-amber-400 hover:bg-amber-300 text-slate-950',  run: closeBallot },
    challenge:  { label: 'Archive Round & Open the Next',    color: 'bg-amber-400 hover:bg-amber-300 text-slate-950', run: archiveAndOpenNext },
  };

  const durationInputs = (
    <div className="grid grid-cols-3 gap-4">
      {[
        { label: 'Submission', val: subDays,  set: setSubDays },
        { label: 'Voting',     val: voteDays, set: setVoteDays },
        { label: 'Challenge',  val: chalDays, set: setChalDays },
      ].map(({ label, val, set }) => (
        <div key={label}>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-mono">{label} (days)</p>
          <input
            type="number"
            min="1"
            max="365"
            value={val}
            onChange={(e) => set(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700 focus:border-amber-400/50 rounded-xl px-3 py-2.5 text-sm font-mono text-white focus:outline-none transition-colors"
          />
        </div>
      ))}
    </div>
  );

  const phaseIdx = round ? PHASES.findIndex((p) => p.key === round.phase) : -1;
  // The ballot closes on winner_status, not on the phase, so a round in 'voting'
  // with a winner pending has no phase action left — approving one is the only move.
  const ballotClosed = round?.phase === 'voting' && round.winnerStatus !== 'none';

  /**
   * Voting reached with nothing approved. The phase button is replaced rather than disabled:
   * "Close Voting & Count the Ballot" can only answer 409 here, and a greyed-out button
   * explains nothing about why. Requires a known count — see `ballot` above.
   */
  const emptyBallot =
    round?.phase === 'voting' && round.winnerStatus === 'none' && ballot?.approved === 0;

  return (
    <div className="space-y-5">
      {error  && <Banner tone="error" text={error}  onDismiss={() => setError(null)} />}
      {notice && <Banner tone="ok"    text={notice} onDismiss={() => setNotice(null)} />}

      {round ? (
        <>
          <Section
            title="Phase Timeline"
            description={
              ballotClosed
                ? `${roundLabel(round)} — the ballot is closed and the totals are frozen.`
                : `${roundLabel(round)} — this phase ends in ${countdown}.`
            }
          >
            {/* Phase progress */}
            <div className="flex items-center gap-0">
              {PHASES.map((p, i) => (
                <React.Fragment key={p.key}>
                  <div className={`flex flex-col items-center gap-1.5 flex-1 ${i <= phaseIdx ? '' : 'opacity-40'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                      i < phaseIdx  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' :
                      i === phaseIdx ? 'bg-amber-400/20 border-amber-400 text-amber-400' :
                      'bg-slate-900 border-slate-700 text-slate-600'
                    }`}>
                      {i < phaseIdx ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      i === phaseIdx ? p.color : i < phaseIdx ? 'text-emerald-400' : 'text-slate-600'
                    }`}>{p.label}</span>
                  </div>
                  {i < PHASES.length - 1 && (
                    <div className={`h-px flex-1 mb-5 transition-colors ${i < phaseIdx ? 'bg-emerald-500/40' : 'bg-slate-800'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Action button — absent once the ballot is closed, because approving the
                winner is then the only way forward and WinnerPanel owns that. */}
            {ballotClosed ? (
              <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3">
                <Trophy className="w-4 h-4 text-blue-400 flex-shrink-0 mt-px" />
                <p className="text-xs text-blue-300/90">
                  Voting is closed — nobody can cast or retract a vote. The round leaves the
                  voting phase only when you approve the winner below.
                </p>
              </div>
            ) : emptyBallot ? (
              <div className="flex items-start gap-2.5 bg-amber-400/8 border border-amber-400/25 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-px" />
                <p className="text-xs text-amber-300/90">
                  There is nothing approved to vote on, so there is no ballot to count. Your
                  options are below.
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { void nextActions[round.phase].run(); }}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${nextActions[round.phase].color}`}
                >
                  <ChevronRight className="w-4 h-4" />
                  {busy ? 'Working…' : nextActions[round.phase].label}
                </button>
                <p className="text-[11px] text-slate-600 text-center">
                  This change is immediate and visible to all users. There is no confirmation.
                </p>
              </>
            )}
          </Section>

          {/* The empty-ballot escape, above WinnerPanel because the two are mutually
              exclusive: emptyBallot needs winnerStatus 'none' and WinnerPanel needs it not
              to be. Nothing approved means there is no winner to approve. */}
          {emptyBallot && ballot && (
            <EmptyBallotPanel
              round={round}
              counts={ballot}
              onRoundChange={onRoundChange}
              onSkipped={(message) => { setError(null); setNotice(message); }}
            />
          )}

          {ballotClosed && <WinnerPanel round={round} onRoundChange={onRoundChange} />}

          {/* Only once something is recorded: there is nothing to correct before then, and
              closing the ballot or resolving a tie are their own paths (D4). */}
          {round.winningSubmissionId !== null && (
            <CorrectionPanel round={round} onRoundChange={onRoundChange} />
          )}

          {round.phase !== 'submission' && <BallotModeration round={round} />}

          <Section
            title="Schedule"
            description="Fixed when the round was opened. Advancing a phase early does not move the later deadlines."
          >
            <div className="space-y-2">
              {PHASES.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
                  <span className={`text-xs font-bold ${key === round.phase ? 'text-amber-400' : 'text-slate-400'}`}>
                    {label} ends
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">{formatDeadline(round.schedule[key])}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Next Round" description="Durations applied when this round is archived and the next one opens.">
            {durationInputs}
          </Section>
        </>
      ) : (
        <Section
          title="Open a Round"
          description="Nothing is running. Submissions, voting and the challenge all key off the open round, so the platform stays idle until one exists."
        >
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Month',  val: month,  set: setMonth,  hint: 'current UTC month' },
              { label: 'Year',   val: year,   set: setYear,   hint: 'current year' },
              { label: 'Reward', val: reward, set: setReward, hint: 'One month of osu!supporter' },
            ].map(({ label, val, set, hint }) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-mono">{label}</p>
                <input
                  type="text"
                  value={val}
                  placeholder={hint}
                  onChange={(e) => set(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 focus:border-amber-400/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors"
                />
              </div>
            ))}
          </div>
          {durationInputs}
          <button
            type="button"
            disabled={busy}
            onClick={() => { void openRound(); }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm bg-amber-400 hover:bg-amber-300 text-slate-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {busy ? 'Opening…' : 'Open Round'}
          </button>
          <p className="text-[11px] text-slate-600">
            The durations become absolute deadlines that cascade — each phase is scheduled to start
            when the previous one closes. Blank month and year default to the current UTC month.
          </p>
        </Section>
      )}
    </div>
  );
}


// ── SUBMISSIONS REVIEW ────────────────────────────────────────────────────────

// ── ELIGIBILITY ───────────────────────────────────────────────────────────────
//
// The country half is C4 and real: GET/PUT/DELETE /api/admin/countries, read by the same
// allowlist that requireCanSubmit, requireCanVote, requireCanChallenge and the canSubmit /
// canVote / canChallenge flags on ApiUser all read, so this tab and the gates cannot
// disagree. The five hardcoded countries and the two invented exception rows that used to
// live here are gone.

/**
 * Intl.DisplayNames knows every ISO 3166-1 region, so no country name is stored or
 * hardcoded — which is what lets the allowlist be open-ended instead of a fixed list.
 * Built once; `of` can throw on a code it does not recognise.
 */
const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

function countryName(code: string): string {
  try {
    return REGION_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The flag, built from the two letters as regional indicator symbols. */
function flagEmoji(code: string): string {
  const letters = [...code.toUpperCase()];
  if (letters.length !== 2 || letters.some((l) => l < 'A' || l > 'Z')) return '\u{1F3F3}';
  return String.fromCodePoint(...letters.map((l) => 0x1f1e6 + l.charCodeAt(0) - 65));
}

// ── BEATMAP RULES (C8) ────────────────────────────────────────────────────────
//
// Wired. This tab rendered star limits, length limits and status toggles with a Save button
// that did nothing, while the server enforced none of it — a submission could be any star
// rating or length at all. Both halves are real now: the limits are stored here and checked in
// POST /api/submissions AND in the lookup preview, so a player is told before they choose a
// mod rather than after.

// ── CONFIG ────────────────────────────────────────────────────────────────────
//
// C7 phase two, and the last tab. Read-only, and much smaller than it was.
//
// DELETED, decided 2026-09-05: the site name, the "Max Submissions Per User / Round" number,
// and the maintenance-mode switch. They corresponded to nothing in my_plan.txt or the
// roadmap, and the max-submissions input was not a setting that exists at all — the server
// allows exactly one entry per player per round through submissions_one_per_user_per_round,
// so that field could never have done anything but mislead.
//
// The webhook input is gone too, for a different reason: DISCORD_WEBHOOK is a secret and
// stays a server environment variable. An admin endpoint that accepted one would mean a
// credential arriving over HTTP and stored somewhere it could be read back. G5 wired the
// announcements; this reports whether they are switched on.

// ── DZPP RECOMPUTE (Phase 7) ─────────────────────────────────────────────────
//
// The escape hatch for the freeze. A completed challenge keeps the DZPP it awarded, so retuning
// a constant does not silently rewrite earlier months — and the cost of that is that a round
// sometimes has to be scored again. This is the only sanctioned way, and every use leaves a row.
//
// ONE ROUND AT A TIME, chosen explicitly. There is no "recompute everything" button, because a
// single click that reshaped the whole leaderboard is not a feature. The list offers ended rounds
// only: an open one can still change on its own, and the server refuses it anyway.

interface AdminDashboardProps {
  round: CurrentRound | null;
  user: AuthUser | null;
  onRoundChange: () => void | Promise<void>;
  onLogin?: () => void;
}

/**
 * Shown instead of the dashboard to anyone who is not an admin. The nav button is
 * already hidden for them, so this is only reachable directly — but the check
 * belongs here too, and the endpoints behind it enforce the real gate.
 */
function AdminLocked({ user, onLogin }: { user: AuthUser | null; onLogin?: () => void }) {
  return (
    <div className="max-w-md mx-auto px-6 py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-5">
        <Shield className="w-6 h-6 text-rose-400" />
      </div>
      <h1 className="text-lg font-black text-white mb-2">Admin access required</h1>
      <p className="text-sm text-slate-500 mb-6 leading-relaxed">
        {user
          ? `${user.username} is not an admin on this instance. Admin accounts are listed in ADMIN_OSU_IDS on the server.`
          : 'Sign in with an osu! account that has admin access.'}
      </p>
      {!user && (
        <button
          type="button"
          onClick={onLogin}
          className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm rounded-xl transition-all"
        >
          Login with osu!
        </button>
      )}
    </div>
  );
}

export function AdminDashboard({ round, user, onRoundChange, onLogin }: AdminDashboardProps) {
  const [tab, setTab] = useState<AdminTab>('round');

  if (!user?.isAdmin) return <AdminLocked user={user} onLogin={onLogin} />;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-rose-400/70 font-mono">Admin</p>
          <h1 className="text-xl font-black text-white tracking-tight">Admin Dashboard</h1>
        </div>
        <div className="ml-auto flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-1.5">
          <Music2 className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
            {round ? `${round.phase} Phase Active` : 'No active round'}
          </span>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <aside className="w-44 flex-shrink-0">
          <nav className="space-y-1">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-all ${
                  tab === key
                    ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {tab === 'round'       && <RoundControl round={round} onRoundChange={onRoundChange} />}
          {tab === 'submissions' && <SubmissionsTab round={round} onReviewed={onRoundChange} />}
          {tab === 'eligibility' && <EligibilityTab />}
          {tab === 'rules'       && <BeatmapRulesTab />}
          {tab === 'challenge'   && <ChallengeTab />}
          {tab === 'users'       && <UsersTab />}
          {tab === 'shop'        && <ShopTab />}
          {tab === 'config'      && (
            <div className="space-y-6">
              <ConfigTab />
              {/* Round-independent, so it lives here rather than on the round tab: a
                  recompute targets an ENDED round, and that tab only renders while one is
                  open. */}
              <DzppRecomputePanel />
            </div>
          )}
          {tab === 'guild'      && <AdminGuildTab />}
        </div>
      </div>
    </div>
  );
}




