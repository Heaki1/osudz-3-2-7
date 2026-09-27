import { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Clock3,
  Crown,
  Layers3,
  Medal,
  RefreshCw,
  ScrollText,
  Trophy,
} from 'lucide-react';
import { BeatmapCard } from '../../beatmap/BeatmapCard';
import type { ApiChallengeBeatmap, ApiChallengeCollectionItem, ApiPlayerShopItem } from '../../../api/client';
import type { ApiPlayerDzppMap, ApiPlayerDzppRound } from '../../../types/player';
import type { Beatmap } from '../../../types';
import type { ItemCategory } from '../shop/shop.types';
import { TitleRenderer } from '../TitleRenderer';
export interface FlatPerformance extends ApiPlayerDzppMap {
  roundId: number;
  roundNumber: number;
  month: string;
  year: number;
  roundPlacement: number | null;
}

export interface WonChallengeMap extends ApiPlayerDzppMap {
  roundId: number;
  roundNumber: number;
  month: string;
  year: number;
  challenge: ApiChallengeBeatmap | null;
}

type ShopCategoryTab = ItemCategory | 'all';

function challengeBadgeKey(win: { roundId: number; submissionId: number }): string {
  return `${win.roundId}-${win.submissionId}`;
}

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  title: 'Titles',
  badge: 'Badges',
  frame: 'Frames',
  username_decoration: 'Decorations',
  profile_decoration: 'Profile',
};

