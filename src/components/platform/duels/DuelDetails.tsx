import { useRef, useState } from 'react';
import { Trophy, Upload, X } from 'lucide-react';
import { api, type ApiDuel } from '../../../api/client';
import { MOCK_DUEL_TESTING, fmt, mapTime } from './duelFormatters';
import type { DuelDetailsProps, MineProps, MyDuelRowProps, MyDuelDetailProps } from './duelTypes';

export function DuelDetails({ duel, balance, userId, onAccept, onClose }: DuelDetailsProps) {
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

function MapStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-2 text-center"><p className="text-[8px] font-mono uppercase tracking-wider text-slate-600">{label}</p><p className="mt-1 text-[11px] font-black text-slate-300">{value}</p></div>;
}

function Info({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-3"><p className="text-[8px] font-mono uppercase tracking-widest text-slate-700">{label}</p><p className={`mt-1 text-xs font-black ${accent ? 'text-amber-300' : 'text-slate-300'}`}>{value}</p></div>;
}

export function Mine({ duels, userId, onImport, onRefresh }: MineProps) {
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

export function MyDuelRow({ duel, selected, onSelect }: MyDuelRowProps) {
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

export function MyDuelDetail({ duel, userId, onImport, onRefresh }: MyDuelDetailProps) {
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
