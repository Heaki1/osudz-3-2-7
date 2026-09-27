/**
 * Public osu!DZ player profile.
 *
 * The page is intentionally styled like the supplied osu!-style profile reference:
 * a compact profile banner, rectangular challenge badges, three-column career area,
 * history + challenge collection, and a separate Shop collection.
 *
 * All ranking/DZPP values are server-provided. The client never recomputes DZPP.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  ExternalLink,
  Package,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { BeatmapCard } from '../BeatmapCard';
import type { Beatmap } from '../../types';
import {
  api,
  type ApiChallengeBeatmap,
  type ApiPlayerDzppMap,
  type ApiPlayerDzppRound,
  type ApiPlayerProfile,
  type ApiPlayerShopItem,
} from '../../api/client';
import { averagePlacement } from '../../lib/rankings';
import type { ItemCategory, ShopProfile } from './shop.types';

export interface PlayerProfilePageProps {
  username: string;
  onBack?: () => void;
}

interface FlatPerformance extends ApiPlayerDzppMap {
  roundId: number;
  roundNumber: number;
  month: string;
  year: number;
  roundPlacement: number | null;
}

interface WonChallengeMap extends ApiPlayerDzppMap {
  roundId: number;
  roundNumber: number;
  month: string;
  year: number;
  challenge: ApiChallengeBeatmap | null;
}

type ShopCategoryTab = ItemCategory | 'all';

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

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '';
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function ProfileAvatar({
  username,
  avatarUrl,
  size,
  className = '',
}: {
  username: string;
  avatarUrl: string;
  size: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        style={{ width: size, height: size }}
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex items-center justify-center bg-slate-950 ${className}`}
    >
      <span className="text-xl font-black text-slate-500">
        {username.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

function SectionHeader({
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
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-[12px] font-black uppercase tracking-[0.19em] text-white">
          {title}
        </h2>
        {count && <span className="font-mono text-[9px] text-slate-600">{count}</span>}
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1 text-[9px] font-bold text-slate-500 transition hover:text-white"
        >
          {action} <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function PlacementBadge({ placement }: { placement: number | null }) {
  if (placement === null) return <span className="text-slate-600">—</span>;
  const className = placement === 1
    ? 'border-amber-300/40 bg-amber-300/10 text-amber-300'
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

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 border border-slate-800 bg-[#0c1424] text-slate-600">
      <RefreshCw className="h-6 w-6 animate-spin text-amber-300/60" />
      <span className="font-mono text-[10px]">{message}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center border border-dashed border-slate-800 bg-[#0c1424] px-4 text-center font-mono text-[10px] text-slate-700">
      {message}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 border border-rose-500/20 bg-rose-500/[0.025] text-rose-300">
      <AlertCircle className="h-7 w-7" />
      <span className="font-mono text-[10px]">{message}</span>
    </div>
  );
}

function ProfileHeader({
  profile,
  shopProfile,
}: {
  profile: ApiPlayerProfile;
  shopProfile: ShopProfile | null;
}) {
  const equipped = new Map(
    shopProfile?.equipped.map((item) => [item.profileSlot, item]) ?? [],
  );
  const title = equipped.get('title');
  const badge = equipped.get('badge');
  const frame = equipped.get('frame');
  const decoration = equipped.get('username_decoration');

  return (
    <section className="mb-5 overflow-hidden border border-slate-800 bg-[#09101d] shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
      <div className="relative min-h-[210px] overflow-hidden">
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center blur-[2px]"
          style={{ backgroundImage: `url(${profile.avatarUrl})` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07101e]/98 via-[#0a1322]/88 to-[#09101d]/48" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09101d] via-transparent to-black/15" />

        <div className="relative z-10 flex min-h-[210px] items-center gap-5 p-4 sm:gap-7 sm:p-5 lg:p-6">
          <div className="relative hidden shrink-0 sm:block">
            <div className="relative h-[132px] w-[132px] border border-amber-300/70 bg-slate-950 p-1 shadow-[0_0_28px_rgba(251,191,36,0.18)] sm:h-[148px] sm:w-[148px]">
              <ProfileAvatar
                username={profile.username}
                avatarUrl={profile.avatarUrl}
                size={138}
                className="h-full w-full"
              />
              {frame?.artwork && (
                <img
                  src={frame.artwork.url}
                  alt={frame.artwork.altText}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 self-center">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-3xl font-black tracking-tight text-white sm:text-4xl">
                {profile.username}
              </h1>
              {title && <Crown className="h-5 w-5 text-amber-300" />}
            </div>

            {title && (
              <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                {title.name}
              </div>
            )}

            <div className="mt-1 text-[9px] font-medium tracking-wide text-slate-400">
              {profile.country ? `${flagEmoji(profile.country)} ${profile.country}` : 'osu!DZ player'}
              {profile.globalRank !== null && (
                <span className="ml-2 text-slate-600">
                  · osu! #{profile.globalRank.toLocaleString()}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {profile.country && (
                <span className="inline-flex items-center gap-1.5 border border-slate-700 bg-black/25 px-2 py-1 text-[10px] font-bold text-slate-300">
                  <span className="text-sm">{flagEmoji(profile.country)}</span>
                  {profile.country}
                </span>
              )}
              {decoration?.artwork && (
                <img
                  src={decoration.artwork.url}
                  alt={decoration.artwork.altText}
                  className="h-7 w-16 border border-slate-700 object-cover"
                />
              )}
              {badge?.artwork && (
                <span className="inline-flex items-center gap-1.5 border border-amber-400/25 bg-black/25 px-2 py-1 text-[9px] font-bold text-amber-200">
                  <img src={badge.artwork.url} alt={badge.artwork.altText} className="h-5 w-5 object-cover" />
                  {badge.name}
                </span>
              )}
              <a
                href={`https://osu.ppy.sh/users/${profile.osuId}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 border border-slate-700 bg-black/25 px-2 py-1 text-[9px] font-bold text-slate-400 transition hover:border-slate-500 hover:text-white"
              >
                osu! <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="mt-5 flex flex-wrap items-center">
              <ProfileNumber label="DZ Rank" value={profile.dzppRank !== null ? `#${profile.dzppRank}` : '—'} />
              <ProfileNumber label="DZPP" value={profile.dzpp.toLocaleString()} accent />
              <ProfileNumber
                label="osu! Rank"
                value={profile.globalRank !== null ? `#${profile.globalRank.toLocaleString()}` : '—'}
              />
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}

function ChallengeBadgeBar({ wins }: { wins: WonChallengeMap[] }) {
  return (
    <section className="mb-5 overflow-hidden border border-slate-800 bg-[#0a111f]">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <Award className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Challenge Badges</span>
        <span className="font-mono text-[9px] text-slate-600">{wins.length}</span>
      </div>
      {wins.length === 0 ? (
        <div className="px-4 py-3 font-mono text-[9px] text-slate-700">
          Win a challenge beatmap to earn a permanent badge.
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto px-3 py-3">
          {wins.map((win) => (
            <div
              key={`${win.roundId}-${win.submissionId}`}
              title={`${win.title} — ${win.difficultyName}`}
              className="group relative h-12 w-[92px] shrink-0 overflow-hidden border border-amber-300/55 bg-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.16)]"
            >
              <img src={win.coverUrl} alt={win.title} referrerPolicy="no-referrer" className="h-full w-full object-cover transition group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 truncate bg-black/35 px-1 py-0.5 text-[7px] font-black text-amber-100">
                #1 · R{win.roundNumber}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileNumber({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border-l border-slate-700 px-5 first:border-l-0 first:pl-0">
      <div className={`font-mono text-xl font-black ${accent ? 'text-amber-300' : 'text-white'}`}>{value}</div>
      <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-600">{label}</div>
    </div>
  );
}

function CareerStats({ profile, rounds }: { profile: ApiPlayerProfile; rounds: ApiPlayerDzppRound[] }) {
  const average = averagePlacement(rounds);
  const stats = [
    ['Total DZPP', profile.dzpp.toLocaleString(), true],
    ['DZ Rank', profile.dzppRank !== null ? `#${profile.dzppRank}` : '—', false],
    ['Rounds Played', String(profile.roundsPlayed), false],
    ['Wins', String(profile.firstPlaces), profile.firstPlaces > 0],
    ['Best Placement', profile.bestPlacement !== null ? `#${profile.bestPlacement}` : '—', false],
    ['Average Place', average === null ? '—' : `#${average}`, false],
  ] as const;

  return (
    <section className="min-w-0">
      <SectionHeader title="Career Statistics" />
      <div className="grid grid-cols-2 gap-px overflow-hidden border-y border-slate-800 bg-slate-800 md:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value, accent]) => (
          <div key={label} className={`min-h-[68px] bg-[#0d1526] px-3 py-3 ${accent ? 'bg-amber-300/[0.035]' : ''}`}>
            <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">{label}</div>
            <div className={`mt-2 font-mono text-lg font-black ${accent ? 'text-amber-300' : 'text-white'}`}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopPlays({ performances }: { performances: FlatPerformance[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? performances : performances.slice(0, 5);

  return (
    <section className="min-w-0">
      <SectionHeader
        title="Top Plays"
        count={`${performances.length} / 100`}
        action={performances.length > 5 ? (showAll ? 'Collapse' : 'See all') : undefined}
        onAction={() => setShowAll((value) => !value)}
      />
      {performances.length === 0 ? (
        <EmptyState message="No finalized performances yet." />
      ) : (
        <div className="overflow-hidden border border-slate-800 bg-[#0d1526]">
          {visible.map((perf, index) => {
            const key = `${perf.roundId}-${perf.submissionId}`;
            return (
              <div key={key} className={`border-b border-slate-800/70 last:border-0 ${index === 0 ? 'bg-amber-300/[0.035]' : ''}`}>
                <div className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                  <span className={`w-7 shrink-0 text-center font-mono text-[9px] font-black ${
                    index === 0 ? 'text-amber-300' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-slate-600'
                  }`}>
                    {index === 0 ? <Crown className="mx-auto h-3.5 w-3.5" /> : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`}
                  </span>
                  <img src={perf.coverUrl} alt="" referrerPolicy="no-referrer" className="h-9 w-14 shrink-0 object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-bold text-white">{perf.title}</span>
                    <span className="mt-0.5 block truncate text-[8px] text-slate-600">{perf.artist} · [{perf.difficultyName}] · {perf.mods || 'NM'}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[10px] font-black text-amber-300">+{perf.finalDzpp}</span>
                    <span className="block text-[8px] text-slate-600"><PlacementBadge placement={perf.placement} /></span>
                  </span>
                </div>
              </div>
            );
          })}
          {performances.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="flex w-full items-center justify-center gap-1 border-t border-slate-800 bg-slate-950/30 py-2 text-[9px] font-bold text-slate-500 transition hover:text-white"
            >
              {showAll ? 'Show fewer' : `Show all ${performances.length}`} <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function History({ rounds }: { rounds: ApiPlayerDzppRound[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rounds : rounds.slice(0, 6);

  return (
    <section className="min-w-0">
      <SectionHeader
        title="History"
        count={`${rounds.length} rounds`}
        action={rounds.length > 6 ? (showAll ? 'Collapse' : 'See all') : undefined}
        onAction={() => setShowAll((value) => !value)}
      />
      <div className="overflow-hidden border border-slate-800 bg-[#0d1526]">
        <div className="hidden grid-cols-[90px_minmax(0,1fr)_78px_70px] border-b border-slate-800 bg-slate-950/30 px-3 py-2 font-mono text-[7px] uppercase tracking-widest text-slate-700 sm:grid">
          <span>Date</span><span>Round</span><span>Placement</span><span className="text-right">DZPP</span>
        </div>
        {visible.length === 0 ? (
          <EmptyState message="No finalized round history yet." />
        ) : visible.map((round) => {
          const open = expanded === round.roundId;
          return (
            <React.Fragment key={round.roundId}>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : round.roundId)}
                className="grid w-full grid-cols-[72px_minmax(0,1fr)_60px_55px_16px] items-center gap-2 border-b border-slate-800/70 px-3 py-2.5 text-left transition hover:bg-slate-800/25 sm:grid-cols-[90px_minmax(0,1fr)_78px_70px_16px]"
              >
                <span className="font-mono text-[8px] text-slate-500">{new Date(round.year, Number(round.month) - 1, 1).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit' })}</span>
                  <span className="min-w-0 truncate text-[9px] font-bold text-white">
                    {round.maps[0]?.title ?? `Round ${round.roundNumber}`} · R{round.roundNumber}
                  </span>
                <PlacementBadge placement={round.placement} />
                <span className="text-right font-mono text-[9px] font-black text-amber-300">+{round.finalDzpp}</span>
                <ChevronDown className={`h-3 w-3 text-slate-700 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="border-b border-slate-800 bg-black/10 px-3 py-2">
                  {round.maps.map((map) => (
                    <div key={`${round.roundId}-${map.submissionId}`} className="flex items-center gap-2 border-b border-slate-800/50 py-2 last:border-0">
                      <img src={map.coverUrl} alt="" referrerPolicy="no-referrer" className="h-7 w-11 shrink-0 object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[9px] font-bold text-slate-200">{map.title}</div>
                        <div className="truncate text-[7px] text-slate-600">{map.artist} · [{map.difficultyName}]</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[9px] font-black text-amber-300">+{map.finalDzpp}</div>
                        <div className="mt-0.5"><PlacementBadge placement={map.placement} /></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
        {rounds.length > 6 && (
          <button type="button" onClick={() => setShowAll((value) => !value)} className="w-full border-t border-slate-800 py-2 text-[9px] font-bold text-slate-600 hover:text-white">
            {showAll ? 'Show fewer' : `See all ${rounds.length} rounds`}
          </button>
        )}
      </div>
    </section>
  );
}

function WonBeatmapCard({ win, challenge }: { win: WonChallengeMap; challenge: ApiChallengeBeatmap | null }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const beatmap: Beatmap = {
    id: String(win.submissionId),
    difficultyId: challenge?.difficultyId ?? win.difficultyId,
    title: win.title,
    artist: win.artist,
    mapper: win.mapper,
    difficultyName: win.difficultyName,
    stars: challenge?.stars ?? 0,
    bpm: challenge?.bpm ?? 0,
    length: challenge?.length ?? '—',
    status: (challenge?.mapStatus as Beatmap['status']) ?? 'ranked',
    coverUrl: challenge?.coverUrl ?? win.coverUrl,
    previewUrl: challenge?.previewUrl,
    modRequirement: win.modRequirement,
    challengeType: win.challengeRequirement,
  };

  return (
    <div className="relative min-w-0">
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
      />
      <div className="pointer-events-none absolute right-3 top-3 z-20 border border-amber-300/70 bg-[#120f08]/90 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-amber-200">
        Winner
      </div>
    </div>
  );
}

function ChallengeCollection({
  wins,
  loading,
}: {
  wins: WonChallengeMap[];
  loading: boolean;
}) {
  if (loading) return <LoadingState message="Loading challenge collection…" />;
  if (wins.length === 0) return <EmptyState message="No challenge beatmaps won yet." />;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {wins.map((win) => (
        <WonBeatmapCard
          key={`${win.roundId}-${win.submissionId}`}
          win={win}
          challenge={win.challenge}
        />
      ))}
    </div>
  );
}

function ShopItemCard({
  item,
  equipped,
}: {
  item: ApiPlayerShopItem;
  equipped: boolean;
}) {
  return (
    <div
      className={`group overflow-hidden border bg-[#0b1322] transition ${
        equipped
          ? 'border-fuchsia-400/60 shadow-[0_0_18px_rgba(232,121,249,0.14)]'
          : 'border-slate-800 hover:border-slate-600'
      }`}
    >
      <div className="relative aspect-[1.28/1] overflow-hidden bg-[#070d18]">
        {item.artwork ? (
          <img
            src={item.artwork.url}
            alt={item.artwork.altText}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[8px] uppercase tracking-widest text-slate-700">
            No artwork
          </div>
        )}

        {equipped && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 border border-emerald-300/40 bg-emerald-400 px-1.5 py-1 text-[7px] font-black uppercase tracking-wide text-slate-950">
            <Check className="h-2.5 w-2.5" />
            Equipped
          </span>
        )}
      </div>

      <div className="border-t border-slate-800 px-2.5 py-2">
        <div className="truncate text-[9px] font-bold text-white">{item.name}</div>
        <div className="mt-0.5 truncate font-mono text-[7px] uppercase tracking-wider text-slate-600">
          {CATEGORY_LABELS[item.category]}
        </div>
      </div>
    </div>
  );
}

function Collection({
  ownedItems,
  equippedIds,
  wins,
  challengeLoading,
}: {
  ownedItems: ApiPlayerShopItem[];
  equippedIds: Map<string, string>;
  wins: WonChallengeMap[];
  challengeLoading: boolean;
}) {
  type CollectionTab = 'shop' | 'wins' | 'all';
  const [tab, setTab] = useState<CollectionTab>('wins');

  const shopItems = ownedItems;
  const challengeItems = wins;

  return (
    <section className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-fuchsia-300" />
          <h2 className="text-[12px] font-black uppercase tracking-[0.19em] text-white">
            Collection
          </h2>
          <span className="font-mono text-[9px] text-slate-600">
            {shopItems.length + challengeItems.length}
          </span>
        </div>

        <div className="flex overflow-hidden border border-slate-800 bg-[#0b1322]">
          {([
            ['shop', 'Shop Items', shopItems.length],
            ['wins', 'Challenge Beatmaps Won', challengeItems.length],
            ['all', 'All Items', shopItems.length + challengeItems.length],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`border-l border-slate-800 px-2.5 py-1.5 text-[8px] font-black transition first:border-l-0 sm:px-3 ${
                tab === value
                  ? 'bg-fuchsia-400/10 text-fuchsia-300'
                  : 'text-slate-600 hover:bg-slate-800/40 hover:text-slate-300'
              }`}
            >
              {label} <span className="ml-1 font-mono opacity-60">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'shop' && (
        shopItems.length === 0 ? (
          <EmptyState message="No Shop items owned yet." />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {shopItems.map((item) => (
              <ShopItemCard
                key={item.itemId}
                item={item}
                equipped={
                  item.profileSlot !== null &&
                  equippedIds.get(item.profileSlot) === item.itemId
                }
              />
            ))}
          </div>
        )
      )}

      {tab === 'wins' && (
        <ChallengeCollection wins={challengeItems} loading={challengeLoading} />
      )}

      {tab === 'all' && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
              Shop items
            </div>
            {shopItems.length === 0 ? (
              <EmptyState message="No Shop items owned yet." />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {shopItems.map((item) => (
                  <ShopItemCard
                    key={item.itemId}
                    item={item}
                    equipped={
                      item.profileSlot !== null &&
                      equippedIds.get(item.profileSlot) === item.itemId
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
              Challenge beatmaps won
            </div>
            <ChallengeCollection wins={challengeItems} loading={challengeLoading} />
          </div>
        </div>
      )}
    </section>
  );
}

export default function PlayerProfilePage({ username, onBack }: PlayerProfilePageProps) {
  const [profile, setProfile] = useState<ApiPlayerProfile | null>(null);
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const [rounds, setRounds] = useState<ApiPlayerDzppRound[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
  const [ownedItems, setOwnedItems] = useState<ApiPlayerShopItem[]>([]);
  const [ownedFailed, setOwnedFailed] = useState(false);
  const [challengeWins, setChallengeWins] = useState<WonChallengeMap[]>([]);
  const [challengeLoading, setChallengeLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setProfile(null);
    setProfileState('loading');
    setRounds(null);
    setHistoryFailed(false);
    setShopProfile(null);
    setOwnedItems([]);
    setOwnedFailed(false);
    setChallengeWins([]);
    setChallengeLoading(false);

    void api.players.profile(username).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setProfileState(result.status === 404 ? 'not_found' : 'error');
        return;
      }
      setProfile(result.data);
      setProfileState('ready');
    });

    return () => {
      live = false;
    };
  }, [username]);

  useEffect(() => {
    if (!profile) return;
    let live = true;

    void api.rankings.player(profile.userId, 'all-time').then((result) => {
      if (!live) return;
      setRounds(result.ok ? result.data : null);
      setHistoryFailed(!result.ok);
    });

    void api.shop.publicProfile(profile.userId).then((result) => {
      if (live && result.ok) setShopProfile(result.data);
    });

    void api.players.ownedItems(profile.userId).then((result) => {
      if (!live) return;
      setOwnedItems(result.ok ? result.data : []);
      setOwnedFailed(!result.ok);
    });

    return () => {
      live = false;
    };
  }, [profile?.userId]);

  const top100 = useMemo<FlatPerformance[]>(() => {
    if (!rounds) return [];
    return rounds
      .flatMap((round) => round.maps.map((map) => ({
        ...map,
        roundId: round.roundId,
        roundNumber: round.roundNumber,
        month: round.month,
        year: round.year,
        roundPlacement: round.placement,
      })))
      .sort((a, b) => b.finalDzpp - a.finalDzpp)
      .slice(0, 100);
  }, [rounds]);

  const winningMaps = useMemo<WonChallengeMap[]>(() => {
    if (!rounds) return [];
    const seen = new Set<string>();
    const wins: WonChallengeMap[] = [];
    for (const round of rounds) {
      for (const map of round.maps) {
        if (map.placement !== 1) continue;
        const key = `${round.roundId}-${map.submissionId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        wins.push({
          ...map,
          roundId: round.roundId,
          roundNumber: round.roundNumber,
          month: round.month,
          year: round.year,
          challenge: null,
        });
      }
    }
    return wins;
  }, [rounds]);

  useEffect(() => {
    if (winningMaps.length === 0) {
      setChallengeWins([]);
      setChallengeLoading(false);
      return;
    }

    let live = true;
    setChallengeLoading(true);
    const roundIds = [...new Set(winningMaps.map((win) => win.roundId))];

    void Promise.all(roundIds.map(async (roundId) => {
      const result = await api.challenge.beatmaps(roundId);
      return [roundId, result.ok ? result.data : []] as const;
    })).then((results) => {
      if (!live) return;
      const bySubmission = new Map<number, ApiChallengeBeatmap>();
      for (const [, maps] of results) {
        for (const map of maps) bySubmission.set(map.submissionId, map);
      }
      setChallengeWins(winningMaps.map((win) => ({
        ...win,
        challenge: bySubmission.get(win.submissionId) ?? null,
      })));
      setChallengeLoading(false);
    });

    return () => {
      live = false;
    };
  }, [winningMaps]);

  const equippedIds = useMemo(
    () => new Map(shopProfile?.equipped.map((item) => [item.profileSlot, item.itemId]) ?? []),
    [shopProfile],
  );

  const displayedChallengeWins = challengeWins.length > 0 ? challengeWins : winningMaps;

  if (profileState === 'loading') {
    return <div className="min-h-full px-4 py-20"><LoadingState message="Loading profile…" /></div>;
  }

  if (profileState === 'not_found') {
    return (
      <div className="mx-auto flex min-h-full max-w-xl items-center justify-center px-6 py-20">
        <div className="w-full border border-slate-800 bg-[#0d1526] p-8 text-center">
          {onBack && <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back</button>}
          <Trophy className="mx-auto mb-4 h-12 w-12 text-slate-700" />
          <div className="font-black text-white">{username}</div>
          <p className="mt-2 text-sm text-slate-500">No osu!DZ account with this username was found.</p>
        </div>
      </div>
    );
  }

  if (profileState === 'error' || !profile) {
    return (
      <div className="mx-auto flex min-h-full max-w-xl items-center justify-center px-6 py-20">
        <div className="w-full border border-rose-500/20 bg-rose-500/[0.025] p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-rose-400" />
          <div className="font-black text-rose-300">Could not load this profile</div>
          <p className="mt-2 text-xs text-rose-300/70">Check your connection and try again.</p>
          {onBack && <button type="button" onClick={onBack} className="mt-5 bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Go back</button>}
        </div>
      </div>
    );
  }

  const roundsReady = rounds !== null;

  return (
    <main className="mx-auto max-w-7xl px-3 py-4 pb-16 text-slate-100 sm:px-5 lg:px-7">
      {onBack && (
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 transition hover:text-white">
          <ArrowLeft className="h-3 w-3" /> Back to Rankings
        </button>
      )}

      <ProfileHeader profile={profile} shopProfile={shopProfile} />
      <ChallengeBadgeBar wins={displayedChallengeWins} />

      {!roundsReady || historyFailed ? (
        historyFailed ? <ErrorState message="Could not load the player's challenge history." /> : <LoadingState message="Loading challenge history…" />
      ) : (
        <>
          <div className="mb-5 space-y-5">
            <CareerStats profile={profile} rounds={rounds} />
            <TopPlays performances={top100} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.05fr_2fr]">
            <History rounds={rounds} />
            <Collection
              ownedItems={ownedItems}
              equippedIds={equippedIds}
              wins={displayedChallengeWins}
              challengeLoading={challengeLoading && displayedChallengeWins.length === 0}
            />
          </div>

          {ownedFailed && (
            <p className="mt-2 text-[9px] font-mono text-rose-400/70">Shop collection could not be loaded.</p>
          )}
        </>
      )}

      <p className="mt-8 text-center font-mono text-[8px] text-slate-700">
        DZPP is earned through osu!DZ monthly challenges and is distinct from osu! global pp.
      </p>
    </main>
  );
}

export function parseProfileUrl(pathname: string): string | null {
  const match = /^\/player\/(.+)$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function profileUrl(username: string): string {
  return `/player/${encodeURIComponent(username)}`;
}