const CATEGORY_ORDER: ItemCategory[] = [
  'frame',
  'title',
  'badge',
  'username_decoration',
  'profile_decoration',
];
export function SectionHeader({
  title,
  count,
  action,
  onAction,
}: {
  title: string;
  count?: string;
  action?: string;
  onAction?: () => void;
}) {
  const Icon = title === 'Career Statistics'
    ? BarChart3
    : title === 'Top Plays'
      ? Trophy
      : title === 'Race to Level 50'
        ? Trophy
      : title === 'Recent Rounds'
        ? Clock3
        : title === 'History' || title === 'Recent'
          ? ScrollText
          : Layers3;

  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 bg-[#111625] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className={`h-5 w-5 shrink-0 ${title === 'Race to Level 50' ? 'text-[#f0c86b]' : 'text-[#e879f9]'}`} strokeWidth={2.5} />
        <h2 className="truncate text-[15px] font-black tracking-tight text-slate-100">{title}</h2>
        {count && <span className="font-mono text-[9px] text-slate-600">{count}</span>}
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-300 transition hover:text-[#f0abfc]"
        >
          {action} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
function PlacementBadge({ placement }: { placement: number | null }) {
  if (placement === null) return <span className="text-slate-600">—</span>;
  const className = placement === 1
    ? 'border-[#d9b86b]/40 bg-amber-300/10 text-[#f0c86b]'
    : placement === 2
      ? 'border-slate-300/30 bg-slate-200/10 text-slate-200'
      : placement === 3
        ? 'border-orange-400/30 bg-orange-400/10 text-orange-300'
        : 'border-slate-700 bg-slate-900/70 text-slate-400';
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[8px] font-black ${className}`}>
      {placement === 1 && <Crown className="mr-1 h-2.5 w-2.5" />}
      #{placement}
    </span>
  );
}

function ordinalPlace(place: number | null): string {
  if (place === null) return '—';

  if (place % 100 >= 11 && place % 100 <= 13) {
    return `${place}th`;
  }

  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

export function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 border border-[#292d45] bg-[#0c1424] text-slate-600">
      <RefreshCw className="h-6 w-6 animate-spin text-[#f0c86b]/60" />
      <span className="font-mono text-[10px]">{message}</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center border border-dashed border-[#353951] bg-[#0c1424] px-4 text-center font-mono text-[10px] text-slate-700">
      {message}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 border border-rose-500/20 bg-rose-500/[0.025] text-rose-300">
      <AlertCircle className="h-7 w-7" />
      <span className="font-mono text-[10px]">{message}</span>
    </div>
  );
}

export function TopPlays({ performances }: { performances: FlatPerformance[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? performances : performances.slice(0, 5);
  const hasMore = performances.length > 5;

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#292d45] bg-[#0d1220]">
      <SectionHeader
        title="Top Plays"
        count={`${performances.length} / 100`}
        action={hasMore ? (expanded ? 'Show less' : 'See all') : undefined}
        onAction={() => setExpanded((value) => !value)}
      />

      {performances.length === 0 ? (
        <EmptyState message="No finalized performances yet." />
      ) : (
        <div className="flex flex-col gap-1.5 p-2">
          {visible.map((perf, index) => (
            <div
              key={`${perf.roundId}-${perf.submissionId}`}
              className="flex h-[54px] items-center gap-2 rounded-md border border-[#292d45] bg-[#0a0f1a] px-2"
            >
              {/* Rank */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800/70">
  {perf.roundPlacement === 1 ? (
    <Crown className="h-4 w-4 text-[#f0c86b]" />
  ) : perf.roundPlacement === 2 ? (
    <Medal className="h-4 w-4 text-slate-300" />
  ) : perf.roundPlacement === 3 ? (
    <Medal className="h-4 w-4 text-orange-300" />
  ) : (
    <span className="font-mono text-sm font-black text-slate-200">
      {perf.roundPlacement !== null ? `#${perf.roundPlacement}` : '—'}
    </span>
  )}
</div>
              {/* Cover */}
              <img
                src={perf.coverUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-10 w-20 shrink-0 rounded-sm object-cover"
              />

              {/* Map information */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-black text-white">
                  {perf.title}
                </div>

                <div className="mt-0.5 truncate text-[9px] text-slate-400">
                  {perf.artist}
                  <span className="mx-1.5 text-slate-700">•</span>
                  mapped by [{perf.mapper}]
                </div>
              </div>

                {/* Performance information */}
              <div className="shrink-0 text-right">
                <div className="font-mono text-[11px] font-black text-[#f0c86b]">
                  {perf.finalDzpp} dzpp
                </div>

                <div className="mt-1 font-mono text-[9px] text-slate-400">
  {perf.accuracy.toFixed(2)}%
  <span className="mx-1.5 text-slate-700">•</span>
  {perf.mods || 'NM'}
</div>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 flex w-full items-center justify-center gap-1 py-1.5 text-[9px] font-bold text-slate-500"
            >
              {expanded ? 'Show less' : 'See all'}
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}


export function History({ rounds }: { rounds: ApiPlayerDzppRound[] }) {
  const [expanded, setExpanded] = useState(false);
const history = rounds.flatMap((round) =>
  round.maps.map((map) => ({
    ...map,
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    year: round.year,
    month: round.month,
  })),
);

  const visible = expanded ? history : history.slice(0, 5);
  const hasMore = history.length > 5;

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#292d45] bg-[#0d1220]">
      <SectionHeader
        title="Recent"
        count={`${history.length} scores`}
        action={hasMore ? (expanded ? 'Show less' : 'See all') : undefined}
        onAction={() => setExpanded((value) => !value)}
      />

      <div className="overflow-hidden bg-[#0a0f1a] p-2">
        {history.length === 0 ? (
          <EmptyState message="No finalized score history yet." />
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {visible.map((map) => (
              <div
                key={`${map.roundId}-${map.submissionId}`}
                className="flex h-[54px] min-w-0 items-center gap-2 rounded-md border border-[#292d45] bg-[#0a0f1a] px-2"
              >
                <span className="w-[62px] shrink-0 font-mono text-[9px] text-slate-400 sm:w-[72px]">
                  {new Date(
                    map.year,
                    Number(map.month) - 1,
                    1,
                  ).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </span>

                <div className="relative min-w-0 flex-1 overflow-hidden rounded-sm">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-cover bg-center opacity-60"
                    style={{ backgroundImage: `url(${map.coverUrl})` }}
                  />
                  <div className="absolute inset-0 bg-[#0a0f1a]/55" />
                  <div className="relative min-w-0 px-1.5 py-1">
                    <div className="truncate text-[11px] font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {map.title}
                    </div>
                    <div className="truncate text-[9px] text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {map.artist} · [{map.difficultyName}]
                    </div>
                  </div>
                </div>

                <span className="w-[35px] shrink-0 truncate font-mono text-[9px] font-bold text-slate-400 sm:w-[42px]">
                  R{map.roundNumber}
                </span>

                <span
                  className={`w-[38px] shrink-0 text-center font-mono text-sm font-black sm:w-[42px] ${
                    map.placement === 1
                      ? 'text-[#f0c86b] drop-shadow-[0_0_6px_rgba(240,200,107,0.55)]'
                      : map.placement === 2
                        ? 'text-slate-300 drop-shadow-[0_0_6px_rgba(203,213,225,0.45)]'
                        : map.placement === 3
                          ? 'text-orange-300 drop-shadow-[0_0_6px_rgba(253,186,116,0.45)]'
                          : 'text-slate-500'
                  }`}
                >
                  {map.placement ?? '—'}
                </span>

                <span className="w-[48px] shrink-0 truncate text-right font-mono text-[9px] font-black text-[#f0c86b] sm:w-[52px]">
                  {map.finalDzpp} dzpp
                </span>
              </div>
            ))}

            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="flex w-full items-center justify-center gap-1 border-t border-[#292d45] py-2 text-[9px] font-bold text-slate-500 transition hover:text-slate-300"
              >
                {expanded ? 'Show less' : 'See all'}
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
function WonBeatmapCard({
  win,
  challenge,
  onGift,
}: {
  win: WonChallengeMap | ApiChallengeCollectionItem;
  challenge: ApiChallengeBeatmap | null;
  onGift?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const beatmap: Beatmap = {
    id: String(win.submissionId),
    difficultyId: challenge?.difficultyId ?? win.difficultyId,
    title: win.title,
    artist: win.artist,
    mapper: win.mapper,
    difficultyName: win.difficultyName,
    stars: challenge?.stars ?? ('stars' in win ? win.stars : 0),
    bpm: challenge?.bpm ?? ('bpm' in win ? win.bpm : 0),
    length: challenge?.length ?? ('length' in win ? win.length : '—'),
    status: (challenge?.mapStatus ?? ('mapStatus' in win ? win.mapStatus : 'ranked')) as Beatmap['status'],
    coverUrl: challenge?.coverUrl ?? win.coverUrl,
    previewUrl: challenge?.previewUrl ?? ('previewUrl' in win ? win.previewUrl : undefined),
    cs: 'cs' in win ? win.cs ?? undefined : undefined,
    ar: 'ar' in win ? win.ar ?? undefined : undefined,
    od: 'od' in win ? win.od ?? undefined : undefined,
    hp: 'hp' in win ? win.hp ?? undefined : undefined,
    modRequirement: win.modRequirement,
    challengeType: win.challengeRequirement,
  };

  return (
    <div className="relative min-w-0 w-full overflow-hidden">
      <BeatmapCard
        beatmap={beatmap}
        isPlaying={playing}
        audioProgress={progress}
        onTogglePlay={() => setPlaying((value) => !value)}
        onScrubAudio={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setProgress(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
        }}
        onVote={() => undefined}
        onFavorite={() => undefined}
        showVoteButton={false}
        showCommentsButton={false}
        isCollectionCard
        collectionDzpp={'finalDzpp' in win ? win.finalDzpp : undefined}
        collectionPerfectionEligible={'perfectionEligible' in win ? win.perfectionEligible : false}
        onGift={onGift}
      />
    </div>
  );
}

export function ChallengeCollection({
  wins,
  loading,
  canGift,
  onGift,
}: {
  wins: Array<WonChallengeMap | ApiChallengeCollectionItem>;
  loading: boolean;
  canGift: (win: WonChallengeMap | ApiChallengeCollectionItem) => boolean;
  onGift: (win: WonChallengeMap | ApiChallengeCollectionItem) => void;
}) {
  const [startIndex, setStartIndex] = useState(0);

  if (loading) {
    return <LoadingState message="Loading challenge collection…" />;
  }

  if (wins.length === 0) {
    return <EmptyState message="No challenge beatmaps won yet." />;
  }

  const visibleCount = 4;
  const canScrollLeft = startIndex > 0;
  const canScrollRight = startIndex + visibleCount < wins.length;

  const visibleWins = wins.slice(startIndex, startIndex + visibleCount);

  return (
    <div className="relative min-w-0">
      <div className="grid min-w-0 grid-cols-4 gap-3">
          {visibleWins.map((win) => (
            <WonBeatmapCard
            key={`${win.roundId}-${win.submissionId}`}
              win={win}
              challenge={'challenge' in win ? win.challenge : null}
              onGift={canGift(win) ? () => onGift(win) : undefined}
            />
        ))}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => setStartIndex((index) => Math.max(0, index - 1))}
          className="absolute left-1 top-1/2 z-30 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#41465f] bg-[#0b101c]/95 text-slate-300 shadow-lg backdrop-blur-sm transition hover:border-[#e879f9]/60 hover:bg-[#111827] hover:text-white"
          aria-label="Previous challenge wins"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() =>
            setStartIndex((index) =>
              Math.min(wins.length - visibleCount, index + 1),
            )
          }
          className="absolute right-1 top-1/2 z-30 flex h-8 w-8 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#41465f] bg-[#0b101c]/95 text-slate-300 shadow-lg backdrop-blur-sm transition hover:border-[#e879f9]/60 hover:bg-[#111827] hover:text-white"
          aria-label="Next challenge wins"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ShopCollection({ ownedItems, equippedIds }: { ownedItems: ApiPlayerShopItem[]; equippedIds: Map<string, string> }) {
  const [tab, setTab] = useState<ShopCategoryTab>('frame');
  const availableTabs = CATEGORY_ORDER.filter((category) => ownedItems.some((item) => item.category === category));
  const activeTab = tab !== 'all' && !availableTabs.includes(tab) ? (availableTabs[0] ?? 'all') : tab;
  const items = activeTab === 'all' ? ownedItems : ownedItems.filter((item) => item.category === activeTab);

  return (
    <section className="mt-4 overflow-hidden rounded-md border border-[#292d45] bg-[#0d1220]">
      <SectionHeader title="Shop Collection" count={`${ownedItems.length} owned`} />
      <div className="flex gap-1 overflow-x-auto border-b border-[#292d45] px-3">
        {([...availableTabs, 'all'] as ShopCategoryTab[]).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setTab(category)}
            className={`shrink-0 border-b-2 px-3 py-2 text-[9px] font-black uppercase tracking-wider transition ${activeTab === category ? 'border-fuchsia-400 text-fuchsia-300' : 'border-transparent text-slate-600 hover:text-slate-300'}`}
          >
            {category === 'all' ? 'All Items' : CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState message="No Shop items owned yet." />
      ) : (
        <div className="grid min-w-0 grid-cols-2 gap-3 bg-[#0a0f1a] p-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => {
            const equipped = item.profileSlot !== null && equippedIds.get(item.profileSlot) === item.itemId;
            return (
              <div key={item.itemId} className={`overflow-hidden rounded-sm border bg-[#0d1220] ${equipped ? 'border-fuchsia-400/50 shadow-[0_0_16px_rgba(232,121,249,0.12)]' : 'border-slate-800'}`}>
                <div className="relative aspect-[1.35/1] bg-slate-950">
                  {item.category === 'title' ? (
                    <div className="flex h-full items-center justify-center bg-slate-950 px-3">
                      <TitleRenderer
                        title={item}
                        size="sm"
                        className="max-w-full"
                      />
                    </div>
                  ) : item.artwork ? (
                    <img src={item.artwork.url} alt={item.artwork.altText} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center font-mono text-[8px] uppercase tracking-wider text-slate-700">No artwork</div>
                  )}
                  {equipped && (
                    <span className="absolute right-1 top-1 inline-flex items-center gap-1 border border-emerald-300/40 bg-emerald-400 px-1.5 py-0.5 text-[7px] font-black uppercase text-slate-950">
                      <Check className="h-2 w-2" /> Equipped
                    </span>
                  )}
                </div>
                <div className="px-2 py-2">
                  <div className="truncate text-[9px] font-bold text-white">{item.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[7px] text-slate-600">{CATEGORY_LABELS[item.category]}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

