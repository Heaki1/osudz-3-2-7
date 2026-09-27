/**
 * ShopPage
 * Compact, profile-first DZP shop.
 *
 * Design principles:
 * - Keep the page narrow and information-dense.
 * - The player's equipped identity is the anchor, not a giant hero.
 * - Purchase / steal is always available directly on an item card.
 * - Details are secondary and only open when needed.
 * - Pricing and ownership decisions remain server/service authoritative.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ApiPlayerProfile } from '../../../api/client';
import {
  ARTWORK_ASPECT_RATIO,
  ShopError,
  type DzpLedgerEntry,
  type ItemCategory,
  type OwnershipTransfer,
  type ShopItem,
  type ShopProfile,
  type ShopSnapshot,
  type TransactionResult,
} from './shop.types';
import {
  deriveViewerState,
  isVisibleInShop,
  type ViewerStateResult,
} from '../viewerState';
import { TitleRenderer } from '../TitleRenderer';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  title: 'Titles',
  badge: 'Badges',
  frame: 'Frames',
  username_decoration: 'Username',
  profile_decoration: 'Profile',
};

const SLOT_LABELS: Record<Exclude<ShopItem['profileSlot'], null>, string> = {
  frame: 'Frame',
  title: 'Title',
  badge: 'Badge',
  username_decoration: 'Username',
};

const SLOT_HINTS: Record<Exclude<ShopItem['profileSlot'], null>, string> = {
  frame: 'Avatar frame',
  title: 'Profile title',
  badge: 'Profile badge',
  username_decoration: 'Name treatment',
};

function categoryLabel(category: ItemCategory) {
  return CATEGORY_LABELS[category];
}

function formatDzp(value: number) {
  return value.toLocaleString();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const TRANSACTION_LABELS: Record<
  DzpLedgerEntry['transactionType'],
  string
> = {
  challenge_reward: 'Challenge reward',
  challenge_reward_adjustment: 'Reward correction',
  purchase: 'Purchase',
  steal_purchase: 'Steal',
  steal_compensation: 'Steal compensation',
  refund: 'Refund',
  admin_adjustment: 'Admin adjustment',
};

function apiError(err: unknown): string {
  if (err instanceof ShopError) {
    switch (err.code) {
      case 'INSUFFICIENT_FUNDS':
        return "You don't have enough DZP.";
      case 'ALREADY_OWNED':
        return 'You already own this item.';
      case 'ITEM_UNAVAILABLE':
        return 'This item is no longer available.';
      case 'ARTWORK_MISSING':
        return "This item's artwork is not ready yet.";
      case 'NOT_STEALABLE':
      case 'NOT_PURCHASABLE':
        return 'This action is not available.';
      case 'NOT_AUTHENTICATED':
        return 'Sign in to continue.';
      case 'ITEM_NOT_FOUND':
        return 'This item no longer exists.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

function Artwork({
  item,
  className = '',
}: {
  item: ShopItem;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-[#080d17] ${className}`}
      style={{ aspectRatio: ARTWORK_ASPECT_RATIO }}
    >
      {item.artwork ? (
        <img
          src={item.artwork.url}
          alt={item.artwork.altText}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] font-black uppercase tracking-[0.14em] text-slate-700">
          Artwork pending
        </div>
      )}
    </div>
  );
}

function StatusPill({ state }: { state: ViewerStateResult['state'] }) {
  const config = {
    available: ['Available', 'border-white/10 bg-white/[0.04] text-slate-400'],
    stealable: ['Stealable', 'border-amber-300/20 bg-amber-400/10 text-amber-200'],
    owned_by_you: ['Owned', 'border-emerald-300/20 bg-emerald-400/10 text-emerald-300'],
    owned_by_other: ['Owned', 'border-white/10 bg-white/[0.03] text-slate-500'],
    insufficient_funds: ['Not enough DZP', 'border-amber-300/20 bg-amber-400/10 text-amber-300'],
    unavailable: ['Unavailable', 'border-white/10 bg-white/[0.03] text-slate-600'],
  } as const;

  const [label, classes] = config[state];

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.13em] ${classes}`}
    >
      {label}
    </span>
  );
}

function MiniIdentity({
  snapshot,
  profile,
  player,
}: {
  snapshot: ShopSnapshot;
  profile: ShopProfile | null;
  player: ApiPlayerProfile | null;
}) {
  const equipped = new Map(
    profile?.equipped.map((entry) => [entry.profileSlot, entry.itemId]) ?? [],
  );

  const getItem = (slot: Exclude<ShopItem['profileSlot'], null>) => {
    const id = equipped.get(slot);
    return id ? snapshot.items.find((item) => item.id === id) ?? null : null;
  };

  const frame = getItem('frame');
  const title = getItem('title');
  const badge = getItem('badge');
  const usernameDecoration = getItem('username_decoration');

  const username = snapshot.viewer?.username ?? player?.username ?? 'Guest';
  const avatarUrl = player?.avatarUrl ?? '';

  const banner = player?.profileBannerUrl ?? '';
  const rankLabel = player?.dzppRank ? `#${player.dzppRank}` : 'Unranked';
  const osuRankLabel = player?.globalRank ? `#${player.globalRank.toLocaleString()}` : 'Unranked';

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#080d17] shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
      {banner ? (
        <img
          src={banner}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-30"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(5,9,18,0.98)_0%,rgba(7,12,23,0.88)_42%,rgba(7,12,23,0.62)_100%)]" />
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-300/[0.09] blur-3xl" />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-[82px] w-[82px] shrink-0">
            {frame?.artwork ? (
              <img
                src={frame.artwork.url}
                alt=""
                className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[102px] w-[102px] -translate-x-1/2 -translate-y-1/2 rounded-full object-contain"
              />
            ) : (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
            )}

            <div className="relative z-10 h-full w-full overflow-hidden rounded-full border-[3px] border-[#050913] bg-[#111827]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={username}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-black text-slate-400">
                  {username.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            {badge?.artwork ? (
              <img
                src={badge.artwork.url}
                alt=""
                className="absolute -bottom-1 -right-2 z-30 h-7 w-7 rounded-lg border border-white/10 object-cover shadow-lg"
              />
            ) : null}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {title ? (
                <TitleRenderer title={title} size="sm" className="max-w-[220px]" />
              ) : (
                <span className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-700">
                  No title equipped
                </span>
              )}
            </div>

            <div
              className={`mt-1 truncate text-xl font-black tracking-tight ${
                usernameDecoration
                  ? 'text-white drop-shadow-[0_0_12px_rgba(250,204,21,0.2)]'
                  : 'text-slate-100'
              }`}
            >
              {username}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-amber-200/80">
                DZ Rank {rankLabel}
              </span>
              <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-slate-500">
                osu! {osuRankLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-[520px]">
          {(
            [
              ['Frame', frame],
              ['Title', title],
              ['Badge', badge],
              ['Name', usernameDecoration],
            ] as const
          ).map(([label, item]) => (
            <div
              key={label}
              className={`min-w-0 rounded-xl border bg-black/20 px-2.5 py-2.5 text-center backdrop-blur-sm ${
                item
                  ? 'border-emerald-300/10'
                  : 'border-white/[0.05]'
              }`}
            >
              <div className="text-[7px] font-black uppercase tracking-[0.1em] text-slate-700">
                {label}
              </div>
              <div
                className={`mt-1 truncate text-[8px] font-bold ${
                  item ? 'text-emerald-300' : 'text-slate-700'
                }`}
              >
                {item?.name ?? 'Empty'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {player ? (
        <div className="relative grid grid-cols-3 border-t border-white/[0.06] bg-black/20">
          {[
            ['DZPP', player.dzpp.toLocaleString()],
            ['Rounds', player.roundsPlayed.toLocaleString()],
            ['Wins', player.firstPlaces.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="border-r border-white/[0.05] px-3 py-3 last:border-r-0">
              <div className="text-[7px] font-black uppercase tracking-[0.14em] text-slate-600">{label}</div>
              <div className="mt-1 font-mono text-sm font-black text-slate-200">{value}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LoadoutBar({
  snapshot,
  profile,
  equippingSlot,
  onEquip,
}: {
  snapshot: ShopSnapshot;
  profile: ShopProfile | null;
  equippingSlot: string | null;
  onEquip: (
    slot: Exclude<ShopItem['profileSlot'], null>,
    itemId: string | null,
  ) => void;
}) {
  const equippedBySlot = new Map(
    profile?.equipped.map((entry) => [entry.profileSlot, entry.itemId]) ?? [],
  );

  const slots: Array<Exclude<ShopItem['profileSlot'], null>> = [
    'frame',
    'title',
    'badge',
    'username_decoration',
  ];

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0a101b] px-3 pb-3 pt-2">
      <div className="mb-2 flex justify-end px-1">
        {profile === null ? (
          <span className="h-4 w-4 animate-spin rounded-full border border-white/10 border-t-amber-300" />
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {slots.map((slot) => {
          const selectedId = equippedBySlot.get(slot) ?? '';
          const selected = selectedId
            ? snapshot.items.find((item) => item.id === selectedId) ?? null
            : null;

          const eligible = snapshot.items.filter((item) => {
            const ownsNormal =
              item.ownershipType === 'normal' &&
              snapshot.ownedItemIds.includes(item.id);
            const ownsStealable =
              item.ownershipType === 'stealable' &&
              item.currentOwner?.userId === snapshot.viewer?.userId;

            return item.profileSlot === slot && (ownsNormal || ownsStealable);
          });

          return (
            <div
              key={slot}
              className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.018] px-2.5 py-2"
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-[#060b13]">
                {selected?.artwork ? (
                  <img
                    src={selected.artwork.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[7px] font-black uppercase text-slate-700">
                    {slot.slice(0, 2)}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[7px] font-black uppercase tracking-[0.12em] text-slate-700">
                  {SLOT_LABELS[slot]}
                </div>
                <select
                  value={selectedId}
                  disabled={equippingSlot === slot}
                  onChange={(event) =>
                    onEquip(slot, event.target.value || null)
                  }
                  className="mt-0.5 w-full min-w-0 appearance-none bg-transparent text-[9px] font-bold text-slate-300 outline-none disabled:opacity-40"
                  aria-label={`Equip ${SLOT_LABELS[slot]}`}
                >
                  <option value="">None equipped</option>
                  {eligible.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  viewerState,
  isOwned,
  equipped,
  onBuy,
  onEquip,
  onDetails,
}: {
  item: ShopItem;
  viewerState: ViewerStateResult;
  isOwned: boolean;
  equipped: boolean;
  onBuy: () => void;
  onEquip: () => void;
  onDetails: () => void;
}) {
  const isStealable = item.ownershipType === 'stealable';
  const canBuy = viewerState.canPurchase || viewerState.canSteal;
  const price = viewerState.actionPriceDzp;

  let actionLabel = isStealable ? 'Steal title' : 'Purchase';
  if (viewerState.state === 'insufficient_funds') actionLabel = 'Need more DZP';
  if (viewerState.state === 'owned_by_you') actionLabel = equipped ? 'Equipped' : 'Equip';
  if (viewerState.state === 'owned_by_other') actionLabel = 'Owned';

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a101b] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-[#0b121f]">
      <button
        type="button"
        onClick={onDetails}
        className="block w-full text-left"
        aria-label={`View details for ${item.name}`}
      >
        <div className="relative">
          <Artwork item={item} className="w-full" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0a101b] to-transparent" />

          <div className="absolute left-2.5 top-2.5">
            <StatusPill state={viewerState.state} />
          </div>

          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
            <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-slate-300 backdrop-blur-md">
              {categoryLabel(item.category)}
            </span>

            {item.profileSlot ? (
              <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-slate-400 backdrop-blur-md">
                {SLOT_LABELS[item.profileSlot]}
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-3.5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-white">
                {item.name}
              </h3>
              <p className="mt-1 line-clamp-1 text-[9px] leading-relaxed text-slate-600">
                {item.description}
              </p>
            </div>
            <span className="shrink-0 pt-0.5 text-[8px] font-bold text-slate-700 group-hover:text-amber-300">
              Details
            </span>
          </div>

          {isStealable && item.currentOwner ? (
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[8px]">
              <span className="truncate text-slate-700">
                Held by{' '}
                <span className="font-bold text-slate-500">
                  {item.currentOwner.username}
                </span>
              </span>
              <span className="shrink-0 font-mono text-slate-700">
                {item.transferCount}×
              </span>
            </div>
          ) : null}
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] px-3.5 py-3">
        <div className="min-w-0">
          <div className="font-mono text-sm font-black text-white">
            {price !== null ? formatDzp(price) : '—'}
            <span className="ml-1 text-[8px] text-amber-300">DZP</span>
          </div>
          <div className="text-[7px] font-black uppercase tracking-[0.12em] text-slate-700">
            {isStealable
              ? item.currentOwner
                ? 'Steal price'
                : 'Initial price'
              : 'Purchase price'}
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5">
          {item.profileSlot && isOwned ? (
            <button
              type="button"
              onClick={onEquip}
              className={`rounded-lg border px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.1em] ${
                equipped
                  ? 'border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-300'
                  : 'border-white/[0.07] bg-white/[0.03] text-slate-400 hover:text-white'
              }`}
            >
              {equipped ? 'Equipped' : 'Equip'}
            </button>
          ) : null}

          {canBuy ? (
            <button
              type="button"
              onClick={onBuy}
              disabled={viewerState.state === 'insufficient_funds'}
              className="rounded-lg bg-amber-300 px-3 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-[#10100a] transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-700"
            >
              {actionLabel}
            </button>
          ) : null}

          {!canBuy && !isOwned && viewerState.state !== 'owned_by_other' ? (
            <button
              type="button"
              onClick={onDetails}
              className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-slate-500 hover:text-white"
            >
              View
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DetailsPanel({
  item,
  viewerState,
  onClose,
  onBuy,
}: {
  item: ShopItem;
  viewerState: ViewerStateResult;
  onClose: () => void;
  onBuy: () => void;
}) {
  const [history, setHistory] = useState<OwnershipTransfer[] | null>(null);
  const [historyState, setHistoryState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');

  const loadHistory = useCallback(() => {
    if (item.ownershipType !== 'stealable') return;

    setHistoryState('loading');

    void api.shop
      .ownershipHistory(item.id)
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setHistory(result.data);
        setHistoryState('ready');
      })
      .catch(() => setHistoryState('error'));
  }, [item.id, item.ownershipType]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const canBuy = viewerState.canPurchase || viewerState.canSteal;
  const isSteal = viewerState.canSteal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-[#0a101b] shadow-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/[0.06] bg-[#0a101b]/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-700">
              {categoryLabel(item.category)}
            </div>
            <h2 className="mt-0.5 truncate text-base font-black text-white">
              {item.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-white/[0.05] hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <Artwork item={item} className="w-full rounded-xl" />

          <div className="min-w-0">
            <p className="text-xs leading-relaxed text-slate-400">
              {item.description}
            </p>

            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] text-slate-600">Status</span>
                <StatusPill state={viewerState.state} />
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <span className="text-[9px] text-slate-600">
                  {isSteal ? 'Current steal price' : 'Price'}
                </span>
                <span className="font-mono text-sm font-black text-amber-300">
                  {viewerState.actionPriceDzp !== null
                    ? `${formatDzp(viewerState.actionPriceDzp)} DZP`
                    : '—'}
                </span>
              </div>

              {item.profileSlot ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[9px] text-slate-600">Profile slot</span>
                  <span className="text-[9px] font-bold text-slate-300">
                    {SLOT_LABELS[item.profileSlot]}
                  </span>
                </div>
              ) : null}

              {item.ownershipType === 'stealable' ? (
                <>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[9px] text-slate-600">Owner</span>
                    <span className="text-[9px] font-bold text-slate-300">
                      {item.currentOwner?.username ?? 'Unowned'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[9px] text-slate-600">Transfers</span>
                    <span className="font-mono text-[9px] font-bold text-slate-300">
                      {item.transferCount}
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            {canBuy ? (
              <button
                type="button"
                onClick={onBuy}
                disabled={viewerState.state === 'insufficient_funds'}
                className="mt-3 w-full rounded-xl bg-amber-300 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#10100a] hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-700"
              >
                {isSteal ? 'Steal title' : 'Purchase'} ·{' '}
                {viewerState.actionPriceDzp !== null
                  ? `${formatDzp(viewerState.actionPriceDzp)} DZP`
                  : '—'}
              </button>
            ) : null}
          </div>
        </div>

        {item.ownershipType === 'stealable' ? (
          <div className="border-t border-white/[0.06] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">
                  Ownership history
                </div>
                <div className="mt-0.5 text-[9px] text-slate-700">
                  Every transfer remains part of the title's history.
                </div>
              </div>
              {historyState === 'error' ? (
                <button
                  type="button"
                  onClick={loadHistory}
                  className="text-[8px] font-black uppercase tracking-[0.1em] text-amber-300"
                >
                  Retry
                </button>
              ) : null}
            </div>

            {historyState === 'loading' ? (
              <div className="py-7 text-center text-[9px] text-slate-600">
                Loading history…
              </div>
            ) : null}

            {historyState === 'error' ? (
              <div className="mt-3 rounded-xl border border-rose-300/10 bg-rose-400/[0.04] px-3 py-3 text-[9px] text-rose-300">
                Couldn't load ownership history.
              </div>
            ) : null}

            {historyState === 'ready' && history ? (
              history.length === 0 ? (
                <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-4 text-center text-[9px] text-slate-600">
                  No transfers yet.
                </div>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[9px] font-bold text-slate-300">
                          {entry.username}
                        </div>
                        <div className="mt-0.5 text-[8px] text-slate-700">
                          Season {entry.season} · {formatDate(entry.acquiredAt)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[9px] font-bold text-slate-400">
                          {formatDzp(entry.acquisitionPriceDzp)} DZP
                        </div>
                        <div className="mt-0.5 text-[7px] text-slate-700">
                          {entry.compensationReceivedDzp !== null
                            ? `+${formatDzp(entry.compensationReceivedDzp)} compensation`
                            : 'Current holder'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type TransactionStatus = 'confirm' | 'pending' | 'success' | 'error';

function TransactionModal({
  item,
  viewerState,
  onClose,
  onSuccess,
}: {
  item: ShopItem;
  viewerState: ViewerStateResult;
  onClose: () => void;
  onSuccess: (result: TransactionResult) => void;
}) {
  const [status, setStatus] = useState<TransactionStatus>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransactionResult | null>(null);

  const isSteal = viewerState.canSteal;
  const price = viewerState.actionPriceDzp;

  const execute = useCallback(() => {
    setStatus('pending');
    setError(null);

    const request = isSteal
      ? api.shop.steal(item.id)
      : api.shop.purchase(item.id);

    void request
      .then((response) => {
        if (!response.ok) throw new Error(response.error);
        setResult(response.data);
        setStatus('success');
        onSuccess(response.data);
      })
      .catch((err) => {
        setError(apiError(err));
        setStatus('error');
      });
  }, [isSteal, item.id, onSuccess]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && status !== 'pending') {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-t-2xl border border-white/[0.08] bg-[#0a101b] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-700">
              {isSteal ? 'Steal title' : 'Purchase'}
            </div>
            <div className="mt-0.5 truncate text-sm font-black text-white">
              {item.name}
            </div>
          </div>

          {status !== 'pending' ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white/[0.05] hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="p-4">
          {status === 'confirm' ? (
            <>
              <div className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <Artwork item={item} className="h-16 w-24 shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <div className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-700">
                    {isSteal ? 'Current price' : 'Purchase price'}
                  </div>
                  <div className="mt-1 font-mono text-xl font-black text-amber-300">
                    {price !== null ? formatDzp(price) : '—'}
                    <span className="ml-1 text-[8px]">DZP</span>
                  </div>
                  {isSteal && item.currentOwner ? (
                    <div className="mt-1 text-[8px] text-slate-600">
                      Currently held by{' '}
                      <span className="font-bold text-slate-400">
                        {item.currentOwner.username}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 space-y-2 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] text-slate-600">Your balance</span>
                  <span className="font-mono text-[9px] font-bold text-slate-300">
                    {(viewerState.viewerBalanceDzp ?? 0).toLocaleString()} DZP
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] text-slate-600">After transaction</span>
                  <span className="font-mono text-[9px] font-bold text-slate-300">
                    {price !== null
                      ? Math.max(
                          0,
                          (viewerState.viewerBalanceDzp ?? 0) - price,
                        ).toLocaleString()
                      : '—'}{' '}
                    DZP
                  </span>
                </div>
              </div>

              <p className="mt-3 text-[9px] leading-relaxed text-slate-600">
                {isSteal
                  ? 'The previous owner receives the server-calculated compensation. The next steal uses the updated price.'
                  : 'This item becomes part of your permanent collection and can be equipped from your loadout.'}
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={execute}
                  disabled={price === null}
                  className="flex-1 rounded-xl bg-amber-300 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#10100a] hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-700"
                >
                  Confirm
                </button>
              </div>
            </>
          ) : null}

          {status === 'pending' ? (
            <div className="py-8 text-center">
              <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-amber-300" />
              <div className="mt-3 text-xs font-black text-white">
                {isSteal ? 'Taking the title…' : 'Completing purchase…'}
              </div>
              <div className="mt-1 text-[9px] text-slate-700">
                Keep this window open.
              </div>
            </div>
          ) : null}

          {status === 'success' && result ? (
            <div>
              <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.04] p-3.5">
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300">
                  Transaction complete
                </div>
                <div className="mt-1 text-base font-black text-white">
                  {result.item.name}
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] text-slate-600">Paid</span>
                    <span className="font-mono text-[9px] font-bold text-slate-300">
                      {price !== null ? formatDzp(price) : '—'} DZP
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] text-slate-600">New balance</span>
                    <span className="font-mono text-[9px] font-bold text-white">
                      {formatDzp(result.viewer.balanceDzp)} DZP
                    </span>
                  </div>
                  {result.previousOwner ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] text-slate-600">
                        Owner compensation
                      </span>
                      <span className="font-mono text-[9px] font-bold text-emerald-300">
                        {formatDzp(result.previousOwner.compensationDzp)} DZP
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full rounded-xl bg-white/[0.06] px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 hover:bg-white/[0.09]"
              >
                Done
              </button>
            </div>
          ) : null}

          {status === 'error' ? (
            <div>
              <div className="rounded-xl border border-rose-300/15 bg-rose-400/[0.04] p-3.5">
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-rose-300">
                  Transaction failed
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-rose-200/70">
                  {error}
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-400"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={execute}
                  className="flex-1 rounded-xl bg-amber-300 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-[#10100a]"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DzpHistory({
  onClose,
}: {
  onClose: () => void;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [entries, setEntries] = useState<DzpLedgerEntry[]>([]);

  const load = useCallback(() => {
    setState('loading');

    void api.dzp
      .history()
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setEntries(result.data);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-[#0a101b] shadow-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0a101b]/95 px-4 py-3 backdrop-blur">
          <div>
            <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-700">
              Wallet
            </div>
            <h2 className="mt-0.5 text-sm font-black text-white">DZP history</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white/[0.05] hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="p-4">
          {state === 'loading' ? (
            <div className="py-8 text-center text-[9px] text-slate-600">
              Loading history…
            </div>
          ) : null}

          {state === 'error' ? (
            <div className="rounded-xl border border-rose-300/10 bg-rose-400/[0.04] p-4 text-center">
              <div className="text-[9px] font-bold text-rose-300">
                Couldn't load DZP history.
              </div>
              <button
                type="button"
                onClick={load}
                className="mt-3 rounded-lg bg-white/[0.05] px-3 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-slate-300"
              >
                Retry
              </button>
            </div>
          ) : null}

          {state === 'ready' ? (
            entries.length === 0 ? (
              <div className="py-8 text-center text-[9px] text-slate-600">
                No DZP activity yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.05]">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-4 border-b border-white/[0.04] px-3 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[9px] font-bold text-slate-300">
                        {TRANSACTION_LABELS[entry.transactionType]}
                      </div>
                      <div className="mt-0.5 truncate text-[8px] text-slate-700">
                        {entry.description} · Season {entry.season} ·{' '}
                        {formatDate(entry.createdAt)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[9px] font-black ${
                        entry.amountDzp >= 0
                          ? 'text-emerald-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {entry.amountDzp > 0 ? '+' : ''}
                      {formatDzp(entry.amountDzp)} DZP
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

type LoadState = 'loading' | 'ready' | 'error';
type CategoryFilter = 'all' | ItemCategory;

export default function ShopPage() {
  const [snapshot, setSnapshot] = useState<ShopSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [transactionItem, setTransactionItem] = useState<ShopItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [player, setPlayer] = useState<ApiPlayerProfile | null>(null);
  const [equippingSlot, setEquippingSlot] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: 'positive' | 'danger';
  } | null>(null);

  const load = useCallback(() => {
    setLoadState('loading');

    void api.shop
      .get()
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setSnapshot(result.data);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!snapshot?.viewer) {
      setProfile(null);
      setPlayer(null);
      return;
    }

    let live = true;

    void api.shop.profile().then((result) => {
      if (live && result.ok) setProfile(result.data);
    });

    void api.players.profile(snapshot.viewer.username).then((result) => {
      if (live && result.ok) setPlayer(result.data);
    });

    return () => {
      live = false;
    };
  }, [snapshot?.viewer?.userId, snapshot?.viewer?.username]);

  const applyTransaction = useCallback((result: TransactionResult) => {
    setSnapshot((previous) => {
      if (!previous) return previous;

      const wasOwned = previous.ownedItemIds.includes(result.item.id);
      const becameNormalOwned =
        result.item.ownershipType === 'normal' && !wasOwned;

      return {
        ...previous,
        viewer: result.viewer,
        items: previous.items.map((item) =>
          item.id === result.item.id ? result.item : item,
        ),
        ownedItemIds: becameNormalOwned
          ? [...previous.ownedItemIds, result.item.id]
          : previous.ownedItemIds,
      };
    });

    setSelectedItem((previous) =>
      previous?.id === result.item.id ? result.item : previous,
    );

    setToast({
      message: result.previousOwner
        ? `You stole ${result.item.name}. ${result.previousOwner.username} received ${formatDzp(result.previousOwner.compensationDzp)} DZP.`
        : `You purchased ${result.item.name}.`,
      tone: 'positive',
    });
  }, []);

  const equip = useCallback(
    async (
      slot: Exclude<ShopItem['profileSlot'], null>,
      itemId: string | null,
    ) => {
      setEquippingSlot(slot);

      try {
        const result = await api.shop.equipProfileItem(slot, itemId);

        if (!result.ok) {
          setToast({ message: result.error, tone: 'danger' });
          return;
        }

        setProfile(result.data);
        setToast({
          message:
            itemId === null ? 'Cosmetic removed.' : 'Cosmetic equipped.',
          tone: 'positive',
        });
      } catch {
        setToast({
          message: 'Could not save your profile equipment.',
          tone: 'danger',
        });
      } finally {
        setEquippingSlot(null);
      }
    },
    [],
  );

  const categories = useMemo(() => {
    if (!snapshot) return [];
    return Array.from(new Set(snapshot.items.map((item) => item.category)));
  }, [snapshot]);

  const visibleItems = useMemo(() => {
    if (!snapshot) return [];

    return snapshot.items
      .filter(isVisibleInShop)
      .filter(
        (item) => category === 'all' || item.category === category,
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [snapshot, category]);

  if (loadState === 'loading') {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#060b13] px-6 py-20 text-slate-100">
        <div className="text-center">
          <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-amber-300" />
          <div className="mt-4 text-xs font-black text-white">
            Opening the shop…
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'error' || !snapshot) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#060b13] px-6 py-20">
        <div className="w-full max-w-sm rounded-2xl border border-rose-300/10 bg-rose-400/[0.03] p-5 text-center">
          <div className="text-sm font-black text-rose-200">
            Couldn't load the shop
          </div>
          <div className="mt-1 text-[9px] leading-relaxed text-rose-200/50">
            Your balance and collection were not changed.
          </div>
          <button
            type="button"
            onClick={load}
            className="mt-4 rounded-lg bg-white/[0.06] px-3 py-2 text-[8px] font-black uppercase tracking-[0.1em] text-slate-300 hover:bg-white/[0.09]"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const viewer = snapshot.viewer;
  const ownedCount = snapshot.ownedItemIds.length;
  const equippedCount = profile?.equipped.length ?? 0;
  const activeCount = snapshot.items.filter((item) => item.lifecycle === 'active').length;
  const stealableCount = snapshot.items.filter((item) => item.ownershipType === 'stealable').length;
  const seasonEndsAt = snapshot.season.endsAt ? new Date(snapshot.season.endsAt) : null;
  const seasonDaysLeft =
    seasonEndsAt && !Number.isNaN(seasonEndsAt.getTime())
      ? Math.max(0, Math.ceil((seasonEndsAt.getTime() - Date.now()) / 86_400_000))
      : null;

  return (
    <div className="min-h-full overflow-x-hidden bg-[#050912] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(251,191,36,0.10),transparent_34%),radial-gradient(circle_at_100%_50%,rgba(99,102,241,0.06),transparent_30%)]" />

      <main className="relative z-10 mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="relative mb-6 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#080d17] shadow-[0_24px_100px_rgba(0,0,0,0.32)]">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(251,191,36,0.07),transparent_38%,rgba(99,102,241,0.06))]" />
          <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end lg:p-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.8)]" />
                osu!DZ / seasonal shop
              </div>
              <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                Your profile. Your collection. Your season.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
                Collect profile cosmetics with DZP earned through osu!DZ challenges.
                Stealable titles can change hands, while permanent purchases stay in your collection.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 lg:min-w-[250px]">
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4">
                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-amber-200/55">DZP balance</div>
                <div className="mt-1 font-mono text-2xl font-black text-amber-200">
                  {viewer ? formatDzp(viewer.balanceDzp) : '—'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">Season</div>
                <div className="mt-1 text-sm font-black text-slate-200">{snapshot.season.label}</div>
                <div className="mt-0.5 text-[8px] text-slate-600">
                  {seasonDaysLeft === null ? 'No end date' : seasonDaysLeft + ' days remaining'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">Collection</div>
                <div className="mt-1 text-sm font-black text-slate-200">{ownedCount} items</div>
              </div>
              <button
                type="button"
                onClick={() => viewer && setHistoryOpen(true)}
                disabled={!viewer}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:border-amber-300/20 hover:bg-white/[0.045] disabled:cursor-default disabled:opacity-50"
              >
                <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">Wallet</div>
                <div className="mt-1 text-sm font-black text-slate-200">Transaction history</div>
                <div className="mt-0.5 text-[8px] text-slate-600">View DZP activity</div>
              </button>
            </div>
          </div>
        </header>

        {viewer ? (
          <>
            <section className="mb-5">
              <MiniIdentity
                snapshot={snapshot}
                profile={profile}
                player={player}
              />
            </section>

            <section className="mb-9">
              <LoadoutBar
                snapshot={snapshot}
                profile={profile}
                equippingSlot={equippingSlot}
                onEquip={(slot, itemId) => void equip(slot, itemId)}
              />
            </section>
          </>
        ) : (
          <section className="mb-9 rounded-[22px] border border-white/[0.07] bg-[#0a101b] px-5 py-6">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-300/70">
              Guest browsing
            </div>
            <div className="mt-1 text-lg font-black text-white">
              Browse the collection
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Sign in to purchase and equip cosmetics.
            </div>
          </section>
        )}

        {/* Catalog controls */}
        <section>
          <div className="mb-5 flex flex-col gap-4 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">
                Curated collection
              </div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
                Find your next signature
              </h2>
              <div className="mt-1 text-[9px] text-slate-600">
                {activeCount} active items · {stealableCount} titles can change ownership · {equippedCount}/4 equipped
              </div>
            </div>

            <div className="flex max-w-full gap-1 overflow-x-auto border border-slate-800 bg-slate-950/50 p-1">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`shrink-0 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] transition-colors ${
                  category === 'all'
                    ? 'bg-amber-300 text-slate-950'
                    : 'text-slate-600 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                All
              </button>

              {categories.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  className={`shrink-0 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] transition-colors ${
                    category === value
                      ? 'bg-amber-300 text-slate-950'
                      : 'text-slate-600 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {categoryLabel(value)}
                </button>
              ))}
            </div>
          </div>

          {visibleItems.length === 0 ? (
            <div className="border border-slate-800 bg-[#0b1322] px-5 py-14 text-center">
              <div className="text-xs font-black text-slate-300">
                Nothing here yet.
              </div>
              <div className="mt-1 text-[9px] text-slate-700">
                Try another category.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => {
                const state = deriveViewerState(
                  item,
                  snapshot.viewer,
                  snapshot.ownedItemIds,
                );

                const owned =
                  snapshot.ownedItemIds.includes(item.id) ||
                  (item.ownershipType === 'stealable' &&
                    item.currentOwner?.userId === snapshot.viewer?.userId);

                const equipped =
                  item.profileSlot !== null &&
                  profile?.equipped.some(
                    (entry) =>
                      entry.profileSlot === item.profileSlot &&
                      entry.itemId === item.id,
                  );

                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    viewerState={state}
                    isOwned={owned}
                    equipped={Boolean(equipped)}
                    onBuy={() => setTransactionItem(item)}
                    onEquip={() => {
                      if (!item.profileSlot) return;
                      void equip(
                        item.profileSlot,
                        equipped ? null : item.id,
                      );
                    }}
                    onDetails={() => setSelectedItem(item)}
                  />
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-12 flex flex-col gap-2 border-t border-white/[0.07] py-6 text-[9px] leading-relaxed text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            DZP is seasonal and spendable. Owned cosmetics remain yours across seasons.
          </span>
          <span>
            {equippedCount}/{4} profile slots equipped
          </span>
        </footer>
      </main>

      {selectedItem ? (
        <DetailsPanel
          item={selectedItem}
          viewerState={deriveViewerState(
            selectedItem,
            snapshot.viewer,
            snapshot.ownedItemIds,
          )}
          onClose={() => setSelectedItem(null)}
          onBuy={() => {
            setSelectedItem(null);
            setTransactionItem(selectedItem);
          }}
        />
      ) : null}

      {transactionItem ? (
        <TransactionModal
          item={transactionItem}
          viewerState={deriveViewerState(
            transactionItem,
            snapshot.viewer,
            snapshot.ownedItemIds,
          )}
          onClose={() => setTransactionItem(null)}
          onSuccess={applyTransaction}
        />
      ) : null}

      {historyOpen ? (
        <DzpHistory onClose={() => setHistoryOpen(false)} />
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 right-4 z-[80] w-[min(380px,calc(100vw-2rem))]">
          <div
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur-xl ${
              toast.tone === 'positive'
                ? 'border-emerald-300/15 bg-[#0a101b]/95'
                : 'border-rose-300/15 bg-[#0a101b]/95'
            }`}
          >
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                toast.tone === 'positive' ? 'bg-emerald-300' : 'bg-rose-300'
              }`}
            />
            <div
              className={`min-w-0 flex-1 text-[9px] font-bold leading-relaxed ${
                toast.tone === 'positive'
                  ? 'text-emerald-200'
                  : 'text-rose-200'
              }`}
            >
              {toast.message}
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-slate-700 hover:text-white"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
