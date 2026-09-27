import React, { useEffect, useState } from 'react';
import { api, ApiDzppRecompute, ApiDzppRecomputeSummary, ApiRoundDetail } from '../../../api/client';
import { formatDeadline } from '../../../lib/round';
import { Banner, Section } from './AdminDashboardPrimitives';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function DzppRecomputePanel() {
  const [open, setOpen] = useState(false);
  const [rounds, setRounds] = useState<ApiRoundDetail[] | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [history, setHistory] = useState<ApiDzppRecompute[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [summary, setSummary] = useState<ApiDzppRecomputeSummary | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
const list = await api.rounds.list();

if (!list.ok) {
  setError(`Could not read the round list: ${list.error}`);
  return;
}

setRounds(list.data.filter((r) => r.phase === 'ended'));
    })();
  }, [open]);

  // The history belongs to the selected round, so it is re-read when the choice moves rather
  // than accumulated across rounds.
  useEffect(() => {
    if (choice === null) {
      setHistory(null);
      setHistoryFailed(false);
      return;
    }
    let live = true;
    setHistory(null);
    setHistoryFailed(false);
    void (async () => {
const rows = await api.admin.dzppRecomputes(choice);

if (!live) return;

if (!rows.ok) {
  setHistory(null);
  setHistoryFailed(true);
  return;
}

setHistory(rows.data);
setHistoryFailed(false);
    })();
    return () => { live = false; };
  }, [choice]);

  const submit = async () => {
    if (choice === null) {
      setError('Choose the ended round to rescore.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Write at least a sentence saying why. It is stored with the recompute.');
      return;
    }
    setBusy(true);
    const res = await api.admin.recomputeDzpp(choice, reason.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setReason('');
    setSummary(res.data.summary);
const rows = await api.admin.dzppRecomputes(choice);

if (rows.ok) {
  setHistory(rows.data);
  setHistoryFailed(false);
} else {
  setHistory(null);
  setHistoryFailed(true);
}
  };

  const selected = rounds?.find((r) => r.id === choice) ?? null;

  return (
    <Section
      title="Recompute a Round's DZPP"
      description="One ended round at a time. Rescores the plays as stored, through the same engine that froze them — so it reflects a changed constant or a fixed bug, never a changed play. Every recompute is recorded with its reason."
    >
      {summary && (
        <div className="bg-emerald-500/8 border border-emerald-500/25 rounded-xl px-4 py-3">
          <p className="text-xs text-emerald-300/90">
            Round {selected?.roundNumber ?? summary.roundId} rescored:{' '}
            <span className="font-mono font-bold">{summary.previousTotal}</span> DZPP over{' '}
            {summary.previousRows} row{summary.previousRows === 1 ? '' : 's'} →{' '}
            <span className="font-mono font-bold">{summary.newTotal}</span> DZPP over{' '}
            {summary.newRows} row{summary.newRows === 1 ? '' : 's'}
            {summary.firstTime && ' · this round had never been scored'}
          </p>
        </div>
      )}

      {choice !== null && history === null && !historyFailed && (
        <p className="text-xs text-slate-500">Reading this round's recompute history…</p>
      )}

      {historyFailed && (
        <div className="flex items-start gap-2.5 bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" />
          <p className="text-xs text-rose-300/90">
            Could not read this round's recompute history. The rescore button still works — this
            is the record, not the action.
          </p>
        </div>
      )}

      {history !== null && history.length === 0 && (
        <p className="text-xs text-slate-500">
          This round has never been recomputed. Nothing has moved since it was frozen.
        </p>
      )}

      {history !== null && history.length > 0 && (
        <div className="space-y-2">
          {history.map((h) => (
            <div key={h.id} className="bg-slate-900/40 border border-amber-500/20 rounded-xl px-4 py-2.5">
              <p className="text-xs text-white font-mono">
                {h.previousTotal} → {h.newTotal} DZPP · {h.previousRows} → {h.newRows} row
                {h.newRows === 1 ? '' : 's'}
                {h.previousFormulaVersion === null
                  ? ' · first scoring'
                  : h.previousFormulaVersion !== h.newFormulaVersion
                    ? ` · formula v${h.previousFormulaVersion} → v${h.newFormulaVersion}`
                    : ` · formula v${h.newFormulaVersion}`}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{h.reason}</p>
              <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                {h.recomputedByName ?? 'an administrator'} · {formatDeadline(h.recomputedAt)}
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
          Recompute a round's DZPP…
        </button>
      ) : (
        <div className="space-y-3">
          {error && (
            <div className="flex items-start gap-2.5 bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" />
              <p className="text-xs text-rose-300/90">{error}</p>
            </div>
          )}

          {rounds === null ? (
            <p className="text-xs text-slate-500">Loading ended rounds…</p>
          ) : rounds.length === 0 ? (
            <p className="text-xs text-slate-500">
              No round has ended yet, so there is nothing frozen to rescore.
            </p>
          ) : (
            <div className="space-y-1.5">
              {rounds.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setChoice(r.id); setSummary(null); }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-left transition-all ${
                    choice === r.id
                      ? 'bg-amber-400/10 border-amber-400/40'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white truncate">
                      Round {r.roundNumber} · {r.month} {r.year}
                    </span>
                    <span className="block text-[10px] font-mono">
                      <span className="text-slate-600">
                        #{r.id} · {r.leaderboard.length} challenge score
                        {r.leaderboard.length === 1 ? '' : 's'} · {r.participants} participant
                        {r.participants === 1 ? '' : 's'} ·{' '}
                      </span>
                      {r.dzppFinalizedAt === null ? (
                        <span className={r.leaderboard.length > 0 ? 'text-amber-400' : 'text-slate-600'}>
                          never scored
                          {r.leaderboard.length > 0 && ' — has scores, so a rescore would add DZPP'}
                        </span>
                      ) : (
                        <span className="text-emerald-400/80">
                          frozen {formatDeadline(r.dzppFinalizedAt)}
                        </span>
                      )}
                    </span>
                  </span>
                  {choice === r.id && <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this round being rescored? Stored with the change and shown above."
            rows={2}
            className="w-full bg-slate-900/60 border border-slate-700 focus:border-amber-400/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors resize-none"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || choice === null || reason.trim().length < 10}
              className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-black rounded-xl transition-all"
            >
              {busy
                ? 'Rescoring…'
                : choice === null
                  ? 'Choose a round'
                  : reason.trim().length < 10
                    ? 'Add a reason'
                    : 'Recompute this round'}
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
            Only the round you chose is touched — the rewrite and its audit row land in one
            transaction, so no other month can move and the change cannot happen unrecorded.
          </p>
        </div>
      )}
    </Section>
  );
}
