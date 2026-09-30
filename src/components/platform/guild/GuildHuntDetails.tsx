import React, { useState } from 'react';
import { Flag, History, MoreVertical, Trophy, X } from 'lucide-react';
import { api } from '../../../api/client';
import type { ApiHunt, ApiHuntAttempt } from '../../../api/beatmapHunts';
import { formatCountdown } from '../../../lib/round';

function Requirements({ requirements }: { requirements: Record<string, unknown> }) {
  const parts = [
    requirements.fullCombo ? 'Full Combo' : null,
    typeof requirements.minAccuracy === 'number' ? requirements.minAccuracy.toFixed(2) + '% minimum' : null,
    typeof requirements.maxMisses === 'number' ? requirements.maxMisses + ' misses maximum' : null,
    typeof requirements.minCombo === 'number' ? requirements.minCombo + 'x combo minimum' : null,
    typeof requirements.minScore === 'number' ? requirements.minScore.toLocaleString() + ' score minimum' : null,
    typeof requirements.minPp === 'number' ? requirements.minPp + 'pp minimum' : null,
    Array.isArray(requirements.requiredMods) && requirements.requiredMods.length ? requirements.requiredMods.join('') + (requirements.exactMods ? ' exact' : ' required') : null,
  ].filter(Boolean) as string[];
  return <div className="flex flex-wrap gap-1.5">{parts.length ? parts.map((part) => <span key={part} className="rounded-full border border-[#6e4a2d]/30 bg-[#b99c77]/25 px-2 py-1 text-[9px] font-black">{part}</span>) : <span className="text-xs text-[#3b2b1a]/60">No additional requirements.</span>}</div>;
}

