import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  Check,
  Crosshair,
  ExternalLink,
  LockKeyhole,
  Volume2,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Swords,
  Timer,
  Trophy,
  Upload,
  X,
} from 'lucide-react';
import type { AuthUser } from '../NavHeader';
import { api, type ApiDuel } from '../../../api/client';
import { useAudioPreview } from '../../../lib/audioPreview';

const fmt = (n?: number) => n === undefined ? '—' : n.toLocaleString();
const MOCK_DUEL_TESTING = import.meta.env.DEV;
const mapTime = (seconds?: number) => {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—';
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

function duelStarStyle(rating: number) {
  if (rating < 1) return { header: 'bg-slate-500 text-white', fill: 'text-slate-400', border: 'border-slate-500/60' };
  if (rating < 2) return { header: 'bg-blue-500 text-white', fill: 'text-blue-400', border: 'border-blue-500/60' };
  if (rating < 2.5) return { header: 'bg-cyan-400 text-slate-950', fill: 'text-cyan-400', border: 'border-cyan-400/60' };
  if (rating < 3) return { header: 'bg-green-500 text-slate-950', fill: 'text-green-400', border: 'border-green-500/60' };
  if (rating < 3.5) return { header: 'bg-lime-400 text-slate-950', fill: 'text-lime-400', border: 'border-lime-400/60' };
  if (rating < 4) return { header: 'bg-yellow-400 text-slate-950', fill: 'text-yellow-400', border: 'border-yellow-400/60' };
  if (rating < 4.5) return { header: 'bg-amber-500 text-slate-950', fill: 'text-amber-400', border: 'border-amber-500/60' };
  if (rating < 5) return { header: 'bg-orange-500 text-white', fill: 'text-orange-400', border: 'border-orange-500/60' };
  if (rating < 5.5) return { header: 'bg-red-500 text-white', fill: 'text-red-400', border: 'border-red-500/60' };
  if (rating < 6) return { header: 'bg-rose-500 text-white', fill: 'text-rose-400', border: 'border-rose-500/60' };
  if (rating < 6.5) return { header: 'bg-pink-500 text-white', fill: 'text-pink-400', border: 'border-pink-400/60' };
  if (rating < 7) return { header: 'bg-purple-600 text-white', fill: 'text-purple-400', border: 'border-purple-600/60' };
  if (rating < 8) return { header: 'bg-indigo-600 text-white', fill: 'text-indigo-400', border: 'border-indigo-600/60' };
  return { header: 'bg-indigo-950 text-white', fill: 'text-indigo-300', border: 'border-indigo-500/60' };
}

function duelModStyle(mods: string) {
  const styles: Record<string, { bg: string; border: string; text: string }> = {
    NM: { bg: 'bg-slate-800/60', border: 'border-slate-600/60', text: 'text-slate-300' },
    HD: { bg: 'bg-amber-900/40', border: 'border-amber-500/60', text: 'text-amber-400' },
    HR: { bg: 'bg-rose-900/40', border: 'border-rose-500/60', text: 'text-rose-400' },
    DT: { bg: 'bg-sky-900/40', border: 'border-sky-500/60', text: 'text-sky-400' },
    HDHR: { bg: 'bg-purple-900/40', border: 'border-purple-500/60', text: 'text-purple-400' },
    HDDT: { bg: 'bg-indigo-900/40', border: 'border-indigo-500/60', text: 'text-indigo-400' },
    FM: { bg: 'bg-emerald-900/40', border: 'border-emerald-500/60', text: 'text-emerald-400' },
    EZ: { bg: 'bg-green-900/40', border: 'border-green-500/60', text: 'text-green-400' },
    FL: { bg: 'bg-violet-900/40', border: 'border-violet-500/60', text: 'text-violet-400' },
    HRDT: { bg: 'bg-orange-900/40', border: 'border-orange-500/60', text: 'text-orange-400' },
  };
  return styles[mods] ?? styles.NM;
}

export function DuelsPage({ user, onLogin, onNavigateToPlayer }: { user: AuthUser | null; onLogin: () => void; onNavigateToPlayer: (username: string) => void }) {
  const [duels, setDuels] = useState<ApiDuel[]>([]);
  const [balance, setBalance] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [tab, setTab] = useState<'arena' | 'current' | 'mine'>('arena');
  const [currentDuelId, setCurrentDuelId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesPurpose, setRulesPurpose] = useState<'post' | 'accept'>('post');
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [message, setMessage] = useState('');

  const active = duels.find((d) => d.id === activeId) ?? null;
  const detail = duels.find((d) => d.id === detailId) ?? null;
  const open = useMemo(() => duels.filter((d) => d.status === 'open'), [duels]);
  const live = useMemo(() => duels.filter((d) => d.status === 'live'), [duels]);
  const mine = useMemo(
    () => duels.filter((d) => !!user && (d.challengerUserId === user.id || d.opponentUserId === user.id)),
    [duels, user],
  );

  const acceptRules = async () => {
    if (!user) return onLogin();
    const result = await api.duels.acceptRules();
    if (!result.ok) return setMessage(result.error);
    setRulesAccepted(true);
    setRulesOpen(false);
    if (rulesPurpose === 'post') setCreateOpen(true);
  };

  const requestRules = (purpose: 'post' | 'accept') => {
    if (!user) return onLogin();
    if (rulesAccepted) {
      if (purpose === 'post') setCreateOpen(true);
      return;
    }
    setRulesPurpose(purpose);
    setRulesOpen(true);
  };

  const refresh = async () => {
    const r = await api.duels.list();
    if (!r.ok) { setMessage(r.error); return; }
    setDuels(r.data.duels);
    setBalance(r.data.balance);
    setActiveId((id) => id && r.data.duels.some((d) => d.id === id) ? id : null);
  };

  useEffect(() => {
    if (user) {
      void refresh();
      void api.duels.rules().then((r) => setRulesAccepted(r.ok && r.data.accepted));
    } else { setDuels([]); setBalance(0); setActiveId(null); setRulesAccepted(false); }
  }, [user]);

  useEffect(() => {
    if (!user || tab !== 'current') return;
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    return () => window.clearInterval(timer);
  }, [user, tab]);

  const accept = async (id: number) => {
    if (!user) return onLogin();
    const r = await api.duels.accept(id);
    if (!r.ok) return setMessage(r.error);
    await refresh();
    setActiveId(id);
    setDetailId(null);
    setMessage('Duel accepted. Your stake is locked.');
  };

  const handleAccept = (id: number) => {
    if (!user) return onLogin();
    if (!rulesAccepted) {
      setRulesPurpose('accept');
      setRulesOpen(true);
      return;
    }
    void accept(id);
  };

  const importScore = async (duelId: number) => {
    if (!user) return onLogin();
    const r = await api.duels.importScore(duelId);
    if (!r.ok) return setMessage(r.error);
    await refresh();
    setMessage('Score imported: ' + r.data.score.toLocaleString());
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-20 sm:px-6">
      <header className="relative mb-7 overflow-hidden border-b border-slate-800/80 pb-8">
        <div className="absolute right-12 -top-28 h-64 w-64 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-rose-300"><Crosshair className="h-3.5 w-3.5" /> Head-to-head arena</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Duel for the points.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">Enter the arena with an osu!standard or osu!mania beatmap, challenge another player, lock the same stake, and settle the duel from verified osu! scores.</p>
          </div>
          <div className="flex items-stretch gap-2">
            <div className="min-w-[170px] border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.16em] text-amber-300/70"><img src="/assets/dzpp-currency.png" alt="" className="h-5 w-5 shrink-0 object-contain" /> Duel DZPP</div>
              <div className="mt-1 text-xl font-black tabular-nums text-amber-300">{balance.toLocaleString()} <span className="text-[10px] font-mono text-amber-300/60">DZPP</span></div>
            </div>
            <button type="button" onClick={() => requestRules('post')} className="flex items-center gap-2 bg-rose-500 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-400"><Plus className="h-4 w-4" /> Post duel</button>
          </div>
        </div>
      </header>

      <div className="mb-7 flex items-center gap-2 border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-xs text-slate-400">
        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400" /> Duel DZPP is a separate ledger. It never changes platform DZPP or monthly challenge rewards.
      </div>

      {message && <div className="mb-5 flex justify-between border border-rose-400/20 bg-rose-500/5 px-4 py-3 text-xs text-rose-200"><span>{message}</span><button onClick={() => setMessage('')}><X className="h-4 w-4" /></button></div>}

      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex gap-5">
            <Tab active={tab === 'arena'} label={`Arena · ${open.length} open`} onClick={() => setTab('arena')} />
            <Tab active={tab === 'current'} label={`Current duels · ${live.length}`} onClick={() => { setTab('current'); setCurrentDuelId(null); }} />
            <Tab active={tab === 'mine'} label="My duels" onClick={() => setTab('mine')} />
          </div>
          <div className="hidden items-center gap-2 pb-3 text-[9px] font-mono uppercase tracking-widest text-slate-600 sm:flex"><Swords className="h-3.5 w-3.5" /> {tab === 'current' ? 'Live arena' : 'Duel arena'}</div>
        </div>

        {tab === 'current' && <CurrentDuelsSection duels={live} selectedId={currentDuelId} user={user} onSelect={setCurrentDuelId} onImport={importScore} onNavigateToPlayer={onNavigateToPlayer} onReplayShared={refresh} />}
        {tab === 'mine' && <Mine duels={mine} userId={user?.id} onImport={importScore} onRefresh={refresh} />}
      </section>

      {tab === 'arena' && (
      <section>
          <div className="mb-4 flex items-end justify-between">
            <div><p className="text-[9px] font-mono uppercase tracking-[0.2em] text-amber-400/70">Find your opponent</p><h2 className="mt-1 text-lg font-black text-white">Open challenges</h2></div>
            <span className="text-[10px] font-mono text-slate-600">{open.length} available</span>
          </div>
          {open.length === 0 ? <EmptyChallenges /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{open.map((duel) => <DuelCard key={duel.id} duel={duel} onSelect={() => setDetailId(duel.id)} onAccept={() => handleAccept(duel.id)} onNavigateToPlayer={onNavigateToPlayer} balance={balance} />)}</div>}
        </section>
      )}

      {rulesOpen && <RulesModal purpose={rulesPurpose} onAccept={acceptRules} onClose={() => setRulesOpen(false)} />}
      {detail && <DuelDetails duel={detail} balance={balance} userId={user?.id} onAccept={() => handleAccept(detail.id)} onClose={() => setDetailId(null)} />}
      {createOpen && <Create onClose={() => setCreateOpen(false)} balance={balance} onCreated={async () => { setCreateOpen(false); await refresh(); }} />}
    </div>
  );
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button onClick={onClick} className={'border-b-2 pb-3 text-xs font-black uppercase tracking-wider ' + (active ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-600 hover:text-slate-400')}>{label}</button>;
}

function ArenaEmpty({ onPost }: { onPost: () => void }) {
  return <div className="relative overflow-hidden border border-slate-800 bg-[#0b1322] px-6 py-14 text-center sm:px-10">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,63,94,.07),transparent_55%)]" />
    <div className="relative mx-auto max-w-xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/10 text-rose-300"><Swords className="h-5 w-5" /></div><h2 className="mt-4 text-xl font-black text-white">The arena is waiting.</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">Post a duel or choose an open challenge below. Once two players lock their stakes, this space becomes the live match.</p><button onClick={onPost} className="mt-6 bg-rose-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-400">Post a duel</button></div>
  </div>;
}

