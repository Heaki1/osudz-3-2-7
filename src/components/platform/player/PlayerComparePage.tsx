import React, { useState } from 'react';
import { Activity, BarChart3, Gauge, Medal, Search, Swords, Target, Trophy, Zap } from 'lucide-react';
import { api } from '../../../api/client';

type CompareResult = Awaited<ReturnType<typeof api.platform.compare>>;
type CompareData = Extract<CompareResult, { ok: true }>['data'];
type OsuPlayer = CompareData['osu'][number];

const fmt = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString();
const pct = (value: number | null | undefined) => value == null ? '—' : `${value.toFixed(2)}%`;
const hours = (seconds: number | null | undefined) => seconds == null ? '—' : `${(seconds / 3600).toFixed(1)}h`;
const score = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString();

export function PlayerComparePage() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);

  const compare = async () => {
    if (!a.trim() || !b.trim()) return;
    setBusy(true);
    setResult(await api.platform.compare(a.trim(), b.trim()));
    setBusy(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 pb-20">
      <header className="relative overflow-hidden border-b border-slate-800/80 pb-8 mb-7">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-pink-500/10 blur-3xl" />
        <div className="flex items-center gap-3 relative">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-pink-400 to-violet-500 flex items-center justify-center shadow-lg shadow-pink-500/10">
            <Swords className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.24em] text-pink-300/80 font-mono">osu! player analysis</p>
            <h1 className="text-2xl font-black text-white mt-1">Player comparison</h1>
          </div>
        </div>
        <p className="relative text-sm text-slate-500 mt-4 max-w-3xl">A detailed side-by-side comparison built around the metrics osu! players actually use: rank, pp, accuracy, activity, grades, top plays and score volume. osu!DZ data is shown separately.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); void compare(); }} className="grid lg:grid-cols-[1fr_1fr_auto] gap-2 mb-9">
        <PlayerInput value={a} onChange={setA} placeholder="First osu! username" />
        <PlayerInput value={b} onChange={setB} placeholder="Second osu! username" />
        <button type="submit" disabled={busy || !a.trim() || !b.trim()} className="h-12 px-7 bg-white text-slate-950 text-xs font-black uppercase tracking-widest hover:bg-pink-100 disabled:opacity-40 transition-colors">
          <Search className="w-3.5 h-3.5 inline mr-2" />{busy ? 'Loading…' : 'Compare'}
        </button>
      </form>

      {!result && <EmptyState />}
      {result?.ok && <Comparison result={result.data} />}
      {result && !result.ok && <div className="border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{result.error}</div>}
    </div>
  );
}

function PlayerInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className="relative"><div className="absolute left-4 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-pink-400" /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full h-12 bg-[#0b1220] border border-slate-800 pl-10 pr-4 text-sm text-white outline-none focus:border-pink-400/50 placeholder:text-slate-700" /></div>;
}

function EmptyState() {
  return <div className="border-y border-slate-800/80 py-20 text-center"><div className="mx-auto mb-4 h-11 w-11 rounded-full border border-slate-800 flex items-center justify-center"><Target className="h-5 w-5 text-slate-700" /></div><p className="text-sm text-slate-500">Enter two osu! usernames to build a detailed comparison.</p><p className="text-[10px] text-slate-700 font-mono uppercase tracking-widest mt-2">live public profile data</p></div>;
}

