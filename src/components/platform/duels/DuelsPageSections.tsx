import { Swords, Trophy } from 'lucide-react';

import type { AuthUser } from '../NavHeader';

import type { ApiDuel } from '../../../api/client';

import { ArenaEmpty, LiveDuel } from './LiveDuel';

import type { CurrentDuelsSectionProps } from './duelTypes';

export { ArenaEmpty } from './LiveDuel';



export function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button onClick={onClick} className={'border-b-2 pb-3 text-xs font-black uppercase tracking-wider ' + (active ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-600 hover:text-slate-400')}>{label}</button>;
}

export function EmptyChallenges() {
  return <div className="border border-dashed border-slate-800 bg-[#0b1322]/60 px-6 py-12 text-center"><Trophy className="mx-auto h-5 w-5 text-slate-700" /><p className="mt-3 text-sm font-bold text-slate-500">No open challenges right now.</p><p className="mt-1 text-xs text-slate-700">Be the first player to put a duel on the board.</p></div>;
}

export function CurrentDuelsSection({ duels, selectedId, user, onSelect, onImport, onNavigateToPlayer, onReplayShared }: CurrentDuelsSectionProps) {
  const selected = selectedId === null ? null : duels.find((duel) => duel.id === selectedId) ?? null;

  if (!duels.length) {
    return <div className="border border-dashed border-slate-800 bg-[#0b1322]/60 px-6 py-12 text-center"><Swords className="mx-auto h-5 w-5 text-slate-700" /><p className="mt-3 text-sm font-bold text-slate-500">No current duels.</p><p className="mt-1 text-xs text-slate-700">Live matches will appear here while they are in progress.</p></div>;
  }

  if (selected) {
    return <div>
      <button type="button" onClick={() => onSelect(null)} className="mb-4 text-[9px] font-black uppercase tracking-wider text-slate-600 hover:text-white">← Current duels</button>
      <LiveDuel duel={selected} user={user} onSelect={() => onSelect(null)} onImport={() => onImport(selected.id)} onNavigateToPlayer={onNavigateToPlayer} onReplayShared={onReplayShared} />
    </div>;
  }

  return <div className="space-y-2">{duels.map((duel) => <button key={duel.id} type="button" onClick={() => onSelect(duel.id)} className="group flex w-full items-center gap-4 rounded-xl border border-slate-800 bg-[#0b1322] p-3 text-left transition hover:border-amber-400/30 hover:bg-[#0d1729]">
    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-950">{(duel.coverUrl || duel.beatmapsetId) && <img src={duel.coverUrl || `https://assets.ppy.sh/beatmaps/${duel.beatmapsetId}/covers/cover.jpg`} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-45" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}<div className="absolute inset-0 bg-gradient-to-r from-[#0b1322]/70 to-transparent" /><span className="absolute left-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /></div>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[8px] font-mono font-black uppercase tracking-widest text-rose-300">Live now</span><span className="text-[8px] font-mono text-slate-700">#{duel.id}</span></div><p className="mt-1 truncate text-sm font-black text-white group-hover:text-amber-100">{duel.title}</p><p className="truncate text-[10px] text-slate-600">{duel.challenger} vs {duel.opponent ?? 'Opponent'} · {duel.mods}</p></div>
    <div className="hidden shrink-0 text-right sm:block"><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">Pot</p><p className="mt-1 text-xs font-black text-amber-300">{(duel.stake * 2).toLocaleString()} DZPP</p></div>
    <span className="shrink-0 border border-slate-700 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 transition group-hover:border-amber-400/40 group-hover:text-amber-300">View duel</span>
  </button>)}</div>;
}
