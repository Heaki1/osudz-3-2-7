import { Upload } from 'lucide-react';
import { fmt } from './duelFormatters';
import type { PlayerScoreProps } from './duelTypes';

export function PlayerScore({ name, avatarUrl, score, accuracy, misses, maxCombo, leading, losing, mine, align, onImport, onNavigateToPlayer }: PlayerScoreProps) {
  const rev = align === 'right';
  const accuracyPct = accuracy === undefined ? undefined : accuracy <= 1 ? accuracy * 100 : accuracy;
  const isFC = misses === 0;
  const statValueClass = leading ? 'text-emerald-300' : losing ? 'text-rose-400' : 'text-slate-300';
  return <div className={`flex flex-col gap-3 ${rev ? 'items-end text-right' : 'items-start text-left'}`}>
    <div className={`flex items-center gap-2.5 ${rev ? 'flex-row-reverse' : ''}`}>
      <button type="button" onClick={() => onNavigateToPlayer(name)} className={`group/player flex items-center gap-2.5 text-left ${rev ? 'flex-row-reverse' : ''}`} aria-label={`Open ${name}'s profile`}>
        {avatarUrl ? <img src={avatarUrl} alt={name} referrerPolicy="no-referrer" className={`h-10 w-10 rounded-full border-2 object-cover transition-[filter] group-hover/player:brightness-110 ${leading ? 'border-emerald-400/70 shadow-[0_0_12px_rgba(52,211,153,0.3)]' : losing ? 'border-rose-400/70 shadow-[0_0_12px_rgba(244,63,94,0.25)]' : 'border-slate-700'}`} onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} /> : null}
        <span className={`${avatarUrl ? 'hidden' : ''} flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-slate-950 text-xs font-black ${leading ? 'border-emerald-400/70 text-emerald-300' : losing ? 'border-rose-400/70 text-rose-300' : 'border-slate-700 text-slate-500'}`}>{name.slice(0, 1).toUpperCase()}</span>
        <span className="text-sm font-black leading-tight text-white transition-[text-shadow,color] duration-200 group-hover/player:text-white group-hover/player:[text-shadow:0_0_8px_rgba(250,204,21,0.85)]">{name}</span>
      </button>
    </div>
    <div className={`font-mono text-2xl font-black tabular-nums ${leading ? 'text-emerald-300' : losing ? 'text-rose-400' : score === undefined ? 'text-slate-700' : 'text-slate-300'}`}>{score === undefined ? 'No score yet' : score.toLocaleString()}</div>
    {score !== undefined && <div className={`flex flex-wrap gap-x-4 gap-y-1.5 ${rev ? 'justify-end' : ''}`}>
      {rev ? <>
        {accuracyPct !== undefined && <div className="flex flex-col items-end"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Accuracy</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>{accuracyPct.toFixed(2)}%</span></div>}
        {misses !== undefined && <div className="flex flex-col items-end"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Misses</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>{misses === 0 ? '0 ✓' : misses}</span></div>}
        {maxCombo !== undefined && <div className="flex flex-col items-end"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Max combo</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>— <span className="text-[10px] font-normal text-slate-600">/ {maxCombo.toLocaleString()}</span></span></div>}
      </> : <>
        {maxCombo !== undefined && <div className="flex flex-col items-start"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Max combo</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>— <span className="text-[10px] font-normal text-slate-600">/ {maxCombo.toLocaleString()}</span></span></div>}
        {misses !== undefined && <div className="flex flex-col items-start"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Misses</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>{misses === 0 ? '0 ✓' : misses}</span></div>}
        {accuracyPct !== undefined && <div className="flex flex-col items-start"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Accuracy</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>{accuracyPct.toFixed(2)}%</span></div>}
      </>}
    </div>}
    <div className={`flex gap-2 ${rev ? 'flex-row-reverse' : ''}`}>{isFC && <span className="border border-emerald-400/30 bg-emerald-400/[0.06] px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400">FC</span>}{leading && <div className="flex items-center gap-1 font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400">Leading</div>}</div>
  </div>;
}

function Score({ name, score, mine, ahead, onImport }: { name: string; score?: number; mine: boolean; ahead: boolean; onImport: () => void }) {
  return <div className={`relative overflow-hidden rounded-xl border p-4 ${ahead ? 'border-emerald-400/30 bg-emerald-400/[0.035]' : 'border-slate-800 bg-slate-950/45'}`}>
    {ahead && <div className="absolute inset-y-0 left-0 w-px bg-emerald-400/70" />}
    <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-black text-slate-200">{name}</p>{mine && <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-1.5 py-0.5 text-[7px] font-mono font-black uppercase tracking-wider text-amber-300">You</span>}</div>
    <p className={`mt-3 truncate text-xl font-black tabular-nums ${ahead ? 'text-emerald-300' : 'text-white'}`}>{score === undefined ? 'Awaiting score' : fmt(score)}</p>
    <div className="mt-2 flex items-center justify-between"><span className={`text-[8px] font-mono uppercase tracking-widest ${ahead ? 'text-emerald-400/70' : 'text-slate-700'}`}>{ahead ? 'Leading' : score === undefined ? 'Not submitted' : 'In contention'}</span>{mine && <button onClick={onImport} className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-300 hover:text-amber-200"><Upload className="h-3 w-3" /> Import</button>}</div>
  </div>;
}
