import React, { useEffect, useMemo, useState } from 'react';
import { Award, Crown, FilePlus2, ScrollText, Shield, Swords } from 'lucide-react';
import { api } from '../../../api/client';
import type { ApiGuildExam, ApiGuildProfile } from '../../../api/guild';
import type { ApiHunt, ApiHuntAttempt, HuntTier } from '../../../api/beatmapHunts';
import { formatCountdown } from '../../../lib/round';
import { GuildPosterPile } from './GuildPosterPile';
import { GuildHuntDetails } from './GuildHuntDetails';
import { GuildCreateHunt } from './GuildCreateHunt';
import { GuildPromotionModal, type GuildPromotionNotification } from './GuildPromotionModal';
import { AdminGuildTab } from '../admin/AdminGuildTab';
import './guildHall.css';

const ROWS: Array<{ tier: HuntTier; label: string; subtitle: string }> = [
  { tier: 'BEGINNER', label: 'BEGINNER', subtitle: 'Iron / Copper' },
  { tier: 'ADVANCED', label: 'ADVANCED', subtitle: 'Silver / Gold' },
  { tier: 'ELITE', label: 'ELITE / MITHRIL', subtitle: 'Platinum / Mithril' },
  { tier: 'LEGENDARY_MASTER', label: 'LEGENDARY MASTER', subtitle: 'Orichalcum / Adamantite' },
];

function ExamPanel({ exam, onRefresh }: { exam: ApiGuildExam; onRefresh: () => Promise<void> }) {
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    const result = await api.guild.importExamScore(score);
    setBusy(false);
    setNotice(result.ok ? 'The Guild recorded your test score.' : result.error);
    if (result.ok) { setScore(''); await onRefresh(); }
  };

  const cashOut = async () => {
    setBusy(true);
    const result = await api.guild.cashOutExam();
    setBusy(false);
    setNotice(result.ok ? 'The Guild recorded your rank and reward.' : result.error);
    if (result.ok) await onRefresh();
  };

  return (
    <section className="guild-section guild-wood-frame">
      <div className="guild-paper guild-document">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ScrollText className="mt-1 h-5 w-5" />
            <div>
              <div className="guild-document__title">Guild Placement Exam</div>
              <div className="guild-document__eyebrow mt-1">Six sequential trials · 72 hours · one examination per adventurer</div>
            </div>
          </div>
          <div className="text-right">
            <div className="guild-document__eyebrow">Time remaining</div>
            <div className="font-mono text-lg font-black">{formatCountdown(exam.expires_at)}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-6 gap-1">
          {Array.from({ length: 6 }, (_, index) => index + 1).map((test) => (
            <div key={test} className={'border p-2 text-center ' + (test <= exam.highest_cleared_test ? 'border-emerald-900/30 bg-emerald-900/10 text-emerald-900' : test === exam.current_test_number && exam.status === 'IN_PROGRESS' ? 'border-amber-800/40 bg-amber-800/10 text-amber-900' : 'border-[#6e4a2d]/15 bg-black/5 text-[#3b2b1a]/35')}>
              <div className="text-[8px] font-black">TEST</div>
              <div className="font-serif text-lg font-black">{test}</div>
            </div>
          ))}
        </div>
        {exam.status === 'IN_PROGRESS' && exam.currentTemplate && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto]">
            <div className="border border-[#6e4a2d]/20 bg-black/5 p-4">
              <div className="guild-document__eyebrow">Current Guild Assignment · Test {exam.current_test_number}</div>
              <div className="mt-2 font-serif text-xl font-black">Beatmap #{exam.currentTemplate.difficulty_id}</div>
              <div className="mt-2 text-[10px] opacity-65">Submit a verified osu! score. The next trial unlocks only after this one qualifies.</div>
            </div>
            <div className="flex min-w-[290px] flex-col gap-2">
              <input value={score} onChange={(e) => setScore(e.target.value)} placeholder="osu! score URL or ID" className="border border-[#6e4a2d]/30 bg-white/45 px-3 py-2 text-xs outline-none" />
              <button disabled={busy || !score.trim()} onClick={() => void submit()} className="guild-seal-button justify-center disabled:opacity-40">Submit Test Score</button>
              {exam.highest_cleared_test > 0 && <button disabled={busy} onClick={() => void cashOut()} className="border border-[#6e4a2d]/30 px-4 py-2 text-[10px] font-black uppercase tracking-wider disabled:opacity-40">Conclude Exam & Claim Current Rank</button>}
            </div>
          </div>
        )}
        {exam.status !== 'IN_PROGRESS' && <div className="mt-5 border border-[#6e4a2d]/20 bg-amber-900/5 p-4 text-sm">Exam status: <b>{exam.status}</b> · Highest cleared test: <b>{exam.highest_cleared_test}</b>{exam.assigned_rank ? ' · Assigned rank: ' + exam.assigned_rank : ''}{exam.reward_dzp ? ' · Reward: ' + exam.reward_dzp.toLocaleString() + ' DZP' : ''}</div>}
        {notice && <div className="mt-3 text-xs font-bold opacity-70">{notice}</div>}
      </div>
    </section>
  );
}

