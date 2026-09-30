import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../../api/client';
import type { HuntType } from '../../../api/beatmapHunts';

export function GuildCreateHunt({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [huntType, setHuntType] = useState<HuntType>('BEATMAP_CHALLENGE');
  const [difficultyId, setDifficultyId] = useState('');
  const [bounty, setBounty] = useState('100');
  const [target, setTarget] = useState('');
  const [myScores, setMyScores] = useState<Array<{ osuScoreId: number; score: number; accuracy: number; mods: string; pp: number | null }>>([]);
  const [loadingScores, setLoadingScores] = useState(false);
  const [description, setDescription] = useState('');
  const [acc, setAcc] = useState('');
  const [misses, setMisses] = useState('');
  const [combo, setCombo] = useState('');
  const [minScore, setMinScore] = useState('');
  const [minPp, setMinPp] = useState('');
  const [mods, setMods] = useState('');
  const [exactMods, setExactMods] = useState(false);
  const [fc, setFc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const requirements: Record<string, unknown> = {};
    if (acc) requirements.minAccuracy = Number(acc);
    if (misses) requirements.maxMisses = Number(misses);
    if (combo) requirements.minCombo = Number(combo);
    if (minScore) requirements.minScore = Number(minScore);
    if (minPp) requirements.minPp = Number(minPp);
    if (mods.trim()) {
      requirements.requiredMods = mods.toUpperCase().match(/NC|PF|HD|HR|DT|HT|EZ|FL|SD|NF|SO|RX|AP|AT|DA|FI|MR/g) ?? [];
      requirements.exactMods = exactMods;
    }
    if (fc) requirements.fullCombo = true;
    const result = await api.beatmapHunts.create({
      huntType,
      difficultyId: Number(difficultyId),
      bountyDzp: Number(bounty),
      requirements,
      description,
      targetScoreInput: huntType === 'BEATMAP_CHALLENGE' ? undefined : target,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated();
  };

  const loadMyScores = async () => {
    const id = Number(difficultyId);
    if (!Number.isInteger(id) || id <= 0) return;
    setLoadingScores(true);
    const result = await api.beatmapHunts.targetScores(id);
    setLoadingScores(false);
    if (result.ok) setMyScores(result.data);
    else setError(result.error);
  };

  return (
    <div className="guild-modal-overlay fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="guild-modal-shell guild-modal-shell--compact">
        <div className="guild-modal-paper p-6 text-[#3b2b1a]">
          <div className="flex items-center justify-between"><div><div className="font-serif text-2xl font-black tracking-wider">POST A QUEST HUNT</div><div className="text-[9px] font-black uppercase tracking-[.25em] opacity-55">The Guild classifies the poster automatically</div></div><button onClick={onClose}><X /></button></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {([
              ['BEATMAP_CHALLENGE', 'Beatmap Hunt'],
              ['BEAT_MY_SCORE', 'Beat My Score'],
              ['SNIPE_SCORE', 'Snipe This Score'],
            ] as Array<[HuntType, string]>).map(([value, label]) => (
              <button key={value} onClick={() => setHuntType(value)} className={'border p-3 text-left ' + (huntType === value ? 'border-[#3b2b1a] bg-[#b99c77]/35' : 'border-[#6e4a2d]/20 bg-transparent')}>
                <div className="text-[10px] font-black">{label}</div>
                <div className="mt-1 text-[8px] opacity-55">{value === 'BEATMAP_CHALLENGE' ? 'Highest qualifying score wins at expiry.' : 'First qualifying score takes the bounty.'}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[9px] font-black uppercase tracking-wider">Beatmap difficulty ID<input value={difficultyId} onChange={(e) => setDifficultyId(e.target.value)} placeholder="e.g. 5606522" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label>
            <label className="text-[9px] font-black uppercase tracking-wider">Bounty (minimum 100 DZP)<input value={bounty} onChange={(e) => setBounty(e.target.value)} type="number" min="100" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label>
          </div>
          {huntType !== 'BEATMAP_CHALLENGE' && <div className="mt-3 border border-[#6e4a2d]/20 bg-[#b99c77]/15 p-3"><div className="flex items-end justify-between gap-2"><label className="min-w-0 flex-1 text-[9px] font-black uppercase tracking-wider">Target score URL / ID<input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://osu.ppy.sh/scores/3818843414" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label><button type="button" onClick={() => void loadMyScores()} disabled={loadingScores || !difficultyId} className="border border-[#6e4a2d]/30 px-3 py-2 text-[9px] font-black disabled:opacity-40">{loadingScores ? 'LOADING' : 'LOAD MY SCORES'}</button></div>{myScores.length > 0 && <label className="mt-3 block text-[9px] font-black uppercase tracking-wider">Verified scores from your osu! account<select defaultValue="" onChange={(e) => { if (e.target.value) setTarget(e.target.value); }} className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none"><option value="">Choose a score…</option>{myScores.map((score) => <option key={score.osuScoreId} value={String(score.osuScoreId)}>{score.score.toLocaleString()} · {score.accuracy.toFixed(2)}% · {score.mods || 'NM'} · {score.pp ?? 0}pp</option>)}</select></label>}</div>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[9px] font-black uppercase tracking-wider">Minimum accuracy<input value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="e.g. 98" type="number" step="0.01" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label>
            <label className="text-[9px] font-black uppercase tracking-wider">Maximum misses<input value={misses} onChange={(e) => setMisses(e.target.value)} placeholder="e.g. 2" type="number" min="0" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label>
            <label className="text-[9px] font-black uppercase tracking-wider">Minimum combo<input value={combo} onChange={(e) => setCombo(e.target.value)} placeholder="e.g. 1200" type="number" min="0" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label>
            <label className="text-[9px] font-black uppercase tracking-wider">Minimum score<input value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="e.g. 900000" type="number" min="0" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label>
            <label className="text-[9px] font-black uppercase tracking-wider">Minimum PP<input value={minPp} onChange={(e) => setMinPp(e.target.value)} placeholder="e.g. 250" type="number" min="0" step="0.1" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label>
            <label className="text-[9px] font-black uppercase tracking-wider">Required mods<input value={mods} onChange={(e) => setMods(e.target.value)} placeholder="e.g. HDHR" className="mt-1 w-full border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm uppercase outline-none" /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[10px] font-black uppercase"><label className="flex items-center gap-2"><input type="checkbox" checked={exactMods} onChange={(e) => setExactMods(e.target.checked)} /> Exact mods</label><label className="flex items-center gap-2"><input type="checkbox" checked={fc} onChange={(e) => setFc(e.target.checked)} /> Full Combo required</label></div>
          <label className="mt-3 block text-[9px] font-black uppercase tracking-wider">Poster notes<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full resize-none border border-[#6e4a2d]/30 bg-white/40 px-3 py-2 text-sm outline-none" /></label>
          {error && <div className="mt-3 border border-red-900/20 bg-red-900/5 p-2 text-xs font-bold text-red-900">{error}</div>}
          <button disabled={busy} onClick={() => void submit()} className="mt-5 w-full bg-[#3b2b1a] py-3 text-xs font-black uppercase tracking-[.2em] text-[#f0dfbf] disabled:opacity-40">{busy ? 'Guild is sealing the poster…' : 'Publish Quest Poster'}</button>
        </div>
      </div>
    </div>
  );
}
