import { Pause, Play } from 'lucide-react';
import type { ApiDuel } from '../../../api/client';
import { useAudioPreview } from '../../../lib/audioPreview';
import { fmt, mapTime, duelStarStyle } from './duelFormatters';
import type { DuelCardProps } from './duelTypes';

export function DuelCard({ duel, onSelect, onAccept, onNavigateToPlayer, balance }: DuelCardProps) {
  const { isPlaying, toggle: togglePlay } = useAudioPreview(String(duel.difficultyId), duel.previewUrl);

  return <article className="group overflow-hidden rounded-none border border-emerald-400/35 bg-[#0b1322] text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400/60 hover:bg-[#0d1729] hover:shadow-xl hover:shadow-emerald-950/20">
    <div className="relative h-40 overflow-hidden bg-slate-950">
      {(duel.coverUrl || duel.beatmapsetId) && <img src={duel.coverUrl || `https://assets.ppy.sh/beatmaps/${duel.beatmapsetId}/covers/cover.jpg`} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-35 transition duration-500 group-hover:scale-105 group-hover:opacity-50" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      {!duel.beatmapsetId && <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.12),transparent_45%)]" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b1322] via-[#0b1322]/45 to-transparent" />
      <div className="absolute left-4 top-3 flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-rose-300"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Open duel</div>
      <div className="absolute right-4 top-3 text-[9px] font-mono font-black uppercase tracking-wider text-slate-300">
        <span className="text-slate-500">Expires</span> {new Date(duel.endsAt).toLocaleDateString()} · {new Date(duel.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      {duel.previewUrl && <button
        type="button"
        onClick={(event) => { event.stopPropagation(); togglePlay(); }}
        aria-label={isPlaying ? `Pause ${duel.title} preview` : `Play ${duel.title} preview`}
        className={`absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-all ${isPlaying ? 'border-amber-300/80 bg-amber-400 text-slate-950 shadow-amber-950/40' : 'border-white/15 bg-slate-950/80 text-white hover:border-amber-400/50 hover:bg-slate-900'}`}
      >
        {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>}
      <div className="absolute bottom-4 left-4 right-4"><h3 className="line-clamp-1 text-lg font-black text-white">{duel.title}</h3><p className="mt-1 line-clamp-1 text-xs text-slate-300">{duel.artist} · {duel.difficulty}</p>{duel.mapper && <p className="mt-1 text-[9px] font-mono text-slate-500">mapped by {duel.mapper}</p>}</div>
    </div>
    <div className="p-4">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={() => onNavigateToPlayer(duel.challenger)} aria-label={`Open ${duel.challenger}'s profile`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/70 bg-amber-400/10 p-0.5 shadow-[0_0_10px_rgba(250,204,21,0.18)] transition hover:border-amber-300 hover:shadow-[0_0_14px_rgba(250,204,21,0.3)]">
            {duel.challengerAvatar ? <img src={duel.challengerAvatar} alt={duel.challenger} referrerPolicy="no-referrer" className="h-full w-full rounded-full bg-slate-900 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} /> : null}
            <span className={duel.challengerAvatar ? 'hidden h-full w-full items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-amber-300' : 'flex h-full w-full items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-amber-300'}>{duel.challenger.slice(0, 1).toUpperCase()}</span>
          </button>
          <button type="button" onClick={() => onNavigateToPlayer(duel.challenger)} className="min-w-0 truncate text-left" aria-label={`Open ${duel.challenger}'s profile`}><p className="text-[8px] font-mono font-black uppercase tracking-widest text-slate-600">Challenger</p><p className="truncate text-xs font-black text-white transition group-hover:text-amber-200">{duel.challenger}</p></button>
        </div>
        <span className={`shrink-0 text-[10px] font-black ${duelStarStyle(duel.stars).fill}`}>★ {duel.stars.toFixed(2)}</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-slate-800/70 py-3 text-[10px] font-mono">
        <span><b className="text-slate-500">BPM</b> <strong className="text-slate-200">{duel.bpm ? fmt(duel.bpm) : '—'}</strong></span>
        <span><b className="text-slate-500">LEN</b> <strong className="text-slate-200">{mapTime(duel.lengthSeconds)}</strong></span>
        <span><b className="text-slate-500">CS</b> <strong className="text-slate-200">{duel.cs == null ? '—' : duel.cs.toFixed(1)}</strong></span>
        <span><b className="text-slate-500">AR</b> <strong className="text-slate-200">{duel.ar == null ? '—' : duel.ar.toFixed(1)}</strong></span>
        <span><b className="text-slate-500">OD</b> <strong className="text-slate-200">{duel.od == null ? '—' : duel.od.toFixed(1)}</strong></span>
        <span><b className="text-slate-500">HP</b> <strong className="text-slate-200">{duel.hp == null ? '—' : duel.hp.toFixed(1)}</strong></span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-mono font-black uppercase tracking-widest text-slate-600">Win condition</p>
          <p className="mt-1 truncate text-xs font-black text-rose-300">{duel.requirement}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[8px] font-mono font-black uppercase tracking-widest text-slate-600">Mod requirements</p>
          <p className="mt-1 text-xs font-black text-emerald-300">{duel.mods}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">Stake <strong className="inline-flex items-center gap-0.5 text-[10px] font-mono font-black text-amber-300"><img src="/assets/dzpp-currency.png" alt="" className="h-[12px] w-[12px] object-contain" />{duel.stake.toLocaleString()}</strong></span>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">Pot <strong className="inline-flex items-center gap-0.5 text-amber-300"><img src="/assets/dzpp-currency.png" alt="" className="h-[12px] w-[12px] object-contain" />{(duel.stake * 2).toLocaleString()}</strong></span>
      </div>
      <div className="mt-3 flex items-center gap-2"><button type="button" onClick={onSelect} className="flex-1 border border-slate-700 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:border-slate-600 hover:text-white">View duel</button><button type="button" onClick={onAccept} disabled={balance < duel.stake} className="flex-[1.35] border border-amber-400/35 bg-amber-400/[0.08] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-amber-300 hover:border-amber-400/55 hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40">{balance < duel.stake ? <>Insufficient <img src="/assets/dzpp-currency.png" alt="" className="mx-1 inline h-[12px] w-[12px] object-contain" /></> : <>Accept <img src="/assets/dzpp-currency.png" alt="" className="mx-1 inline h-[12px] w-[12px] object-contain" /> {duel.stake.toLocaleString()}</>}</button></div>
    </div>
  </article>;
}
