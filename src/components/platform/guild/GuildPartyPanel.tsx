import React, { useEffect, useState } from 'react';
import { Crown, Users } from 'lucide-react';
import { api } from '../../../api/client';

export function GuildPartyPanel({ unlocked }: { unlocked: boolean }) {
  const [data, setData] = useState<any>(null);
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => { const result = await api.guild.party(); if (result.ok) setData(result.data); };
  useEffect(() => { if (unlocked) void refresh(); }, [unlocked]);
  if (!unlocked) return null;

  const create = async () => { const result = await api.guild.createParty(name); setNotice(result.ok ? 'Party created.' : result.error); if (result.ok) { setName(''); await refresh(); } };
  const join = async () => { const result = await api.guild.joinParty(joinId); setNotice(result.ok ? 'Joined Party.' : result.error); if (result.ok) { setJoinId(''); await refresh(); } };
  const accept = async (templateId: string) => { if (!data?.party) return; const result = await api.guild.acceptPartyQuest(data.party.id, templateId); setNotice(result.ok ? 'Party Quest accepted by the leader.' : result.error); await refresh(); };

  return <section className="guild-section guild-wood-frame"><div className="guild-paper guild-document">
    <div className="flex items-start gap-3"><Users className="mt-1 h-5 w-5" /><div><div className="guild-document__title">Adventurer Party</div><div className="guild-document__eyebrow mt-1">Elite Family only · 25% Party Quest bonus · 5% passive member share</div></div></div>
    {!data?.party ? <div className="mt-5 grid gap-4 md:grid-cols-2"><div><div className="text-[9px] font-black uppercase">Form a Party</div><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Party name" className="mt-2 w-full border border-[#6e4a2d]/25 bg-white/40 px-3 py-2 text-xs" /><button disabled={!name.trim()} onClick={() => void create()} className="guild-seal-button mt-2 disabled:opacity-40">Create Party</button></div><div><div className="text-[9px] font-black uppercase">Join a Party</div><input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Party ID" className="mt-2 w-full border border-[#6e4a2d]/25 bg-white/40 px-3 py-2 text-xs" /><button disabled={!joinId.trim()} onClick={() => void join()} className="guild-seal-button mt-2 disabled:opacity-40">Join Party</button></div></div> : <div className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-serif text-xl font-black">{data.party.name}</div><div className="text-[8px] font-black uppercase opacity-50">Leader ID · {data.party.leader_user_id}</div></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{data.party.members.map((member: any) => <div key={member.user_id} className="border border-[#6e4a2d]/15 bg-black/5 p-3"><div className="text-[10px] font-black">{member.username}</div><div className="mt-1 text-[8px] opacity-50">Member #{member.user_id}</div></div>)}</div>{data.party.leader_user_id && data.templates?.length > 0 && <div className="mt-5"><div className="mb-2 text-[9px] font-black uppercase">Guild Party Quests</div><div className="grid gap-2 md:grid-cols-2">{data.templates.map((template: any) => <button key={template.id} onClick={() => void accept(template.id)} className="border border-[#6e4a2d]/20 bg-black/5 p-3 text-left"><div className="font-black">{template.title}</div><div className="mt-1 text-[8px] uppercase opacity-55">{Number(template.exp_bounty).toLocaleString()} base EXP · requires 2 qualifying members</div></button>)}</div></div>}</div>}
    {notice && <div className="mt-3 text-xs font-bold opacity-70">{notice}</div>}
    <div className="mt-4 flex items-center gap-2 text-[8px] font-black uppercase tracking-wider opacity-50"><Crown className="h-3 w-3" /> Passive members receive 5%; qualifying members split the remaining 95% proportionally.</div>
  </div></section>;
}
