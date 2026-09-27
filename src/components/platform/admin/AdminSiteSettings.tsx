import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiAdminSiteSettings, ApiSiteSettings } from '../../../api/client';
import { Section } from './AdminDashboardPrimitives';
import { AlertCircle, Plus, X } from 'lucide-react';

/** Shared site-settings state. Both settings tabs PATCH the same server row. */
export function useSiteSettings() {
  const [settings, setSettings] = useState<ApiAdminSiteSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const rows = await api.admin.settings();
    if (!rows.ok) {
      setError(`Could not read the submission rules: ${rows.error}`);
      return;
    }
    setError(null);
    setSettings(rows.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Partial<ApiSiteSettings>) => {
    setSaving(true);
    setSaved(false);
    const res = await api.admin.saveSettings(patch);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setSettings(res.data.settings);
    setSaved(true);
  };

  return { settings, error, saving, saved, save };
}

/** A bound field: empty means no limit, which is what null is in the table. */
export function BoundInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-mono">{label}</p>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-900/60 border border-slate-700 focus:border-amber-400/50 rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none transition-colors"
      />
    </div>
  );
}

export function parseLength(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parts = trimmed.split(':');
  if (parts.length === 1) {
    const n = Number(parts[0]);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  }
  if (parts.length !== 2) return undefined;
  const m = Number(parts[0]);
  const s = Number(parts[1]);
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || s > 59) return undefined;
  return m * 60 + s;
}