export function GuildHuntDetails({
  hunt,
  leaderboard,
  history,
  isOwner,
  onClose,
  onRefresh,
}: {
  hunt: ApiHunt;
  leaderboard: ApiHuntAttempt[];
  history: ApiHuntAttempt[];
  isOwner: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  const action = async (run: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const result = await run();
    setBusy(false);
    setNotice(result.ok ? 'Guild record updated.' : result.error ?? 'Action failed.');
    if (result.ok) { setScore(''); await onRefresh(); }
  };

  return (
    <div className="guild-modal-overlay fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="guild-modal-shell">
        <div className="guild-modal-paper p-5 sm:p-7">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full border border-[#3b2b1a]/20 p-2 hover:bg-black/5"><X className="h-4 w-4" /></button>
          <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
            <div>
              <div className="font-serif text-3xl font-black tracking-[.15em]">QUEST</div>
              <div className="mt-1 text-[9px] font-black tracking-[.25em]">{hunt.huntType.replace(/_/g, ' ')}</div>
              <div className="mt-4 overflow-hidden border-2 border-[#3b2b1a]/35">
                {hunt.beatmap.coverUrl && <img src={hunt.beatmap.coverUrl} alt="" className="aspect-[16/8] w-full object-cover sepia-[.2]" />}
              </div>
              <h1 className="mt-3 font-serif text-2xl font-black leading-tight">{hunt.beatmap.title}</h1>
              <div className="flex items-center justify-between border-t border-[#3b2b1a]/20 pt-1 text-xs font-bold"><span>{hunt.beatmap.difficultyName}</span><span>★ {hunt.beatmap.stars.toFixed(2)}</span></div>
              <div className="mt-3 text-center"><div className="text-[8px] font-black uppercase tracking-[.25em]">Bounty</div><div className="font-serif text-4xl font-black">{hunt.bountyDzp.toLocaleString()} <span className="text-sm">DZP</span></div></div>
              <div className="mt-3 border-y border-[#3b2b1a]/20 py-3"><div className="mb-2 text-[8px] font-black uppercase tracking-[.22em]">Guild Conditions</div><Requirements requirements={hunt.requirements} /></div>
              {hunt.targetScore && <div className="mt-3 border-2 border-[#6e4a2d]/30 bg-[#b99c77]/25 p-3"><div className="text-[8px] font-black uppercase tracking-[.2em]">Target Score</div><div className="mt-1 font-serif text-2xl font-black">{hunt.targetScore.score.toLocaleString()}</div><div className="text-[10px] font-bold">{hunt.targetScore.username} · {hunt.targetScore.mods || 'NM'} · {hunt.targetScore.accuracy.toFixed(2)}%</div></div>}
              <div className="mt-4 text-xs leading-relaxed">{hunt.description || 'No additional poster notes.'}</div>
              <div className="mt-5 flex items-center justify-between border-t border-[#3b2b1a]/20 pt-3 text-[10px]"><span>Posted by <b>{hunt.poster.username}</b></span><span>{hunt.status === 'CLAIMED' ? 'Claimed by ' + (hunt.winner?.username ?? 'unknown') : formatCountdown(hunt.expiresAt)}</span></div>
              {isOwner && hunt.status === 'ACTIVE' && <button disabled={busy} onClick={() => void action(() => api.beatmapHunts.cancel(hunt.id))} className="mt-4 w-full border border-red-900/30 bg-red-900/5 py-2 text-[10px] font-black uppercase tracking-wider text-red-900 disabled:opacity-40">Cancel Hunt & Return Escrow</button>}
              {hunt.status === 'PENDING_UPGRADE' && isOwner && <div className="mt-4 border border-amber-900/20 bg-amber-900/5 p-3"><div className="text-[9px] font-black uppercase tracking-wider">Guild upgrade required</div><div className="mt-1 font-serif text-2xl font-black">{hunt.upgradeRequiredDzp.toLocaleString()} DZP</div><div className="mt-2 flex gap-2"><button disabled={busy} onClick={() => void action(() => api.beatmapHunts.payUpgrade(hunt.id))} className="flex-1 bg-[#3b2b1a] py-2 text-[9px] font-black text-[#f0dfbf]">PAY</button><button disabled={busy} onClick={() => void action(() => api.beatmapHunts.takeUpgradeLoan(hunt.id))} className="flex-1 border border-[#3b2b1a]/30 py-2 text-[9px] font-black">REQUEST LOAN</button></div></div>}
            </div>

            <div>
              <div className="flex items-center justify-between border-b border-[#3b2b1a]/20 pb-3"><div><div className="font-serif text-xl font-black">Hunters Ledger</div><div className="text-[9px] font-black uppercase tracking-[.2em] opacity-55">Best verified attempt per hunter</div></div><Trophy className="h-5 w-5 opacity-60" /></div>
              {hunt.status === 'ACTIVE' && <div className="mt-4 border border-[#6e4a2d]/30 bg-[#b99c77]/20 p-3"><div className="mb-2 text-[8px] font-black uppercase tracking-[.2em]">Import your score</div><div className="flex gap-2"><input value={score} onChange={(e) => setScore(e.target.value)} placeholder="osu! score URL or ID" className="min-w-0 flex-1 border border-[#6e4a2d]/30 bg-[#f1e2c7]/80 px-3 py-2 text-xs outline-none" /><button disabled={busy || !score.trim()} onClick={() => void action(() => api.beatmapHunts.importScore(hunt.id, score))} className="bg-[#3b2b1a] px-4 py-2 text-[10px] font-black text-[#f1e2c7] disabled:opacity-40">IMPORT</button></div>{notice && <div className="mt-2 text-[10px] font-bold">{notice}</div>}</div>}
              <div className="mt-4 overflow-hidden border border-[#6e4a2d]/25">
                {leaderboard.length === 0 ? <div className="p-8 text-center text-xs opacity-60">No hunters have entered this poster yet.</div> : leaderboard.map((entry, index) => (
                  <div key={entry.id} className="relative grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-[#6e4a2d]/15 p-3 last:border-b-0">
                    <div className="font-serif text-lg font-black opacity-60">#{index + 1}</div>
                    <div className="min-w-0"><div className="truncate text-xs font-black">{entry.username}</div><div className="mt-1 flex flex-wrap gap-2 text-[9px] font-bold opacity-65"><span>{entry.score.toLocaleString()}</span><span>{entry.accuracy.toFixed(2)}%</span><span>{entry.misses} miss</span><span>{entry.mods || 'NM'}</span></div></div>
                    <div className="relative"><span className={'mr-1 rounded-full px-2 py-1 text-[8px] font-black ' + (entry.qualifies ? 'bg-emerald-900/10 text-emerald-900' : 'bg-red-900/10 text-red-900')}>{entry.qualifies ? 'QUALIFIED' : 'FAILED'}</span><button onClick={() => setMenuId(menuId === entry.id ? null : entry.id)} className="rounded p-1 hover:bg-black/5"><MoreVertical className="h-4 w-4" /></button>
                      {menuId === entry.id && <div className="absolute right-0 top-8 z-20 w-40 border border-[#6e4a2d]/30 bg-[#ead7b8] p-1 shadow-xl"><button onClick={async () => { const reason = window.prompt('Why are you reporting this hunter as a smurfer?'); if (reason) { const result = await api.beatmapHunts.reportAttempt(entry.id, reason); setNotice(result.ok ? 'Report sent to the Guild.' : result.error); } setMenuId(null); }} className="flex w-full items-center gap-2 px-2 py-2 text-left text-[9px] font-black hover:bg-black/5"><Flag className="h-3 w-3" /> Report as Smurfer</button></div>}
                    </div>
                  </div>
                ))}
              </div>
              {history.length > 0 && <div className="mt-4 border border-[#6e4a2d]/20"><button onClick={() => setHistoryOpen(!historyOpen)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider"><span className="flex items-center gap-2"><History className="h-3.5 w-3.5" /> My attempt history ({history.length})</span><span>{historyOpen ? '−' : '+'}</span></button>{historyOpen && <div className="border-t border-[#6e4a2d]/15">{history.map((entry) => <div key={entry.id} className="flex items-center justify-between border-b border-[#6e4a2d]/10 px-3 py-2 text-[9px] last:border-b-0"><span>{entry.score.toLocaleString()} · {entry.accuracy.toFixed(2)}% · {entry.mods || 'NM'} {entry.deleted_at ? '· deleted' : ''}</span>{!entry.deleted_at && <button onClick={() => void action(() => api.beatmapHunts.deleteAttempt(hunt.id, entry.id))} className="text-red-900/70">Delete</button>}</div>)}</div>}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
