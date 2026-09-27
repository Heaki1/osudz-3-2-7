import type { ReplayShareScreenProps } from './duelTypes';

export function ReplayShareScreen({ label, player, ready }: ReplayShareScreenProps) {
  const stateClass = ready
    ? 'border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300'
    : 'border-rose-400/20 bg-rose-500/[0.04] text-rose-300';
  return <div className="flex min-h-[220px] flex-col items-center justify-center bg-[#05070b] p-6 text-center">
    <div className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">{label}</div>
    <div className="mt-2 text-sm font-black text-white">{player}</div>
    <div className={'mt-4 border px-4 py-2 font-mono text-[9px] font-black uppercase tracking-wider ' + stateClass}>
      {ready ? 'Replay shared — waiting for opponent' : 'Replay not shared'}
    </div>
  </div>;
}
