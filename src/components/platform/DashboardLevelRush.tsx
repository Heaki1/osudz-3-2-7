import React from 'react';
import { Crown, Trophy } from 'lucide-react';
import { ApiLevelRushEntry } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { AuthUser } from './NavHeader';
import { SectionHeader } from './PlayerProfileSections';

interface DashboardLevelRushProps {
  entries: ApiLevelRushEntry[] | null;
  user: AuthUser | null;
}

export function DashboardLevelRush({ entries, user }: DashboardLevelRushProps) {
  if (!user || !entries || entries.length === 0) return null;

  const target = 50;
  const visible = entries.slice(0, 10);

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#292d45] bg-[#0d1220]">
      <SectionHeader title="Race to Level 50" count="10 / 10" />

      <div className="overflow-x-auto p-2">
        <div className="min-w-[760px] flex flex-col gap-1.5">
        <div className="grid grid-cols-[40px_minmax(220px,2fr)_72px_minmax(190px,1.35fr)_100px_100px] items-center gap-3 bg-[#111625] px-2.5 py-2">
          <span className="text-center font-mono text-[8px] font-black uppercase tracking-wider text-slate-700">#</span>
          <span className="pl-1 font-mono text-[8px] font-black uppercase tracking-wider text-slate-700">Player</span>
          <span className="text-right font-mono text-[8px] font-black uppercase tracking-wider text-slate-700">Level</span>
          <span className="text-right font-mono text-[8px] font-black uppercase tracking-wider text-slate-700">Progress to next level</span>
          <span className="text-right font-mono text-[8px] font-black uppercase tracking-wider text-slate-700">Wins</span>
          <span className="text-right font-mono text-[8px] font-black uppercase tracking-wider text-slate-700">DZPP</span>
        </div>

        <div className="divide-y divide-slate-800/50">
          {visible.map((entry) => {
            const isYou = entry.userId === user.id;
            const progress = Math.round(entry.levelProgress * 100);
            const reached = entry.level >= target;
            const topThree = entry.rank <= 3;

            return (
              <div
                key={entry.userId}
                className={`grid grid-cols-[40px_minmax(220px,2fr)_72px_minmax(190px,1.35fr)_100px_100px] items-center gap-3 rounded-md border px-2.5 py-2 transition-colors ${
                  isYou ? 'border-[#f0c86b]/70 bg-[#f0c86b]/[0.08] shadow-[0_0_22px_rgba(240,200,107,0.12)]' : 'border-[#292d45] bg-[#0a0f1a] hover:bg-slate-800/25'
                }`}
              >
                <div className="flex justify-center">
                  {topThree ? (
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[9px] font-black ${
                      entry.rank === 1
                        ? 'border-amber-300/30 bg-amber-300/10 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.16)]'
                        : entry.rank === 2
                          ? 'border-slate-300/20 bg-slate-300/10 text-slate-200'
                          : 'border-orange-400/20 bg-orange-400/10 text-orange-300'
                    }`}>
                      {entry.rank === 1 ? <Crown className="h-3.5 w-3.5" /> : entry.rank}
                    </div>
                  ) : (
                    <span className="font-mono text-[10px] font-black text-slate-500">{entry.rank}</span>
                  )}
                </div>

                <div className="flex min-w-0 items-center gap-3">
                  <PlayerAvatar userId={entry.userId} avatarUrl={entry.avatarUrl} username={entry.username} size={34} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className={`min-w-0 truncate text-[11px] font-black ${isYou ? 'text-white' : 'text-sky-300'}`}>
                        {entry.username}{isYou ? ' (You)' : ''}
                      </p>
                      <span className="shrink-0 text-[12px] leading-none" title="Algeria">🇩🇿</span>
                      {entry.level50Reward && <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/5 px-1.5 py-0.5 font-mono text-[6px] font-black uppercase tracking-wider text-amber-400">WINNER</span>}
                      {reached && !entry.level50Reward && <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[6px] font-black uppercase tracking-wider text-slate-600">50</span>}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-mono text-sm font-black text-slate-100">Lv. {entry.level}</p>
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-3">
                    <div className="h-2.5 w-full max-w-[178px] overflow-hidden rounded-full border border-slate-700 bg-slate-950 shadow-inner">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#c99a32] to-[#f0c86b] shadow-[0_0_10px_rgba(240,200,107,0.28)]" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="w-[44px] font-mono text-[9px] font-black tabular-nums text-slate-400">{progress} / 100</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-amber-400" />
                  <span className="font-mono text-[10px] font-black text-slate-300">{entry.challengeWins}</span>
                </div>

                <div className="text-right">
                  <p className="font-mono text-[10px] font-black tabular-nums text-slate-300">{entry.dzpp.toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
      </div>
    </section>
  );
}