export interface GuildPageProps {
  userId: number;
  username: string;
  isAdmin?: boolean;
}

export function GuildPage({ userId, username, isAdmin = false }: GuildPageProps) {
  const [profile, setProfile] = useState<ApiGuildProfile | null>(null);
  const [exam, setExam] = useState<ApiGuildExam | null>(null);
  const [active, setActive] = useState<ApiHunt[]>([]);
  const [claimed, setClaimed] = useState<ApiHunt[]>([]);
  const [selected, setSelected] = useState<ApiHunt | null>(null);
  const [selectedData, setSelectedData] = useState<{ leaderboard: ApiHuntAttempt[]; myHistory: ApiHuntAttempt[] } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: number; kind: string; title: string; body: string; payload: Record<string, unknown>; read_at: string | null }>>([]);
  const [promotionNotification, setPromotionNotification] = useState<GuildPromotionNotification | null>(null);
  const [handledPromotionId, setHandledPromotionId] = useState<number | null>(null);
  const [kingdoms, setKingdoms] = useState<Array<{ kingdom: string; display_name: string; capital: string; lore: string; travel_cost_dzp: number; travel_duration_hours: number; cooldown_months: number }>>([]);
  const [travelBusy, setTravelBusy] = useState(false);

  const refresh = async () => {
    const [profileResult, activeResult, claimedResult, examResult, notificationResult] = await Promise.all([
      api.guild.profile(), api.beatmapHunts.list(), api.beatmapHunts.claimed(), api.guild.exam(), api.guild.notifications(),
    ]);
    if (profileResult.ok) setProfile(profileResult.data);
    if (activeResult.ok) setActive(activeResult.data);
    if (claimedResult.ok) setClaimed(claimedResult.data);
    if (examResult.ok) setExam(examResult.data);
    if (notificationResult.ok) {
      setNotifications(notificationResult.data);
      const promotion = notificationResult.data.find((notification) => notification.kind === 'GUILD_RANK_ADJUSTED' && !notification.read_at && notification.payload?.type === 'PROMOTION');
      if (promotion && promotion.id !== handledPromotionId) setPromotionNotification(promotion);
    }
    const kingdomsResult = await api.guild.kingdoms();
    if (kingdomsResult.ok) setKingdoms(kingdomsResult.data);
  };

  useEffect(() => { void refresh(); }, []);

  const openHunt = async (hunt: ApiHunt) => {
    setSelected(hunt);
    const result = await api.beatmapHunts.get(hunt.id);
    if (result.ok) setSelectedData({ leaderboard: result.data.leaderboard, myHistory: result.data.myHistory });
  };

  const registerIron = async () => {
    const result = await api.guild.registerIron();
    setNotice(result.ok ? 'You are now registered as an Iron Adventurer.' : result.error);
    if (result.ok) await refresh();
  };

  const startExam = async () => {
    const result = await api.guild.startExam();
    setNotice(result.ok ? 'The Guild has opened your three-day Placement Exam.' : result.error);
    if (result.ok) await refresh();
  };

  const rows = useMemo(() => ROWS.map((row) => ({
    ...row,
    active: active.filter((hunt) => hunt.tier === row.tier),
    claimed: claimed.filter((hunt) => hunt.tier === row.tier),
  })), [active, claimed]);

  const refreshSelected = async () => {
    if (!selected) return;
    const result = await api.beatmapHunts.get(selected.id);
    if (result.ok) {
      setSelected(result.data.hunt);
      setSelectedData({ leaderboard: result.data.leaderboard, myHistory: result.data.myHistory });
    }
    await refresh();
  };

  const closePromotion = async () => {
    if (!promotionNotification) return;
    const notificationId = promotionNotification.id;
    setHandledPromotionId(notificationId);
    setPromotionNotification(null);
    await api.guild.readNotification(notificationId);
    await refresh();
  };

  const travel = async (destination: string) => {
    setTravelBusy(true);
    const result = await api.guild.travel(destination);
    setTravelBusy(false);
    setNotice(result.ok ? 'Travel registered. The Guild board is sealed during the 8-hour journey.' : result.error);
    if (result.ok) await refresh();
  };

  const inTransit = Boolean(profile?.profile.travel_destination);

  return (
    <div className="guild-hall">
      <div className="guild-hall__content">
        <header className="guild-header">
          <div className="guild-header__ornament">
            <span />
            <div className="guild-crest"><img src="/guild/guild-icon.png" alt="The DZ Guild" className="h-14 w-14 object-contain" /></div>
            <span />
          </div>
          <div className="guild-header__kicker"><Shield className="h-4 w-4" /><span>osu!dz Adventurer Guild · Official Registry</span><Shield className="h-4 w-4" /></div>
          <div className="guild-header__title-wrap">
            <div className="guild-header__seal">GUILD</div>
            <h1>THE GUILD ADVENTURER</h1>
            <div className="guild-header__subtitle">A registry for those who seek the next trial</div>
          </div>
          <p>Enter the Guild, choose your adventure, and leave your mark. Claim verified Hunts, prove your skill through osu! scores, and build a record worthy of your rank.</p>
          <div className="guild-header__features">
            <span><b>01</b> Verified scores</span>
            <span><b>02</b> Seven-day Hunts</span>
            <span><b>03</b> 100 DZP minimum bounty</span>
          </div>
        </header>

        {profile?.profile.onboarding_completed && profile.profile.kingdom && (
          <section className="guild-section guild-wood-frame">
            <div className="guild-paper guild-document">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1"><div className="guild-document__eyebrow">Current Kingdom</div><div className="guild-document__title">{kingdoms.find((item) => item.kingdom === profile.profile.kingdom)?.display_name ?? profile.profile.kingdom}</div><p className="mt-2 text-xs leading-relaxed opacity-70">{kingdoms.find((item) => item.kingdom === profile.profile.kingdom)?.lore}</p></div>
                <div className="text-right text-[9px] font-black uppercase tracking-wider opacity-60">{inTransit ? <>In transit to {kingdoms.find((item) => item.kingdom === profile.profile.travel_destination)?.display_name ?? profile.profile.travel_destination}<br />Arrives {new Date(profile.profile.travel_arrives_at ?? '').toLocaleString()}</> : profile.profile.kingdom_cooldown_until && new Date(profile.profile.kingdom_cooldown_until).getTime() > Date.now() ? <>Migration cooldown<br />Until {new Date(profile.profile.kingdom_cooldown_until).toLocaleString()}</> : 'Migration available'}</div>
              </div>
              {!inTransit && (!profile.profile.kingdom_cooldown_until || new Date(profile.profile.kingdom_cooldown_until).getTime() <= Date.now()) && <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{kingdoms.filter((item) => item.kingdom !== profile.profile.kingdom).map((item) => <button key={item.kingdom} disabled={travelBusy} onClick={() => void travel(item.kingdom)} className="border border-[#6e4a2d]/25 bg-black/5 p-3 text-left disabled:opacity-40"><div className="text-[10px] font-black">Travel to {item.display_name}</div><div className="mt-1 text-[8px] opacity-60">{item.travel_cost_dzp} DZP · 8 hours · 2-month cooldown</div></button>)}</div>}
            </div>
          </section>
        )}

        {profile?.profile.registration_status === 'UNREGISTERED' && !exam && (
          <section className="guild-section guild-wood-frame">
            <div className="guild-paper guild-document">
              <div className="flex items-start gap-4">
                <Crown className="mt-1 h-7 w-7" />
                <div>
                  <div className="guild-document__title">Report to the Guild</div>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed opacity-70">Register as an Iron Adventurer and begin climbing the Guild ranks, or take the one-time six-trial Placement Exam to prove your level.</p>
                  <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void registerIron()} className="guild-seal-button">Register as Iron</button><button onClick={() => void startExam()} className="border border-[#6e4a2d]/30 px-4 py-2 text-[10px] font-black uppercase tracking-wider">Take Placement Exam</button></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {exam && <ExamPanel exam={exam} onRefresh={refresh} />}

        {isAdmin && (
          <section className="guild-section guild-admin-office">
            <div className="guild-admin-office__inside">
              <div className="mb-5 flex items-start gap-3 border-b border-[#d9b878]/15 pb-4">
                <img src="/guild/guild-icon.png" alt="Guild" className="mt-0.5 h-8 w-8 shrink-0 object-contain" />
                <div><div className="guild-section__title">Guild Administration</div><p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-[#dcc6a8]/60">Guild officials only. Configure Placement Exams, manage Quest posters and Guild rows, review smurf reports, manage adventurer ranks, review final examinations, and reconcile Guild loans from the same Guild page.</p></div>
              </div>
              <AdminGuildTab />
            </div>
          </section>
        )}

        {profile && (
          <section className="guild-section guild-profile-grid">
            <div className="guild-wood-frame"><div className="guild-paper guild-document"><div className="flex flex-wrap items-center gap-4"><img src={profile.badgeAsset} alt={profile.profile.guild_rank + " Guild badge"} className="h-16 w-16 object-contain" onError={(event) => { const image = event.currentTarget; if (!image.src.endsWith(".png")) image.src = profile.badgeAsset.replace(/\.svg$/i, ".png"); }} /><div><div className="guild-document__eyebrow">{profile.profile.guild_rank} <span className="font-black">Adventurer</span></div><div className="guild-document__title">{username}</div></div><div className="ml-auto text-right"><div className="guild-document__eyebrow">Guild EXP</div><div className="font-mono text-lg font-black">{profile.profile.guild_exp.toLocaleString()}</div></div></div><div className="mt-5 h-3 overflow-hidden border border-[#6e4a2d]/25 bg-black/15"><div className="h-full bg-gradient-to-r from-[#7c4b1e] via-[#d2a44d] to-[#f1dfad]" style={{ width: (profile.progressPercent ?? 0) + '%' }} /></div><div className="mt-1 flex justify-between text-[8px] font-black uppercase tracking-wider opacity-55"><span>Guild rank progress</span><span>{profile.nextRank ? 'Next: ' + profile.nextRank : 'Highest current rank'}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[8px] font-black uppercase tracking-wider opacity-60"><span>EXP multiplier: {profile.rankMultiplier.toFixed(1)}×</span>{profile.nextRankExp !== null && <span>Promotion floor: {profile.nextRankExp.toLocaleString()} EXP</span>}</div>{profile.demotionWarning && <div className="mt-3 border border-rose-900/20 bg-rose-900/5 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-rose-900">Demotion warning · recover above your current rank floor within 24 hours · target: {profile.demotionWarning.targetRank ?? 'IRON'} · expires {new Date(profile.demotionWarning.expiresAt).toLocaleString()}</div>}{profile.rankReview && <div className="mt-3 border border-amber-900/20 bg-amber-900/5 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-amber-900">Tribunal review pending · {profile.rankReview.requestedRank}</div>}</div></div>
            <div className="guild-wood-frame"><div className="guild-paper guild-document h-full"><div className="guild-document__eyebrow">Guild record</div><div className="mt-3 grid grid-cols-3 gap-3 text-center"><div><div className="font-serif text-xl font-black">{profile.profile.attempted_hunts}</div><div className="text-[8px] uppercase opacity-55">Attempts</div></div><div><div className="font-serif text-xl font-black">{profile.profile.successful_hunts}</div><div className="text-[8px] uppercase opacity-55">Taken down</div></div><div><div className="font-serif text-xl font-black">{profile.profile.failed_hunts}</div><div className="text-[8px] uppercase opacity-55">Failed</div></div></div>{profile.loan && <div className="mt-4 border-t border-[#6e4a2d]/15 pt-3 text-[9px] font-bold">Guild debt: {profile.loan.remainingDzp.toLocaleString()} DZP · {profile.loan.installmentPercent}% installments</div>}</div></div>
          </section>
        )}

        {inTransit ? <section className="guild-section"><div className="guild-paper guild-document border-2 border-amber-900/20 text-center"><div className="guild-document__eyebrow">The road is under way</div><div className="guild-document__title mt-1">Guild access sealed during transit</div><p className="mx-auto mt-2 max-w-xl text-xs opacity-70">Your journey completes at {new Date(profile?.profile.travel_arrives_at ?? '').toLocaleString()}. Return after arrival to enter the destination Guild Hall.</p></div></section> : <>
        {notifications.length > 0 && <section className="guild-section"><div className="guild-section__header"><div><div className="guild-section__title">Guild Notices</div><div className="guild-section__sub">Pinned messages from the reception desk</div></div></div><div className="guild-notices">{notifications.slice(0, 4).map((notification) => <button key={notification.id} onClick={() => void api.guild.readNotification(notification.id).then(() => refresh())} className={'guild-notice ' + (notification.read_at ? 'opacity-55' : '')}><div className="text-[10px] font-black uppercase tracking-wider">{notification.title}</div><div className="mt-1 text-[9px] leading-relaxed opacity-70">{notification.body}</div></button>)}</div></section>}

        <section className="guild-section">
          <div className="guild-section__header">
            <div><div className="guild-section__title flex items-center gap-2"><Swords className="h-5 w-5 text-[#d7ae5b]" />Active Quest Board</div><div className="guild-section__sub">Guild Adventures for Iron and Copper adventurers · choose your next Quest and earn your place in the Guild</div></div>
            <button onClick={() => setCreateOpen(true)} className="guild-seal-button"><FilePlus2 className="h-4 w-4" /> Post Hunt</button>
          </div>
          {notice && <div className="guild-paper guild-document mb-6 text-xs">{notice}</div>}
          <div className="space-y-16">
            {rows.map((row) => <section key={row.tier} className="guild-rack"><div className="guild-rack__heading"><div><h2>{row.label}<span>{row.subtitle}</span></h2></div></div>{row.active.length === 0 ? <div className="guild-empty">No active posters in this Guild row</div> : <div className="relative z-[1] grid grid-cols-1 justify-items-center gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: Math.ceil(row.active.length / 4) }, (_, index) => <GuildPosterPile key={index} hunts={row.active.slice(index * 4, index * 4 + 4)} claimed={false} onOpen={openHunt} />)}</div>}</section>)}
          </div>
        </section>

        <section className="guild-section guild-rack"><div className="guild-rack__heading"><div><h2 className="flex items-center gap-2"><Award className="h-5 w-5" />GUILD ARCHIVE<span>Claimed posters · completed contracts remain readable</span></h2></div></div><div className="space-y-16">{rows.map((row) => <section key={'claimed-' + row.tier}><div className="mb-6 text-center"><div className="font-serif text-lg font-black tracking-[.16em] text-[#e2c28a]">{row.label}</div><div className="mt-1 text-[8px] uppercase tracking-[.28em] text-[#dcc6a8]/35">{row.subtitle}</div></div>{row.claimed.length === 0 ? <div className="guild-empty">No claimed posters in this row</div> : <div className="grid grid-cols-1 justify-items-center gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: Math.ceil(row.claimed.length / 4) }, (_, index) => <GuildPosterPile key={index} hunts={row.claimed.slice(index * 4, index * 4 + 4)} claimed onOpen={openHunt} />)}</div>}</section>)}</div></section>
        <div className="guild-footer">Guild charter · verified osu! scores · seven-day Hunts · minimum bounty 100 DZP · every attempt recorded</div>
        </>}
      </div>
      {createOpen && <GuildCreateHunt onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void refresh(); }} />}
      {selected && selectedData && <GuildHuntDetails hunt={selected} leaderboard={selectedData.leaderboard} history={selectedData.myHistory} isOwner={selected.poster.userId === userId} onClose={() => { setSelected(null); setSelectedData(null); }} onRefresh={refreshSelected} />}
      {promotionNotification && <GuildPromotionModal notification={promotionNotification} onClose={closePromotion} />}
    </div>
  );
}




