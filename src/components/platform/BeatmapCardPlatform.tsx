import React, { useEffect, useState } from 'react';
import { useAudioPreview } from '../../lib/audioPreview';
import { Beatmap } from '../../types';
import { Star, Heart, CheckCircle2, Music2, Upload, Play, Pause } from 'lucide-react';
import { getBeatmapStatusStyle } from '../beatmap/beatmapCard.shared';
import { BeatmapCardAudio } from '../beatmap/beatmapCard/BeatmapCardAudio';
import { BeatmapDifficultySelector } from '../beatmap/beatmapCard/BeatmapDifficultySelector';

interface BeatmapCardPlatformProps {
  beatmap: Beatmap;
  difficulties?: Beatmap[];
  showVoteButton?: boolean;
  showSubmitButton?: boolean;
  voted?: boolean;
  onVote?: () => void;
  onFavorite?: (beatmap: Beatmap) => void;
  onSubmit?: () => void;
  maxVotes?: number;
  voteBusy?: boolean;
  voteDisabled?: boolean;
  voteDisabledReason?: string;
}

export function BeatmapCardPlatform({
  beatmap,
  difficulties,
  showVoteButton,
  showSubmitButton,
  voted,
  onVote,
  onFavorite,
  onSubmit,
  maxVotes,
  voteBusy,
  voteDisabled,
  voteDisabledReason,
}: BeatmapCardPlatformProps) {
const [selectedDifficultyIndex, setSelectedDifficultyIndex] = useState(0);
const [favoriteOverride, setFavoriteOverride] = useState<Record<number, boolean>>({});

const selectedBeatmap =
  difficulties?.[selectedDifficultyIndex] ?? beatmap;

const selectedDifficultyId = selectedBeatmap.difficultyId;

const favorited =
  selectedDifficultyId !== undefined &&
  favoriteOverride[selectedDifficultyId] !== undefined
    ? favoriteOverride[selectedDifficultyId]
    : selectedBeatmap.isFavorited ?? false;

useEffect(() => {
  if (selectedDifficultyId === undefined) return;

  setFavoriteOverride((prev) => {
    if (prev[selectedDifficultyId] === selectedBeatmap.isFavorited) {
      return prev;
    }

    return {
      ...prev,
      [selectedDifficultyId]: selectedBeatmap.isFavorited ?? false,
    };
  });
}, [selectedDifficultyId, selectedBeatmap.isFavorited]);

useEffect(() => {
  if (difficulties && selectedDifficultyIndex >= difficulties.length) {
    setSelectedDifficultyIndex(0);
  }
}, [difficulties, selectedDifficultyIndex]);

  const isVoted = voted ?? beatmap.isVoted ?? false;
  const status = getBeatmapStatusStyle(beatmap.status);
  const votePercent =
    beatmap.voteCount !== undefined && maxVotes !== undefined && maxVotes > 0
      ? Math.min(100, Math.round((beatmap.voteCount / maxVotes) * 100))
      : 0;
  const voteBlocked = Boolean(voteBusy || voteDisabled);

const difficultyUrl =
  selectedBeatmap.difficultyId !== undefined
    ? `https://osu.ppy.sh/beatmaps/${selectedBeatmap.difficultyId}`
    : null;

const openDifficulty = () => {
  if (!difficultyUrl) return;

  window.open(
    difficultyUrl,
    '_blank',
    'noopener,noreferrer'
  );
};

const stopClick = (e: React.MouseEvent) => {
  e.stopPropagation();
};

const {
  isPlaying,
  progress,
  toggle: togglePlay,
  seek,
} = useAudioPreview(
  String(selectedBeatmap.difficultyId ?? selectedBeatmap.id),
  selectedBeatmap.previewUrl
);

const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
  e.stopPropagation();

  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = Math.max(
    0,
    Math.min(1, (e.clientX - rect.left) / rect.width)
  );

  seek(ratio);
};

 const handleFavorite = () => {
  if (selectedDifficultyId === undefined) return;

  const nextFavorited = !favorited;

  setFavoriteOverride((prev) => ({
    ...prev,
    [selectedDifficultyId]: nextFavorited,
  }));

  onFavorite?.(selectedBeatmap);
};

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openDifficulty}
      onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openDifficulty();
  }
}}
      className="group relative bg-[#0d1526] border border-slate-800/80 rounded-2xl overflow-hidden hover:border-slate-700/80 hover:shadow-lg hover:shadow-black/30 transition-all duration-300 cursor-pointer"
    >
      <div className="relative h-36 overflow-hidden bg-slate-900/80">
        <img
          src={beatmap.coverUrl}
          alt={beatmap.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-[1.03] transition-all duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d1526] via-[#0d1526]/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0d1526]/40 to-transparent" />

        <span className={`absolute top-3 left-3 text-[10px] font-black px-2.5 py-1 rounded-lg border backdrop-blur-sm ${status.bg} ${status.text} ${status.border}`}>
          {status.label}
        </span>

        <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-950/70 backdrop-blur-sm px-2 py-1 rounded-lg">
          <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
          <span className="text-[11px] font-black font-mono text-amber-400">{selectedBeatmap.stars.toFixed(2)}</span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <h3 className="text-sm font-black text-white leading-tight line-clamp-1 drop-shadow-md tracking-tight">
            {beatmap.title}
          </h3>
          <p className="text-[11px] text-slate-300/80 line-clamp-1 mt-0.5">{beatmap.artist}</p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            stopClick(e);
            handleFavorite();
          }}
          aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
          className={`absolute bottom-3 right-3 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
            favorited
              ? 'bg-rose-500/30 text-rose-400 border border-rose-500/40'
              : 'bg-slate-950/50 text-slate-500 hover:text-rose-400 border border-slate-700/40'
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${favorited ? 'fill-rose-400' : ''}`} />
        </button>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-3">
{difficulties && (
  <BeatmapDifficultySelector
    difficulties={difficulties}
    selectedIndex={selectedDifficultyIndex}
    onSelect={setSelectedDifficultyIndex}
  />
)}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            by <span className="text-slate-300 font-semibold">{beatmap.mapper}</span>
          </p>
          <span className="text-[10px] bg-slate-900 border border-slate-700/60 px-2 py-0.5 rounded-full text-slate-400 font-medium truncate max-w-[120px]">
            {selectedBeatmap.difficultyName}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
          <span className="flex items-center gap-1">
            <Music2 className="w-3 h-3" />
            {selectedBeatmap.bpm} BPM
          </span>
          <span className="text-slate-800">·</span>
          <span>{selectedBeatmap.length}</span>
          {beatmap.submittedByName && (
            <>
              <span className="text-slate-800">·</span>
              <span className="text-slate-600 truncate">by {beatmap.submittedByName}</span>
            </>
          )}
        </div>
