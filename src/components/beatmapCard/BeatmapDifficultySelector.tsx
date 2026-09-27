import type { Beatmap } from '../../types';

interface BeatmapDifficultySelectorProps {
  difficulties: Beatmap[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function BeatmapDifficultySelector({
  difficulties,
  selectedIndex,
  onSelect,
}: BeatmapDifficultySelectorProps) {
  if (difficulties.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto" onClick={(event) => event.stopPropagation()}>
      {difficulties.map((difficulty, index) => (
        <button
          key={difficulty.difficultyId ?? difficulty.id}
          type="button"
          onClick={() => onSelect(index)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border whitespace-nowrap transition-all ${
            index === selectedIndex
              ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          {difficulty.difficultyName}
        </button>
      ))}
    </div>
  );
}
