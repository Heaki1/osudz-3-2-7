import { Pause, Play } from 'lucide-react';
import type { MouseEvent } from 'react';

interface BeatmapCardAudioProps {
  isPlaying: boolean;
  progress: number;
  onToggle: () => void;
  onScrub: (event: MouseEvent<HTMLDivElement>) => void;
  durationLabel?: string;
  disabled?: boolean;
  compact?: boolean;
}

export function BeatmapCardAudio({
  isPlaying,
  progress,
  onToggle,
  onScrub,
  durationLabel,
  disabled = false,
  compact = false,
}: BeatmapCardAudioProps) {
  return (
    <div
      className={compact
        ? `flex items-center gap-2 rounded-xl px-2.5 py-1.5 border transition-all ${isPlaying ? 'bg-amber-400/8 border-amber-400/25' : 'bg-slate-900/60 border-slate-800/60'}`
        : 'bg-slate-900/90 border border-slate-800/80 rounded-xl px-2.5 flex items-center gap-2.5 flex-shrink-0 mt-2 h-[35px]'}
    >
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onToggle(); }}
        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
        disabled={disabled}
        className={compact
          ? `w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isPlaying ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'}`
          : `w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isPlaying ? 'bg-amber-400 text-slate-950 scale-105' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
      >
        {isPlaying ? <Pause className={compact ? 'w-3 h-3 fill-current' : 'w-3.5 h-3.5 fill-current'} /> : <Play className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill-current ml-0.5`} />}
      </button>
      <div
        onClick={onScrub}
        className={`${compact ? 'h-1.5' : 'h-2'} flex-1 bg-slate-800 rounded-full relative overflow-hidden cursor-pointer`}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${isPlaying ? 'bg-amber-400' : compact ? 'bg-slate-600' : 'bg-slate-400'}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <span className={`${compact ? 'w-14 text-slate-600' : 'w-12 text-slate-400'} text-[10px] tabular-nums font-mono text-right flex-shrink-0`}>
        {durationLabel ?? 'preview'}
      </span>
    </div>
  );
}
