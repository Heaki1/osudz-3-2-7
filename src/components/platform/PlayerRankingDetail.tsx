import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Crown,
  Medal,
  Trophy,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { TitleRenderer } from './TitleRenderer';
import { PlayerAvatar } from './PlayerAvatar';
import { api, ApiPlayerDzppMap, ApiPlayerDzppRound, ApiRankingEntry } from '../../api/client';
import { averagePlacement, monthLabel } from '../../lib/rankings';
import type { ShopProfile } from './shop.types';

// ── ONE PLAYER'S DZPP ─────────────────────────────────────────────────────────
//
// The panel behind a row of the DZ Performance Rankings: the player's totals, and every
// finalized round that produced them.
//
// IT CARRIES THE WHOLE BREAKDOWN, not just each round's total. That is the reason
// round_dzpp stores the terms separately rather than only the sum: a table of totals with no
// visible derivation is a table people argue with rather than chase. Every figure here comes
// from GET /api/rankings/:userId — nothing is recomputed against the formula, because the
// stored row IS the answer and a second opinion in the client could disagree with it.
//
// The history read is its own, rather than being handed down: it is wanted only when a row is
// opened, and fetching it here keeps its loading and error states beside what they describe.

interface PlayerRankingDetailProps {
  entry: ApiRankingEntry;
  /** The ranking scope that was active when this player was opened. */
  scope: 'all-time' | 'yearly' | 'seasonal';
  /** The season being viewed. Null is all-time, and scopes the history to match the table. */
  year: number | null;
  /** "All-time" or "2026", for the line under the username. */
  scopeLabel: string;
  onBack: () => void;
}

/**
 * A round's finishing position. Null is not a position: only qualified plays are placed, so a
 * round the player did not qualify in says so rather than rendering "#null".
 */
