import React, { useEffect, useState } from 'react';
import { api } from '../../../api/client';

const TIERS = ['BEGINNER', 'ADVANCED', 'ELITE', 'LEGENDARY_MASTER'];

function ExamTemplateRow({ testNumber, template, defaultRank, defaultReward, onSaved }: { testNumber: number; template: any; defaultRank: string | null; defaultReward: number; onSaved: () => Promise<void> }) {
  const [difficultyId, setDifficultyId] = useState(template?.difficulty_id ? String(template.difficulty_id) : '');
  const [rank, setRank] = useState(template?.reward_rank ?? defaultRank ?? '');
  const [reward, setReward] = useState(template?.reward_dzp != null ? String(template.reward_dzp) : String(defaultReward));
  const initialReq = template?.requirements ?? { fullCombo: true };
  const [minAccuracy, setMinAccuracy] = useState(initialReq.minAccuracy != null ? String(initialReq.minAccuracy) : '');
  const [maxMisses, setMaxMisses] = useState(initialReq.maxMisses != null ? String(initialReq.maxMisses) : '');
  const [minCombo, setMinCombo] = useState(initialReq.minCombo != null ? String(initialReq.minCombo) : '');
  const [minScore, setMinScore] = useState(initialReq.minScore != null ? String(initialReq.minScore) : '');
  const [minPp, setMinPp] = useState(initialReq.minPp != null ? String(initialReq.minPp) : '');
  const [fullCombo, setFullCombo] = useState(initialReq.fullCombo === true);
  const [exactMods, setExactMods] = useState(initialReq.exactMods === true);
  const [mods, setMods] = useState(Array.isArray(initialReq.requiredMods) ? initialReq.requiredMods.join(' ') : '');
  const [beatmap, setBeatmap] = useState<any>(null);
  const [loadingBeatmap, setLoadingBeatmap] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const parsed: Record<string, unknown> = {};
    if (minAccuracy !== '') parsed.minAccuracy = Number(minAccuracy);
    if (maxMisses !== '') parsed.maxMisses = Number(maxMisses);
    if (minCombo !== '') parsed.minCombo = Number(minCombo);
    if (minScore !== '') parsed.minScore = Number(minScore);
    if (minPp !== '') parsed.minPp = Number(minPp);
    if (mods.trim()) parsed.requiredMods = mods.trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (mods.trim()) parsed.exactMods = exactMods;
    if (fullCombo) parsed.fullCombo = true;
    if (Object.values(parsed).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) { window.alert('Requirements must use valid non-negative values.'); return; }
    setBusy(true);
    const result = await api.guildAdmin.updateExamTemplate(testNumber, { difficultyId: Number(difficultyId), rewardRank: rank || null, rewardDzp: Number(reward), requirements: parsed });
    setBusy(false);
    if (!result.ok) window.alert(result.error);
    else await onSaved();
  };
  const preview = async () => {
    const id = Number(difficultyId);
    if (!Number.isInteger(id) || id <= 0) return;
    setLoadingBeatmap(true);
    const result = await api.guildAdmin.examBeatmap(id);
    setLoadingBeatmap(false);
    setBeatmap(result.ok ? result.data : null);
    if (!result.ok) window.alert(result.error);
  };
  return <div className="grid gap-2 border border-slate-800 p-3 md:grid-cols-[44px_1fr_150px_120px_1.3fr_auto] md:items-center">
    <div className="font-serif text-lg font-black text-amber-200">#{testNumber}</div>
    <div className="flex gap-1"><input value={difficultyId} onChange={(e) => { setDifficultyId(e.target.value); setBeatmap(null); }} placeholder="difficulty ID" className="min-w-0 flex-1 border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" /><button onClick={() => void preview()} disabled={loadingBeatmap} className="border border-slate-700 px-2 text-[9px] text-slate-300">{loadingBeatmap ? '…' : 'LOOK'}</button></div>
    <select value={rank} onChange={(e) => setRank(e.target.value)} className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-[9px] font-black text-white"><option value="">No milestone</option><option>SILVER</option><option>GOLD</option><option>PLATINUM</option><option>MITHRIL</option></select>
    <input value={reward} onChange={(e) => setReward(e.target.value)} type="number" min="0" className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
    <div className="grid grid-cols-2 gap-1 border border-slate-700 bg-slate-900 p-2 text-[9px] text-slate-300 md:col-span-2 md:grid-cols-5"><label>ACC %<input value={minAccuracy} onChange={(e) => setMinAccuracy(e.target.value)} type="number" min="0" max="100" step="0.01" className="mt-1 w-full bg-black/30 px-1.5 py-1" /></label><label>MAX MISS<input value={maxMisses} onChange={(e) => setMaxMisses(e.target.value)} type="number" min="0" className="mt-1 w-full bg-black/30 px-1.5 py-1" /></label><label>MIN COMBO<input value={minCombo} onChange={(e) => setMinCombo(e.target.value)} type="number" min="0" className="mt-1 w-full bg-black/30 px-1.5 py-1" /></label><label>MIN SCORE<input value={minScore} onChange={(e) => setMinScore(e.target.value)} type="number" min="0" className="mt-1 w-full bg-black/30 px-1.5 py-1" /></label><label>MIN PP<input value={minPp} onChange={(e) => setMinPp(e.target.value)} type="number" min="0" step="0.1" className="mt-1 w-full bg-black/30 px-1.5 py-1" /></label><label className="col-span-2">REQUIRED MODS<input value={mods} onChange={(e) => setMods(e.target.value)} placeholder="HD HR" className="mt-1 w-full bg-black/30 px-1.5 py-1 uppercase" /></label><label className="flex items-end gap-1"><input checked={exactMods} onChange={(e) => setExactMods(e.target.checked)} type="checkbox" /> exact mods</label><label className="flex items-end gap-1"><input checked={fullCombo} onChange={(e) => setFullCombo(e.target.checked)} type="checkbox" /> full combo</label></div>
    <button disabled={busy || !difficultyId} onClick={() => void save()} className="border border-amber-300/25 px-3 py-1.5 text-[9px] font-black text-amber-200 disabled:opacity-40">{busy ? '...' : 'SAVE'}</button>
    {beatmap && <div className="md:col-span-full border border-emerald-400/10 bg-emerald-400/5 p-2 text-[9px] text-slate-300"><b className="text-emerald-200">{beatmap.artist} — {beatmap.title} [{beatmap.difficultyName}]</b> · {Number(beatmap.stars).toFixed(2)}★ · CS {beatmap.cs ?? '-'} · AR {beatmap.ar ?? '-'} · OD {beatmap.od ?? '-'} · HP {beatmap.hp ?? '-'} · {beatmap.maxCombo ? beatmap.maxCombo + 'x' : 'combo unavailable'} · {beatmap.status}</div>}
  </div>;
}