function Comparison({ result }: { result: Extract<CompareResult, { ok: true }>['data'] }) {
  const players = result.osu as [OsuPlayer, OsuPlayer];
  const platform = result.platform as [typeof result.platform[number], typeof result.platform[number]];
  const extras = [platform[0]?.extras, platform[1]?.extras];
  return <div className="space-y-10">
    {result.warnings?.map((warning) => (
      <div key={`${warning.code}-${warning.player}`} className="border-y border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/80">
        Top plays for <span className="font-semibold text-amber-100">{warning.player}</span> are currently unavailable; the public profile comparison is still shown.
      </div>
    ))}
    <PlayerHero players={players} />
    <CompareSection icon={<Gauge />} title="Performance">
      <StatGrid players={players} rows={[
        ['Performance points', players[0].pp == null ? '—' : `${players[0].pp.toFixed(0)}pp`, players[1].pp == null ? '—' : `${players[1].pp.toFixed(0)}pp`],
        ['Global rank', players[0].globalRank ? `#${fmt(players[0].globalRank)}` : 'Unranked', players[1].globalRank ? `#${fmt(players[1].globalRank)}` : 'Unranked'],
        ['Country rank', players[0].countryRank ? `#${fmt(players[0].countryRank)}` : '—', players[1].countryRank ? `#${fmt(players[1].countryRank)}` : '—'],
        ['Hit accuracy', pct(players[0].accuracy), pct(players[1].accuracy)],
        ['Maximum combo', fmt(players[0].maxCombo), fmt(players[1].maxCombo)],
      ]} better={[true, false, false, true, true]} />
    </CompareSection>
    <CompareSection icon={<Activity />} title="Activity & volume">
      <StatGrid players={players} rows={[
        ['Play count', fmt(players[0].playCount), fmt(players[1].playCount)],
        ['Play time', hours(players[0].playTime), hours(players[1].playTime)],
        ['Total score', score(players[0].totalScore), score(players[1].totalScore)],
        ['Ranked score', score(players[0].rankedScore), score(players[1].rankedScore)],
        ['Total hits', fmt(players[0].totalHits), fmt(players[1].totalHits)],
      ]} better={[true, true, true, true, true]} />
    </CompareSection>
    <CompareSection icon={<Medal />} title="Grades & progression">
      <StatGrid players={players} rows={[
        ['Level', players[0].level ? `${players[0].level.current ?? '—'} · ${players[0].level.progress ?? 0}%` : '—', players[1].level ? `${players[1].level.current ?? '—'} · ${players[1].level.progress ?? 0}%` : '—'],
        ['SS / SSH', grades(players[0], 'ss', 'ssh'), grades(players[1], 'ss', 'ssh')],
        ['S / SH', grades(players[0], 's', 'sh'), grades(players[1], 's', 'sh')],
        ['A', grades(players[0], 'a'), grades(players[1], 'a')],
        ['Replays watched', fmt(players[0].replaysWatched), fmt(players[1].replaysWatched)],
      ]} better={[true, true, true, true, true]} />
    </CompareSection>
    <CompareSection icon={<Trophy />} title="Top plays">
      <div className="grid grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] border-y border-slate-800/80">
        <TopPlays player={players[0]} side="left" opponent={players[1]} />
        <div className="flex items-start justify-center border-x border-slate-800/80 pt-6"><span className="text-[9px] uppercase tracking-[0.16em] text-slate-600 font-mono text-center leading-relaxed">Top 5<br />plays</span></div>
        <TopPlays player={players[1]} side="right" opponent={players[0]} />
      </div>
    </CompareSection>
    <CompareSection icon={<BarChart3 />} title="osu!DZ career">
      <div className="border-y border-slate-800/80">
        <StatGrid players={players} rows={[
          ['DZPP', platform[0]?.registered ? fmt(platform[0].dzpp) : '—', platform[1]?.registered ? fmt(platform[1].dzpp) : '—'],
          ['DZPP rank', platform[0]?.registered && platform[0].dzpp_rank ? `#${fmt(platform[0].dzpp_rank)}` : '—', platform[1]?.registered && platform[1].dzpp_rank ? `#${fmt(platform[1].dzpp_rank)}` : '—'],
          ['Live DZPP', platform[0]?.registered ? fmt(extras[0]?.liveDzpp) : '—', platform[1]?.registered ? fmt(extras[1]?.liveDzpp) : '—'],
          ['Rounds', platform[0]?.registered ? fmt(platform[0].rounds) : '—', platform[1]?.registered ? fmt(platform[1].rounds) : '—'],
          ['First places', platform[0]?.registered ? fmt(extras[0]?.firstPlaces) : '—', platform[1]?.registered ? fmt(extras[1]?.firstPlaces) : '—'],
          ['Best placement', platform[0]?.registered ? fmt(extras[0]?.bestPlacement) : '—', platform[1]?.registered ? fmt(extras[1]?.bestPlacement) : '—'],
          ['Qualified challenge score', platform[0]?.registered ? score(extras[0]?.qualifiedScores) : '—', platform[1]?.registered ? score(extras[1]?.qualifiedScores) : '—'],
          ['Challenge plays', platform[0]?.registered ? fmt(extras[0]?.challengePlays) : '—', platform[1]?.registered ? fmt(extras[1]?.challengePlays) : '—'],
          ['Total challenge score', platform[0]?.registered ? score(extras[0]?.totalChallengeScore) : '—', platform[1]?.registered ? score(extras[1]?.totalChallengeScore) : '—'],
          ['Approved beatmaps', platform[0]?.registered ? fmt(extras[0]?.approvedBeatmaps) : '—', platform[1]?.registered ? fmt(extras[1]?.approvedBeatmaps) : '—'],
          ['Votes received', platform[0]?.registered ? fmt(extras[0]?.votesReceived) : '—', platform[1]?.registered ? fmt(extras[1]?.votesReceived) : '—'],
        ]} better={[true, false, true, true, false, true, true, true, true, true, true]} numericRows={[
          [platform[0]?.registered ? platform[0].dzpp : null, platform[1]?.registered ? platform[1].dzpp : null],
          [platform[0]?.registered ? (platform[0].dzpp_rank ?? null) : null, platform[1]?.registered ? (platform[1].dzpp_rank ?? null) : null],
          [extras[0]?.liveDzpp ?? null, extras[1]?.liveDzpp ?? null],
          [platform[0]?.registered ? platform[0].rounds : null, platform[1]?.registered ? platform[1].rounds : null],
          [extras[0]?.firstPlaces ?? null, extras[1]?.firstPlaces ?? null],
          [extras[0]?.bestPlacement ?? null, extras[1]?.bestPlacement ?? null],
          [extras[0]?.qualifiedScores ?? null, extras[1]?.qualifiedScores ?? null],
          [extras[0]?.challengePlays ?? null, extras[1]?.challengePlays ?? null],
          [extras[0]?.totalChallengeScore ?? null, extras[1]?.totalChallengeScore ?? null],
          [extras[0]?.approvedBeatmaps ?? null, extras[1]?.approvedBeatmaps ?? null],
          [extras[0]?.votesReceived ?? null, extras[1]?.votesReceived ?? null],
        ]} />
      </div>
    </CompareSection>
    <CompareSection icon={<Zap />} title="Progression & streaks">
      <StatGrid players={players} rows={[
        ['Level', fmt(extras[0]?.level), fmt(extras[1]?.level)],
        ['Base level', fmt(extras[0]?.baseLevel), fmt(extras[1]?.baseLevel)],
        ['Challenge wins', fmt(extras[0]?.challengeWins), fmt(extras[1]?.challengeWins)],
        ['Challenge-win levels', fmt(extras[0]?.challengeWinLevels), fmt(extras[1]?.challengeWinLevels)],
        ['Level progress', extras[0] ? `${Math.round(extras[0].levelProgress * 100)}%` : '—', extras[1] ? `${Math.round(extras[1].levelProgress * 100)}%` : '—'],
        ['Current win streak', fmt(extras[0]?.streakCurrent), fmt(extras[1]?.streakCurrent)],
        ['Best win streak', fmt(extras[0]?.streakBest), fmt(extras[1]?.streakBest)],
      ]} better={[true, true, true, true, true, true, true]} numericRows={[
        [extras[0]?.level ?? null, extras[1]?.level ?? null],
        [extras[0]?.baseLevel ?? null, extras[1]?.baseLevel ?? null],
        [extras[0]?.challengeWins ?? null, extras[1]?.challengeWins ?? null],
        [extras[0]?.challengeWinLevels ?? null, extras[1]?.challengeWinLevels ?? null],
        [extras[0]?.levelProgress ?? null, extras[1]?.levelProgress ?? null],
        [extras[0]?.streakCurrent ?? null, extras[1]?.streakCurrent ?? null],
        [extras[0]?.streakBest ?? null, extras[1]?.streakBest ?? null],
      ]} />
    </CompareSection>
    <CompareSection icon={<Swords />} title="Duel Arena">
      <StatGrid players={players} rows={[
        ['Duels played', fmt(extras[0]?.duel.played), fmt(extras[1]?.duel.played)],
        ['Duel wins', fmt(extras[0]?.duel.wins), fmt(extras[1]?.duel.wins)],
        ['Duel losses', fmt(extras[0]?.duel.losses), fmt(extras[1]?.duel.losses)],
        ['Duel draws', fmt(extras[0]?.duel.draws), fmt(extras[1]?.duel.draws)],
        ['Duel win rate', extras[0]?.duel.played ? `${((extras[0].duel.wins / extras[0].duel.played) * 100).toFixed(1)}%` : '—', extras[1]?.duel.played ? `${((extras[1].duel.wins / extras[1].duel.played) * 100).toFixed(1)}%` : '—'],
        ['Duel PP earned', fmt(extras[0]?.duel.totalPayout ? extras[0].duel.totalPayout / 2 : 0), fmt(extras[1]?.duel.totalPayout ? extras[1].duel.totalPayout / 2 : 0)],
        ['Total staked', fmt(extras[0]?.duel.totalStaked), fmt(extras[1]?.duel.totalStaked)],
        ['Total payout', fmt(extras[0]?.duel.totalPayout), fmt(extras[1]?.duel.totalPayout)],
        ['Duel net', fmt(extras[0]?.duel.netDzpp), fmt(extras[1]?.duel.netDzpp)],
        ['Score wins', fmt(extras[0]?.duel.scoreWins), fmt(extras[1]?.duel.scoreWins)],
        ['Accuracy wins', fmt(extras[0]?.duel.accuracyWins), fmt(extras[1]?.duel.accuracyWins)],
        ['Full Combo wins', fmt(extras[0]?.duel.fullComboWins), fmt(extras[1]?.duel.fullComboWins)],
        ['Lowest-miss wins', fmt(extras[0]?.duel.lowestMissWins), fmt(extras[1]?.duel.lowestMissWins)],
      ]} better={[true, true, false, true, true, true, false, true, true, true, true, true, true]} numericRows={[
        [extras[0]?.duel.played ?? null, extras[1]?.duel.played ?? null],
        [extras[0]?.duel.wins ?? null, extras[1]?.duel.wins ?? null],
        [extras[0]?.duel.losses ?? null, extras[1]?.duel.losses ?? null],
        [extras[0]?.duel.draws ?? null, extras[1]?.duel.draws ?? null],
        [extras[0]?.duel.played ? extras[0].duel.wins / extras[0].duel.played : null, extras[1]?.duel.played ? extras[1].duel.wins / extras[1].duel.played : null],
        [extras[0]?.duel.wins ?? null, extras[1]?.duel.wins ?? null],
        [extras[0]?.duel.totalStaked ?? null, extras[1]?.duel.totalStaked ?? null],
        [extras[0]?.duel.totalPayout ?? null, extras[1]?.duel.totalPayout ?? null],
        [extras[0]?.duel.netDzpp ?? null, extras[1]?.duel.netDzpp ?? null],
        [extras[0]?.duel.scoreWins ?? null, extras[1]?.duel.scoreWins ?? null],
        [extras[0]?.duel.accuracyWins ?? null, extras[1]?.duel.accuracyWins ?? null],
        [extras[0]?.duel.fullComboWins ?? null, extras[1]?.duel.fullComboWins ?? null],
        [extras[0]?.duel.lowestMissWins ?? null, extras[1]?.duel.lowestMissWins ?? null],
      ]} />
    </CompareSection>
    <CompareSection icon={<Medal />} title="Adventurer Guild">
      <StatGrid players={players} rows={[
        ['Guild rank', extras[0]?.guild.registered ? (extras[0].guild.rank ?? '—') : 'Unregistered', extras[1]?.guild.registered ? (extras[1].guild.rank ?? '—') : 'Unregistered'],
        ['Guild EXP', extras[0]?.guild.registered ? fmt(extras[0].guild.exp) : '—', extras[1]?.guild.registered ? fmt(extras[1].guild.exp) : '—'],
        ['Hunt attempts', extras[0]?.guild.registered ? fmt(extras[0].guild.attemptedHunts) : '—', extras[1]?.guild.registered ? fmt(extras[1].guild.attemptedHunts) : '—'],
        ['Successful Hunts', extras[0]?.guild.registered ? fmt(extras[0].guild.successfulHunts) : '—', extras[1]?.guild.registered ? fmt(extras[1].guild.successfulHunts) : '—'],
        ['Failed Hunts', extras[0]?.guild.registered ? fmt(extras[0].guild.failedHunts) : '—', extras[1]?.guild.registered ? fmt(extras[1].guild.failedHunts) : '—'],
        ['Hunt success rate', extras[0]?.guild.attemptedHunts ? `${((extras[0].guild.successfulHunts / extras[0].guild.attemptedHunts) * 100).toFixed(1)}%` : '—', extras[1]?.guild.attemptedHunts ? `${((extras[1].guild.successfulHunts / extras[1].guild.attemptedHunts) * 100).toFixed(1)}%` : '—'],
        ['Placement exam', extras[0]?.guild.registered ? (extras[0].guild.examUsed ? 'Used' : 'Not used') : '—', extras[1]?.guild.registered ? (extras[1].guild.examUsed ? 'Used' : 'Not used') : '—'],
        ['Next Guild rank', extras[0]?.guild.registered ? (extras[0].guild.nextRank ?? 'Highest') : '—', extras[1]?.guild.registered ? (extras[1].guild.nextRank ?? 'Highest') : '—'],
      ]} better={[true, true, true, true, false, true, false, false]} numericRows={[
        [null, null],
        [extras[0]?.guild.registered ? extras[0].guild.exp : null, extras[1]?.guild.registered ? extras[1].guild.exp : null],
        [extras[0]?.guild.registered ? extras[0].guild.attemptedHunts : null, extras[1]?.guild.registered ? extras[1].guild.attemptedHunts : null],
        [extras[0]?.guild.registered ? extras[0].guild.successfulHunts : null, extras[1]?.guild.registered ? extras[1].guild.successfulHunts : null],
        [extras[0]?.guild.registered ? extras[0].guild.failedHunts : null, extras[1]?.guild.registered ? extras[1].guild.failedHunts : null],
        [extras[0]?.guild.attemptedHunts ? extras[0].guild.successfulHunts / extras[0].guild.attemptedHunts : null, extras[1]?.guild.attemptedHunts ? extras[1].guild.successfulHunts / extras[1].guild.attemptedHunts : null],
        [null, null],
        [null, null],
      ]} />
    </CompareSection>
    <CompareSection icon={<Trophy />} title="Collections & mapping">
      <StatGrid players={players} rows={[
        ['Challenge maps owned', fmt(extras[0]?.challengeCollection), fmt(extras[1]?.challengeCollection)],
        ['Shop items owned', fmt(extras[0]?.shopItems), fmt(extras[1]?.shopItems)],
        ['Approved beatmaps', fmt(extras[0]?.approvedBeatmaps), fmt(extras[1]?.approvedBeatmaps)],
        ['Votes received', fmt(extras[0]?.votesReceived), fmt(extras[1]?.votesReceived)],
      ]} better={[true, true, true, true]} numericRows={[
        [extras[0]?.challengeCollection ?? null, extras[1]?.challengeCollection ?? null],
        [extras[0]?.shopItems ?? null, extras[1]?.shopItems ?? null],
        [extras[0]?.approvedBeatmaps ?? null, extras[1]?.approvedBeatmaps ?? null],
        [extras[0]?.votesReceived ?? null, extras[1]?.votesReceived ?? null],
      ]} />
    </CompareSection>
  </div>;
}

