import React, { useEffect, useState } from 'react';
import { Crown, MapPinned, Swords } from 'lucide-react';
import { api } from '../../../api/client';

type WarBoard = {
  cycle: { id: string; phase: string; starts_at: string; ends_at: string; postponed_reason?: string | null };
  participants: Array<{ user_id: number; username: string; kingdom: string; roster_rank: number; guild_rank: string }>;
  quests: Array<{ id: string; quest_number: number; difficulty_id: number; mod_requirement: string; source: string; kingdom: string | null }>;
  leaderboard: Array<{ user_id: number; username: string; kingdom: string; guild_rank: string; quests_played: number; quests_qualified: number; total_war_score: number }>;
  viewerIsParticipant: boolean;
};

export function GuildWarPanel({ userId }: { userId: number }) {
  const [war, setWar] = useState<WarBoard | null>(null);
  const [summoned, setSummoned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [trump, setTrump] = useState({ beatmapId: '', beatmapsetId: '', difficultyId: '', modRequirement: 'FM', notes: '' });

  const refresh = async () => {
    const result = await api.guild.war();
    if (!result.ok) { setNotice(result.error); return; }
    setWar(result.data);
    if (result.data?.cycle?.id) {
      const summon = await api.guild.warSummons(result.data.cycle.id);
      if (summon.ok) setSummoned(Boolean(summon.data));
    }
  };

  useEffect(() => { void refresh(); }, [userId]);
  if (!war) return null;

  const submitTrump = async () => {
    setBusy(true);
    const result = await api.guild.submitTrump(war.cycle.id, {
      beatmapId: Number(trump.beatmapId),
      beatmapsetId: trump.beatmapsetId ? Number(trump.beatmapsetId) : null,
      difficultyId: Number(trump.difficultyId),
      modRequirement: trump.modRequirement,
      notes: trump.notes,
    });
    setBusy(false);
    setNotice(result.ok ? 'Trump Card submitted to Guild Review.' : result.error);
  };

  const summon = async () => {
    setBusy(true);
    const result = await api.guild.useWarSummons(war.cycle.id);
    setBusy(false);
    setNotice(result.ok ? 'War Summons activated. E-Rantel access is now open without travel cost or cooldown.' : result.error);
    if (result.ok) setSummoned(true);
  };

  return (
    <section className="guild-section guild-wood-frame">
      <div className="guild-paper guild-document">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><Swords className="mt-1 h-5 w-5" /><div><div className="guild-document__title">Kingdoms War · The Mascara Phase</div><div className="guild-document__eyebrow mt-1">20-day inter-kingdom cycle · 10 Throne Quests · osu! supporter prize</div></div></div>
          <div className="border border-[#6e4a2d]/20 bg-black/5 px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">Phase · {war.cycle.phase}</div>
        </div>

        {war.cycle.phase === 'MASCARA' && war.viewerIsParticipant && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-purple-900/20 bg-purple-900/5 p-4">
            <div><div className="text-[10px] font-black uppercase tracking-wider">War Summons</div><div className="mt-1 text-[9px] opacity-70">Instant E-Rantel access · 0 DZP · 0 hours · no migration cooldown.</div></div>
            <button disabled={busy || summoned} onClick={() => void summon()} className="guild-seal-button disabled:opacity-40"><MapPinned className="h-4 w-4" />{summoned ? 'Summons Active' : 'Use War Summons'}</button>
          </div>
        )}

        {war.cycle.phase === 'TRUMP' && war.viewerIsParticipant && (
          <div className="mt-5 border border-[#6e4a2d]/20 bg-black/5 p-4">
            <div className="text-[10px] font-black uppercase tracking-wider">War Desk · Trump Card Submission</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input value={trump.beatmapId} onChange={(e) => setTrump({ ...trump, beatmapId: e.target.value })} placeholder="Beatmap ID" className="border border-[#6e4a2d]/25 bg-white/40 px-3 py-2 text-xs" />
              <input value={trump.beatmapsetId} onChange={(e) => setTrump({ ...trump, beatmapsetId: e.target.value })} placeholder="Beatmapset ID" className="border border-[#6e4a2d]/25 bg-white/40 px-3 py-2 text-xs" />
              <input value={trump.difficultyId} onChange={(e) => setTrump({ ...trump, difficultyId: e.target.value })} placeholder="Difficulty ID" className="border border-[#6e4a2d]/25 bg-white/40 px-3 py-2 text-xs" />
              <input value={trump.modRequirement} onChange={(e) => setTrump({ ...trump, modRequirement: e.target.value })} placeholder="Mod requirement" className="border border-[#6e4a2d]/25 bg-white/40 px-3 py-2 text-xs" />
            </div>
            <textarea value={trump.notes} onChange={(e) => setTrump({ ...trump, notes: e.target.value })} maxLength={1000} placeholder="Notes for Guild Review" className="mt-2 min-h-20 w-full border border-[#6e4a2d]/25 bg-white/40 px-3 py-2 text-xs" />
            <button disabled={busy || !trump.beatmapId || !trump.difficultyId} onClick={() => void submitTrump()} className="guild-seal-button mt-3 disabled:opacity-40">Submit Trump Card</button>
          </div>
        )}

        {notice && <div className="mt-3 text-xs font-bold opacity-70">{notice}</div>}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[9px]">
            <thead><tr className="border-b border-[#6e4a2d]/20 text-[8px] font-black uppercase tracking-wider opacity-60"><th className="p-2">Rank</th><th className="p-2">Adventurer</th><th className="p-2">Quests Played / 10</th><th className="p-2">Qualified</th><th className="p-2">Total War EXP</th></tr></thead>
            <tbody>{war.leaderboard.map((row, index) => <tr key={row.user_id} className="border-b border-[#6e4a2d]/10"><td className="p-2 font-black">{index + 1}</td><td className="p-2"><div className="font-black">{row.username}</div><div className="text-[7px] uppercase opacity-50">{row.guild_rank} · {row.kingdom}</div></td><td className="p-2">{row.quests_played} / 10</td><td className="p-2">{row.quests_qualified}</td><td className="p-2 font-mono font-black">{Number(row.total_war_score).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {war.quests.map((quest) => <div key={quest.id} className="border border-[#6e4a2d]/15 bg-black/5 p-3"><div className="text-[8px] font-black uppercase">Quest {quest.quest_number}</div><div className="mt-1 font-serif text-sm font-black">#{quest.difficulty_id}</div><div className="mt-1 text-[8px] opacity-55">{quest.source} · {quest.mod_requirement} · no penalties</div></div>)}
        </div>

        <div className="mt-5 flex items-center gap-2 text-[8px] font-black uppercase tracking-wider opacity-50"><Crown className="h-3 w-3" /> Qualified scores rank above Attempts; Attempts lose 30% of placement bonus.</div>
      </div>
    </section>
  );
}