function EmptyChallenges() {
  return <div className="border border-dashed border-slate-800 bg-[#0b1322]/60 px-6 py-12 text-center"><Trophy className="mx-auto h-5 w-5 text-slate-700" /><p className="mt-3 text-sm font-bold text-slate-500">No open challenges right now.</p><p className="mt-1 text-xs text-slate-700">Be the first player to put a duel on the board.</p></div>;
}

function LiveSection({ duels, user, onSelect, onImport, onPost }: { duels: ApiDuel[]; user: AuthUser | null; onSelect: (id: number) => void; onImport: () => void; onPost: () => void }) {
  return <section className="mb-10">
    <div className="mb-4 flex items-end justify-between border-b border-slate-800/80 pb-3">
      <div><div className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-[0.2em] text-rose-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /> Live arena</div><h2 className="mt-1 text-lg font-black text-white">Live duels</h2><p className="mt-1 text-xs text-slate-600">Active matches between locked opponents.</p></div>
      <span className="text-[10px] font-mono text-slate-600">{duels.length} active</span>
    </div>
    {duels.length ? <div className="space-y-4">{duels.map((duel) => <Live key={duel.id} duel={duel} user={user} onSelect={() => onSelect(duel.id)} onImport={onImport} onNavigateToPlayer={() => {}} />)}</div> : <ArenaEmpty onPost={onPost} />}
  </section>;
}

function CurrentDuelsSection({ duels, selectedId, user, onSelect, onImport, onNavigateToPlayer, onReplayShared }: { duels: ApiDuel[]; selectedId: number | null; user: AuthUser | null; onSelect: (id: number | null) => void; onImport: (id: number) => void; onNavigateToPlayer: (username: string) => void; onReplayShared: () => Promise<void> }) {
  const selected = selectedId === null ? null : duels.find((duel) => duel.id === selectedId) ?? null;

  if (!duels.length) {
    return <div className="border border-dashed border-slate-800 bg-[#0b1322]/60 px-6 py-12 text-center"><Swords className="mx-auto h-5 w-5 text-slate-700" /><p className="mt-3 text-sm font-bold text-slate-500">No current duels.</p><p className="mt-1 text-xs text-slate-700">Live matches will appear here while they are in progress.</p></div>;
  }

  if (selected) {
    return <div>
      <button type="button" onClick={() => onSelect(null)} className="mb-4 text-[9px] font-black uppercase tracking-wider text-slate-600 hover:text-white">← Current duels</button>
      <Live duel={selected} user={user} onSelect={() => onSelect(null)} onImport={() => onImport(selected.id)} onNavigateToPlayer={onNavigateToPlayer} onReplayShared={onReplayShared} />
    </div>;
  }

  return <div className="space-y-2">{duels.map((duel) => <button key={duel.id} type="button" onClick={() => onSelect(duel.id)} className="group flex w-full items-center gap-4 rounded-xl border border-slate-800 bg-[#0b1322] p-3 text-left transition hover:border-amber-400/30 hover:bg-[#0d1729]">
    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-950">{(duel.coverUrl || duel.beatmapsetId) && <img src={duel.coverUrl || `https://assets.ppy.sh/beatmaps/${duel.beatmapsetId}/covers/cover.jpg`} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-45" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}<div className="absolute inset-0 bg-gradient-to-r from-[#0b1322]/70 to-transparent" /><span className="absolute left-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /></div>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[8px] font-mono font-black uppercase tracking-widest text-rose-300">Live now</span><span className="text-[8px] font-mono text-slate-700">#{duel.id}</span></div><p className="mt-1 truncate text-sm font-black text-white group-hover:text-amber-100">{duel.title}</p><p className="truncate text-[10px] text-slate-600">{duel.challenger} vs {duel.opponent ?? 'Opponent'} · {duel.mods}</p></div>
    <div className="hidden shrink-0 text-right sm:block"><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">Pot</p><p className="mt-1 text-xs font-black text-amber-300">{(duel.stake * 2).toLocaleString()} DZPP</p></div>
    <span className="shrink-0 border border-slate-700 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 transition group-hover:border-amber-400/40 group-hover:text-amber-300">View duel</span>
  </button>)}</div>;
}

