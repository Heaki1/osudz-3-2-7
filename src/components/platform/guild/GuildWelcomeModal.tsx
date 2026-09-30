import React, { useEffect, useState } from 'react';
import { Crown, Map, Shield, Sparkles } from 'lucide-react';
import { api } from '../../../api/client';

type Kingdom = { kingdom: string; display_name: string; capital: string; lore: string; travel_cost_dzp: number; travel_duration_hours: number; cooldown_months: number };

export function GuildWelcomeModal({ onClose, onOpenGuild }: { onClose: () => void; onOpenGuild: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [kingdoms, setKingdoms] = useState<Kingdom[]>([]);
  const [kingdom, setKingdom] = useState('');
  const [path, setPath] = useState<'IRON' | 'EXAM' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void api.guild.kingdoms().then((result) => { if (result.ok) { setKingdoms(result.data); setKingdom(result.data[0]?.kingdom ?? ''); } else setError(result.error); }); }, []);

  const submit = async () => {
    if (!path || !kingdom) return;
    setBusy(true); setError(null);
    const result = await api.guild.onboarding(name, kingdom, path);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    onClose(); onOpenGuild();
  };

  const selected = kingdoms.find((item) => item.kingdom === kingdom);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-3xl border border-[#9a7047]/70 bg-[#e3caa0] p-1 shadow-[0_30px_100px_rgba(0,0,0,.7)]">
        <div className="relative overflow-hidden bg-[#f0dfbf] p-7 text-[#3b2b1a] sm:p-9">
          <div className="text-center"><Crown className="mx-auto h-9 w-9" /><div className="mt-3 text-[9px] font-black uppercase tracking-[.4em] opacity-55">Guild Reception Desk · First Registration</div><h2 className="mt-2 font-serif text-3xl font-black tracking-wider">THE ADVENTURER REGISTER</h2></div>
          {step === 0 && <div className="mt-7 space-y-4"><p className="text-sm leading-relaxed opacity-75">Every adventurer begins with the Guild briefing. There are eight ranks across four families: Iron and Copper, Silver and Gold, Platinum and Mithril, then Orichalcum and Adamantite.</p><p className="text-sm leading-relaxed opacity-75">Hunts pay DZP and Guild EXP. Exact contract requirements matter. A failed or terrible attempt can reduce EXP and put a rank at risk.</p><button onClick={() => setStep(1)} className="guild-seal-button w-full justify-center">Continue to Identity</button></div>}
          {step === 1 && <div className="mt-7"><label className="text-[9px] font-black uppercase tracking-wider">Adventurer Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="The name shown on Guild records" className="mt-2 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-3 text-lg outline-none" /></label><p className="mt-2 text-[9px] opacity-55">This is your Guild identity. It is separate from your osu! username.</p><button disabled={name.trim().length < 2} onClick={() => setStep(2)} className="guild-seal-button mt-5 w-full justify-center disabled:opacity-40">Continue to the Crossroads</button></div>}
          {step === 2 && <div className="mt-7 grid gap-3 sm:grid-cols-2"><button onClick={() => { setPath('IRON'); setStep(3); }} className="border-2 border-[#6e4a2d]/30 p-5 text-left"><div className="flex items-center gap-2 font-serif text-xl font-black"><Shield className="h-5 w-5" /> Take the Iron Tag</div><p className="mt-2 text-[10px] leading-relaxed opacity-65">Begin at Iron with 0 Guild EXP and follow normal progression.</p></button><button onClick={() => { setPath('EXAM'); setStep(3); }} className="border-2 border-amber-800/40 bg-amber-100/30 p-5 text-left"><div className="flex items-center gap-2 font-serif text-xl font-black"><Sparkles className="h-5 w-5" /> Take the Placement Exam</div><p className="mt-2 text-[10px] leading-relaxed opacity-65">Enter the one-time six-test tower. A successful final result can skip ranks.</p></button></div>}
          {step === 3 && <div className="mt-7"><div className="mb-4 flex items-center gap-2"><Map className="h-5 w-5" /><div className="font-serif text-xl font-black">Choose Your Kingdom</div></div><div className="grid gap-3 sm:grid-cols-2">{kingdoms.map((item) => <button key={item.kingdom} onClick={() => setKingdom(item.kingdom)} className={'border p-4 text-left ' + (kingdom === item.kingdom ? 'border-[#3b2b1a] bg-[#b99c77]/35' : 'border-[#6e4a2d]/20')}><div className="font-serif text-lg font-black">{item.display_name}</div><div className="mt-1 text-[9px] uppercase tracking-wider opacity-55">Capital · {item.capital}</div><p className="mt-2 text-[10px] leading-relaxed opacity-70">{item.lore}</p></button>)}</div>{selected && <div className="mt-4 border border-[#6e4a2d]/20 bg-black/5 p-3 text-[9px] uppercase tracking-wider opacity-70">Travel later costs {selected.travel_cost_dzp} DZP and takes exactly {selected.travel_duration_hours} hours. Arrival begins a {selected.cooldown_months}-month migration cooldown.</div>}{error && <div className="mt-3 border border-red-900/20 bg-red-900/5 p-3 text-xs font-bold text-red-900">{error}</div>}<button disabled={busy || !kingdom} onClick={() => void submit()} className="guild-seal-button mt-5 w-full justify-center disabled:opacity-40">{busy ? 'Registering…' : 'Sign the Register'}</button></div>}
        </div>
      </div>
    </div>
  );
}
