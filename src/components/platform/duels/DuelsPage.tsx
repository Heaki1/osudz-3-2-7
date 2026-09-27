import React, { useEffect, useMemo, useState } from 'react';
import {
  Crosshair,
  Plus,
  ShieldCheck,
  Swords,
  X,
} from 'lucide-react';
import type { AuthUser } from '../NavHeader';
import { api, type ApiDuel } from '../../../api/client';
import { ArenaEmpty, CurrentDuelsSection, EmptyChallenges, Tab } from './DuelsPageSections';
import { DuelCard } from './DuelCard';
import { DuelDetails, Mine } from './DuelDetails';
import { RulesModal } from './RulesModal';
import { CreateDuel } from './CreateDuel';

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
            <Tab active={tab === 'arena'} label={`Arena Â· ${open.length} open`} onClick={() => setTab('arena')} />
            <Tab active={tab === 'current'} label={`Current duels Â· ${live.length}`} onClick={() => { setTab('current'); setCurrentDuelId(null); }} />
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
      {createOpen && <CreateDuel onClose={() => setCreateOpen(false)} balance={balance} onCreated={async () => { setCreateOpen(false); await refresh(); }} />}
    </div>
  );
}
