import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiResultCorrection, ApiSubmission, ApiVoteAudit } from '../../api/client';
import { CurrentRound, formatDeadline, roundLabel } from '../../lib/round';
import { PlayerAvatar } from './PlayerAvatar';
import { Banner, Section } from './AdminDashboardPrimitives';
import { AlertCircle, AlertTriangle, CheckCircle2, Circle, Eye, Scale, SkipForward, Trophy } from 'lucide-react';

function WinnerEntry({ id, entry }: { id: number; entry: ApiSubmission | null }) {
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      {entry?.coverUrl && (
        <img
          src={entry.coverUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="w-20 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-900"
        />
      )}
      <div className="min-w-0 text-left">
        <p className="text-sm font-bold text-white truncate">
          {entry ? entry.title : `Submission #${id}`}
        </p>
        <p className="text-xs text-slate-400 truncate">
          {entry
            ? `${entry.artist} · [${entry.difficultyName}] · submitted by ${entry.submittedByName}`
            : 'No longer listed in this round — approve with care.'}
        </p>
      </div>
    </div>
  );
}

export function WinnerPanel({
  round,
  onRoundChange,
}: {
  round: CurrentRound;
  onRoundChange: () => void | Promise<void>;
}) {
  const tiebreak = round.winnerStatus === 'tiebreak';
  const [entries, setEntries] = useState<ApiSubmission[]>([]);
  const [tied, setTied] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The round carries ids; the titles come from the admin submission list, which is
  // the one read that returns every entry of the round rather than only approved ones.
useEffect(() => {
  let live = true;

  void (async () => {
    const [rows, ids] = await Promise.all([
      api.admin.submissions(),
      tiebreak
        ? api.admin.tiebreakEntries()
        : Promise.resolve({ ok: true as const, data: [] as number[] }),
    ]);

    if (!live) return;

    if (!rows.ok) {
      setLoadError(rows.error);
      setLoaded(true);
      return;
    }

    if (!ids.ok) {
      setLoadError(ids.error);
      setLoaded(true);
      return;
    }

    setLoadError(null);
    setEntries(rows.data);
    setTied(ids.data);
    setLoaded(true);
  })();

  return () => {
    live = false;
  };
}, [round.id, tiebreak]);

  const entryFor = (id: number) => entries.find((e) => e.id === id) ?? null;

  const approve = async () => {
    setBusy(true);
    setError(null);
    const result = await api.admin.approveWinner(tiebreak ? (choice ?? undefined) : undefined);
    if (!result.ok) {
      setError(result.status === 0 ? result.error : `${result.error} (HTTP ${result.status})`);
      setBusy(false);
      return;
    }
    // Approving moves the round to the challenge phase, which unmounts this panel, so
    // only the failure path puts the button back.
    await onRoundChange();
  };

  const permanence = (
    <p className="text-[11px] text-slate-600">
      Approving records the winner permanently and starts the challenge phase. It cannot be
      undone from here.
    </p>
  );

  if (tiebreak) {
    return (
      <Section
        title="Voting ended in a tie"
        description={`Level on ${round.winnerVoteCount ?? 0} votes${
          round.totalVotes === null ? '' : ` of ${round.totalVotes} cast`
        }. A tie is not resolved automatically — pick the winner.`}
      >
        {error && <Banner tone="error" text={error} onDismiss={() => setError(null)} />}

{loadError && (
  <Banner
    tone="error"
    text={`Could not load the winner data: ${loadError}`}
    onDismiss={() => setLoadError(null)}
  />
)}

        {!loaded ? (
          <p className="text-sm text-slate-500">Loading the tied entries…</p>
        ) : tied.length === 0 ? (
          <p className="text-sm text-rose-400">
            This round is marked tied but no candidates came back. Reload — if that does not fix
            it, the round_tiebreak_entries rows are missing and the winner cannot be chosen here.
          </p>
        ) : (
          <div className="space-y-2">
            {tied.map((id) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => setChoice(id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all disabled:opacity-50 ${
                  choice === id
                    ? 'bg-amber-400/10 border-amber-400/40'
                    : 'bg-slate-900/40 border-slate-800/70 hover:border-slate-700'
                }`}
              >
                {choice === id
                  ? <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  : <Circle className="w-4 h-4 text-slate-600 flex-shrink-0" />}
                <WinnerEntry id={id} entry={entryFor(id)} />
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={busy || choice === null}
          onClick={() => { void approve(); }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm bg-purple-500 hover:bg-purple-400 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Scale className="w-4 h-4" />
          {busy ? 'Approving…' : choice === null ? 'Select the winning entry' : 'Approve Winner & Start Challenge'}
        </button>
        {permanence}
      </Section>
    );
  }

  const winner = round.winningSubmissionId;

  return (
    <Section
      title="Winner pending approval"
      description="The ballot is closed and the totals are frozen. The winner is not official, and the challenge does not start, until you approve it."
    >
      {error && <Banner tone="error" text={error} onDismiss={() => setError(null)} />}

      {loadError && (
        <Banner
          tone="error"
          text={`Could not load the winner data: ${loadError}`}
          onDismiss={() => setLoadError(null)}
        />
      )}

      {winner === null ? (
        <p className="text-sm text-rose-400">
          Voting is closed but no winning entry is recorded. This should not happen — a closed
          round is either pending with one entry or tied with several.
        </p>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-slate-900/40 border border-slate-800/70 rounded-xl">
          <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <WinnerEntry id={winner} entry={loaded ? entryFor(winner) : null} />
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-black font-mono text-amber-400">{round.winnerVoteCount ?? 0}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-600 font-mono">
              of {round.totalVotes ?? 0} cast
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={busy || winner === null}
        onClick={() => { void approve(); }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm bg-purple-500 hover:bg-purple-400 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Trophy className="w-4 h-4" />
        {busy ? 'Approving…' : 'Approve Winner & Start Challenge'}
      </button>
      {permanence}
    </Section>
  );
}

// ── BALLOT MODERATION ─────────────────────────────────────────────────────────
//
// Who voted for what. The only place in the app where a voter and their choice appear
// together: ballot secrecy is a rule for everyone else, and no public endpoint carries
// voter identity. This exists for investigating a dispute.
//
// Collapsed by default on purpose. An administrator opening Round Control to advance a
// phase has no business reading the ballot, and making it a deliberate click keeps that
// distinction visible.

export function BallotModeration({ round }: { round: CurrentRound }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ApiVoteAudit[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void (async () => {
      const list = await api.admin.votes();
      if (!live) return;
     if (!list.ok) {
  setRows(null);
  setFailed(true);
  return;
}
      setRows(list.data);
      setFailed(false);
    })();
    return () => { live = false; };
  }, [open, round.id]);

  return (
    <Section
      title="Ballot"
      description="Who voted for what, for moderation only. Players never see this — the public surfaces show totals and nothing else."
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-bold transition-all"
      >
        <Eye className="w-3.5 h-3.5" />
        {open ? 'Hide the ballot' : 'Show who voted for what'}
      </button>

      {open && (
        rows === null ? (
          <p className="text-sm text-slate-500">Loading the ballot…</p>
        ) : failed ? (
          <p className="text-sm text-rose-400">Could not read the ballot. Reload to try again.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No votes have been cast in this round.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-600">
              {rows.length} {rows.length === 1 ? 'vote' : 'votes'}, newest first.
            </p>
            {rows.map((row) => (
              <div
                key={row.voteId}
                className="flex items-center gap-3 px-3 py-2 bg-slate-900/40 border border-slate-800/70 rounded-xl"
              >
  <PlayerAvatar
  userId={row.userId}
  username={row.username}
  avatarUrl={row.avatarUrl}
  size={28}
/>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">
                    {row.username}
                    <span className="text-slate-600 font-mono font-normal ml-1.5">
                      {row.country} · {row.osuId}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    voted for {row.submissionArtist} - {row.submissionTitle} [{row.difficultyName}]
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] font-mono text-slate-600">
                    {new Date(row.castAt).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                  {/* B9. A vote that moved is the case this view exists to investigate, so it
                      is marked rather than left for someone to notice by comparing columns. */}
                  {row.movedAt !== row.castAt && (
                    <p className="text-[10px] font-mono text-amber-400/80">
                      moved{' '}
                      {new Date(row.movedAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </Section>
  );
}

// ── ROUND CONTROL ─────────────────────────────────────────────────────────────

/**
 * Correcting a recorded result (D4).
 *
 * Deliberately the least convenient control on this page: collapsed by default, needs a
 * submission chosen from the round's own entries, and needs a written reason. A validly cast
 * vote is permanent and neither a later block nor a later rejection touches it, so this is the
 * one escape hatch — and an escape hatch that is as easy to reach as the ordinary path stops
 * being an exception.
 */
export function CorrectionPanel({
  round,
  onRoundChange,
}: {
  round: CurrentRound;
  onRoundChange: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ApiSubmission[] | null>(null);
  const [history, setHistory] = useState<ApiResultCorrection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
  const [rows, corrections] = await Promise.all([
    api.admin.submissions(round.id),
    api.admin.corrections(round.id),
  ]);

  if (!rows.ok) {
    setLoadError(rows.error);
    return;
  }

  if (!corrections.ok) {
    setLoadError(corrections.error);
    return;
  }

  setLoadError(null);
  setEntries(rows.data);
  setHistory(corrections.data);
}, [round.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const submit = async () => {
    if (choice === null) {
      setError('Choose the entry that should be recorded as the winner.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Write at least a sentence saying why. It is stored with the correction.');
      return;
    }
    setBusy(true);
    const res = await api.admin.correctWinner(choice, reason.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setReason('');
    setChoice(null);
    await load();
    await onRoundChange();
  };

  return (
    <Section
      title="Correct the Recorded Result"
      description="The only way a recorded winner changes. Votes are never rewritten — this records an override, with a reason, over the top of them."
    >
      {history.length > 0 && (
        <div className="space-y-2">
          {history.map((c) => (
            <div key={c.id} className="bg-slate-900/40 border border-amber-500/20 rounded-xl px-4 py-2.5">
              <p className="text-xs text-white">
                {c.previousTitle ?? `#${c.previousSubmissionId}`} → {c.newTitle ?? `#${c.newSubmissionId}`}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{c.reason}</p>
              <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                {c.correctedByName ?? 'an administrator'} · {formatDeadline(c.correctedAt)} · was{' '}
                {c.previousWinnerStatus}
              </p>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-bold text-slate-500 hover:text-amber-400 transition-colors"
        >
          Correct the result…
        </button>
      ) : (
        <div className="space-y-3">
          {error && (
            <div className="flex items-start gap-2.5 bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" />
              <p className="text-xs text-rose-300/90">{error}</p>
            </div>
          )}

{loadError && (
  <Banner
    tone="error"
    text={`Could not load the correction data: ${loadError}`}
    onDismiss={() => setLoadError(null)}
  />
)}
          {entries === null ? (
            <p className="text-xs text-slate-500">Loading this round's entries…</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-slate-500">This round has no entries to choose between.</p>
          ) : (
            <div className="space-y-1.5">
              {entries.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setChoice(s.id)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-left transition-all ${
                    choice === s.id
                      ? 'bg-amber-400/10 border-amber-400/40'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white truncate">
                      {s.artist} - {s.title} [{s.difficultyName}]
                    </span>
                    <span className="block text-[10px] text-slate-600 font-mono">
                      #{s.id} · {s.submittedByName} · {s.voteCount} vote{s.voteCount === 1 ? '' : 's'}
                      {round.winningSubmissionId === s.id && ' · recorded winner'}
                    </span>
                  </span>
                  {choice === s.id && <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being corrected? Stored with the change and shown above."
            rows={2}
            className="w-full bg-slate-900/60 border border-slate-700 focus:border-amber-400/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors resize-none"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-xs font-black rounded-xl transition-all"
            >
              {busy ? 'Recording…' : 'Record the correction'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-slate-600">
            The announcement goes out again, saying the result was corrected and why — the
            community was already told the previous answer.
          </p>
        </div>
      )}
    </Section>
  );
}

// ── THE EMPTY BALLOT ─────────────────────────────────────────────────────────
//
// A round can reach voting with nothing approved: nobody entered, or everything entered was
// rejected. The server refuses to count that ballot and the clock stops on it, so the round
// used to sit in voting with a "Close Voting & Count the Ballot" button that could only
// answer 409 and a countdown that changed nothing when it expired.
//
// This panel says what is actually wrong and offers the one move that is honest. RoundControl
// renders it INSTEAD OF the close-ballot button, and only when nothing is approved, so the
// normal close/approve/tiebreak flow is untouched — one approved entry and this never appears.
//
// It distinguishes the two ways to get here, because they call for different actions: with
// entries awaiting review the fix is usually to review them, and skipping would throw away
// somebody's submission. Skipping is still offered, since an administrator may have rejected
// them all deliberately.

/** What the voting phase has to work with. Counted once by RoundControl and shared. */
export interface BallotCounts {
  approved: number;
  pending: number;
  rejected: number;
  total: number;
}

export const countBallot = (rows: ApiSubmission[]): BallotCounts => ({
  approved: rows.filter((r) => r.reviewStatus === 'approved').length,
  pending: rows.filter((r) => r.reviewStatus === 'pending').length,
  rejected: rows.filter((r) => r.reviewStatus === 'rejected').length,
  total: rows.length,
});

export function EmptyBallotPanel({
  round,
  counts,
  onRoundChange,
  onSkipped,
}: {
  round: CurrentRound;
  counts: BallotCounts;
  onRoundChange: () => void | Promise<void>;
  /** Reported upwards because a successful skip UNMOUNTS this panel with the round. */
  onSkipped: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { pending, rejected, total } = counts;

  const skip = async () => {
    setBusy(true);
    setError(null);
    const res = await api.admin.skipVoting();
    if (!res.ok) {
      // Includes the server's own refusal if an entry was approved in the meantime, which
      // is the answer an administrator needs rather than a generic failure.
      setError(res.error);
      setBusy(false);
      setConfirming(false);
      return;
    }
    // No state reset on success: the round is ended, so findCurrent returns null and this
    // panel unmounts with it. Only the failure path above puts the button back.
    onSkipped(
      `${roundLabel(round)} is closed with no winner. Open the next round below when you are ready.`
    );
    await onRoundChange();
  };

  return (
    <Section
      title="No Ballot to Count"
      description="This round reached the voting phase with nothing approved, so there is no winner it can produce."
    >
      {error && <Banner tone="error" text={error} onDismiss={() => setError(null)} />}

      <div className="flex items-start gap-2.5 bg-amber-400/8 border border-amber-400/25 rounded-xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-px" />
        <div className="space-y-1.5">
          <p className="text-xs text-amber-300/90 leading-relaxed">
            <span className="font-bold">No approved submissions.</span>{' '}
            {total === 0
              ? 'Nobody entered this round.'
              : `${total} ${total === 1 ? 'entry was' : 'entries were'} submitted` +
                `${pending > 0 ? `, ${pending} still awaiting review` : ''}` +
                `${rejected > 0 ? `, ${rejected} rejected` : ''}.`}
          </p>
          <p className="text-[11px] text-amber-300/60 leading-relaxed">
            Counting the ballot is refused while nothing is approved, and the voting deadline
            will not change that when it passes — a round with no entries has no winner to
            record, and one will never be invented for it.
          </p>
        </div>
      </div>

      {pending > 0 && (
        <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3">
          <Eye className="w-4 h-4 text-blue-400 flex-shrink-0 mt-px" />
          <p className="text-xs text-blue-300/90 leading-relaxed">
            {pending === 1 ? 'One entry is' : `${pending} entries are`} still awaiting review on
            the Submissions tab. Approving {pending === 1 ? 'it' : 'one'} gives this round a
            real ballot and the normal close-and-approve flow back. Skip only if you meant to
            reject {pending === 1 ? 'it' : 'them'}.
          </p>
        </div>
      )}

      {confirming ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 space-y-3">
          <p className="text-xs text-slate-300 font-bold">
            End {roundLabel(round)} with no winner?
          </p>
          <ul className="text-[11px] text-slate-400 leading-relaxed space-y-1 list-disc list-inside">
            <li>The round is archived immediately. No winner is recorded, and no challenge starts.</li>
            <li>It becomes visible to everyone as an ended round, with no winning beatmap.</li>
            <li>
              A round cannot be reopened — the next month is a new round, which you open from
              this tab.
            </li>
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => { void skip(); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-black bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <SkipForward className="w-3.5 h-3.5" />
              {busy ? 'Closing…' : 'Confirm — close with no winner'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="px-3 py-2 rounded-lg text-[11px] font-bold text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm bg-slate-800 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 transition-all"
        >
          <SkipForward className="w-4 h-4" />
          Skip Voting &amp; Close Round
        </button>
      )}
    </Section>
  );
}


