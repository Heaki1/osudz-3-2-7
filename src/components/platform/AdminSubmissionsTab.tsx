import React, { useCallback, useEffect, useState } from 'react';
import type { ApiSubmission } from '../../api/client';
import { api } from '../../api/client';
import { beatmapUrl } from '../../lib/submission';
import { CurrentRound, roundLabel } from '../../lib/round';
import { Link as LinkIcon } from 'lucide-react';

export interface AdminSubmissionsTabProps {
  round: CurrentRound | null;
  onReviewed: () => void | Promise<void>;
}

export function AdminSubmissionsTab({ round, onReviewed }: AdminSubmissionsTabProps) {
  const [rows, setRows] = useState<ApiSubmission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await api.admin.submissions();
    if (!list.ok) {
      setRows([]);
      setLoadFailed(true);
      setLoaded(true);
      return;
    }
    setRows(list.data);
    setLoadFailed(false);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load, round?.id]);

  const decide = async (id: number, status: 'approved' | 'rejected') => {
    setBusyId(id);
    setError(null);
    const result = await api.admin.reviewSubmission(id, status);
    if (result.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? result.data.submission : r)));
      await onReviewed();
    } else {
      setError(result.status === 0 ? result.error : `${result.error} (HTTP ${result.status})`);
    }
    setBusyId(null);
  };

  const pending = rows.filter((r) => r.reviewStatus === 'pending');
  const reviewTone: Record<ApiSubmission['reviewStatus'], string> = {
    pending: 'bg-amber-400/10 border-amber-400/25 text-amber-400',
    approved: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
    rejected: 'bg-rose-500/10 border-rose-500/25 text-rose-400',
  };

  const section = (title: string, description: string, children: React.ReactNode) => (
    <div className="bg-[#0d1526] border border-slate-800 rounded-2xl p-6 space-y-5">
      <div><h3 className="text-sm font-black text-white">{title}</h3><p className="text-xs text-slate-500 mt-0.5">{description}</p></div>
      {children}
    </div>
  );

  if (!round) return section('Submissions', 'Review queue for the open round.', <p className="text-sm text-slate-500">No round is open, so there is nothing to review.</p>);

  return (
    <div className="space-y-5">
      {error && <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3"><p className="text-xs text-rose-300">{error}</p></div>}
      {section('Review Queue', `${roundLabel(round)} — ${pending.length} awaiting review, ${rows.length} submitted in total.`,
        !loaded ? <p className="text-sm text-slate-500">Loading…</p> : loadFailed ? <p className="text-sm text-rose-400">Could not reach the API. Reload to try again.</p> : rows.length === 0 ? <p className="text-sm text-slate-500">Nothing has been submitted to this round yet.</p> : (
          <div className="space-y-3">
            {rows.map((s) => (
              <div key={s.id} className="flex items-start gap-4 p-3 bg-slate-900/40 border border-slate-800/70 rounded-xl">
                {s.coverUrl && <img src={s.coverUrl} alt="" referrerPolicy="no-referrer" className="w-24 h-14 rounded-lg object-cover flex-shrink-0 bg-slate-900" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-bold text-white truncate">{s.title}</p><span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${reviewTone[s.reviewStatus]}`}>{s.reviewStatus}</span></div>
                  <p className="text-xs text-slate-400 truncate">{s.artist} · [{s.difficultyName}] · mapped by {s.mapper}</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-1">★ {s.stars.toFixed(2)} · {s.bpm} BPM · {s.length} · {s.mapStatus}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">{s.modRequirement}</span>
                    <span className="text-[10px] font-bold bg-amber-400/10 border border-amber-400/25 px-1.5 py-0.5 rounded text-amber-400">{s.challengeRequirement}</span>
                    <span className="text-[10px] text-slate-600">by {s.submittedByName}</span>
                    <a href={beatmapUrl(s)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-amber-400 transition-colors"><LinkIcon className="w-3 h-3" />osu!</a>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button type="button" disabled={busyId === s.id || s.reviewStatus === 'approved'} onClick={() => { void decide(s.id, 'approved'); }} className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Approve</button>
                  <button type="button" disabled={busyId === s.id || s.reviewStatus === 'rejected'} onClick={() => { void decide(s.id, 'rejected'); }} className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
