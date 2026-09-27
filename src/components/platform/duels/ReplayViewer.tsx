import { useEffect, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import type { ApiDuel } from '../../../api/client';
import { ReplayShareScreen } from './ReplayShareScreen';
import type { ReplayViewerProps } from './duelTypes';

export function ReplayViewer({ duel, watching }: ReplayViewerProps) {
  const bothReady = !!duel.challengerReplayReady && !!duel.opponentReplayReady;
  const [progress, setProgress] = useState({ challengerPerformance: { score: 0, acc: 0, combo: 0, misses: 0 }, opponentPerformance: { score: 0, acc: 0, combo: 0, misses: 0 }, timeMs: 0, durationMs: 0, playing: false });

  useEffect(() => {
    if (!watching) {
      setProgress({ challengerPerformance: { score: 0, acc: 0, combo: 0, misses: 0 }, opponentPerformance: { score: 0, acc: 0, combo: 0, misses: 0 }, timeMs: 0, durationMs: 0, playing: false });
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'osu-dz-duel-progress') return;
      setProgress({
        challengerPerformance: event.data.challengerPerformance ?? { score: 0, acc: 0, combo: 0, misses: 0 },
        opponentPerformance: event.data.opponentPerformance ?? { score: 0, acc: 0, combo: 0, misses: 0 },
        timeMs: Number(event.data.timeMs) || 0,
        durationMs: Number(event.data.durationMs) || 0,
        playing: !!event.data.playing,
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [watching]);

  const requirement = duel.requirement.toLowerCase();
  const isMissCount = requirement.includes('miss');
  const isAccuracy = requirement.includes('accuracy');
  const isFullCombo = requirement.includes('full combo');
  const challenger = progress.challengerPerformance;
  const opponent = progress.opponentPerformance;
  const challengerPrimary = isMissCount ? challenger.misses : isAccuracy ? challenger.acc : isFullCombo ? challenger.combo : challenger.score;
  const opponentPrimary = isMissCount ? opponent.misses : isAccuracy ? opponent.acc : isFullCombo ? opponent.combo : opponent.score;
  const challengerLeading = isMissCount
    ? challengerPrimary < opponentPrimary
    : challengerPrimary > opponentPrimary || (isFullCombo && challengerPrimary === opponentPrimary && challenger.score > opponent.score);
  const opponentLeading = isMissCount
    ? opponentPrimary < challengerPrimary
    : opponentPrimary > challengerPrimary || (isFullCombo && challengerPrimary === opponentPrimary && opponent.score > challenger.score);
  const total = challengerPrimary + opponentPrimary;
  const challengerPct = isMissCount
    ? (challengerPrimary === 0 && opponentPrimary === 0 ? 50 : total > 0 ? (opponentPrimary / total) * 100 : 50)
    : total > 0 ? (challengerPrimary / total) * 100 : 50;
  const opponentPct = 100 - challengerPct;
  const metricLabel = isMissCount ? 'Misses' : isAccuracy ? 'Accuracy' : isFullCombo ? 'Combo' : 'Score';
  const displayValue = (value: number) => isMissCount ? String(value) : isAccuracy ? `${(value * 100).toFixed(2)}%` : value.toLocaleString();
  const elapsed = progress.durationMs > 0 ? Math.min(100, (progress.timeMs / progress.durationMs) * 100) : 0;
  const sendReplayControl = (data: Record<string, unknown>) => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title$=" live replay"]');
    iframe?.contentWindow?.postMessage({ type: 'osu-dz-replay-control', ...data }, window.location.origin);
  };

  return <div className="relative mb-6 overflow-hidden rounded-xl border border-slate-800 bg-black">
    {bothReady && watching ? (
      <>
        <div className="group/replay relative">
          <iframe
            title={duel.challenger + ' vs ' + (duel.opponent ?? 'Opponent') + ' live replay'}
            src={'/replayviewer/?duel=' + duel.id + '&embed=1'}
            className="block h-[360px] w-full border-0 sm:h-[430px] lg:h-[500px]"
            allow="autoplay"
          />

          <div className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-200 group-hover/replay:opacity-100">
            <div className="pointer-events-auto absolute bottom-[5%] left-1/2 flex -translate-x-1/2 items-center gap-2">
              <button
                type="button"
                aria-label={progress.playing ? 'Pause replay' : 'Play replay'}
                onClick={() => sendReplayControl({ action: 'toggle' })}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-xl backdrop-blur-sm transition hover:scale-105 hover:border-amber-400/50 hover:text-amber-300"
              >
                {progress.playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>

              <div className="flex h-9 w-9 items-center overflow-hidden rounded-full border border-white/10 bg-black/75 shadow-xl backdrop-blur-sm transition-[width] duration-200 hover:w-36">
              <Volume2 className="ml-2.5 h-4 w-4 shrink-0 text-white" />
              <input
                aria-label="Replay volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                defaultValue="1"
                onChange={event => sendReplayControl({ action: 'volume', value: Number(event.target.value) })}
                className="ml-2 h-1.5 w-24 min-w-0 cursor-pointer accent-amber-400"
              />
              </div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-5 bottom-5 z-10 rounded-lg border border-white/10 bg-black/70 px-4 py-3 shadow-2xl backdrop-blur-sm sm:inset-x-8 sm:px-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0 text-left">
              <div className="truncate font-mono text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">{duel.challenger} · {metricLabel}</div>
              <div className={`mt-0.5 font-mono text-xl font-black tabular-nums transition-colors ${challengerLeading ? 'text-emerald-300' : 'text-slate-200'}`}>
                {displayValue(challengerPrimary)}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center px-2">
              <span className={`text-[9px] font-mono font-black uppercase tracking-[0.14em] ${challengerLeading ? 'text-emerald-400' : opponentLeading ? 'text-rose-400' : 'text-slate-600'}`}>
                {challengerLeading ? `${duel.challenger} leads` : opponentLeading ? `${duel.opponent ?? 'Opponent'} leads` : 'Even'}
              </span>
              <span className="mt-1 font-mono text-[8px] tabular-nums text-slate-700">
                {Math.floor(progress.timeMs / 1000 / 60)}:{String(Math.floor(progress.timeMs / 1000) % 60).padStart(2, '0')} / {Math.floor(progress.durationMs / 1000 / 60)}:{String(Math.floor(progress.durationMs / 1000) % 60).padStart(2, '0')}
              </span>
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate font-mono text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">{duel.opponent ?? 'Opponent'} · {metricLabel}</div>
              <div className={`mt-0.5 font-mono text-xl font-black tabular-nums transition-colors ${opponentLeading ? 'text-emerald-300' : 'text-slate-200'}`}>
                {displayValue(opponentPrimary)}
              </div>
            </div>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-slate-950 ring-1 ring-slate-800">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-300 transition-[width] duration-200" style={{ width: `${challengerPct}%` }} />
            <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-rose-600 via-rose-500 to-rose-300 transition-[width] duration-200" style={{ width: `${opponentPct}%` }} />
            <div className="absolute inset-y-[-2px] left-1/2 w-px bg-white/80 shadow-[0_0_7px_rgba(255,255,255,0.7)]" />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className={`font-mono text-[9px] font-black tabular-nums ${challengerLeading ? 'text-emerald-400' : 'text-slate-600'}`}>{challengerPct.toFixed(0)}%</span>
            <div className="h-1 w-1/3 overflow-hidden rounded-full bg-slate-900">
              <div className="h-full bg-slate-600 transition-[width] duration-200" style={{ width: `${elapsed}%` }} />
            </div>
            <span className={`font-mono text-[9px] font-black tabular-nums ${opponentLeading ? 'text-emerald-400' : 'text-slate-600'}`}>{opponentPct.toFixed(0)}%</span>
          </div>
        </div>
      </>
    ) : (
      <div className="grid min-h-[220px] grid-cols-1 gap-px bg-slate-800 sm:grid-cols-2">
        <ReplayShareScreen label="Challenge" player={duel.challenger} ready={!!duel.challengerReplayReady} />
        <ReplayShareScreen label="Opponent" player={duel.opponent ?? 'Opponent'} ready={!!duel.opponentReplayReady} />
      </div>
    )}
  </div>;
}