function DuelCard({ duel, onSelect, onAccept, onNavigateToPlayer, balance }: { duel: ApiDuel; onSelect: () => void; onAccept: () => void; onNavigateToPlayer: (username: string) => void; balance: number }) {
  const { isPlaying, toggle: togglePlay } = useAudioPreview(String(duel.difficultyId), duel.previewUrl);

  return <article className="group overflow-hidden rounded-none border border-emerald-400/35 bg-[#0b1322] text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400/60 hover:bg-[#0d1729] hover:shadow-xl hover:shadow-emerald-950/20">
    <div className="relative h-40 overflow-hidden bg-slate-950">
      {(duel.coverUrl || duel.beatmapsetId) && <img src={duel.coverUrl || `https://assets.ppy.sh/beatmaps/${duel.beatmapsetId}/covers/cover.jpg`} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-35 transition duration-500 group-hover:scale-105 group-hover:opacity-50" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      {!duel.beatmapsetId && <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.12),transparent_45%)]" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b1322] via-[#0b1322]/45 to-transparent" />
      <div className="absolute left-4 top-3 flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-widest text-rose-300"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Open duel</div>
      <div className="absolute right-4 top-3 text-[9px] font-mono font-black uppercase tracking-wider text-slate-300">
        <span className="text-slate-500">Expires</span> {new Date(duel.endsAt).toLocaleDateString()} · {new Date(duel.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      {duel.previewUrl && <button
        type="button"
        onClick={(event) => { event.stopPropagation(); togglePlay(); }}
        aria-label={isPlaying ? `Pause ${duel.title} preview` : `Play ${duel.title} preview`}
        className={`absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-all ${isPlaying ? 'border-amber-300/80 bg-amber-400 text-slate-950 shadow-amber-950/40' : 'border-white/15 bg-slate-950/80 text-white hover:border-amber-400/50 hover:bg-slate-900'}`}
      >
        {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>}
      <div className="absolute bottom-4 left-4 right-4"><h3 className="line-clamp-1 text-lg font-black text-white">{duel.title}</h3><p className="mt-1 line-clamp-1 text-xs text-slate-300">{duel.artist} · {duel.difficulty}</p>{duel.mapper && <p className="mt-1 text-[9px] font-mono text-slate-500">mapped by {duel.mapper}</p>}</div>
    </div>
    <div className="p-4">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={() => onNavigateToPlayer(duel.challenger)} aria-label={`Open ${duel.challenger}'s profile`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/70 bg-amber-400/10 p-0.5 shadow-[0_0_10px_rgba(250,204,21,0.18)] transition hover:border-amber-300 hover:shadow-[0_0_14px_rgba(250,204,21,0.3)]">
            {duel.challengerAvatar ? <img src={duel.challengerAvatar} alt={duel.challenger} referrerPolicy="no-referrer" className="h-full w-full rounded-full bg-slate-900 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} /> : null}
            <span className={duel.challengerAvatar ? 'hidden h-full w-full items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-amber-300' : 'flex h-full w-full items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-amber-300'}>{duel.challenger.slice(0, 1).toUpperCase()}</span>
          </button>
          <button type="button" onClick={() => onNavigateToPlayer(duel.challenger)} className="min-w-0 truncate text-left" aria-label={`Open ${duel.challenger}'s profile`}><p className="text-[8px] font-mono font-black uppercase tracking-widest text-slate-600">Challenger</p><p className="truncate text-xs font-black text-white transition group-hover:text-amber-200">{duel.challenger}</p></button>
        </div>
        <span className={`shrink-0 text-[10px] font-black ${duelStarStyle(duel.stars).fill}`}>★ {duel.stars.toFixed(2)}</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-slate-800/70 py-3 text-[10px] font-mono">
        <span><b className="text-slate-500">BPM</b> <strong className="text-slate-200">{duel.bpm ? fmt(duel.bpm) : '—'}</strong></span>
        <span><b className="text-slate-500">LEN</b> <strong className="text-slate-200">{mapTime(duel.lengthSeconds)}</strong></span>
        <span><b className="text-slate-500">CS</b> <strong className="text-slate-200">{duel.cs == null ? '—' : duel.cs.toFixed(1)}</strong></span>
        <span><b className="text-slate-500">AR</b> <strong className="text-slate-200">{duel.ar == null ? '—' : duel.ar.toFixed(1)}</strong></span>
        <span><b className="text-slate-500">OD</b> <strong className="text-slate-200">{duel.od == null ? '—' : duel.od.toFixed(1)}</strong></span>
        <span><b className="text-slate-500">HP</b> <strong className="text-slate-200">{duel.hp == null ? '—' : duel.hp.toFixed(1)}</strong></span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-mono font-black uppercase tracking-widest text-slate-600">Win condition</p>
          <p className="mt-1 truncate text-xs font-black text-rose-300">{duel.requirement}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[8px] font-mono font-black uppercase tracking-widest text-slate-600">Mod requirements</p>
          <p className="mt-1 text-xs font-black text-emerald-300">{duel.mods}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">Stake <strong className="inline-flex items-center gap-0.5 text-[10px] font-mono font-black text-amber-300"><img src="/assets/dzpp-currency.png" alt="" className="h-[12px] w-[12px] object-contain" />{duel.stake.toLocaleString()}</strong></span>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">Pot <strong className="inline-flex items-center gap-0.5 text-amber-300"><img src="/assets/dzpp-currency.png" alt="" className="h-[12px] w-[12px] object-contain" />{(duel.stake * 2).toLocaleString()}</strong></span>
      </div>
      <div className="mt-3 flex items-center gap-2"><button type="button" onClick={onSelect} className="flex-1 border border-slate-700 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:border-slate-600 hover:text-white">View duel</button><button type="button" onClick={onAccept} disabled={balance < duel.stake} className="flex-[1.35] border border-amber-400/35 bg-amber-400/[0.08] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-amber-300 hover:border-amber-400/55 hover:bg-amber-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40">{balance < duel.stake ? <>Insufficient <img src="/assets/dzpp-currency.png" alt="" className="mx-1 inline h-[12px] w-[12px] object-contain" /></> : <>Accept <img src="/assets/dzpp-currency.png" alt="" className="mx-1 inline h-[12px] w-[12px] object-contain" /> {duel.stake.toLocaleString()}</>}</button></div>
    </div>
  </article>;
}

function MapStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-2 text-center"><p className="text-[8px] font-mono uppercase tracking-wider text-slate-600">{label}</p><p className="mt-1 text-[11px] font-black text-slate-300">{value}</p></div>;
}

function DuelDetails({ duel, balance, userId, onAccept, onClose }: { duel: ApiDuel; balance: number; userId?: number; onAccept: () => void; onClose: () => void }) {
  const isOwn = duel.challengerUserId === userId;
  const isOpen = duel.status === 'open';
  return <div className="fixed inset-0 z-[65] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1322] shadow-2xl shadow-black/40">
      <div className="relative h-48 overflow-hidden bg-slate-950">
        {(duel.coverUrl || duel.beatmapsetId) && <img src={duel.coverUrl || `https://assets.ppy.sh/beatmaps/${duel.beatmapsetId}/covers/cover.jpg`} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-40" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1322] via-[#0b1322]/35 to-transparent" />
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/30 p-2 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        <div className="absolute bottom-5 left-5 right-5"><div className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-[0.2em] text-rose-300"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Open challenge <span className="text-slate-600">#{duel.id}</span></div><h2 className="mt-1 text-2xl font-black text-white">{duel.title}</h2><p className="mt-1 text-xs text-slate-400">{duel.artist} · {duel.difficulty} · mapped by {duel.mapper || duel.challenger}</p></div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><MapStat label="Difficulty" value={`${duel.stars.toFixed(2)}★`} /><MapStat label="BPM" value={duel.bpm ? fmt(duel.bpm) : '—'} /><MapStat label="Length" value={mapTime(duel.lengthSeconds)} /><MapStat label="Max combo" value={duel.maxCombo ? fmt(duel.maxCombo) : '—'} /></div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"><MapStat label="CS" value={duel.cs == null ? '—' : duel.cs.toFixed(1)} /><MapStat label="AR" value={duel.ar == null ? '—' : duel.ar.toFixed(1)} /><MapStat label="OD" value={duel.od == null ? '—' : duel.od.toFixed(1)} /><MapStat label="HP" value={duel.hp == null ? '—' : duel.hp.toFixed(1)} /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><Info label="Challenger" value={duel.challenger} /><Info label="Mods" value={duel.mods === 'FM' ? 'FreeMod' : duel.mods} /><Info label="Win condition" value={duel.requirement} /></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Info label="Stake" value={`${duel.stake.toLocaleString()} DZPP`} accent /><Info label="Total pot" value={`${(duel.stake * 2).toLocaleString()} DZPP`} accent /></div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4"><div><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">Challenge expires</p><p className="mt-1 text-xs text-slate-400">{new Date(duel.endsAt).toLocaleDateString()} · {new Date(duel.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>{isOpen && !isOwn && <button type="button" onClick={onAccept} disabled={balance < duel.stake} className="bg-amber-400 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">{balance < duel.stake ? 'Insufficient DZPP' : `Accept duel · ${duel.stake.toLocaleString()} DZPP`}</button>}</div>
      </div>
    </div>
  </div>;
}

function Info({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-3"><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">{label}</p><p className={`mt-1 text-xs font-black ${accent ? 'text-amber-300' : 'text-slate-300'}`}>{value}</p></div>;
}

function Mine({ duels, userId, onImport, onRefresh }: { duels: ApiDuel[]; userId?: number; onImport: (id: number) => void; onRefresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<'all' | 'posted' | 'accepted' | 'active' | 'history'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const accepted = duels.filter((d) => d.opponentUserId === userId);
  const postedByMe = duels.filter((d) => d.challengerUserId === userId);
  const active = duels.filter((d) => d.status === 'open' || d.status === 'live');
  const history = duels.filter((d) => d.status === 'settled');
  const counts = { all: duels.length, posted: postedByMe.length, accepted: accepted.length, active: active.length, history: history.length };
  const visible = filter === 'all' ? duels : filter === 'posted' ? postedByMe : filter === 'accepted' ? accepted : filter === 'active' ? active : history;
  const filterItems: Array<[typeof filter, string]> = [['all', 'All'], ['posted', 'Posted'], ['accepted', 'Accepted'], ['active', 'Active'], ['history', 'History']];
  if (!duels.length) return <div className="border border-slate-800 bg-[#0b1322] p-12 text-center"><Trophy className="mx-auto h-5 w-5 text-slate-700" /><p className="mt-3 text-sm font-bold text-slate-500">You have no duels yet.</p><p className="mt-1 text-xs text-slate-700">Your posted and accepted duels will appear here.</p></div>;
  return <div>
    <div className="mb-5 flex flex-wrap items-center gap-1 border-b border-slate-800/80 pb-1">{filterItems.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`border-b-2 px-3 py-2.5 text-[9px] font-black uppercase tracking-wider ${filter === key ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-600 hover:text-slate-400'}`}>{label} <span className="ml-1 font-mono text-slate-700">{counts[key]}</span></button>)}</div>
    {visible.length ? <div className="space-y-2">{visible.map((d) => <MyDuelRow key={d.id} duel={d} selected={selectedId === d.id} onSelect={() => setSelectedId((id) => id === d.id ? null : d.id)} />)}</div> : <div className="border border-dashed border-slate-800 px-6 py-10 text-center text-xs text-slate-600">No duels in this category.</div>}
    {selectedId !== null && visible.some((d) => d.id === selectedId) && <MyDuelDetail duel={visible.find((d) => d.id === selectedId)!} userId={userId} onImport={() => onImport(selectedId)} onRefresh={onRefresh} />}
  </div>;
}

function MyDuelRow({ duel, selected, onSelect }: { duel: ApiDuel; selected: boolean; onSelect: () => void }) {
  const role = duel.opponentUserId ? 'Matched' : 'Posted';
  const status = duel.status === 'live' ? 'Live' : duel.status === 'open' ? 'Waiting' : 'Settled';
  const score = duel.challengerScore ?? duel.opponentScore;
  const accuracy = duel.challengerAccuracy ?? duel.opponentAccuracy;
  const misses = duel.challengerMisses ?? duel.opponentMisses;
  return <button type="button" onClick={onSelect} className={`group w-full overflow-hidden rounded-xl border bg-[#0b1322] text-left transition hover:border-slate-700 hover:bg-[#0d1729] ${selected ? 'border-amber-400/30' : 'border-slate-800'}`}>
    <div className="flex min-h-[94px] items-center gap-4 px-4 py-3 sm:px-5">
      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-950">{duel.coverUrl && <img src={duel.coverUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-50" />}<div className="absolute inset-0 bg-gradient-to-r from-[#0b1322]/70 to-transparent" /><span className={`absolute left-2 top-2 h-1.5 w-1.5 rounded-full ${duel.status === 'live' ? 'animate-pulse bg-rose-400' : duel.status === 'settled' ? 'bg-slate-600' : 'bg-amber-400'}`} /></div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`text-[8px] font-mono font-black uppercase tracking-widest ${duel.status === 'live' ? 'text-rose-300' : duel.status === 'settled' ? 'text-slate-600' : 'text-amber-300'}`}>{status}</span><span className="text-[8px] font-mono uppercase tracking-widest text-slate-700">{role}</span></div><p className="mt-1 truncate text-sm font-black text-white">{duel.title}</p><p className="mt-0.5 truncate text-[10px] text-slate-600">{duel.artist} · {duel.difficulty} · {duel.mods}</p></div>
      <div className="hidden shrink-0 text-right sm:block"><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">Opponent</p><p className="mt-1 max-w-28 truncate text-[10px] font-bold text-slate-400">{duel.opponent || (duel.challenger === duel.opponent ? '—' : duel.challenger)}</p></div>
      <div className="hidden w-24 shrink-0 text-right md:block"><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">Score</p><p className="mt-1 text-xs font-black tabular-nums text-slate-300">{score === undefined ? '—' : fmt(score)}</p>{accuracy !== undefined && <p className="mt-0.5 text-[9px] font-mono text-slate-600">{(accuracy * 100).toFixed(2)}% · {misses ?? 0} miss</p>}</div>
      <div className="w-20 shrink-0 text-right"><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">Stake</p><p className="mt-1 text-xs font-black text-amber-300">{duel.stake.toLocaleString()}</p><p className="text-[8px] font-mono text-slate-700">DZPP</p></div>
      <span className="hidden text-[11px] font-black text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-rose-300 sm:block">→</span>
    </div>
  </button>;
}

function MyDuelDetail({ duel, userId, onImport, onRefresh }: { duel: ApiDuel; userId?: number; onImport: () => void; onRefresh: () => Promise<void> }) {
  const mineIsChallenger = duel.challengerUserId === userId;
  const myScore = mineIsChallenger ? duel.challengerScore : duel.opponentScore;
  const opponentScore = mineIsChallenger ? duel.opponentScore : duel.challengerScore;
  const myAccuracy = mineIsChallenger ? duel.challengerAccuracy : duel.opponentAccuracy;
  const opponentAccuracy = mineIsChallenger ? duel.opponentAccuracy : duel.challengerAccuracy;
  const myMisses = mineIsChallenger ? duel.challengerMisses : duel.opponentMisses;
  const opponentMisses = mineIsChallenger ? duel.opponentMisses : duel.challengerMisses;
  const opponent = mineIsChallenger ? duel.opponent : duel.challenger;
  const mockInput = useRef<HTMLInputElement>(null);
  const [mockUploading, setMockUploading] = useState(false);
  const [mockMessage, setMockMessage] = useState('');
  const importMockOpponent = async (file: File) => {
    if (!mineIsChallenger || mockUploading) return;
    if (!file.name.toLowerCase().endsWith('.osr')) {
      setMockMessage('Choose an .osr replay file.');
      return;
    }
    setMockUploading(true);
    setMockMessage('');
    const result = await api.duels.uploadMockOpponentReplay(duel.id, file);
    setMockUploading(false);
    if (!result.ok) {
      setMockMessage(result.error);
      return;
    }
    setMockMessage('Mock opponent loaded: ' + result.data.mockOpponent.score.toLocaleString() + ' score · ' + (result.data.mockOpponent.accuracy * 100).toFixed(2) + '% · ' + result.data.mockOpponent.misses + ' miss');
    await onRefresh();
  };
  return <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1322] shadow-xl">
    <div className="relative h-24 overflow-hidden bg-slate-950">{duel.coverUrl && <img src={duel.coverUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-25" />}<div className="absolute inset-0 bg-gradient-to-r from-[#0b1322] via-[#0b1322]/75 to-[#0b1322]/95" /><div className="absolute inset-0 flex items-center justify-between px-5"><div><p className="text-[8px] font-mono uppercase tracking-[0.2em] text-slate-600">Duel #{duel.id}</p><h3 className="mt-1 text-lg font-black text-white">{duel.title}</h3><p className="text-[10px] text-slate-500">{duel.artist} · {duel.difficulty} · {duel.mods}</p></div><span className={`rounded-full border px-2.5 py-1 text-[8px] font-mono font-black uppercase tracking-widest ${duel.status === 'live' ? 'border-rose-400/20 bg-rose-400/10 text-rose-300' : duel.status === 'open' ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-slate-700 bg-slate-900 text-slate-500'}`}>{duel.status}</span></div></div>
    <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <DuelPerson label="You" name={mineIsChallenger ? duel.challenger : (duel.opponent || 'You')} score={myScore} accuracy={myAccuracy} misses={myMisses} highlight />
      <div className="text-center"><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">VS</p><p className="mt-1 text-[10px] font-black uppercase text-amber-300">{duel.stake.toLocaleString()} DZPP stake</p></div>
      <DuelPerson label="Opponent" name={opponent || 'Waiting for opponent'} score={opponentScore} accuracy={opponentAccuracy} misses={opponentMisses} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/35 px-5 py-3">
      <div className="text-[9px] font-mono uppercase tracking-widest text-slate-600">{duel.requirement} · Pot {(duel.stake * 2).toLocaleString()} DZPP · Ends {new Date(duel.endsAt).toLocaleDateString()}</div>
      <div className="flex flex-wrap gap-2">
        {MOCK_DUEL_TESTING && mineIsChallenger && duel.status === 'open' && !duel.opponentUserId && <button type="button" disabled={mockUploading} onClick={() => mockInput.current?.click()} className="inline-flex items-center gap-1.5 border border-cyan-400/25 bg-cyan-400/[0.04] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50"><Upload className="h-3 w-3" /> {mockUploading ? 'Reading replay…' : 'Import mock opponent'}</button>}
        {duel.status === 'live' && <button type="button" onClick={onImport} className="inline-flex items-center gap-1.5 border border-amber-400/25 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-400/10"><Upload className="h-3 w-3" /> Import my score</button>}
        <input ref={mockInput} type="file" accept=".osr,application/octet-stream" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importMockOpponent(file); }} />
      </div>
    </div>
    {mockMessage && <div className="border-t border-slate-800 px-5 py-2 text-right text-[9px] font-mono text-slate-500">{mockMessage}</div>}
  </div>;
}

function DuelPerson({ label, name, score, accuracy, misses, highlight }: { label: string; name: string; score?: number; accuracy?: number; misses?: number; highlight?: boolean }) {
  return <div className={`rounded-xl border p-4 ${highlight ? 'border-emerald-400/20 bg-emerald-400/[0.025]' : 'border-slate-800 bg-slate-950/40'}`}><p className="text-[8px] font-mono uppercase tracking-widest text-slate-600">{label}</p><p className="mt-1 truncate text-sm font-black text-white">{name}</p><p className={`mt-3 text-xl font-black tabular-nums ${score !== undefined ? 'text-slate-200' : 'text-slate-700'}`}>{score === undefined ? '—' : fmt(score)}</p><div className="mt-1 text-[9px] font-mono text-slate-600">{accuracy !== undefined ? `${(accuracy * 100).toFixed(2)}%` : '—'} · {misses ?? '—'} miss</div></div>;
}

function Live({ duel, user, onSelect, onImport, onNavigateToPlayer, onReplayShared }: { duel: ApiDuel; user: AuthUser | null; onSelect: () => void; onImport: () => void; onNavigateToPlayer: (username: string) => void; onReplayShared?: () => Promise<void> }) {
  const { isPlaying, progress, toggle: togglePlay, seek } = useAudioPreview(String(duel.difficultyId), duel.previewUrl);
  const replayInput = useRef<HTMLInputElement>(null);
  const [uploadingReplay, setUploadingReplay] = useState(false);
  const [replayMessage, setReplayMessage] = useState('');
  const [watchingReplay, setWatchingReplay] = useState(false);
  const starStyle = duelStarStyle(duel.stars);
  const modStyle = duelModStyle(duel.mods);
  const mine = !!user && (duel.challengerUserId === user.id || duel.opponentUserId === user.id);
  const challengerAhead = (duel.challengerScore ?? -1) > (duel.opponentScore ?? -1);
  const opponentAhead = (duel.opponentScore ?? -1) > (duel.challengerScore ?? -1);
  const total = (duel.challengerScore ?? 0) + (duel.opponentScore ?? 0);
  const cPct = total === 0 ? 50 : Math.round(((duel.challengerScore ?? 0) / total) * 100);
  const oPct = 100 - cPct;
  const tied = !challengerAhead && !opponentAhead;
  const seekAudio = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };
  const myReplayReady = mine
    ? duel.challengerUserId === user?.id
      ? !!duel.challengerReplayReady
      : !!duel.opponentReplayReady
    : false;
  const bothReplaysReady = !!duel.challengerReplayReady && !!duel.opponentReplayReady;
  const shareReplay = async (file: File) => {
    if (!mine || uploadingReplay) return;
    if (!file.name.toLowerCase().endsWith('.osr')) {
      setReplayMessage('Choose an .osr replay file.');
      return;
    }
    setUploadingReplay(true);
    setReplayMessage('');
    const result = await api.duels.uploadReplay(duel.id, file);
    setUploadingReplay(false);
    if (!result.ok) {
      setReplayMessage(result.error);
      return;
    }
    setReplayMessage('Replay shared. It is now available to spectators.');
    await onReplayShared?.();
  };
  return <article className="group overflow-hidden rounded-2xl border border-rose-500/30 bg-[#0b1322] shadow-[0_0_60px_rgba(244,63,94,0.07)] transition-all duration-200 hover:border-amber-400/50 hover:shadow-[0_0_45px_rgba(250,204,21,0.12)]">
    <div className="flex items-center justify-between border-b border-rose-500/20 bg-[#0d0f1e] px-5 py-3">
      <div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" /></span><span className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-rose-300">Live now</span></div>
      <div className="font-mono text-sm font-black tabular-nums text-slate-400"><Timer className="mr-1 inline h-3.5 w-3.5" />{new Date(duel.endsAt).toLocaleDateString()} · {new Date(duel.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    </div>

      <div className="relative overflow-hidden border-b border-slate-800/60 px-5 py-4">
      {(duel.coverUrl || duel.beatmapsetId) && <img src={duel.coverUrl || `https://assets.ppy.sh/beatmaps/${duel.beatmapsetId}/covers/cover.jpg`} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-20" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b1322] via-[#0b1322]/90 to-[#0b1322]/80" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-1.5">
            <div className={`flex h-5 items-center gap-1 rounded-md border px-1.5 ${starStyle.border} ${starStyle.header}`}>
              <span className="text-[10px] leading-none">★</span>
              <span className="font-mono text-[10px] font-black tabular-nums">{duel.stars.toFixed(2)}</span>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${modStyle.bg} ${modStyle.border} ${modStyle.text}`}>{duel.mods}</span>
            <span className="rounded-full border border-slate-700 bg-slate-800/90 px-2 py-0.5 text-[9px] font-semibold text-slate-200">{duel.difficulty}</span>
          </div>
          <p className="truncate text-base font-black text-white transition-[text-shadow] duration-200 group-hover:[text-shadow:0_0_8px_rgba(250,204,21,0.85)]">{duel.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-300 font-medium">{duel.artist}<span className="text-slate-500 font-normal"> · mapped by </span><span className="text-slate-200 font-semibold">{duel.mapper || 'osu!'}</span></p>
          <p className="mt-2 text-[10px] text-slate-600">Win condition: <span className="font-bold text-slate-400">{duel.requirement}</span></p>
        </div>
        <a href={`https://osu.ppy.sh/b/${duel.difficultyId}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-sm border border-slate-700 p-2 text-slate-500 transition hover:border-slate-500 hover:text-white"><ExternalLink className="h-4 w-4" /></a>
      </div>
      {duel.previewUrl && <div className={`relative mt-4 flex items-center gap-2 rounded-xl border px-2.5 py-2 ${isPlaying ? 'border-amber-400/25 bg-amber-400/[0.06]' : 'border-slate-700/70 bg-slate-950/60'}`}>
        <button type="button" onClick={togglePlay} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isPlaying ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}</button>
        <div onClick={seekAudio} className="relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-slate-800"><div className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <span className="w-12 text-right font-mono text-[8px] uppercase tracking-wider text-slate-600">preview</span>
      </div>}
    </div>

    <div className="px-5 pb-5 pt-5">
      <DuelReplayScreens duel={duel} watching={watchingReplay} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px_minmax(0,1fr)] lg:items-center">
        <PlayerScore name={duel.challenger} avatarUrl={duel.challengerAvatar} score={duel.challengerScore} accuracy={duel.challengerAccuracy} misses={duel.challengerMisses} maxCombo={duel.maxCombo ?? undefined} leading={challengerAhead} losing={opponentAhead} mine={!!mine && duel.challengerUserId === user?.id} align="left" onImport={onImport} onNavigateToPlayer={onNavigateToPlayer} />
        <div className="order-first flex min-w-0 flex-col items-center lg:order-none">
          <div className="mb-3 w-full max-w-xs space-y-2">
            {[
              { label: 'CS', value: duel.cs ?? 0, max: 7 },
              { label: 'HP', value: duel.hp ?? 0, max: 10 },
              { label: 'OD', value: duel.od ?? 0, max: 10 },
              { label: 'AR', value: duel.ar ?? 0, max: 10 },
            ].map(({ label, value, max }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[9px] font-mono font-black uppercase tracking-wider text-slate-500">{label}</span>
                  <span className="font-mono text-[9px] font-bold text-slate-300">{value.toFixed(1)}</span>
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className={"h-full rounded-full " + starStyle.header.split(' ')[0]} style={{ width: Math.min(100, (value / max) * 100) + "%" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex select-none flex-col items-center gap-1">
            <span className="font-black text-2xl italic text-rose-500/70">VS</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-700">{duel.stake * 2} DZPP pot</span>
          </div>
        </div>
        <PlayerScore name={duel.opponent ?? 'Waiting…'} avatarUrl={duel.opponentAvatar} score={duel.opponentScore} accuracy={duel.opponentAccuracy} misses={duel.opponentMisses} maxCombo={duel.maxCombo ?? undefined} leading={opponentAhead} losing={challengerAhead} mine={!!mine && duel.opponentUserId === user?.id} align="right" onImport={onImport} onNavigateToPlayer={onNavigateToPlayer} />
      </div>

      <div className="mt-6"><div className="mb-1.5 flex items-center justify-between"><span className={`font-mono text-[9px] font-black ${challengerAhead ? 'text-emerald-400' : opponentAhead ? 'text-rose-400' : 'text-slate-600'}`}>{cPct}%</span><span className="font-mono text-[8px] uppercase tracking-widest text-slate-700">{tied ? 'Tied' : challengerAhead ? `${duel.challenger} leads` : `${duel.opponent ?? 'Opponent'} leads`}</span><span className={`font-mono text-[9px] font-black ${opponentAhead ? 'text-emerald-400' : challengerAhead ? 'text-rose-400' : 'text-slate-600'}`}>{oPct}%</span></div><div className="flex h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full transition-all duration-700 ${challengerAhead ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : opponentAhead ? 'bg-gradient-to-r from-rose-500 to-rose-400' : 'bg-slate-700'}`} style={{ width: `${cPct}%` }} /><div className={`h-full transition-all duration-700 ${opponentAhead ? 'bg-gradient-to-r from-emerald-300 to-emerald-500' : challengerAhead ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-slate-700'}`} style={{ width: `${oPct}%` }} /></div></div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-4">
        <div className="flex items-center gap-3 text-[10px] text-slate-600">
          <BadgeDollarSign className="h-3.5 w-3.5 text-amber-400/60" />
          <span>Each player staked <span className="font-black text-amber-300">{duel.stake} DZPP</span></span>
          <span className={bothReplaysReady ? 'font-black text-emerald-400' : 'font-mono text-slate-700'}>
            Replay {duel.challengerReplayReady ? '✓' : '—'} / {duel.opponentReplayReady ? '✓' : '—'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mine && <button type="button" onClick={onImport} className="inline-flex items-center gap-1.5 border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-amber-300 transition hover:border-amber-400/60 hover:bg-amber-400/10"><Upload className="h-3.5 w-3.5" /> Import my score</button>}
          {mine && !myReplayReady && <button type="button" disabled={uploadingReplay} onClick={() => replayInput.current?.click()} className="inline-flex items-center gap-1.5 border border-rose-400/30 bg-rose-500/[0.06] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-rose-300 transition hover:border-rose-400/60 hover:bg-rose-500/10 disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> {uploadingReplay ? 'Sharing…' : 'Share replay'}</button>}
          {bothReplaysReady && <button type="button" onClick={() => setWatchingReplay(true)} className="inline-flex items-center gap-1.5 border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-400/10"><Play className="h-3.5 w-3.5" /> Watch duel</button>}
          <input ref={replayInput} type="file" accept=".osr,application/octet-stream" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void shareReplay(file); }} />
        </div>
      </div>
      {replayMessage && <div className="mt-2 text-right text-[9px] font-mono text-slate-500">{replayMessage}</div>}
    </div>
  </article>;
}

function DuelReplayScreens({ duel, watching }: { duel: ApiDuel; watching: boolean }) {
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

function ReplayShareScreen({ label, player, ready }: { label: string; player: string; ready: boolean }) {
  const stateClass = ready
    ? 'border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300'
    : 'border-rose-400/20 bg-rose-500/[0.04] text-rose-300';
  return <div className="flex min-h-[220px] flex-col items-center justify-center bg-[#05070b] p-6 text-center">
    <div className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">{label}</div>
    <div className="mt-2 text-sm font-black text-white">{player}</div>
    <div className={'mt-4 border px-4 py-2 font-mono text-[9px] font-black uppercase tracking-wider ' + stateClass}>
      {ready ? 'Replay shared — waiting for opponent' : 'Replay not shared'}
    </div>
  </div>;
}

function PlayerScore({ name, avatarUrl, score, accuracy, misses, maxCombo, leading, losing, mine, align, onImport, onNavigateToPlayer }: { name: string; avatarUrl?: string; score?: number; accuracy?: number; misses?: number; maxCombo?: number; leading: boolean; losing: boolean; mine: boolean; align: 'left' | 'right'; onImport: () => void; onNavigateToPlayer: (username: string) => void }) {
  const rev = align === 'right';
  const accuracyPct = accuracy === undefined ? undefined : accuracy <= 1 ? accuracy * 100 : accuracy;
  const isFC = misses === 0;
  const statValueClass = leading ? 'text-emerald-300' : losing ? 'text-rose-400' : 'text-slate-300';
  return <div className={`flex flex-col gap-3 ${rev ? 'items-end text-right' : 'items-start text-left'}`}>
    <div className={`flex items-center gap-2.5 ${rev ? 'flex-row-reverse' : ''}`}>
      <button type="button" onClick={() => onNavigateToPlayer(name)} className={`group/player flex items-center gap-2.5 text-left ${rev ? 'flex-row-reverse' : ''}`} aria-label={`Open ${name}'s profile`}>
        {avatarUrl ? <img src={avatarUrl} alt={name} referrerPolicy="no-referrer" className={`h-10 w-10 rounded-full border-2 object-cover transition-[filter] group-hover/player:brightness-110 ${leading ? 'border-emerald-400/70 shadow-[0_0_12px_rgba(52,211,153,0.3)]' : losing ? 'border-rose-400/70 shadow-[0_0_12px_rgba(244,63,94,0.25)]' : 'border-slate-700'}`} onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} /> : null}
        <span className={`${avatarUrl ? 'hidden' : ''} flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-slate-950 text-xs font-black ${leading ? 'border-emerald-400/70 text-emerald-300' : losing ? 'border-rose-400/70 text-rose-300' : 'border-slate-700 text-slate-500'}`}>{name.slice(0, 1).toUpperCase()}</span>
        <span className="text-sm font-black leading-tight text-white transition-[text-shadow,color] duration-200 group-hover/player:text-white group-hover/player:[text-shadow:0_0_8px_rgba(250,204,21,0.85)]">{name}</span>
      </button>
    </div>
    <div className={`font-mono text-2xl font-black tabular-nums ${leading ? 'text-emerald-300' : losing ? 'text-rose-400' : score === undefined ? 'text-slate-700' : 'text-slate-300'}`}>{score === undefined ? 'No score yet' : score.toLocaleString()}</div>
    {score !== undefined && <div className={`flex flex-wrap gap-x-4 gap-y-1.5 ${rev ? 'justify-end' : ''}`}>
      {rev ? <>
        {accuracyPct !== undefined && <div className="flex flex-col items-end"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Accuracy</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>{accuracyPct.toFixed(2)}%</span></div>}
        {misses !== undefined && <div className="flex flex-col items-end"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Misses</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>{misses === 0 ? '0 ✓' : misses}</span></div>}
        {maxCombo !== undefined && <div className="flex flex-col items-end"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Max combo</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>— <span className="text-[10px] font-normal text-slate-600">/ {maxCombo.toLocaleString()}</span></span></div>}
      </> : <>
        {maxCombo !== undefined && <div className="flex flex-col items-start"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Max combo</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>— <span className="text-[10px] font-normal text-slate-600">/ {maxCombo.toLocaleString()}</span></span></div>}
        {misses !== undefined && <div className="flex flex-col items-start"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Misses</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>{misses === 0 ? '0 ✓' : misses}</span></div>}
        {accuracyPct !== undefined && <div className="flex flex-col items-start"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-600">Accuracy</span><span className={`font-mono text-sm font-black tabular-nums ${statValueClass}`}>{accuracyPct.toFixed(2)}%</span></div>}
      </>}
    </div>}
    <div className={`flex gap-2 ${rev ? 'flex-row-reverse' : ''}`}>{isFC && <span className="border border-emerald-400/30 bg-emerald-400/[0.06] px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400">FC</span>}{leading && <div className="flex items-center gap-1 font-mono text-[9px] font-black uppercase tracking-wider text-emerald-400">Leading</div>}</div>
  </div>;
}

function Score({ name, score, mine, ahead, onImport }: { name: string; score?: number; mine: boolean; ahead: boolean; onImport: () => void }) {
  return <div className={`relative overflow-hidden rounded-xl border p-4 ${ahead ? 'border-emerald-400/30 bg-emerald-400/[0.035]' : 'border-slate-800 bg-slate-950/45'}`}>
    {ahead && <div className="absolute inset-y-0 left-0 w-px bg-emerald-400/70" />}
    <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-black text-slate-200">{name}</p>{mine && <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-1.5 py-0.5 text-[7px] font-mono font-black uppercase tracking-wider text-amber-300">You</span>}</div>
    <p className={`mt-3 truncate text-xl font-black tabular-nums ${ahead ? 'text-emerald-300' : 'text-white'}`}>{score === undefined ? 'Awaiting score' : fmt(score)}</p>
    <div className="mt-2 flex items-center justify-between"><span className={`text-[8px] font-mono uppercase tracking-widest ${ahead ? 'text-emerald-400/70' : 'text-slate-700'}`}>{ahead ? 'Leading' : score === undefined ? 'Not submitted' : 'In contention'}</span>{mine && <button onClick={onImport} className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-300 hover:text-amber-200"><Upload className="h-3 w-3" /> Import</button>}</div>
  </div>;
}

function RulesModal({ purpose, onAccept, onClose }: { purpose: 'post' | 'accept'; onAccept: () => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-400/20 bg-[#0b1322] shadow-2xl"><div className="flex items-start justify-between border-b border-slate-800 p-6"><div><div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.2em] text-amber-300"><LockKeyhole className="h-4 w-4" /> Arena agreement</div><h2 className="mt-2 text-xl font-black text-white">Know the rules before you enter.</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">{purpose === 'post' ? 'You are about to create a duel. Accept once and you will not be shown these rules again on this account.' : 'You are about to lock your stake and enter a live duel. Accept once and continue to the match.'}</p></div><button onClick={onClose} className="text-slate-600 hover:text-slate-300"><X /></button></div><div className="space-y-3 p-6"><Rule n="01" text="Both players lock the same stake. Once accepted, your stake is committed to the duel." /><Rule n="02" text="The duel uses the exact beatmap difficulty and required mods shown on the challenge." /><Rule n="03" text="Scores are verified from osu! data. The duel result is determined by its declared win condition." /><Rule n="04" text="Duel DZPP is separate from platform DZPP and monthly challenge rewards." /><Rule n="05" text="Do not enter a duel you cannot complete before its deadline." /></div><div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/40 p-5"><button onClick={onClose} className="text-xs font-black uppercase tracking-wider text-slate-600 hover:text-slate-300">Not now</button><button onClick={onAccept} className="inline-flex items-center gap-2 bg-amber-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300"><Check className="h-4 w-4" /> I accept the arena rules</button></div></div></div>;
}

function Rule({ n, text }: { n: string; text: string }) { return <div className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/35 p-3"><span className="font-mono text-[10px] font-black text-amber-400">{n}</span><p className="text-xs leading-relaxed text-slate-400">{text}</p></div>; }

function Create({ balance, onClose, onCreated }: { balance: number; onClose: () => void; onCreated: () => Promise<void> }) {
  const [v, setV] = useState({ url: '', difficultyId: 0, modeInt: 0, title: '', artist: '', difficulty: '', stars: 0, coverUrl: '', previewUrl: '', mods: 'FM', requirement: 'Top #1 Score', stake: '200' });
  const [loading, setLoading] = useState(false); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  const { isPlaying, progress, toggle: togglePlay, seek } = useAudioPreview(String(v.difficultyId), v.previewUrl);
  const scrub = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); };
  const load = async (url = v.url) => { if (!url.trim()) return; setLoading(true); setError(''); const r = await api.duels.lookup(url); setLoading(false); if (!r.ok) return setError(r.error); setV((s) => ({ ...s, difficultyId: r.data.difficultyId, modeInt: r.data.modeInt ?? 0, title: r.data.title, artist: r.data.artist, difficulty: r.data.difficultyName, stars: r.data.stars, coverUrl: r.data.coverUrl, previewUrl: r.data.previewUrl, mods: 'FM', requirement: 'Top #1 Score' })); };
  const modOptions = v.modeInt === 3 ? ['FM','EZ','NF','HT','HR','SD','PF','DT','NC','HD','FI','FL','1K','2K','3K','4K','5K','6K','7K','8K','9K','CP','MR','RD'] : ['FM','HD','HR','DT','EZ','FL','HDHR','HDDT','HRDT'];
  const requirementOptions = v.modeInt === 3 ? ['Top #1 Score','Best Accuracy','Lowest Miss Count','Full Combo'] : ['Full Combo','Top #1 Score','Best Accuracy','Lowest Miss Count'];
  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (!v.difficultyId) return; setSubmitting(true); setError(''); const r = await api.duels.create({ difficultyId: v.difficultyId, title: v.title, artist: v.artist, difficulty: v.difficulty, stars: v.stars, mods: v.mods, requirement: v.requirement, stake: Number(v.stake) }); setSubmitting(false); if (!r.ok) return setError(r.error); await onCreated(); };
  return <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-6"><form onSubmit={submit} className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0b1322] p-6 shadow-2xl sm:max-h-[calc(100vh-3rem)]"><div className="flex justify-between"><div><h2 className="text-xl font-black text-white">Post a duel</h2><p className="mt-1 text-xs text-slate-500">Paste a specific osu! difficulty URL. The beatmap details are fetched automatically.</p></div><button type="button" onClick={onClose}><X className="text-slate-500" /></button></div><div className="mt-6"><label className="text-xs font-mono uppercase text-amber-300">Beatmap URL<div className="mt-2 flex gap-2"><input required value={v.url} onChange={(e) => { const url = e.target.value; setV((s) => ({ ...s, url, difficultyId: 0 })); setError(''); if (url.trim()) void load(url); }} placeholder="https://osu.ppy.sh/beatmapsets/...#osu/..." className="h-11 min-w-0 flex-1 border border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder-slate-700" /><button type="button" onClick={() => void load()} disabled={!v.url.trim() || loading} className="bg-amber-400 px-4 text-xs font-black text-slate-950 disabled:opacity-40">{loading ? 'Loading…' : 'Load'}</button></div></label></div>{error && <p className="mt-3 border border-rose-400/20 bg-rose-500/5 p-3 text-xs text-rose-300">{error}</p>}{v.difficultyId > 0 && <div className="relative mt-5 min-h-40 overflow-hidden rounded-xl border border-slate-800 bg-slate-950"><div className="absolute inset-0 bg-cover bg-center opacity-45" style={{ backgroundImage: `url("${v.coverUrl}")` }} /><div className="absolute inset-0 bg-gradient-to-r from-[#0b1322]/95 via-[#0b1322]/75 to-[#0b1322]/55" /><div className="relative p-4"><div className="text-[9px] font-mono uppercase tracking-widest text-emerald-400">Beatmap found</div><div className="mt-2 text-xl font-black text-emerald-300">{v.title}</div><div className="text-sm text-emerald-100/90">{v.artist} · {v.difficulty} · ★ {v.stars.toFixed(2)}</div><div className={`mt-4 flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${isPlaying ? 'border-amber-400/25 bg-amber-400/8' : 'border-slate-700/70 bg-slate-950/60'}`}><button type="button" onClick={togglePlay} disabled={!v.previewUrl} className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${isPlaying ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 disabled:opacity-40'}`}>{isPlaying ? '❚❚' : '▶'}</button><div onClick={scrub} className="relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-slate-800"><div className={`absolute inset-y-0 left-0 rounded-full ${isPlaying ? 'bg-amber-400' : 'bg-slate-600'}`} style={{ width: `${Math.round(progress * 100)}%` }} /></div><span className="w-14 text-right text-[10px] font-mono text-slate-500">preview</span></div></div></div>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-mono uppercase text-amber-300"><span>Available DZPP <span className="text-sm font-bold normal-case tracking-normal text-emerald-400">{balance.toLocaleString()}</span></span><input required min="1" max={balance} value={v.stake} onChange={(e) => setV((s) => ({ ...s, stake: e.target.value }))} type="number" className="mt-2 h-10 w-full border border-slate-700 bg-slate-950 px-3 text-sm text-white" /></label><div><div className="text-xs font-mono uppercase text-amber-300">Mods</div><div className="mt-2 grid grid-cols-3 gap-1.5">{modOptions.map((m) => <button key={m} type="button" onClick={() => setV((s) => ({ ...s, mods: m }))} className={v.mods === m ? 'h-10 border border-amber-400/60 bg-amber-400/15 text-xs font-black text-amber-300' : 'h-10 border border-slate-700 bg-slate-950 text-xs font-black text-slate-400 hover:border-slate-600 hover:text-slate-200'}>{m}</button>)}</div></div><label className="text-xs font-mono uppercase text-amber-300 sm:col-span-2">Win condition<select value={v.requirement} onChange={(e) => setV((s) => ({ ...s, requirement: e.target.value }))} className="mt-2 h-10 w-full bg-slate-950 px-3 text-white">{requirementOptions.map((option) => <option key={option}>{option}</option>)}</select></label></div><button disabled={submitting || !v.difficultyId || Number(v.stake) > balance || Number(v.stake) <= 0} className="mt-6 w-full bg-rose-500 py-3 text-xs font-black uppercase text-white disabled:opacity-40">{submitting ? 'Posting…' : v.difficultyId ? `Post open duel → ${v.stake} DZPP` : 'Load a beatmap first'}</button></form></div>;
}