function PlayerHero({ players }: { players: [OsuPlayer, OsuPlayer] }) {
  return <div className="grid md:grid-cols-2 border-y border-slate-800/80">{players.map((p, i) => <div key={p.id} className={`relative overflow-hidden py-7 ${i === 1 ? 'md:border-l border-slate-800/80' : ''}`}><div className="absolute inset-0 bg-gradient-to-br from-pink-500/[0.07] via-transparent to-violet-500/[0.05]" /><div className="relative px-1 md:px-7"><div className="flex items-center gap-4"><img src={p.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-800" /><div><p className="text-[9px] uppercase tracking-[0.2em] text-slate-600 font-mono">{i === 0 ? 'PLAYER A' : 'PLAYER B'}</p><h2 className="text-2xl font-black text-white mt-1">{p.username}</h2><p className="text-xs text-slate-500 mt-1">{p.country} · {p.globalRank ? `#${fmt(p.globalRank)} global` : 'Unranked'}</p></div></div><div className="mt-7 flex items-end justify-between"><div><p className="text-[9px] uppercase tracking-widest text-slate-600 font-mono">PP</p><p className="text-4xl font-black text-white mt-1">{p.pp == null ? '—' : Math.round(p.pp).toLocaleString()}<span className="text-sm text-pink-300 ml-1">pp</span></p></div><div className="text-right"><p className="text-[9px] uppercase tracking-widest text-slate-600 font-mono">Accuracy</p><p className="text-xl font-black text-slate-200 mt-1">{pct(p.accuracy)}</p></div></div></div></div>)}</div>;
}

function CompareSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section><div className="flex items-center gap-2 mb-3 text-slate-500"><span className="text-pink-300 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span><p className="text-[10px] uppercase tracking-[0.2em] font-mono">{title}</p></div>{children}</section>;
}

function StatGrid({ players, rows, better, numericRows }: { players: [OsuPlayer, OsuPlayer]; rows: Array<[string, React.ReactNode, React.ReactNode]>; better: boolean[]; numericRows?: Array<[number | null, number | null]> }) {
  const numeric = (player: OsuPlayer, label: string): number | null => {
    const values: Record<string, number | null> = {
      'Performance points': player.pp,
      'Global rank': player.globalRank,
      'Country rank': player.countryRank,
      'Hit accuracy': player.accuracy,
      'Maximum combo': player.maxCombo,
      'Play count': player.playCount,
      'Play time': player.playTime,
      'Total score': player.totalScore,
      'Ranked score': player.rankedScore,
      'Total hits': player.totalHits,
      'Level': player.level?.current ?? null,
      'SS / SSH': player.grades ? (player.grades.ss ?? 0) + (player.grades.ssh ?? 0) : null,
      'S / SH': player.grades ? (player.grades.s ?? 0) + (player.grades.sh ?? 0) : null,
      'A': player.grades?.a ?? null,
      'Replays watched': player.replaysWatched,
    };
    return values[label] ?? null;
  };

  const tone = (left: number | null, right: number | null, higherIsBetter: boolean): string => {
    if (left == null || right == null || left === right) return 'text-white';
    const leftWins = higherIsBetter ? left > right : left < right;
    return leftWins ? 'text-emerald-400' : 'text-rose-400';
  };

  return <div className="border-y border-slate-800/80">{rows.map(([label, a, b], index) => {
    const left = numericRows?.[index]?.[0] ?? numeric(players[0], label);
    const right = numericRows?.[index]?.[1] ?? numeric(players[1], label);
    const higherIsBetter = better[index];
    return <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-h-14 border-b last:border-b-0 border-slate-800/60 items-center">
      <div className={`px-4 text-right text-sm font-bold ${tone(left, right, higherIsBetter)}`}>{a}</div>
      <div className="px-5 text-center text-[9px] uppercase tracking-[0.16em] text-slate-600 font-mono whitespace-nowrap">{label}</div>
      <div className={`px-4 text-left text-sm font-bold ${tone(right, left, higherIsBetter)}`}>{b}</div>
    </div>;
  })}</div>;
}

function TopPlays({ player, opponent, side }: { player: OsuPlayer; opponent: OsuPlayer; side: 'left' | 'right' }) {
  const tone = (value: number | null, other: number | null) => value == null || other == null || value === other ? 'text-white' : value > other ? 'text-emerald-400' : 'text-rose-400';
  return <div className={`py-5 ${side === 'left' ? 'pr-4' : 'pl-4'}`}><div className={`${side === 'right' ? 'text-left' : 'text-right'} mb-4`}><p className="font-black text-white">{player.username}</p><p className="text-[9px] uppercase tracking-widest text-slate-600 font-mono mt-1">best 5</p></div><div className="space-y-1.5">{player.best.length === 0 ? <div className="py-8 text-center text-[10px] uppercase tracking-widest text-slate-700 font-mono">Top plays unavailable</div> : player.best.map((play, i) => { const other = opponent.best[i]; return <div key={play.id} className={`grid grid-cols-[24px_1fr_auto] gap-2 items-center bg-slate-950/40 px-3 py-2.5 ${side === 'right' ? '' : ''}`}><span className={`text-[10px] font-black font-mono ${i === 0 ? 'text-pink-300' : 'text-slate-600'}`}>#{i + 1}</span><div className="min-w-0"><p className="text-xs text-slate-200 truncate">{play.beatmap.title}</p><p className="text-[9px] text-slate-600 truncate">{play.beatmap.version} · {play.mods.length ? play.mods.join('') : 'NM'} · {(play.accuracy * 100).toFixed(2)}%</p></div><div className={`text-right text-xs font-black ${tone(play.pp, other?.pp ?? null)}`}>{play.pp == null ? '—' : `${Math.round(play.pp)}pp`}<p className="text-[9px] text-slate-600">{play.beatmap.difficultyRating?.toFixed(2) ?? '—'}★</p></div></div>; })}</div></div>;
}

function SmallStat({ label, value }: { label: string; value: React.ReactNode }) { return <div><p className="text-[9px] uppercase tracking-widest text-slate-600 font-mono">{label}</p><p className="text-lg font-black text-white mt-1">{value}</p></div>; }
function grades(player: OsuPlayer, a: 'ss'|'s'|'a', b?: 'ssh'|'sh') { const g = player.grades; if (!g) return '—'; return b ? `${fmt(g[a])} / ${fmt(g[b])}` : fmt(g[a]); }
