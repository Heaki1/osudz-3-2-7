import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Plus, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { api, type ApiAllowedCountry, type ApiParticipantException } from '../../../api/client';
import { formatDeadline } from '../../../lib/round';
import { Section } from './AdminDashboardPrimitives';

const REGION_NAMES = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (code: string) => { try { return REGION_NAMES?.of(code) ?? code; } catch { return code; } };
const flagEmoji = (code: string) => { const letters = [...code.toUpperCase()]; if (letters.length !== 2 || letters.some((l) => l < 'A' || l > 'Z')) return '\u{1F3F3}'; return String.fromCodePoint(...letters.map((l) => 0x1f1e6 + l.charCodeAt(0) - 65)); };

export function AdminEligibilityTab() {
  const [countries, setCountries] = useState<ApiAllowedCountry[] | null>(null);
  const [exceptions, setExceptions] = useState<ApiParticipantException[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');

  const load = useCallback(async () => {
    const [rows, overrides] = await Promise.all([api.admin.countries(), api.admin.participants()]);
    if (!rows.ok) { setError(`Could not read countries: ${rows.error}`); return; }
    if (!overrides.ok) { setError(`Could not read user exceptions: ${overrides.error}`); return; }
    setError(null); setCountries(rows.data); setExceptions(overrides.data);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const write = async (code: string, enabled: boolean) => { setBusy(code); const res = await api.admin.setCountry(code, enabled); setBusy(null); if (!res.ok) { setError(res.error); return; } await load(); };
  const drop = async (code: string) => { setBusy(code); const res = await api.admin.removeCountry(code); setBusy(null); if (!res.ok) { setError(res.error); return; } await load(); };
  const clearException = async (userId: number) => { setBusy(String(userId)); const res = await api.admin.clearParticipant(userId); setBusy(null); if (!res.ok) { setError(res.error); return; } await load(); };
  const add = async () => { const code = newCode.trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(code)) { setError('A country code is two letters, like DZ.'); return; } setNewCode(''); await write(code, true); };
  const enabledCount = countries?.filter((c) => c.enabled).length ?? 0;

  return <div className="space-y-5">
    {error && <div className="flex items-start gap-2.5 bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" /><p className="text-xs text-rose-300/90">{error}</p></div>}
    <Section title="Country Allowlist" description="Only players from enabled countries may submit or vote. Everyone else can still read and comment.">
      <div className="flex gap-2"><input type="text" placeholder="Country code, e.g. TN" maxLength={2} value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} className="flex-1 bg-slate-900/60 border border-slate-700 focus:border-amber-400/50 rounded-xl px-3 py-2.5 text-sm font-mono uppercase text-white placeholder-slate-600 focus:outline-none transition-colors" /><button type="button" onClick={() => void add()} className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl transition-all"><Plus className="w-3.5 h-3.5" />Add</button></div>
      {countries === null ? <p className="text-xs text-slate-500 py-4">Loading the allowlist…</p> : countries.length === 0 ? <p className="text-xs text-slate-500 py-4">No countries listed. Nobody can submit or vote until one is added.</p> : <div className="space-y-2">{countries.map((c) => <div key={c.country} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0"><div className="flex items-center gap-3"><span className="text-lg">{flagEmoji(c.country)}</span><div><p className="text-sm font-bold text-white">{countryName(c.country)}</p><p className="text-[10px] text-slate-600 font-mono">{c.country}</p></div></div><div className="flex items-center gap-3"><button type="button" disabled={busy === c.country} onClick={() => void write(c.country, !c.enabled)} aria-label={c.enabled ? `Disable ${c.country}` : `Enable ${c.country}`} className="transition-opacity hover:opacity-80 disabled:opacity-40">{c.enabled ? <ToggleRight className="w-7 h-7 text-emerald-400" /> : <ToggleLeft className="w-7 h-7 text-slate-600" />}</button><button type="button" disabled={busy === c.country} onClick={() => void drop(c.country)} aria-label={`Remove ${c.country} from the list`} title="Remove the row entirely. Use the toggle to disable without forgetting the decision." className="text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-40"><X className="w-4 h-4" /></button></div></div>)}</div>}
      {countries !== null && enabledCount === 0 && countries.length > 0 && <p className="text-[11px] text-amber-400/80">Nothing is enabled, so submitting and voting are closed to everyone. That is a supported way to pause a round — it does not affect administration.</p>}
    </Section>
    <Section title="User Exceptions" description="Players an administrator has granted or refused individually, whatever their country.">
      {exceptions === null ? <p className="text-xs text-slate-500">Loading exceptions…</p> : exceptions.length === 0 ? <p className="text-xs text-slate-500">No exceptions. Every account is decided by the country allowlist above. Set one from the Users tab, where both capabilities are on the same row.</p> : <div className="space-y-2">{exceptions.map((ex) => <div key={ex.userId} className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-2.5"><div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{ex.username}<span className="ml-2 text-[10px] font-mono text-slate-600">{ex.country}</span></p>{ex.note && <p className="text-[10px] text-slate-500 truncate">{ex.note}</p>}<p className="text-[10px] text-slate-600">set {formatDeadline(ex.setAt)}{ex.setByName && ` by ${ex.setByName}`}</p></div>{(['submit', 'vote'] as const).map((cap) => { const value = cap === 'submit' ? ex.canSubmit : ex.canVote; if (value === null) return null; return <span key={cap} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${value ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/15 border-rose-500/30 text-rose-400'}`}>{value ? 'may' : 'cannot'} {cap}</span>; })}<button type="button" disabled={busy === String(ex.userId)} onClick={() => void clearException(ex.userId)} aria-label={`Clear the exception for ${ex.username}`} title="Clear it, so the country allowlist decides this account again." className="text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-40"><X className="w-4 h-4" /></button></div>)}</div>}
    </Section>
  </div>;
}
