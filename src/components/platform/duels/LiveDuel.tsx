import { useRef, useState } from 'react';
import { BadgeDollarSign, ExternalLink, Pause, Play, Swords, Timer, Upload } from 'lucide-react';
import type { ApiDuel } from '../../../api/client';
import { api } from '../../../api/client';
import { useAudioPreview } from '../../../lib/audioPreview';
import { duelStarStyle, duelModStyle } from './duelFormatters';
import { ReplayViewer } from './ReplayViewer';
import { PlayerScore } from './PlayerScore';
import type { LiveDuelProps, LiveSectionProps } from './duelTypes';

export function ArenaEmpty({ onPost }: { onPost: () => void }) {
  return <div className="relative overflow-hidden border border-slate-800 bg-[#0b1322] px-6 py-14 text-center sm:px-10">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,63,94,.07),transparent_55%)]" />
    <div className="relative mx-auto max-w-xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/10 text-rose-300"><Swords className="h-5 w-5" /></div><h2 className="mt-4 text-xl font-black text-white">The arena is waiting.</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">Post a duel or choose an open challenge below. Once two players lock their stakes, this space becomes the live match.</p><button onClick={onPost} className="mt-6 bg-rose-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-400">Post a duel</button></div>
  </div>;
}

export function LiveDuel({ duel, user, onSelect, onImport, onNavigateToPlayer, onReplayShared }: LiveDuelProps) {
  const { isPlaying, progress, toggle: togglePlay, seek } = useAudioPreview(String(duel.difficultyId), duel.previewUrl);
  const replayInput = useRef<HTMLInputElement>(null);
  const [uploadingReplay, setUploadingReplay] = useState(false);
  const [replayMessage, setReplayMessage] = useState('');
  const [watchingReplay, setWatchingReplay] = useState(false);
  const starStyle = duelStarStyle(duel.stars);
  const modStyle = duelModStyle(duel.mods);
  const mine = !!user && (duel.challengerUserId === user.id || duel.opponentUserId === user.id);
  const challengerAhead = (duel.challengerScore ?? -1) > (duel.opponentScore ?? -1);
  const opponentAhead = (duel.opponentScore ?? -1) > (duel.challengerScore ?? -1);
  const total = (duel.challengerScore ?? 0) + (duel.opponentScore ?? 0);
  const cPct = total === 0 ? 50 : Math.round(((duel.challengerScore ?? 0) / total) * 100);
  const oPct = 100 - cPct;
  const tied = !challengerAhead && !opponentAhead;
  const seekAudio = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };
  const myReplayReady = mine
    ? duel.challengerUserId === user?.id
      ? !!duel.challengerReplayReady
      : !!duel.opponentReplayReady
    : false;
  const bothReplaysReady = !!duel.challengerReplayReady && !!duel.opponentReplayReady;
  const shareReplay = async (file: File) => {
    if (!mine || uploadingReplay) return;
    if (!file.name.toLowerCase().endsWith('.osr')) {
      setReplayMessage('Choose an .osr replay file.');
      return;
    }
    setUploadingReplay(true);
    setReplayMessage('');
    const result = await api.duels.uploadReplay(duel.id, file);
    setUploadingReplay(false);
    if (!result.ok) {
      setReplayMessage(result.error);
      return;
    }
    setReplayMessage('Replay shared. It is now available to spectators.');
    await onReplayShared?.();
  };
  return <article className="group overflow-hidden rounded-2xl border border-rose-500/30 bg-[#0b1322] shadow-[0_0_60px_rgba(244,63,94,0.07)] transition-all duration-200 hover:border-amber-400/50 hover:shadow-[0_0_45px_rgba(250,204,21,0.12)]">
    <div className="flex items-center justify-between border-b border-rose-500/20 bg-[#0d0f1e] px-5 py-3">
      <div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" /></span><span className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-rose-300">Live now</span></div>
      <div className="font-mono text-sm font-black tabular-nums text-slate-400"><Timer className="mr-1 inline h-3.5 w-3.5" />{new Date(duel.endsAt).toLocaleDateString()} · {new Date(duel.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    </div>

      <div className="relative overflow-hidden border-b border-slate-800/60 px-5 py-4">
      {(duel.coverUrl || duel.beatmapsetId) && <img src={duel.coverUrl || `https://assets.ppy.sh/beatmaps/${duel.beatmapsetId}/covers/cover.jpg`} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-20" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b1322] via-[#0b1322]/90 to-[#0b1322]/80" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-1.5">
            <div className={`flex h-5 items-center gap-1 rounded-md border px-1.5 ${starStyle.border} ${starStyle.header}`}>
              <span className="text-[10px] leading-none">★</span>
              <span className="font-mono text-[10px] font-black tabular-nums">{duel.stars.toFixed(2)}</span>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${modStyle.bg} ${modStyle.border} ${modStyle.text}`}>{duel.mods}</span>
            <span className="rounded-full border border-slate-700 bg-slate-800/90 px-2 py-0.5 text-[9px] font-semibold text-slate-200">{duel.difficulty}</span>
          </div>
          <p className="truncate text-base font-black text-white transition-[text-shadow] duration-200 group-hover:[text-shadow:0_0_8px_rgba(250,204,21,0.85)]">{duel.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-300 font-medium">{duel.artist}<span className="text-slate-500 font-normal"> · mapped by </span><span className="text-slate-200 font-semibold">{duel.mapper || 'osu!'}</span></p>
          <p className="mt-2 text-[10px] text-slate-600">Win condition: <span className="font-bold text-slate-400">{duel.requirement}</span></p>
        </div>
        <a href={`https://osu.ppy.sh/b/${duel.difficultyId}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-sm border border-slate-700 p-2 text-slate-500 transition hover:border-slate-500 hover:text-white"><ExternalLink className="h-4 w-4" /></a>
      </div>
      {duel.previewUrl && <div className={`relative mt-4 flex items-center gap-2 rounded-xl border px-2.5 py-2 ${isPlaying ? 'border-amber-400/25 bg-amber-400/[0.06]' : 'border-slate-700/70 bg-slate-950/60'}`}>
        <button type="button" onClick={togglePlay} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isPlaying ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}</button>
        <div onClick={seekAudio} className="relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-slate-800"><div className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <span className="w-12 text-right font-mono text-[8px] uppercase tracking-wider text-slate-600">preview</span>
      </div>}
    </div>

    <div className="px-5 pb-5 pt-5">
      <ReplayViewer duel={duel} watching={watchingReplay} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px_minmax(0,1fr)] lg:items-center">
        <PlayerScore name={duel.challenger} avatarUrl={duel.challengerAvatar} score={duel.challengerScore} accuracy={duel.challengerAccuracy} misses={duel.challengerMisses} maxCombo={duel.maxCombo ?? undefined} leading={challengerAhead} losing={opponentAhead} mine={!!mine && duel.challengerUserId === user?.id} align="left" onImport={onImport} onNavigateToPlayer={onNavigateToPlayer} />
        <div className="order-first flex min-w-0 flex-col items-center lg:order-none">
          <div className="mb-3 w-full max-w-xs space-y-2">
            {[
              { label: 'CS', value: duel.cs ?? 0, max: 7 },
              { label: 'HP', value: duel.hp ?? 0, max: 10 },
              { label: 'OD', value: duel.od ?? 0, max: 10 },
              { label: 'AR', value: duel.ar ?? 0, max: 10 },
            ].map(({ label, value, max }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[9px] font-mono font-black uppercase tracking-wider text-slate-500">{label}</span>
                  <span className="font-mono text-[9px] font-bold text-slate-300">{value.toFixed(1)}</span>
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className={"h-full rounded-full " + starStyle.header.split(' ')[0]} style={{ width: Math.min(100, (value / max) * 100) + "%" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex select-none flex-col items-center gap-1">
            <span className="font-black text-2xl italic text-rose-500/70">VS</span>
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-700">{duel.stake * 2} DZPP pot</span>
          </div>
        </div>
        <PlayerScore name={duel.opponent ?? 'Waiting…'} avatarUrl={duel.opponentAvatar} score={duel.opponentScore} accuracy={duel.opponentAccuracy} misses={duel.opponentMisses} maxCombo={duel.maxCombo ?? undefined} leading={opponentAhead} losing={challengerAhead} mine={!!mine && duel.opponentUserId === user?.id} align="right" onImport={onImport} onNavigateToPlayer={onNavigateToPlayer} />
      </div>

      <div className="mt-6"><div className="mb-1.5 flex items-center justify-between"><span className={`font-mono text-[9px] font-black ${challengerAhead ? 'text-emerald-400' : opponentAhead ? 'text-rose-400' : 'text-slate-600'}`}>{cPct}%</span><span className="font-mono text-[8px] uppercase tracking-widest text-slate-700">{tied ? 'Tied' : challengerAhead ? `${duel.challenger} leads` : `${duel.opponent ?? 'Opponent'} leads`}</span><span className={`font-mono text-[9px] font-black ${opponentAhead ? 'text-emerald-400' : challengerAhead ? 'text-rose-400' : 'text-slate-600'}`}>{oPct}%</span></div><div className="flex h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full transition-all duration-700 ${challengerAhead ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : opponentAhead ? 'bg-gradient-to-r from-rose-500 to-rose-400' : 'bg-slate-700'}`} style={{ width: `${cPct}%` }} /><div className={`h-full transition-all duration-700 ${opponentAhead ? 'bg-gradient-to-r from-emerald-300 to-emerald-500' : challengerAhead ? 'bg-gradient-to-r from-rose-400 to-rose-500' : 'bg-slate-700'}`} style={{ width: `${oPct}%` }} /></div></div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-4">
        <div className="flex items-center gap-3 text-[10px] text-slate-600">
          <BadgeDollarSign className="h-3.5 w-3.5 text-amber-400/60" />
          <span>Each player staked <span className="font-black text-amber-300">{duel.stake} DZPP</span></span>
          <span className={bothReplaysReady ? 'font-black text-emerald-400' : 'font-mono text-slate-700'}>
            Replay {duel.challengerReplayReady ? '✓' : '—'} / {duel.opponentReplayReady ? '✓' : '—'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mine && <button type="button" onClick={onImport} className="inline-flex items-center gap-1.5 border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-amber-300 transition hover:border-amber-400/60 hover:bg-amber-400/10"><Upload className="h-3.5 w-3.5" /> Import my score</button>}
          {mine && !myReplayReady && <button type="button" disabled={uploadingReplay} onClick={() => replayInput.current?.click()} className="inline-flex items-center gap-1.5 border border-rose-400/30 bg-rose-500/[0.06] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-rose-300 transition hover:border-rose-400/60 hover:bg-rose-500/10 disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> {uploadingReplay ? 'Sharing…' : 'Share replay'}</button>}
          {bothReplaysReady && <button type="button" onClick={() => setWatchingReplay(true)} className="inline-flex items-center gap-1.5 border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-400/10"><Play className="h-3.5 w-3.5" /> Watch duel</button>}
          <input ref={replayInput} type="file" accept=".osr,application/octet-stream" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void shareReplay(file); }} />
        </div>
      </div>
      {replayMessage && <div className="mt-2 text-right text-[9px] font-mono text-slate-500">{replayMessage}</div>}
    </div>
  </article>;
}

export function LiveSection({ duels, user, onSelect, onImport, onPost }: LiveSectionProps) {
  return <section className="mb-10">
    <div className="mb-4 flex items-end justify-between border-b border-slate-800/80 pb-3">
      <div><div className="flex items-center gap-2 text-[9px] font-mono font-black uppercase tracking-[0.2em] text-rose-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /> Live arena</div><h2 className="mt-1 text-lg font-black text-white">Live duels</h2><p className="mt-1 text-xs text-slate-600">Active matches between locked opponents.</p></div>
      <span className="text-[10px] font-mono text-slate-600">{duels.length} active</span>
    </div>
    {duels.length ? <div className="space-y-4">{duels.map((duel) => <LiveDuel key={duel.id} duel={duel} user={user} onSelect={() => onSelect(duel.id)} onImport={onImport} onNavigateToPlayer={() => {}} />)}</div> : <ArenaEmpty onPost={onPost} />}
  </section>;
}