<div className="grid grid-cols-4 gap-1.5">
  {[
    ['CS', selectedBeatmap.cs ?? 0],
    ['AR', selectedBeatmap.ar ?? 0],
    ['OD', selectedBeatmap.od ?? 0],
    ['HP', selectedBeatmap.hp ?? 0],
  ].map(([label, value]) => (
    <div
      key={label}
      className="bg-slate-900/70 border border-slate-800 rounded-lg px-2 py-1.5 text-center"
    >
      <p className="text-[9px] uppercase tracking-wider text-slate-600 font-mono">
        {label}
      </p>
      <p className="text-[11px] font-bold text-slate-200 font-mono">
        {Number(value).toFixed(1)}
      </p>
    </div>
  ))}
</div>

        <BeatmapCardAudio
          isPlaying={isPlaying}
          progress={progress}
          onToggle={togglePlay}
          onScrub={handleScrub}
          disabled={!selectedBeatmap.previewUrl}
          compact
        />

        {(beatmap.modRequirement || beatmap.challengeType) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {beatmap.modRequirement && (
              <span className="text-[10px] font-mono font-bold bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 px-2 py-0.5 rounded-lg">
                {beatmap.modRequirement}
              </span>
            )}
            {beatmap.challengeType && (
              <span className="text-[10px] font-bold bg-amber-400/8 border border-amber-400/20 text-amber-400/90 px-2 py-0.5 rounded-lg">
                {beatmap.challengeType}
              </span>
            )}
          </div>
        )}

        {beatmap.voteCount !== undefined && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-600 font-mono">Votes</span>
              <span className="text-[11px] font-black font-mono text-white">{beatmap.voteCount}
                {maxVotes !== undefined && (
                  <span className="text-slate-600 font-normal"> / {maxVotes}</span>
                )}
              </span>
            </div>
            {maxVotes !== undefined && (
              <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isVoted ? 'bg-emerald-400' : 'bg-amber-400/60'}`}
                  style={{ width: `${votePercent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {(showVoteButton || showSubmitButton) && (
          <div className="flex items-center gap-2 pt-0.5">
            {showVoteButton && (
              <div className="flex-1 space-y-1">
                <button
                  type="button"
                  disabled={voteBlocked}
                  title={voteDisabled ? voteDisabledReason : undefined}
                  aria-label={voteDisabled && voteDisabledReason ? voteDisabledReason : undefined}
                  onClick={
                    voteBlocked
                      ? undefined
                      : (e) => {
                          stopClick(e);
                          onVote?.();
                        }
                  }
                  className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed ${
                    isVoted
                      ? 'bg-emerald-600/80 hover:bg-emerald-500/80 text-white border border-emerald-500/30'
                      : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                  }`}
                >
                  {isVoted && !voteBusy && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {voteBusy ? 'Voting…' : isVoted ? 'Voted' : 'Vote for this'}
                </button>
                {voteDisabled && voteDisabledReason && (
                  <p className="text-[10px] text-slate-500 text-center leading-snug">
                    {voteDisabledReason}
                  </p>
                )}
              </div>
            )}
            {showSubmitButton && (
              <button
                type="button"
                onClick={(e) => {
                  stopClick(e);
                  onSubmit?.();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950 transition-all active:scale-[0.97]"
              >
                <Upload className="w-3.5 h-3.5" />
                Submit this
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