export function parseStars(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const secondsToLength = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const JUDGED_TYPES = ['Full Combo', 'Top #1 Score', 'Best Accuracy', 'Lowest Miss Count'];

export function BeatmapRulesTab() {
  const { settings, error, saving, saved, save } = useSiteSettings();
  const [starMin, setStarMin] = useState('');
  const [starMax, setStarMax] = useState('');
  const [lenMin, setLenMin] = useState('');
  const [lenMax, setLenMax] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [maxSubmissionsPerUser, setMaxSubmissionsPerUser] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setStarMin(settings.minStars === null ? '' : settings.minStars.toFixed(2));
    setStarMax(settings.maxStars === null ? '' : settings.maxStars.toFixed(2));
    setLenMin(settings.minLengthSeconds === null ? '' : secondsToLength(settings.minLengthSeconds));
    setLenMax(settings.maxLengthSeconds === null ? '' : secondsToLength(settings.maxLengthSeconds));
    setStatuses(settings.allowedStatuses);
    setMaxSubmissionsPerUser(settings.maxSubmissionsPerUser === null ? '' : String(settings.maxSubmissionsPerUser));
  }, [settings]);

  const handleSave = async () => {
    const minStars = parseStars(starMin);
    const maxStars = parseStars(starMax);
    const minLengthSeconds = parseLength(lenMin);
    const maxLengthSeconds = parseLength(lenMax);
    if (minStars === undefined || maxStars === undefined) return setLocalError('Star limits must be a number, or empty for no limit.');
    if (minLengthSeconds === undefined || maxLengthSeconds === undefined) return setLocalError('Lengths must be m:ss or a number of seconds, or empty for no limit.');
    if (statuses.length === 0) return setLocalError('Allow at least one beatmap status, or nothing can be submitted at all.');
    const trimmed = maxSubmissionsPerUser.trim();
    const maxSubmissionsPerUserValue = trimmed === '' ? null : Number(trimmed);
    if (maxSubmissionsPerUserValue !== null && (!Number.isInteger(maxSubmissionsPerUserValue) || maxSubmissionsPerUserValue < 1)) {
      return setLocalError('Max submissions per user must be a positive whole number, or empty for no limit.');
    }
    setLocalError(null);
    await save({ minStars, maxStars, minLengthSeconds, maxLengthSeconds, allowedStatuses: statuses, maxSubmissionsPerUser: maxSubmissionsPerUserValue });
  };

  return <div className="space-y-5">
    {(error || localError) && <div className="flex items-start gap-2.5 bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" /><p className="text-xs text-rose-300/90">{localError ?? error}</p></div>}
    <Section title="Star Rating Range" description="Submitted beatmaps must fall within this range. Leave a field empty for no limit."><div className="grid grid-cols-2 gap-4"><BoundInput label="Minimum ★" value={starMin} placeholder="no minimum" onChange={setStarMin} /><BoundInput label="Maximum ★" value={starMax} placeholder="no maximum" onChange={setStarMax} /></div></Section>
    <Section title="Length Range" description="Total length of the difficulty, as m:ss or seconds. Empty means no limit."><div className="grid grid-cols-2 gap-4"><BoundInput label="Minimum" value={lenMin} placeholder="no minimum" onChange={setLenMin} /><BoundInput label="Maximum" value={lenMax} placeholder="no maximum" onChange={setLenMax} /></div></Section>
    <Section title="Allowed Statuses" description="Only these osu! statuses may be submitted."><div className="flex flex-wrap gap-2">{['ranked', 'loved', 'approved'].map((key) => <button key={key} type="button" onClick={() => setStatuses((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key])} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize border transition-all ${statuses.includes(key) ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400' : 'bg-slate-900/50 border-slate-700/60 text-slate-600 hover:text-slate-400'}`}>{key}</button>)}</div></Section>
    <Section title="Max Submissions per User" description="How many non-rejected submissions each user may make in a single round. Leave empty for no limit."><BoundInput label="Limit (empty = no limit)" value={maxSubmissionsPerUser} placeholder="no limit" onChange={setMaxSubmissionsPerUser} /></Section>
    <div className="flex items-center gap-3"><button type="button" onClick={() => void handleSave()} disabled={saving || settings === null} className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-sm font-black rounded-xl transition-all">{saving ? 'Saving…' : 'Save Rules'}</button>{saved && <p className="text-xs text-emerald-400">Saved. New submissions are checked against these.</p>}</div>
  </div>;
}

export function ChallengeTab() {
  const { settings, error, saving, saved, save } = useSiteSettings();
  const [mods, setMods] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [newMod, setNewMod] = useState('');
  const [newType, setNewType] = useState('');
  const [maxChallengeBeatmaps, setMaxChallengeBeatmaps] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setMods(settings.allowedMods);
    setTypes(settings.allowedChallengeTypes);
    setMaxChallengeBeatmaps(settings.maxChallengeBeatmaps === null ? '' : String(settings.maxChallengeBeatmaps));
  }, [settings]);

  const addMod = () => { const name = newMod.trim().toUpperCase(); if (name && !mods.includes(name)) { setMods((prev) => [...prev, name]); setNewMod(''); } };
  const addType = () => { const name = newType.trim(); if (name && !types.includes(name)) { setTypes((prev) => [...prev, name]); setNewType(''); } };
  const handleSave = async () => {
    if (mods.length === 0 || types.length === 0) return setLocalError('Keep at least one mod and one challenge type, or nothing can be submitted.');
    const trimmed = maxChallengeBeatmaps.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isInteger(value) || value < 1)) return setLocalError('Challenge beatmaps per round must be a positive whole number, or empty for no limit.');
    setLocalError(null);
    await save({ allowedMods: mods, allowedChallengeTypes: types, maxChallengeBeatmaps: value });
  };
  const droppedJudged = JUDGED_TYPES.filter((t) => !types.includes(t));
  return <div className="space-y-5">
    {(error || localError) && <div className="flex items-start gap-2.5 bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" /><p className="text-xs text-rose-300/90">{localError ?? error}</p></div>}
    <Section title="Allowed Mods" description="Players choose from these when submitting a beatmap."><div className="flex flex-wrap gap-2">{mods.map((m) => <div key={m} className="flex items-center gap-1.5 bg-slate-900/40 border border-slate-800 rounded-lg pl-3 pr-2 py-1.5"><span className="text-xs font-mono font-bold text-white">{m}</span><button type="button" onClick={() => setMods((prev) => prev.filter((x) => x !== m))} className="text-slate-600 hover:text-rose-400 transition-colors"><X className="w-3.5 h-3.5" /></button></div>)}</div><div className="flex gap-2 mt-3"><input type="text" placeholder="New mod acronym (e.g. HDDT)…" value={newMod} onChange={(e) => setNewMod(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMod(); }} className="flex-1 bg-slate-900/60 border border-slate-700 focus:border-amber-400/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors font-mono" /><button type="button" onClick={addMod} className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl transition-all"><Plus className="w-3.5 h-3.5" />Add</button></div></Section>
    <Section title="Challenge Types" description="The requirement a submitter picks alongside the mod."><div className="space-y-2">{types.map((t) => <div key={t} className="flex items-center justify-between bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-2.5"><span className="text-sm text-white">{t}{JUDGED_TYPES.includes(t) && <span className="ml-2 text-[10px] font-mono text-slate-600">judged</span>}</span><button type="button" onClick={() => setTypes((prev) => prev.filter((x) => x !== t))} className="text-slate-600 hover:text-rose-400 transition-colors"><X className="w-4 h-4" /></button></div>)}</div><div className="flex gap-2"><input type="text" placeholder="New challenge type…" value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addType(); }} className="flex-1 bg-slate-900/60 border border-slate-700 focus:border-amber-400/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors" /><button type="button" onClick={addType} className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl transition-all"><Plus className="w-3.5 h-3.5" />Add</button></div>{droppedJudged.length > 0 && <p className="text-[11px] text-amber-400/80">Removing {droppedJudged.join(', ')} leaves existing rounds intact; it only stops being offered on new submissions.</p>}</Section>
    <Section title="Challenge Beatmaps per Round" description="How many of the highest-voted approved submissions advance to the challenge phase. Leave empty to include all approved submissions."><BoundInput label="Limit (empty = all approved)" value={maxChallengeBeatmaps} placeholder="no limit" onChange={setMaxChallengeBeatmaps} /></Section>
    <div className="flex items-center gap-3"><button type="button" onClick={() => void handleSave()} disabled={saving || settings === null} className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 text-sm font-black rounded-xl transition-all">{saving ? 'Saving…' : 'Save Challenge Options'}</button>{saved && <p className="text-xs text-emerald-400">Saved.</p>}</div>
  </div>;
}
