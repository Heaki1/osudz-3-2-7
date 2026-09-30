import React, { useEffect, useRef, useState } from 'react';
import type { ApiHunt } from '../../../api/beatmapHunts';

function Paper({ hunt, claimed }: { hunt: ApiHunt; claimed: boolean }) {
  const isBeatmapHunt = hunt.huntType === 'BEATMAP_CHALLENGE';
  const typeLabel =
    hunt.huntType === 'BEAT_MY_SCORE' ? 'BEAT MY SCORE' :
      hunt.huntType === 'SNIPE_SCORE' ? 'SNIPE THIS SCORE' : 'BEATMAP HUNT';
  const req = hunt.requirements;
  const requirements = [
    req.fullCombo ? 'FULL COMBO' : null,
    typeof req.minAccuracy === 'number' ? req.minAccuracy.toFixed(2) + '%+' : null,
    typeof req.maxMisses === 'number' ? '≤' + req.maxMisses + ' MISS' : null,
    typeof req.minCombo === 'number' ? req.minCombo + 'x' : null,
    Array.isArray(req.requiredMods) && req.requiredMods.length ? req.requiredMods.join('') : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className="relative h-full w-full overflow-hidden border border-[#6e4a2d]/70 bg-[#dcc6a8] text-[#3b2b1a] shadow-[0_22px_34px_rgba(0,0,0,.55),inset_0_0_30px_rgba(75,43,20,.28)]"
      style={{ backgroundImage: 'linear-gradient(rgba(220,198,168,.86),rgba(220,198,168,.86)), radial-gradient(circle at 15% 15%, rgba(90,50,20,.22), transparent 28%), repeating-linear-gradient(12deg, rgba(75,43,20,.06) 0 1px, transparent 1px 14px)', opacity: claimed ? 0.9 : 1 }}
    >
      <div className="absolute -right-2 -top-3 z-10 flex h-12 w-12 rotate-12 flex-col items-center justify-center rounded-full border-[3px] border-[#3b2b1a] bg-[#d7bc96] shadow-lg">
        <span className="font-serif text-[9px] font-black">DZP</span>
        <span className="text-[6px] font-black tracking-wider">BOUNTY</span>
      </div>
      <div className="flex h-full flex-col p-3">
        <div className="mb-1 text-center">
          <div className="font-serif text-[25px] font-black leading-none tracking-[.18em] [transform:scaleY(1.18)]">QUEST</div>
          <div className="mt-1 text-[7px] font-black tracking-[.25em]">{typeLabel}</div>
        </div>
        <div className="relative mt-1 h-[112px] overflow-hidden border-2 border-[#3b2b1a]/55 bg-[#b79b78] shadow-inner">
          {hunt.beatmap.coverUrl ? (
            <img src={hunt.beatmap.coverUrl} alt="" className="h-full w-full object-cover sepia-[.25] contrast-125" />
          ) : <div className="flex h-full items-center justify-center font-serif text-xl font-black">NO COVER</div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-2 right-2 text-white">
            <div className="truncate font-serif text-[15px] font-black">{hunt.beatmap.title}</div>
            <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wide">
              <span className="truncate">{hunt.beatmap.difficultyName}</span>
              <span>★ {hunt.beatmap.stars.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 border-y border-[#3b2b1a]/25 py-1 text-center text-[7px] font-black tracking-wider">
          <span className="mx-1">CS {hunt.beatmap.cs ?? '—'}</span>
          <span className="mx-1">AR {hunt.beatmap.ar ?? '—'}</span>
          <span className="mx-1">OD {hunt.beatmap.od ?? '—'}</span>
          <span className="mx-1">HP {hunt.beatmap.hp ?? '—'}</span>
          <span className="mx-1">{hunt.beatmap.maxCombo ? hunt.beatmap.maxCombo + 'x' : '—'}</span>
        </div>
        {!isBeatmapHunt && (
          <div className="mt-2 border-2 border-[#6b3f22]/40 bg-[#b99c77]/35 px-2 py-1 text-center">
            <div className="text-[7px] font-black tracking-[.18em]">TARGET SCORE</div>
            {hunt.targetScore ? <><div className="font-serif text-lg font-black leading-none">{hunt.targetScore.score.toLocaleString()}</div><div className="text-[7px] font-bold">{hunt.targetScore.username} · {hunt.targetScore.mods || 'NM'}</div></> : <div className="py-1 font-serif text-sm font-black opacity-45">TARGET PENDING</div>}
          </div>
        )}
        <div className="mt-2 text-center">
          <div className="text-[7px] font-black uppercase tracking-[.18em] opacity-80">Bounty</div>
          <div className="font-serif text-[28px] font-black leading-none tracking-wider">{hunt.bountyDzp.toLocaleString()} <span className="text-xs">DZP</span></div>
        </div>
        <div className="mt-2 flex-1 border-t border-[#3b2b1a]/20 pt-1.5 text-center">
          <div className="text-[7px] font-black uppercase tracking-wider">Guild Conditions</div>
          <div className="mt-1 line-clamp-2 text-[8px] font-bold leading-tight">{requirements || 'No additional conditions'}</div>
          {hunt.description && <div className="mt-1 line-clamp-2 text-[7px] italic opacity-80">{hunt.description}</div>}
        </div>
        <div className="mt-2 flex items-end justify-between border-t border-[#3b2b1a]/25 pt-2">
          <div className="max-w-[120px] text-[5px] font-semibold uppercase leading-[6px] opacity-65">Guild record. Scores are verified directly against osu! data.</div>
          <div className="font-serif text-[11px] font-bold italic">by {hunt.poster.username}</div>
        </div>
      </div>
      {claimed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rotate-[-16deg] border-[3px] border-[#5b201d]/55 px-4 py-2 text-center text-[#5b201d]/70 shadow-sm">
            <div className="font-serif text-2xl font-black tracking-[.18em]">CLAIMED</div>
            <div className="text-[8px] font-black uppercase tracking-[.2em]">BY {hunt.winner?.username ?? 'UNKNOWN'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GuildPosterPile({
  hunts,
  claimed,
  onOpen,
}: {
  hunts: ApiHunt[];
  claimed: boolean;
  onOpen: (hunt: ApiHunt) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lift, setLift] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [peeling, setPeeling] = useState(false);
  const [pinnedRemnants, setPinnedRemnants] = useState<Array<{ id: string; offset: number }>>([]);
  const timers = useRef<number[]>([]);
  const pointer = useRef({ id: -1, x: 0, y: 0, width: 1, height: 1, moved: false, tore: false, remnantId: '' });
  const active = hunts[activeIndex % Math.max(1, hunts.length)];
  const tearing = peeling || lift > 0.05;

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timers.current = timers.current.filter((item) => item !== timer);
      callback();
    }, delay);
    timers.current.push(timer);
  };

  if (!active) return null;

  const leavePinnedRemnant = () => {
    const remnantId = active.id + '-' + Date.now();
    pointer.current.remnantId = remnantId;
    setPinnedRemnants((current) => [...current.slice(-3), { id: remnantId, offset: current.length % 3 }]);
    schedule(() => setPinnedRemnants((current) => current.filter((remnant) => remnant.id !== remnantId)), 5000);
  };

  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (settling) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, moved: false, tore: false, remnantId: '' };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || event.pointerId !== pointer.current.id) return;
    const dy = event.clientY - pointer.current.y;
    const dx = event.clientX - pointer.current.x;
    if (Math.abs(dy) > 7 || Math.abs(dx) > 7) pointer.current.moved = true;
    const nextLift = Math.max(0, Math.min(1, dy / pointer.current.height));
    setLift(nextLift);
    if (nextLift >= 0.05 && hunts.length > 1 && !pointer.current.tore) {
      pointer.current.tore = true;
      leavePinnedRemnant();
    }
    setRotation(Math.max(-9, Math.min(9, dx / pointer.current.width * 12)));
  };

  const end = () => {
    if (!dragging) return;
    setDragging(false);
    if (!pointer.current.moved) {
      setLift(0); setRotation(0); onOpen(active); return;
    }
    if (lift >= 0.42 && hunts.length > 1) {
      setPeeling(true); setSettling(true); setLift(1);
      schedule(() => {
        setActiveIndex((index) => (index + 1) % hunts.length);
        setLift(0); setRotation(0); setSettling(false); setPeeling(false);
      }, 720);
      return;
    }
    setSettling(true); setLift(0); setRotation(0);
    if (pointer.current.remnantId) {
      const remnantId = pointer.current.remnantId;
      setPinnedRemnants((current) => current.filter((remnant) => remnant.id !== remnantId));
      pointer.current.remnantId = '';
    }
    schedule(() => setSettling(false), 380);
  };

  return (
    <div className="relative mx-auto aspect-[1/1.42] w-[230px] select-none sm:w-[250px]" style={{ perspective: 1200 }}>
      {hunts.map((hunt, index) => {
        const position = (index - activeIndex + hunts.length) % hunts.length;
        if (position === 0) return null;
        const depth = Math.min(position, 3);
        return (
          <div key={hunt.id} className="pointer-events-none absolute inset-0" style={{ zIndex: 100 - position, transform: 'translate(' + depth * 5 + 'px,' + depth * 6 + 'px) rotate(' + ((index % 3) - 1) * 1.2 + 'deg)', filter: 'brightness(' + (1 - depth * .09) + ')' }}>
            <Paper hunt={hunt} claimed={claimed} />
          </div>
        );
      })}
      <div
        className="absolute inset-0 z-[200] cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(active); }
        }}
        role="button"
        tabIndex={0}
        aria-label="Open Quest poster."
      >
        <div
          className="absolute inset-0"
          style={{
            transformOrigin: '0% 0%',
            transformStyle: 'preserve-3d',
            transform: peeling ? undefined : 'translateY(' + (lift * 52) + '%) rotateZ(' + rotation + 'deg) rotateX(' + (lift * 10) + 'deg)',
            animation: peeling ? 'guildPosterPull 720ms cubic-bezier(.28,.03,.18,1) forwards' : undefined,
            transition: dragging ? 'none' : settling ? 'transform 380ms cubic-bezier(.22,.8,.22,1)' : 'transform 180ms ease-out',
            clipPath: tearing ? 'polygon(42px 0, 100% 0, 100% 100%, 0 100%, 0 46px, 7px 42px, 4px 34px, 13px 30px, 9px 22px, 19px 19px, 15px 12px, 27px 9px, 24px 3px, 34px 5px)' : undefined,
            boxShadow: '0 ' + (12 + lift * 32) + 'px ' + (22 + lift * 40) + 'px rgba(0,0,0,' + (0.38 + lift * .25) + ')',
            ['--guild-poster-pull-start' as string]: 'translateY(' + (lift * 52) + '%) rotateZ(' + rotation + 'deg) rotateX(' + (lift * 10) + 'deg)',
          }}
        >
            <div
              className="absolute inset-0"
              style={{
                clipPath: lift > 0.05
                  ? 'polygon(42px 0, 100% 0, 100% 100%, 0 100%, 0 46px, 7px 42px, 4px 34px, 13px 30px, 9px 22px, 19px 19px, 15px 12px, 27px 9px, 24px 3px, 34px 5px)'
                  : 'none',
              }}
            >
              <Paper hunt={active} claimed={claimed} />
            </div>
            {dragging && lift > 0.08 && (
              <div
                className="pointer-events-none absolute left-0 top-0 z-[20] h-[48px] w-[48px]"
                style={{
                  background: 'linear-gradient(135deg, rgba(91,57,31,.72) 0%, rgba(91,57,31,.38) 35%, rgba(220,198,168,.9) 37%, rgba(220,198,168,.72) 72%, transparent 73%)',
                  clipPath: 'polygon(0 0, 42px 0, 34px 5px, 27px 9px, 19px 19px, 13px 30px, 7px 42px, 0 46px)',
                  opacity: Math.min(1, lift * 1.7),
                }}
              />
            )}
            {dragging && lift > 0.05 && <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(120deg, transparent 25%, rgba(255,248,230,' + Math.min(.38, lift * .55) + ') 48%, transparent 70%)', opacity: lift }} />}
          </div>
        </div>
        {pinnedRemnants.map((remnant) => (
          <div key={remnant.id} className="guild-poster-tear pointer-events-none absolute -left-[2px] -top-[2px] z-[250]" style={{ marginLeft: remnant.offset * 2, marginTop: remnant.offset * 2 }} />
        ))}
        <div className="guild-poster-nail pointer-events-none absolute -left-2 top-0 z-[300]" aria-hidden="true"><span /></div>
    </div>
  );
}