export function AdminGuildTab() {
  const [hunts, setHunts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [rankRules, setRankRules] = useState<any[]>([]);
  const [tierRules, setTierRules] = useState<any[]>([]);
  const [rankReviews, setRankReviews] = useState<any[]>([]);
  const [rankUserId, setRankUserId] = useState('');
  const [rankValue, setRankValue] = useState('IRON');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    const [h, r, e, t, rr, tr, rv] = await Promise.all([api.guildAdmin.hunts(), api.guildAdmin.reports(), api.guildAdmin.examReviews(), api.guildAdmin.examTemplates(), api.guildAdmin.rankRules(), api.guildAdmin.tierRules(), api.guildAdmin.rankReviews()]);
    if (h.ok) setHunts(h.data);
    if (r.ok) setReports(r.data);
    if (e.ok) setReviews(e.data);
    if (t.ok) setTemplates(t.data);
    if (rr.ok) setRankRules(rr.data);
    if (tr.ok) setTierRules(tr.data);
    if (rv.ok) setRankReviews(rv.data);
  };

  useEffect(() => { void refresh(); }, []);

  const override = async (hunt: any, tier: string) => {
    const reason = window.prompt('Guild reason for this row adjustment:', 'Guild difficulty review');
    if (!reason) return;
    const result = await api.guildAdmin.setHuntTier(hunt.id, tier, reason);
    setNotice(result.ok ? 'Poster row updated. The owner was notified when a top-up is required.' : result.error);
    if (result.ok) await refresh();
  };

  const resolve = async (report: any, status: 'RESOLVED_BANNED' | 'RESOLVED_CLEARED') => {
    const note = window.prompt('Guild resolution note:', status === 'RESOLVED_BANNED' ? 'Smurf report confirmed.' : 'Report cleared.');
    if (note === null) return;
    const result = await api.guildAdmin.resolveReport(report.id, status, note);
    setNotice(result.ok ? 'Report resolved.' : result.error);
    if (result.ok) await refresh();
  };

  const approve = async (review: any, rank: string) => {
    const note = window.prompt('Final Guild review note:', 'Reviewed by Guild administration.');
    if (note === null) return;
    const result = await api.guildAdmin.approveExam(review.user_id, rank, note);
    setNotice(result.ok ? 'Placement Exam approved and rewarded.' : result.error);
    if (result.ok) await refresh();
  };

  const approveRankReview = async (review: any) => {
    const note = window.prompt('Adamantite Tribunal approval note:', 'Final progression reviewed and approved by Guild administration.');
    if (note === null) return;
    const result = await api.guildAdmin.approveRankReview(review.id, note);
    setNotice(result.ok ? 'Adamantite promotion approved.' : result.error);
    if (result.ok) await refresh();
  };

  const rejectRankReview = async (review: any) => {
    const note = window.prompt('Adamantite Tribunal rejection note:', 'Current evidence does not satisfy the final Guild standard.');
    if (note === null) return;
    const result = await api.guildAdmin.rejectRankReview(review.id, note);
    setNotice(result.ok ? 'Adamantite review closed without promotion.' : result.error);
    if (result.ok) await refresh();
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-lg font-black text-white">Adventurer Guild</h2><p className="mt-1 text-xs text-slate-500">Moderate Quest posters, review smurf reports, approve final exams, and reconcile Guild loans.</p></div>
      {notice && <div className="border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">{notice}</div>}

      <section className="border border-slate-800 bg-slate-950/35 p-4">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-black text-white">Quest poster administration</h3><button onClick={() => void api.guildAdmin.reconcileLoans().then((r) => setNotice(r.ok ? 'Guild loan reconciliation completed.' : r.error))} className="border border-slate-700 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-300">Reconcile loans</button></div>
        <div className="space-y-2">{hunts.length === 0 ? <div className="py-6 text-center text-xs text-slate-600">No active Guild posters.</div> : hunts.map((hunt) => <div key={hunt.id} className="grid gap-3 border border-slate-800 p-3 md:grid-cols-[1fr_auto_auto] md:items-center"><div><div className="text-xs font-black text-slate-200">{hunt.title}</div><div className="mt-1 text-[9px] text-slate-500">{hunt.poster.username} · {hunt.stars.toFixed(2)}★ · {hunt.bountyDzp.toLocaleString()} DZP · {hunt.status}</div></div><div className="text-[9px] font-black uppercase text-amber-300">{hunt.tier}</div><select defaultValue={hunt.tier} onChange={(e) => void override(hunt, e.target.value)} className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-[9px] font-black text-slate-200">{TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select></div>)}</div>
      </section>

      <section className="border border-slate-800 bg-slate-950/35 p-4">
        <h3 className="mb-1 text-sm font-black text-white">Quest Board classification policy</h3>
        <p className="mb-4 text-[10px] text-slate-500">The Guild automatically places posters using both star difficulty and bounty. These thresholds are the policy the automatic classifier uses; individual posters can still be overridden above.</p>
        <div className="space-y-2">{tierRules.map((rule) => <div key={rule.tier} className="grid gap-2 border border-slate-800 p-3 md:grid-cols-[1fr_180px_180px_auto] md:items-center"><div><div className="text-[10px] font-black text-amber-200">{rule.display_name}</div><div className="text-[8px] uppercase tracking-wider text-slate-600">{rule.tier}</div></div><input defaultValue={rule.min_stars} type="number" min="0" step="0.01" data-tier-stars={rule.tier} className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="Minimum stars" /><input defaultValue={rule.min_bounty_dzp} type="number" min="100" step="1" data-tier-bounty={rule.tier} className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="Minimum DZP" /><button onClick={async (event) => { const row = event.currentTarget.parentElement; if (!row) return; const stars = row.querySelector<HTMLInputElement>('[data-tier-stars]')?.value; const bounty = row.querySelector<HTMLInputElement>('[data-tier-bounty]')?.value; const result = await api.guildAdmin.updateTierRule(rule.tier, { minStars: Number(stars), minBountyDzp: Number(bounty) }); setNotice(result.ok ? `${rule.display_name} classification rule saved.` : result.error); if (result.ok) await refresh(); }} className="border border-amber-300/25 px-3 py-1.5 text-[9px] font-black text-amber-200">SAVE</button></div>)}</div>
      </section>

      <section className="border border-slate-800 bg-slate-950/35 p-4">
        <h3 className="mb-1 text-sm font-black text-white">Guild rank administration</h3>
        <p className="mb-4 text-[10px] text-slate-500">Configure EXP promotion thresholds and manually assign an adventurer rank when Guild administration needs to intervene.</p>
        <div className="space-y-2">
          {rankRules.map((rule) => <div key={rule.rank} className="grid gap-2 border border-slate-800 p-3 md:grid-cols-[120px_1fr_1fr_1fr_auto] md:items-center">
            <div className="text-[10px] font-black text-amber-200">{rule.rank}</div>
            <input defaultValue={rule.min_exp ?? ''} type="number" min="0" placeholder="Minimum EXP" data-rank-exp={rule.rank} className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
            <select defaultValue={rule.required_hunt_tier ?? ''} data-rank-tier={rule.rank} className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-[9px] font-black text-white"><option value="">No Hunt tier requirement</option>{TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select>
            <input defaultValue={rule.required_successes ?? ''} type="number" min="0" placeholder="Successful Hunts" data-rank-successes={rule.rank} className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
            <button onClick={async (event) => { const row = event.currentTarget.parentElement; if (!row) return; const exp = row.querySelector<HTMLInputElement>('[data-rank-exp]')?.value; const tier = row.querySelector<HTMLSelectElement>('[data-rank-tier]')?.value; const successes = row.querySelector<HTMLInputElement>('[data-rank-successes]')?.value; const result = await api.guildAdmin.updateRankRule(rule.rank, { minExp: exp === '' ? null : Number(exp), requiredHuntTier: tier === '' ? null : tier, requiredSuccesses: successes === '' ? null : Number(successes) }); setNotice(result.ok ? `${rule.rank} Guild rule saved.` : result.error); if (result.ok) await refresh(); }} className="border border-amber-300/25 px-3 py-1.5 text-[9px] font-black text-amber-200">SAVE</button>
          </div>)}
        </div>
        <div className="mt-5 grid gap-2 border-t border-slate-800 pt-4 md:grid-cols-[150px_1fr_auto]">
          <input value={rankUserId} onChange={(e) => setRankUserId(e.target.value)} type="number" min="1" placeholder="Local user ID" className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
          <select value={rankValue} onChange={(e) => setRankValue(e.target.value)} className="border border-slate-700 bg-slate-900 px-2 py-1.5 text-[9px] font-black text-white">{['IRON','COPPER','SILVER','GOLD','PLATINUM','MITHRIL','ORICHALCUM','ADAMANTITE'].map((rank) => <option key={rank}>{rank}</option>)}</select>
          <button disabled={!rankUserId} onClick={async () => { const result = await api.guildAdmin.setPlayerRank(Number(rankUserId), rankValue, 'Guild administration manual rank assignment'); setNotice(result.ok ? 'Adventurer rank updated.' : result.error); }} className="border border-amber-300/25 px-3 py-1.5 text-[9px] font-black text-amber-200 disabled:opacity-40">ASSIGN RANK</button>
        </div>
      </section>

      <section className="border border-slate-800 bg-slate-950/35 p-4">
        <h3 className="mb-1 text-sm font-black text-white">Placement Exam setup</h3>
        <p className="mb-4 text-[10px] text-slate-500">Configure the six Guild-assigned beatmaps. Tests unlock sequentially. Reward milestones follow the Guild design.</p>
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => index + 1).map((testNumber) => {
            const template = templates.find((item) => Number(item.test_number) === testNumber);
            const defaultRank = testNumber === 1 ? 'SILVER' : testNumber === 2 || testNumber === 3 ? 'GOLD' : testNumber === 4 ? 'PLATINUM' : testNumber === 5 ? 'MITHRIL' : null;
            const defaultReward = testNumber === 1 ? 500 : testNumber === 2 || testNumber === 3 ? 750 : testNumber === 4 ? 2000 : testNumber === 5 ? 3000 : 5000;
            return <ExamTemplateRow key={testNumber} testNumber={testNumber} template={template} defaultRank={defaultRank} defaultReward={defaultReward} onSaved={refresh} />;
          })}
        </div>
      </section>

      <section className="border border-slate-800 bg-slate-950/35 p-4">
        <h3 className="mb-4 text-sm font-black text-white">Smurf reports</h3>
        <div className="space-y-2">{reports.length === 0 ? <div className="py-6 text-center text-xs text-slate-600">No pending reports.</div> : reports.map((report) => <div key={report.id} className="grid gap-3 border border-slate-800 p-3 md:grid-cols-[1fr_auto]"><div><div className="text-xs font-black text-slate-200">{report.username} · {report.score.toLocaleString()} · {report.accuracy.toFixed(2)}%</div><div className="mt-1 text-[10px] text-slate-500">{report.reason}</div></div><div className="flex gap-2"><button onClick={() => void resolve(report, 'RESOLVED_CLEARED')} className="border border-emerald-500/20 px-3 py-1.5 text-[9px] font-black text-emerald-300">CLEAR</button><button onClick={() => void resolve(report, 'RESOLVED_BANNED')} className="border border-rose-500/20 px-3 py-1.5 text-[9px] font-black text-rose-300">CONFIRM</button></div></div>)}</div>
      </section>

      <section className="border border-slate-800 bg-slate-950/35 p-4">
        <h3 className="mb-4 text-sm font-black text-white">Placement Exam review</h3>
        <div className="space-y-2">{reviews.length === 0 ? <div className="py-6 text-center text-xs text-slate-600">No Test 6 reviews waiting.</div> : reviews.map((review) => <div key={review.id} className="grid gap-3 border border-slate-800 p-3 md:grid-cols-[1fr_auto]"><div><div className="text-xs font-black text-slate-200">{review.username}</div><div className="mt-1 text-[9px] text-slate-500">Cleared all six tests · {new Date(review.updated_at ?? review.expires_at).toLocaleString()}</div></div><div className="flex gap-2"><button onClick={() => void approve(review, 'ORICHALCUM')} className="border border-purple-400/20 px-3 py-1.5 text-[9px] font-black text-purple-300">ORICHALCUM</button><button onClick={() => void approve(review, 'ADAMANTITE')} className="border border-amber-300/20 px-3 py-1.5 text-[9px] font-black text-amber-200">ADAMANTITE</button></div></div>)}</div>
      </section>

      <section className="border border-slate-800 bg-slate-950/35 p-4">
        <h3 className="mb-1 text-sm font-black text-white">Adamantite Tribunal</h3>
        <p className="mb-4 text-[10px] text-slate-500">Final rank requests are created only after the 50,000 EXP threshold and all Adamantite gate conditions are satisfied.</p>
        <div className="space-y-2">{rankReviews.length === 0 ? <div className="py-6 text-center text-xs text-slate-600">No pending rank reviews.</div> : rankReviews.map((review) => <div key={review.id} className="grid gap-3 border border-slate-800 p-3 md:grid-cols-[1fr_auto]"><div><div className="text-xs font-black text-slate-200">{review.username} · {review.requested_rank}</div><div className="mt-1 text-[9px] text-slate-500">Requested {new Date(review.requested_at).toLocaleString()}</div></div><div className="flex gap-2"><button onClick={() => void approveRankReview(review)} className="border border-amber-300/20 px-3 py-1.5 text-[9px] font-black text-amber-200">APPROVE</button><button onClick={() => void rejectRankReview(review)} className="border border-rose-500/20 px-3 py-1.5 text-[9px] font-black text-rose-300">REJECT</button></div></div>)}</div>
      </section>
    </div>
  );
}
