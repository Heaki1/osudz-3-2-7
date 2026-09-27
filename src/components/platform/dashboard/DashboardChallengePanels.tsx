import React, { useState } from 'react';
import { api, ApiChallengeScore } from '../../../api/client';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { AuthUser } from '../NavHeader';
import { AlertCircle, CheckCircle2, Crown, Info, RefreshCw, Target, Trophy, X } from 'lucide-react';

const modAssetByLabel: Record<string, string> = {
  NM: '/assets/osu/Icons-Mods-mod-no-mod.png',
  HD: '/assets/osu/Icons-Mods-mod-hidden.png',
  HR: '/assets/osu/Icons-Mods-mod-hard-rock.png',
  DT: '/assets/osu/Icons-Mods-mod-double-time.png',
  EZ: '/assets/osu/Icons-Mods-mod-easy.png',
  FL: '/assets/osu/Icons-Mods-mod-flashlight.png',
  HT: '/assets/osu/Icons-Mods-mod-half-time.png',
  NF: '/assets/osu/Icons-Mods-mod-no-fail.png',
  SD: '/assets/osu/Icons-Mods-mod-sudden-death.png',
  PF: '/assets/osu/Icons-Mods-mod-perfect.png',
};

function modTokens(requirement: string | null) {
  const tokens = (requirement ?? '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  return tokens.length ? tokens : ['NM'];
}

function challengeIcon(requirement: string | null) {
  switch ((requirement ?? '').toLowerCase()) {
    case 'best accuracy':
      return <Target className="h-5 w-5 text-amber-400" />;
    case 'lowest miss count':
      return <CheckCircle2 className="h-5 w-5 text-amber-400" />;
    case 'top #1 score':
      return <img src="/assets/osu/Icons-crown.png" alt="" className="h-5 w-5 object-contain" />;
    case 'full combo':
      return <span className="text-[10px] font-black tracking-tight text-yellow-300">FC</span>;
    default:
      return <img src="/assets/osu/Icons-ranking.png" alt="" className="h-5 w-5 object-contain" />;
  }
}

export function MyChallengeScore({
  score,
  requirement,
  modRequirement,
  submissionId,
  onImportScore,
  user,
  onLogin,
}: {
  score: ApiChallengeScore | null;
  requirement: string | null;
  modRequirement: string | null;
  submissionId: number | null;
  onImportScore: (osuScoreId: number, submissionId: number) => Promise<string | null>;
  user: AuthUser | null;
  onLogin?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mods = modTokens(modRequirement);

const [availableScores, setAvailableScores] = useState<
  Array<{
    osuScoreId: number;
    score: number;
    accuracy: number;
    misses: number;
    mods: string;
    pp: number | null;
    rank: string;
    passed: boolean;
    endedAt: string | null;
  }>
>([]);

  const run = async () => {
    if (submissionId === null) return;

  setBusy(true);
  setError(null);

  const result = await api.challenge.available(submissionId);

  if (!result) {
    setError('Could not load your available challenge scores.');
    setBusy(false);
    return;
  }

    if (result.ok) {
      setAvailableScores(result.data.scores);
      if (result.data.scores.length === 0) {
        setError('No eligible osu! scores were found for this challenge yet.');
      }
    } else {
      setAvailableScores([]);
      setError(result.error);
    }
    setBusy(false);
  };

  const importButton = (
    <button
      type="button"
      disabled={busy}
      onClick={() => { void run(); }}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
      {busy ? 'Reading osu!…' : score ? 'Refresh from osu!' : 'Import my score'}
    </button>
  );

const scoreSelector = availableScores.length > 0 && (
  <div className="mt-4 space-y-2">
    <p className="text-[10px] uppercase tracking-widest text-slate-600 font-mono">
      Select your score
    </p>

    {availableScores.map((available) => (
      <div
        key={available.osuScoreId}
        className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white font-black font-mono">
              {available.score.toLocaleString()}
            </p>

            <p className="text-[11px] text-slate-400 mt-1">
              {available.accuracy.toFixed(2)}% · {available.misses} miss
              {available.misses === 1 ? '' : 'es'} · {available.mods}
            </p>

            {available.endedAt && (
              <p className="text-[10px] text-slate-600 mt-1">
                {new Date(available.endedAt).toLocaleString()}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);

              if (submissionId === null) return;
              void onImportScore(available.osuScoreId, submissionId).then((message) => {
                setError(message);
                setBusy(false);
              });
            }}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-40 transition-all"
          >
            Select
          </button>
        </div>
      </div>
    ))}
  </div>
);

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-400/20 bg-[#0d1526]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-400/70 font-mono">Your run</p>
          <h3 className="mt-1 text-sm font-black text-white">Challenge score</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>

      <div className="p-5">
        <div className="mb-5 rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-3">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em]">The Challenge</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {challengeIcon(requirement)}
            <span className="text-xs font-black text-white">{requirement || 'Not specified'}</span>
            <span className="text-xs font-black text-yellow-300">×</span>
            {mods.map((mod) => (
              <span key={mod} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-black text-amber-300">
                {modAssetByLabel[mod] && <img src={modAssetByLabel[mod]} alt="" className="h-5 w-5 object-contain" />}
                {mod}
              </span>
            ))}
          </div>
        </div>

      {error && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2 mb-4">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-px" />
          <p className="text-[11px] text-rose-300 flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} className="opacity-60 hover:opacity-100 flex-shrink-0">
            <X className="w-3 h-3 text-rose-300" />
          </button>
        </div>
      )}

      {!user ? (
        <div className="text-center py-4">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/60">
            <Crown className="h-5 w-5 text-slate-600" />
          </div>
          <p className="text-sm font-bold text-white">Your score appears here</p>
          <p className="mt-1 text-xs text-slate-500">Log in to import your osu! score for this challenge.</p>
          <button
            type="button"
            onClick={onLogin}
            className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl transition-all"
          >
            Login with osu!
          </button>
        </div>
      ) : !score && !user.canChallenge ? (
        /* The server would refuse the import with a 403, so the button is not offered.
           Reading the leaderboard is still open to everybody — that is the E2 decision,
           not a consolation. Ordered before the empty state but AFTER the score check: an
           account blocked after posting a score still sees the score it earned. */
        <div className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-950/35 p-4">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-400 leading-relaxed">
              This account cannot compete in the challenge.
            </p>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            The challenge is limited to the community's countries, and an administrator can
            also restrict an individual account. The leaderboard below is open to read either
            way.
          </p>
        </div>
      ) : !score ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-purple-400/10 bg-purple-400/[0.035] px-4 py-3">
            <p className="text-xs font-bold text-white">Play it. Import it. See where you stand.</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Your osu! profile is the source of truth, so there is nothing to type in manually.
            </p>
          </div>
          {importButton}
          {scoreSelector}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">Current placement</p>
              <div className="mt-1 flex items-end gap-3">
                <span className="font-mono text-4xl font-black tracking-tight text-white">
                  {score.rank > 0 ? `#${score.rank}` : '—'}
                </span>
                <div className="pb-1">
                  <p className="truncate text-sm font-bold text-slate-200">{score.username}</p>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black ${
                    score.qualified
                      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                      : 'border-rose-400/20 bg-rose-400/10 text-rose-300'
                  }`}>
                    {score.qualified ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {score.qualified ? 'Qualified' : 'Not qualified'}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">Score</p>
              <p className="mt-1 font-mono text-xl font-black tabular-nums text-amber-400">{score.score.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Accuracy', value: `${score.accuracy.toFixed(2)}%` },
              { label: 'Misses', value: String(score.misses) },
              { label: 'Max combo', value: `${score.maxCombo.toLocaleString()}×` },
              { label: 'Mods', value: score.mods },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-3">
                <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{label}</div>
                <div className="text-sm font-black font-mono text-white">{value}</div>
              </div>
            ))}
          </div>

          {/* Why it did not qualify, when that can be said from the play alone. The
              three relative requirements cannot be judged this way — they are the
              leaderboard's order — so nothing is claimed about them here. */}
          {!score.qualified && (
            <div className="mt-4 space-y-1 rounded-xl border border-slate-800/60 bg-slate-950/35 px-3 py-3 text-[11px] leading-relaxed text-slate-500">
              {modRequirement && (
                <p>
                  {score.modCompliant
                    ? `Mod requirement met: ${modRequirement === 'NM' ? 'no mods' : modRequirement}.`
                    : `Mod requirement not met: ${modRequirement === 'NM' ? 'no mods' : modRequirement} required, ${score.mods} played.`}
                </p>
              )}
              {requirement === 'Full Combo' && (
                <p>
                  {score.misses === 0
                    ? 'Full Combo requirement met.'
                    : `Full Combo requirement not met: ${score.misses} miss${score.misses === 1 ? '' : 'es'}.`}
                </p>
              )}
              {!modRequirement && requirement !== 'Full Combo' && (
                <p>This play did not meet the round requirement.</p>
              )}
            </div>
          )}

          {user.canChallenge ? (
  <div className="mt-4">
    {importButton}
    {scoreSelector}
  </div>
) : (
            /* The row stays — it was earned and it is on the leaderboard — but refreshing
               it is the permission this account no longer has. */
            <p className="text-[11px] text-slate-600 mt-4 leading-relaxed">
              This account can no longer refresh its score.
            </p>
          )}
          {score.osuScoreId === null && (
            <p className="text-[10px] text-slate-600 mt-2">
              Entered by an administrator rather than imported.
            </p>
          )}
        </>
      )}
      </div>
    </div>
  );
}

// ── CHALLENGE LEADERBOARD ────────────────────────────────────────────────────

/**
 * The round's real scores, in the order the server returned them.
 *
 * That order is not decorative: three of the four challenge requirements are relative
 * ('Top #1 Score', 'Best Accuracy', 'Lowest Miss Count'), so the server sorts by the
 * one this round asked for and this table must not re-sort. `qualified` carries only
 * what a single play can be judged on by itself.
 */
export function ChallengeLeaderboard({
  roundNumber,
  scores,
  loaded,
  myUserId,
  requirement,
}: {
  roundNumber: number;
  scores: ApiChallengeScore[];
  loaded: boolean;
  myUserId: number | null;
  requirement: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0d1526]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/60 px-5 py-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-400/65 font-mono">Live standings</p>
          <h3 className="mt-1 text-sm font-black text-white">Challenge leaderboard</h3>
          {requirement && (
            <p className="mt-1 text-[10px] text-slate-500">Ordered by {requirement}</p>
          )}
        </div>
        <div className="text-right">
          <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600">Round {roundNumber}</span>
          <span className="mt-1 block text-[9px] font-mono uppercase tracking-wider text-slate-700">DZPP provisional</span>
        </div>
      </div>

      {!loaded ? (
        <p className="px-5 py-10 text-sm text-slate-500 text-center">Loading scores…</p>
      ) : scores.length === 0 ? (
        <p className="px-5 py-10 text-sm text-slate-500 text-center">
          No scores yet. Play the challenge map and import your score to be the first.
        </p>
      ) : (
      <>

      {/* Top of field */}
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-amber-400" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Top of field</p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {scores.slice(0, 3).map((entry) => {
            const isMe = myUserId !== null && entry.userId === myUserId;
            return (
              <div
                key={entry.userId}
                className={`rounded-2xl border p-3.5 ${
                  isMe
                    ? 'border-amber-400/25 bg-amber-400/[0.045]'
                    : entry.rank === 1
                    ? 'border-amber-400/15 bg-amber-400/[0.025]'
                    : 'border-slate-800/70 bg-slate-950/35'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <PlayerAvatar userId={entry.userId} username={entry.username} avatarUrl={entry.avatarUrl} size={42} />
                    <span className={`absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-md border px-1 font-mono text-[9px] font-black ${
                      entry.rank === 1
                        ? 'border-amber-300/30 bg-amber-400 text-slate-950'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                    }`}>
                      #{entry.rank}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-black ${isMe ? 'text-amber-300' : 'text-white'}`}>{entry.username}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-[0.12em] ${entry.qualified ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {entry.qualified ? 'Qualified' : 'Not qualified'}
                      </span>
                      <span className="text-[9px] font-mono text-slate-600">{entry.mods}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800/60 pt-3">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.14em] text-slate-600">Score</p>
                    <p className="mt-1 font-mono text-xs font-black text-white">{entry.score.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.14em] text-slate-600">Acc</p>
                    <p className="mt-1 font-mono text-xs font-black text-white">{entry.accuracy.toFixed(1)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] uppercase tracking-[0.14em] text-slate-600">DZPP</p>
                    <p className="mt-1 font-mono text-xs font-black text-amber-400">{entry.dzpp === null ? '—' : entry.dzpp.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {scores.length > 3 && <div className="border-t border-slate-800/60 px-5 py-3"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">Field</p></div>}

      {/* Header row */}
      {/* RESPONSIVE, and the breakpoints are chosen so nothing is ever lost. Rank, player and
          DZPP are always here. The qualified badge joins at sm, and score, accuracy, misses and
          mods at lg — below which every one of them appears in the sub-line under the username
          instead, so a narrow screen shows the same facts in a taller row rather than fewer
          facts in a clipped one. */}
      {scores.length > 3 && <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 bg-slate-900/30 border-b border-slate-800/40">
        <span className="w-6 text-[10px] text-slate-600 font-mono">#</span>
        <span className="w-8 flex-shrink-0" />
        <span className="flex-1 text-[10px] text-slate-600 uppercase tracking-wider">Player</span>
        <span
          className="w-16 sm:w-20 text-[10px] text-amber-400 uppercase tracking-wider text-right"
          title="Provisional DZPP — placement and the field factor both move while the challenge is open"
        >
          DZPP
        </span>
        <span className="hidden lg:block w-24 text-[10px] text-slate-600 uppercase tracking-wider text-right">Score</span>
        <span className="hidden lg:block w-14 text-[10px] text-slate-600 uppercase tracking-wider text-right">Acc</span>
        <span className="hidden lg:block w-14 text-[10px] text-slate-600 uppercase tracking-wider text-right">Miss</span>
        <span className="hidden lg:block w-10 text-[10px] text-slate-600 uppercase tracking-wider text-center">Mod</span>
        <span className="hidden sm:block w-28 text-[10px] text-slate-600 uppercase tracking-wider text-center">Status</span>
      </div>}

      {scores.length > 3 && <div className="divide-y divide-slate-800/40">
        {scores.slice(3).map((entry) => {
          const isMe = myUserId !== null && entry.userId === myUserId;
          return (
          <div
            key={entry.userId}
            className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 transition-colors ${
              isMe
                ? 'bg-amber-400/5 border-l-2 border-l-amber-400'
                : entry.qualified
                ? 'hover:bg-emerald-500/5'
                : 'hover:bg-slate-800/20'
            }`}
          >
            {/* Rank */}
            <span className="w-6 text-sm font-black font-mono text-slate-600 text-center flex-shrink-0">
              {entry.rank}
            </span>

{/* Avatar */}
<PlayerAvatar
  userId={entry.userId}
  username={entry.username}
  avatarUrl={entry.avatarUrl}
  size={40}
/>

            {/* Username, and below lg the columns that are hidden at that width. Same numbers,
                one line down — not a reduced row. */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold truncate ${isMe ? 'text-amber-400' : 'text-white'}`}>
                {entry.username}
                {isMe && <span className="text-amber-400/60 font-normal ml-1 text-xs">(you)</span>}
              </p>
              <p className="lg:hidden text-[10px] font-mono text-slate-500 truncate mt-0.5">
                {entry.score.toLocaleString()} · {entry.accuracy.toFixed(1)}% ·{' '}
                <span className={entry.misses === 0 ? 'text-emerald-400' : 'text-slate-500'}>
                  {entry.misses}×
                </span>{' '}
                · {entry.mods}
                <span className={`sm:hidden ${entry.qualified ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {' · '}{entry.qualified ? 'QUALIFIED' : 'NOT QUAL.'}
                </span>
              </p>
            </div>

            {/* Provisional DZPP. Computed by the server with the approved engine — the same
                scoreRound that freezes round_dzpp when the round ends — so this is the live
                view of one formula rather than a second one. Null when the read could not
                know the qualified field size. */}
            <span className="w-16 sm:w-20 text-right flex-shrink-0 tabular-nums">
              {entry.dzpp === null ? (
                <span className="text-xs font-mono text-slate-700">—</span>
              ) : (
                <span className={`text-sm font-black font-mono ${entry.qualified ? 'text-amber-400' : 'text-amber-400/50'}`}>
                  {entry.dzpp.toLocaleString()}
                </span>
              )}
            </span>

            {/* Score */}
            <span className="hidden lg:block w-24 text-sm font-black font-mono text-white text-right flex-shrink-0">
              {entry.score.toLocaleString()}
            </span>

            {/* Accuracy */}
            <span className="hidden lg:block w-14 text-xs font-mono text-slate-400 text-right flex-shrink-0">
              {entry.accuracy.toFixed(1)}%
            </span>

            {/* Misses */}
            <span className={`hidden lg:block w-14 text-xs font-mono text-right flex-shrink-0 ${entry.misses === 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
              {entry.misses}×
            </span>

            {/* Mods */}
            <div className="hidden lg:flex w-10 justify-center flex-shrink-0">
              <span className="text-[10px] font-mono font-bold bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                {entry.mods}
              </span>
            </div>

            {/* Qualification. Held from sm rather than lg: whether a play counts at all is the
                most important fact after DZPP, so it survives one breakpoint longer than the
                raw numbers do. */}
            <div className="hidden sm:flex w-28 justify-center flex-shrink-0">
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                entry.qualified
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {entry.qualified
                  ? <><CheckCircle2 className="w-3 h-3" /> QUALIFIED</>
                  : <><AlertCircle className="w-3 h-3" /> NOT QUALIFIED</>
                }
              </div>
            </div>
          </div>
          );
        })}
      </div>}

      {/* Said once, plainly: these numbers are not final. Placement moves as scores arrive and
          the field factor grows with the qualified field, so the column is a running estimate
          until the round ends and repo/dzpp.ts freezes it. */}
      <p className="px-5 py-3 border-t border-slate-800/40 text-[10px] text-slate-600 font-mono">
        DZPP is provisional while the challenge is open — placement and the field factor both
        move as scores arrive. It is frozen when the round ends.
      </p>
      </>
      )}
    </div>
  );
}

// ── SUBMISSION PHASE PANELS ──────────────────────────────────────────────────

