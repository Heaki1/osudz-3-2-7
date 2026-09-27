import React, { useRef, useState } from 'react';
import { ApiChallengeBeatmap } from '../../api/client';
import { CurrentRound, roundLabel } from '../../lib/round';
import { beatmapUrl } from '../../lib/submission';
import {
  ChevronRight,
  Crown,
  Music2,
} from 'lucide-react';

function starColor(rating: number) {
  if (rating < 1) return 'text-slate-400';
  if (rating < 2) return 'text-blue-400';
  if (rating < 2.5) return 'text-cyan-400';
  if (rating < 3) return 'text-green-400';
  if (rating < 3.5) return 'text-lime-400';
  if (rating < 4) return 'text-yellow-400';
  if (rating < 4.5) return 'text-amber-400';
  if (rating < 5) return 'text-orange-400';
  if (rating < 5.5) return 'text-red-400';
  if (rating < 6) return 'text-rose-400';
  if (rating < 6.5) return 'text-pink-400';
  if (rating < 7) return 'text-purple-400';
  if (rating < 8) return 'text-indigo-400';
  return 'text-violet-400';
}

export function DashboardChallengeHero({
  round,
  selectedBeatmap,
  challengeBeatmaps,
  selectedChallengeId,
  onSelectChallenge,
  countdown,
}: {
  round: CurrentRound;
  selectedBeatmap: ApiChallengeBeatmap | null;
  challengeBeatmaps: ApiChallengeBeatmap[];
  selectedChallengeId: number | null;
  onSelectChallenge: (id: number) => void;
  countdown: string;
}) {
  if (!selectedBeatmap) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-[#0a1020] px-6 py-8 sm:px-8 sm:py-10">
        <div className="flex items-center gap-2 text-amber-400">
          <Crown className="w-4 h-4" />
          <span className="text-xs font-bold tracking-wide">{roundLabel(round)} Challenge</span>
        </div>
        <p className="text-sm text-slate-400 mt-3 max-w-lg">
          No challenge beatmap is available yet — one will appear here once the administrator confirms the winner.
        </p>
      </div>
    );
  }

  const activeIndex = challengeBeatmaps.findIndex((b) => b.submissionId === selectedChallengeId);
  const selectedIndex = activeIndex === -1 ? 0 : activeIndex;
  const nextIndex = challengeBeatmaps.length > 1 ? (selectedIndex + 1) % challengeBeatmaps.length : 0;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const togglePreview = () => {
    if (!selectedBeatmap.previewUrl) return;
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      void audioRef.current.play();
      setPreviewPlaying(true);
    } else {
      audioRef.current.pause();
      setPreviewPlaying(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-purple-400/20 bg-[#09111f] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="relative min-h-[340px] overflow-hidden">
        {selectedBeatmap.coverUrl && (
          <img
            src={selectedBeatmap.coverUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover scale-[1.03]"
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(100deg,#060d18_20%,#07101fe8_48%,#07101f95_72%,#07101f45_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_84%_16%,rgba(168,85,247,0.20),transparent_30%),linear-gradient(180deg,transparent_45%,#060d18_100%)]" />

        <div className="relative flex min-h-[340px] flex-col justify-start gap-8 px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em]">
            <span className="font-black text-emerald-400">Challenge live</span>
            <span className="text-slate-500">{roundLabel(round)}</span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-yellow-300">Challenge map {selectedIndex + 1}</p>
                {selectedBeatmap.voteRank === 1 && round.reward && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-amber-400">
                    <img src="/assets/osu/Online-supporter-heart.png" alt="" className="h-4 w-4 object-contain" />
                    {round.reward}
                  </span>
                )}
              </div>
              <h2 className="max-w-3xl text-2xl font-black leading-tight tracking-tight text-white drop-shadow-2xl sm:text-4xl">
                {selectedBeatmap.title}
              </h2>
              <p className="mt-2 text-base font-semibold text-slate-200">{selectedBeatmap.artist}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>mapped by <span className="font-semibold text-slate-200">{selectedBeatmap.mapper}</span></span>
                <span className="text-slate-700">·</span>
                <span className={`inline-flex items-center gap-1 font-mono ${starColor(selectedBeatmap.stars)}`}>
                  <img src="/assets/osu/Icons-star.png" alt="" className="h-3 w-3 object-contain" />
                  {selectedBeatmap.stars.toFixed(2)}
                </span>
                <span className="text-slate-700">·</span>
          <span className={selectedBeatmap.mapStatus.toLowerCase() === 'ranked' ? 'text-emerald-400' : selectedBeatmap.mapStatus.toLowerCase() === 'loved' ? 'text-red-400' : ''}>
            {selectedBeatmap.mapStatus}
          </span>
              </div>

              <div className="mt-16 flex flex-wrap items-center gap-2">
                <a
                  href={beatmapUrl({ beatmapsetId: selectedBeatmap.beatmapsetId, difficultyId: selectedBeatmap.difficultyId })}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 transition-colors hover:bg-amber-300"
                >
                  <img src="/assets/osu/Icons-Logo.png" alt="" className="h-4 w-4 object-contain" />
                  osu! page
                </a>
                <audio
                  ref={audioRef}
                  src={selectedBeatmap.previewUrl || undefined}
                  preload="none"
                  onEnded={() => setPreviewPlaying(false)}
                />
                <button
                  type="button"
                  onClick={togglePreview}
                  disabled={!selectedBeatmap.previewUrl}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-xs font-black text-white transition-colors hover:border-amber-400/30 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <img src="/assets/osu/Icons-music.png" alt="" className="h-4 w-4 object-contain" />
                  {previewPlaying ? 'Pause preview' : 'Preview'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-slate-950/65 p-4 backdrop-blur-md shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/80">Time remaining</p>
                  </div>
                </div>
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                  <img src="/assets/osu/Icons-clock.png" alt="" className="h-4 w-4 object-contain" />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3.5 py-4">
                <p className="font-mono text-2xl font-black tabular-nums tracking-tight text-white">{countdown}</p>
              </div>
              {challengeBeatmaps.length > 1 && (
                <button
                  type="button"
                  onClick={() => onSelectChallenge(challengeBeatmaps[nextIndex].submissionId)}
                  className="mt-4 hidden"
                >
                  Next challenge
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {challengeBeatmaps.length > 1 && (
        <div className="border-t border-white/8 bg-[#08101c]/95 px-4 py-4 sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">Challenge lineup</p>
              <p className="mt-0.5 text-xs text-slate-400">Choose which challenge to play.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] font-bold text-slate-600">{selectedIndex + 1} / {challengeBeatmaps.length}</span>
              <button
                type="button"
                onClick={() => onSelectChallenge(challengeBeatmaps[nextIndex].submissionId)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 transition-colors hover:bg-amber-300"
              >
                Next challenge
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {challengeBeatmaps.map((beatmap, index) => {
              const active = beatmap.submissionId === selectedChallengeId;
              return (
                <button
                  type="button"
                  key={beatmap.submissionId}
                  aria-pressed={active}
                  onClick={() => onSelectChallenge(beatmap.submissionId)}
                  className={`group flex min-w-[190px] max-w-[230px] flex-1 items-center gap-3 rounded-2xl border p-2 text-left transition-colors ${
                    active
                      ? 'border-yellow-400/50 bg-yellow-400/10 shadow-[0_0_18px_rgba(250,204,21,0.16)]'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/70'
                  }`}
                >
                  <img
                    src={beatmap.coverUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-11 w-14 flex-shrink-0 rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[9px] font-black uppercase tracking-[0.16em] ${active ? 'text-yellow-300' : 'text-slate-600'}`}>#{index + 1}</span>
                    <span className="mt-0.5 block truncate text-xs font-black text-white">{beatmap.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 truncate font-mono text-[10px] text-slate-500">
                      <img src="/assets/osu/Icons-star.png" alt="" className="h-2.5 w-2.5 object-contain" />
                      {beatmap.difficultyName} · {beatmap.stars.toFixed(2)}★
                    </span>
                  </span>
                  {active ? (
                    <img src="/assets/osu/Icons-music.png" alt="" className="mr-1 h-4 w-4 flex-shrink-0 object-contain" />
                  ) : beatmap.voteRank === 1 ? (
                    <img src="/assets/osu/Icons-crown.png" alt="" className="mr-1 h-4 w-4 flex-shrink-0 object-contain" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