function PlacementBadge({ placement }: { placement: number | null }) {
  if (placement === null) {
    return <span className="text-slate-600 text-[11px] font-normal">not qualified</span>;
  }
  if (placement === 1) return <span className="inline-flex items-center gap-1 text-amber-400"><Crown className="w-3.5 h-3.5" /> #1</span>;
  if (placement === 2) return <span className="inline-flex items-center gap-1 text-slate-300"><Medal className="w-3.5 h-3.5" /> #2</span>;
  if (placement === 3) return <span className="inline-flex items-center gap-1 text-amber-700"><Medal className="w-3.5 h-3.5" /> #3</span>;
  return <span className="text-slate-400">#{placement}</span>;
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${accent ? 'bg-amber-400/5 border-amber-400/25' : 'bg-slate-900/60 border-slate-800'}`}>
      <div className={`text-[9px] uppercase tracking-wider font-mono mb-1 ${accent ? 'text-amber-400/60' : 'text-slate-600'}`}>{label}</div>
      <div className={`text-lg font-black font-mono tabular-nums ${accent ? 'text-amber-400' : 'text-white'}`}>{value}</div>
    </div>
  );
}

/**
 * Where a round's DZPP came from, term by term.
 *
 * A null performance value reads as "no pp" rather than as 0.00: osu! awards no pp on a Loved
 * beatmap, and "osu! rated this play at nothing" and "osu! did not rate this play" are
 * different facts. The nullable column exists to keep them apart, so the page does too.
 */
function Breakdown({ round }: { round: ApiPlayerDzppRound }) {
  const term = (value: number, label: string) => (
    <span className="whitespace-nowrap">
      <span className="text-slate-400 tabular-nums">{value}</span>{' '}
      <span className="text-slate-600">{label}</span>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono mt-1">
      {round.performanceValue === null ? (
        <span className="text-slate-600 whitespace-nowrap">no pp</span>
      ) : (
        <span className="whitespace-nowrap">
          <span className="text-sky-300/80 tabular-nums">{round.performanceValue.toFixed(2)}</span>{' '}
          <span className="text-slate-600">pp</span>
        </span>
      )}
      <span className="text-slate-700">+</span>
      {term(round.completionPoints, 'completion')}
      <span className="text-slate-700">+</span>
      {term(round.qualificationPoints, 'qualification')}
      {round.qualified && (
        <>
          <span className="text-slate-700">+</span>
          {term(round.placementPoints, 'placement')}
        </>
      )}
      <span className="text-slate-700">·</span>
      <span className="text-slate-600 whitespace-nowrap">
        field of <span className="tabular-nums">{round.fieldSize}</span>
      </span>
    </div>
  );
}

function MapResult({ map }: { map: ApiPlayerDzppMap }) {
  const qualificationKnown =
    map.modCompliancePoints !== null &&
    map.requirementAchievementPoints !== null;

  return (
    <div
      className={`rounded-xl border ${
        map.counted
          ? 'border-amber-400/25 bg-amber-400/[0.035]'
          : 'border-slate-800 bg-slate-950/30'
      }`}
    >
      <div className="p-4">
  <div className="min-w-0">
    <div className="flex items-start gap-3">
      {map.coverUrl ? (
        <img
          src={map.coverUrl}
          alt=""
          className="w-20 h-12 rounded-md object-cover bg-slate-900 flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-12 rounded-md bg-slate-900 flex-shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-slate-500">
            MAP #{map.voteRank}
          </span>

          {map.counted ? (
            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-black text-amber-400">
              <Check className="w-3 h-3" />
              counted
            </span>
          ) : (
            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600">
              not counted
            </span>
          )}
        </div>

        <div className="text-sm font-bold text-white truncate mt-0.5">
          {map.title}
        </div>

        <div className="text-[11px] text-slate-500 truncate mt-0.5">
          {map.artist} · mapped by {map.mapper} · [{map.difficultyName}]
        </div>
      </div>
    </div>

    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] font-mono">
      <span className="text-slate-500">
        mods <span className="text-white font-bold">{map.mods || 'NM'}</span>
      </span>

      <span className="text-slate-500">
        required <span className="text-white font-bold">{map.modRequirement}</span>
      </span>

      <span className="text-slate-500">
        challenge <span className="text-white font-bold">{map.challengeRequirement}</span>
      </span>
    </div>
  </div>

  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
    <StatTile label="Score" value={map.score.toLocaleString()} />
    <StatTile label="Accuracy" value={`${map.accuracy.toFixed(2)}%`} />
    <StatTile label="Misses" value={String(map.misses)} />
    <StatTile
      label="Combo"
      value={`${map.maxCombo.toLocaleString()} / ${map.beatmapMaxCombo.toLocaleString()}`}
    />
  </div>
</div>

      <div className="border-t border-slate-800/60 px-4 py-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-[10px] font-mono">
          <div>
            <div className="text-slate-600 uppercase tracking-wider">Performance</div>
            <div className="text-sky-300 font-bold mt-0.5">
              {map.performanceValue === null
                ? 'no pp'
                : `${map.performanceValue.toFixed(2)} pp`}
            </div>
          </div>

          <div>
            <div className="text-slate-600 uppercase tracking-wider">Completion</div>
            <div className="text-white font-bold mt-0.5">
              +{map.completionPoints}
            </div>
          </div>

          <div>
            <div className="text-slate-600 uppercase tracking-wider">Mod compliance</div>
            <div className={`font-bold mt-0.5 ${
              !qualificationKnown
                ? 'text-slate-500'
                : map.modCompliancePoints! > 0
                  ? 'text-emerald-400'
                  : 'text-slate-500'
            }`}>
              {!qualificationKnown
                ? 'legacy data'
                : map.modCompliancePoints! > 0
                  ? `+${map.modCompliancePoints}`
                  : (
                    <span className="inline-flex items-center gap-1">
                      <X className="w-3 h-3" /> +0
                    </span>
                  )}
            </div>
          </div>

          <div>
            <div className="text-slate-600 uppercase tracking-wider">Requirement achievement</div>
            <div className={`font-bold mt-0.5 ${
              !qualificationKnown
                ? 'text-slate-500'
                : map.requirementAchievementPoints! > 0
                  ? 'text-emerald-400'
                  : 'text-slate-500'
            }`}>
              {!qualificationKnown
                ? 'legacy data'
                : map.requirementAchievementPoints! > 0
                  ? `+${map.requirementAchievementPoints}`
                  : '+0'}
            </div>
          </div>

          <div>
            <div className="text-slate-600 uppercase tracking-wider">Placement</div>
            <div className="text-white font-bold mt-0.5">
              {map.placement === null ? 'not qualified' : `#${map.placement}`}
              {map.placementPoints > 0 && ` · +${map.placementPoints}`}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-800/40">
          <div className="text-[10px] font-mono text-slate-600">
            {qualificationKnown
              ? `Qualification +${map.qualificationPoints}`
              : `Qualification +${map.qualificationPoints} · sub-awards unavailable for this older frozen result`}
          </div>

          <div className="text-right whitespace-nowrap">
            <span className="text-lg font-black font-mono text-amber-400">
              +{map.finalDzpp}
            </span>
            <span className="text-[10px] text-slate-500 font-mono ml-1">
              map DZPP
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlayerRankingDetail({ entry, scope, year, scopeLabel, onBack }: PlayerRankingDetailProps) {
  const [history, setHistory] = useState<ApiPlayerDzppRound[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);

  // Re-read when the season or scope changes, so the history always describes the table it
  // was opened from. client.ts resolves a failed read and an empty one both to null, hence
  // the separate flag: "this player has no counted rounds" and "the API is down" must not
  // look alike.
  useEffect(() => {
    let live = true;
    setHistory(null);
    setFailed(false);
    void (async () => {
      const rounds = await api.rankings.player(entry.userId, scope, year ?? undefined);
      if (!live) return;
      setHistory(rounds.ok ? rounds.data : null);
      setFailed(!rounds.ok);
    })();
    return () => { live = false; };
  }, [entry.userId, scope, year]);

  useEffect(() => {
    let live = true;
    setShopProfile(null);
    void api.shop.publicProfile(entry.userId).then((result) => {
      if (live && result.ok) setShopProfile(result.data);
    });
    return () => { live = false; };
  }, [entry.userId]);

  const rounds = history ?? [];
  const average = averagePlacement(rounds);
  const equipped = new Map(shopProfile?.equipped.map((item) => [item.profileSlot, item]) ?? []);
  const title = equipped.get('title');
  const badge = equipped.get('badge');
  const frame = equipped.get('frame');
  const usernameDecoration = equipped.get('username_decoration');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-16">

      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors mb-6 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70`}
      >
        <ArrowLeft className="w-4 h-4" /> Rankings
      </button>

      <div className="bg-[#0d1526] border border-slate-800 rounded-2xl px-6 py-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="relative ring-2 ring-amber-400/50 rounded-full p-1 self-start overflow-hidden">
            <div className="relative z-10">
  <PlayerAvatar
    userId={entry.userId}
    username={entry.username}
    avatarUrl={entry.avatarUrl}
    size={72}
    frame={frame}
  />
</div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg" aria-hidden="true">🇩🇿</span>
              <h1 className="text-2xl font-black text-white truncate">{entry.username}</h1>
              {usernameDecoration && (
                <img src={usernameDecoration.artwork.url} alt={usernameDecoration.artwork.altText} title={usernameDecoration.name} className="h-6 w-10 rounded object-cover" />
              )}
              {badge && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-black text-amber-300" title={badge.artwork.altText}>
                  <img src={badge.artwork.url} alt="" className="h-3.5 w-3.5 rounded-sm object-cover" />
                  {badge.name}
                </span>
              )}
              {/* The osu! profile, because this platform has no profile page of its own. */}
              <a
                href={`https://osu.ppy.sh/users/${entry.osuId}`}
                target="_blank"
                rel="noreferrer noopener"
                className={`inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-amber-400 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70`}
                aria-label={`Open the osu! profile for ${entry.username} in a new tab`}
              >
                osu! profile <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-[12px] text-slate-500 font-mono mt-1">
              {scopeLabel} DZPP rank <span className="text-white font-bold">#{entry.rank}</span> · Algeria
            </p>
            {title && <p className="mt-2 text-xs font-black uppercase tracking-wider text-amber-400">{title.name}</p>}
          </div>

          <div className="text-right self-start sm:self-center">
            <div className="text-4xl font-black font-mono text-amber-400 tabular-nums leading-none">
              {entry.dzpp.toLocaleString()}
            </div>
            <div className="text-[11px] font-black font-mono text-amber-400/70 tracking-widest mt-1">DZPP</div>
            <div className="text-[10px] text-slate-600 font-mono mt-0.5">osu!DZ points · not osu! pp</div>
          </div>
        </div>

        {/* Challenges and wins come from the ranking row; the average is computed from the
            placements in the history below, and best placement is null for a player who has
            never qualified in a counted round. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <StatTile label="Challenges" value={String(entry.roundsPlayed)} />
          <StatTile label="Wins" value={String(entry.firstPlaces)} />
          <StatTile
            label="Avg Placement"
            value={history === null ? '…' : average === null ? '—' : `#${average}`}
          />
          <StatTile
            label="Best Placement"
            value={entry.bestPlacement === null ? '—' : `#${entry.bestPlacement}`}
            accent
          />
        </div>
      </div>

      <div className="bg-[#0d1526] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">DZPP History</h2>
          <span className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">
            {history === null ? '…' : `${rounds.length} challenge${rounds.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {history === null && !failed ? (
          <div className="min-h-[200px] flex flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-400/60" />
            <span className="text-sm font-mono">Loading DZPP history…</span>
          </div>
        ) : failed ? (
          <div className="min-h-[200px] flex flex-col items-center justify-center gap-3 text-slate-500">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <span className="text-sm font-mono">Could not load this history.</span>
          </div>
        ) : rounds.length === 0 ? (
          <div className="min-h-[200px] flex flex-col items-center justify-center gap-3 text-slate-600">
            <Trophy className="w-9 h-9" />
            <span className="text-sm font-mono">
              No challenge history for {scopeLabel.toLowerCase()} yet.
            </span>
          </div>
        ) : (
          <>
  <div className="px-5 py-3 bg-slate-900/30 border-b border-slate-800/40">
  <div className="flex items-center justify-between gap-4">
    <span className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">
      Challenge rounds
    </span>
    <span className="text-[10px] text-slate-600 font-mono">
      Each map is scored independently · counted map becomes round total
    </span>
  </div>
</div>

<ul role="list" className="divide-y divide-slate-800/40">
  {rounds.map((round) => (
    <li key={round.roundId}>
      <details className="group">
        <summary
          className={`list-none cursor-pointer px-5 py-4 hover:bg-slate-800/20 transition-colors ${
            round.placement === 1 ? 'bg-amber-400/[0.03]' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <ChevronDown className="w-4 h-4 text-slate-600 flex-shrink-0 transition-transform group-open:rotate-180" />

            <div className="w-24 flex-shrink-0">
              <div className="text-xs font-mono text-slate-500">
                {monthLabel(round)}
              </div>
              <div className="text-[10px] font-mono text-slate-700 mt-0.5">
                Round {round.roundNumber}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">
                  {round.maps.length} challenge map{round.maps.length !== 1 ? 's' : ''}
                </span>

                <span className="text-[10px] font-mono">
                  <PlacementBadge placement={round.placement} />
                </span>
              </div>

              <Breakdown round={round} />
            </div>

            <div className="text-right flex-shrink-0">
              <div className="text-sm font-black font-mono text-amber-400">
                +{round.finalDzpp}
              </div>
              <div className="text-[9px] text-slate-600 font-mono uppercase tracking-wider">
                round DZPP
              </div>
            </div>
          </div>
        </summary>

        <div className="px-5 pb-5 pt-1 space-y-3 bg-slate-950/20">
          {round.maps.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-6 text-center">
              <div className="text-[11px] text-slate-600 font-mono">
                No per-map frozen result is available for this round.
              </div>
            </div>
          ) : (
            round.maps.map((map) => (
              <MapResult key={`${round.roundId}-${map.submissionId}`} map={map} />
            ))
          )}
        </div>
      </details>
    </li>
  ))}
</ul>
          </>
        )}
      </div>

      <p className="text-center text-[10px] text-slate-700 font-mono mt-8">
        DZPP is earned only from monthly challenge performances · distinct from osu! global pp
      </p>
    </div>
  );
}
