import React from 'react';
import { Award, CheckCircle2, Crown, Medal, Swords, Target, Trophy, Vote } from 'lucide-react';
import type { ApiPlayerDzppRound, ApiPlayerProfile } from '../../api/client';

function fmt(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString();
}

function ordinal(value: number | null): string {
  if (value === null) return '—';
  if (value % 100 >= 11 && value % 100 <= 13) return `${value}th`;
  const suffix = value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th';
  return `${value}${suffix}`;
}

function RankBlock({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-slate-500 sm:text-[9px]">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-[24px] font-black leading-none sm:text-[27px] ${accent ? 'text-amber-300' : 'text-slate-200'}`}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value, accent = false, labelClass = 'text-slate-600' }: { icon: React.ReactNode; label: string; value: string; accent?: boolean; labelClass?: string }) {
  return (
    <div className="min-w-0">
      <div className={`flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] ${labelClass}`}>
        <span className={accent ? 'text-amber-300' : 'text-slate-500'}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 truncate font-mono text-[15px] font-black sm:text-[17px] ${accent ? 'text-amber-300' : 'text-slate-200'}`}>
        {value}
      </div>
    </div>
  );
}

function DetailRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-[10px]">
      <span className="truncate text-slate-400">{label}</span>
      <span className={`shrink-0 font-mono font-bold tabular-nums ${accent ? 'text-emerald-300' : 'text-slate-200'}`}>{value}</span>
    </div>
  );
}

function ProgressionGraph({ rounds, duelHistory, total }: { rounds: ApiPlayerDzppRound[]; duelHistory: ApiPlayerProfile['duelHistory']; total: number }) {
  const ordered = [...rounds].reverse();
  let running = 0;
  const points = ordered.map((round, index) => {
    running += round.finalDzpp;
    return { round: round.roundNumber, month: round.month, year: round.year, value: running, gain: round.finalDzpp, x: ordered.length <= 1 ? 0 : index / (ordered.length - 1) };
  });

  if (points.length === 0) {
    return <div className="flex h-[142px] items-center justify-center border-y border-slate-800/60 font-mono text-[9px] uppercase tracking-widest text-slate-700">No challenge history yet</div>;
  }

  const width = 760;
  const height = 150;
  const padX = 18;
  const padY = 14;
  const max = Math.max(...points.map((point) => point.value), 1);
  const coords = points.map((point) => ({
    ...point,
    cx: padX + point.x * (width - padX * 2),
    cy: height - padY - (point.value / max) * (height - padY * 2),
  }));
  // Use quadratic curves through the actual points instead of straight line
  // segments. The old L-to-L path made the progression look artificially flat
  // when rounds had similar DZPP gains.
  const curvedPath = (items: Array<{ cx: number; cy: number }>) => {
    if (items.length === 1) return `M ${items[0].cx.toFixed(1)} ${items[0].cy.toFixed(1)}`;
    let d = `M ${items[0].cx.toFixed(1)} ${items[0].cy.toFixed(1)}`;
    for (let i = 1; i < items.length; i += 1) {
      const previous = items[i - 1];
      const current = items[i];
      const midX = (previous.cx + current.cx) / 2;
      d += ` Q ${midX.toFixed(1)} ${previous.cy.toFixed(1)} ${midX.toFixed(1)} ${((previous.cy + current.cy) / 2).toFixed(1)}`;
      d += ` Q ${midX.toFixed(1)} ${current.cy.toFixed(1)} ${current.cx.toFixed(1)} ${current.cy.toFixed(1)}`;
    }
    return d;
  };
  const path = curvedPath(coords);
  const duelValues = points.map((point, index) => {
    const monthIndex = new Date(`${point.month} 1, ${point.year}`).getMonth();
    const roundDate = new Date(Date.UTC(point.year, Number.isFinite(monthIndex) ? monthIndex : 0, 1));
    let cumulative = 0;
    for (const duel of duelHistory) {
      if (new Date(duel.createdAt).getTime() <= roundDate.getTime()) cumulative += duel.amount;
    }
    return { ...point, value: cumulative };
  });
  const duelMax = Math.max(...duelValues.map((point) => point.value), 1);
  const duelCoords = duelValues.map((point) => ({
    cx: padX + point.x * (width - padX * 2),
    cy: height - padY - (point.value / duelMax) * (height - padY * 2),
  }));
  const duelPath = curvedPath(duelCoords);
  const area = `${path} L ${coords[coords.length - 1].cx.toFixed(1)} ${height - padY} L ${coords[0].cx.toFixed(1)} ${height - padY} Z`;

  return (
    <div className="mt-2 min-w-0">
      <div className="relative h-[154px] overflow-hidden bg-[#17141a]">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Cumulative DZPP progression">
          <defs>
            <linearGradient id="dzpp-career-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(251 191 36 / 0.22)" />
              <stop offset="100%" stopColor="rgb(251 191 36 / 0)" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((level) => (
            <line key={level} x1={padX} x2={width - padX} y1={height - padY - level * (height - padY * 2)} y2={height - padY - level * (height - padY * 2)} stroke="rgb(71 65 70 / 0.55)" strokeWidth="1" />
          ))}
          <path d={area} fill="url(#dzpp-career-fill)" />
          <path d={path} fill="none" stroke="rgb(251 191 36)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
          {duelHistory.length > 0 && <path d={duelPath} fill="none" stroke="rgb(52 211 153)" strokeWidth="1.8" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
          {coords.map((point) => (
            <circle key={point.round} cx={point.cx} cy={point.cy} r="2.8" fill="rgb(251 191 36)" />
          ))}
        </svg>
        <div className="pointer-events-none absolute left-3 top-2 font-mono text-[9px] font-semibold tracking-[0.08em] text-slate-500">DZPP HISTORY</div>
        <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[9px] font-medium text-slate-500">R{points[0].round}</div>
        <div className="pointer-events-none absolute bottom-2 right-3 font-mono text-[9px] font-medium text-slate-500">R{points[points.length - 1].round}</div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[9px] font-medium leading-4 text-slate-500">
        <span>{points.length} scored round{points.length === 1 ? '' : 's'}</span>
        <span>+{points[points.length - 1].gain.toLocaleString()} last round</span>
        <span>{total.toLocaleString()} total DZPP</span>
      </div>
      <div className="mt-2.5 flex items-center gap-5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 bg-amber-300" />DZPP</span>
        {duelHistory.length > 0 && <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 border-t border-dashed border-emerald-300" />PP Duel</span>}
      </div>
    </div>
  );
}

export function PlayerCareerProgression({ profile, rounds, averagePlace }: { profile: ApiPlayerProfile; rounds: ApiPlayerDzppRound[]; averagePlace: number | null }) {
  return (
    <section className="mb-4 overflow-hidden border border-[#292d45] bg-[#17141a] shadow-[0_8px_30px_rgba(0,0,0,0.16)]">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <RankBlock label="Global Ranking" value={profile.globalRank === null ? '—' : `#${profile.globalRank.toLocaleString()}`} />
            <RankBlock label="Country Ranking" value={profile.countryRank === null ? '—' : `#${profile.countryRank.toLocaleString()}`} />
            <RankBlock label="DZPP Ranking" value={profile.dzppRank === null ? '—' : `#${profile.dzppRank.toLocaleString()}`} />
            <RankBlock label="PP Duel Ranking" value={profile.duelPpRank === null ? '—' : `#${profile.duelPpRank.toLocaleString()}`} accent />
          </div>

          <div className="mt-5 border-t border-slate-800/60 pt-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Career progression</div>
                <div className="mt-1 text-[14px] font-black text-slate-200">Challenge performance</div>
              </div>
              <div className="text-right font-mono text-[10px] text-slate-400">
                <span className="text-amber-300">{profile.dzpp.toLocaleString()}</span> DZPP
              </div>
            </div>
            <ProgressionGraph rounds={rounds} duelHistory={profile.duelHistory} total={profile.dzpp} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-800/60 pt-3 sm:grid-cols-4">
            <MiniStat icon={<Award className="h-3 w-3" />} label="osu! PP" labelClass="text-[#ff66ab]" value={profile.osuPp === null ? '—' : Math.round(profile.osuPp).toLocaleString()} />
            <MiniStat icon={<Medal className="h-3 w-3" />} label="DZPP" value={profile.dzpp.toLocaleString()} accent />
            <MiniStat icon={<Swords className="h-3 w-3" />} label="PP Duel" value={profile.duelPp.toLocaleString()} accent />
            <MiniStat icon={<Crown className="h-3 w-3" />} label="Challenge Wins" labelClass="text-emerald-300" value={profile.firstPlaces.toLocaleString()} />
          </div>
        </div>

        <aside className="border-t border-slate-800/80 bg-[#211d23] px-4 py-4 lg:border-l lg:border-t-0">
          <div className="mb-2 flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Target className="h-3 w-3 text-amber-300" />
            osu!DZ career details
          </div>
          <div className="divide-y divide-slate-800/60">
            <DetailRow label="Qualified Scores" value={fmt(profile.qualifiedScores)} accent={profile.qualifiedScores > 0} />
            <DetailRow label="Challenge Plays" value={fmt(profile.challengePlays)} />
            <DetailRow label="Total Score" value={fmt(profile.totalChallengeScore)} />
            <DetailRow label="Rounds Completed" value={fmt(profile.roundsPlayed)} />
            <DetailRow label="Challenges Won" value={fmt(profile.firstPlaces)} accent={profile.firstPlaces > 0} />
            <DetailRow label="Best Placement" value={ordinal(profile.bestPlacement)} />
            <DetailRow label="Average Placement" value={averagePlace === null ? '—' : averagePlace.toFixed(1)} />
            <DetailRow label="Approved Beatmaps" value={fmt(profile.approvedBeatmaps)} />
            <DetailRow label="Votes Received" value={fmt(profile.votesReceived)} />
            <DetailRow label="PP Duel Earned" value={fmt(profile.duelPp)} accent={profile.duelPp > 0} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-slate-800/80 bg-[#17141a] px-2.5 py-2">
              <div className="flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500"><CheckCircle2 className="h-3 w-3" />Qualified score share</div>
              <div className="mt-1 font-mono text-[12px] font-black text-slate-300">{profile.totalChallengeScore ? `${((profile.qualifiedScores / profile.totalChallengeScore) * 100).toFixed(1)}%` : '—'}</div>
            </div>
            <div className="border border-slate-800/80 bg-[#17141a] px-2.5 py-2">
              <div className="flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500"><Trophy className="h-3 w-3" />Win rate</div>
              <div className="mt-1 font-mono text-[12px] font-black text-slate-300">{profile.roundsPlayed ? `${((profile.firstPlaces / profile.roundsPlayed) * 100).toFixed(1)}%` : '—'}</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
