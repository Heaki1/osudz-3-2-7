export const fmt = (n?: number) => n === undefined ? '—' : n.toLocaleString();
export const MOCK_DUEL_TESTING = import.meta.env.DEV;
export const mapTime = (seconds?: number) => {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—';
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

export function duelStarStyle(rating: number) {
  if (rating < 1) return { header: 'bg-slate-500 text-white', fill: 'text-slate-400', border: 'border-slate-500/60' };
  if (rating < 2) return { header: 'bg-blue-500 text-white', fill: 'text-blue-400', border: 'border-blue-500/60' };
  if (rating < 2.5) return { header: 'bg-cyan-400 text-slate-950', fill: 'text-cyan-400', border: 'border-cyan-400/60' };
  if (rating < 3) return { header: 'bg-green-500 text-slate-950', fill: 'text-green-400', border: 'border-green-500/60' };
  if (rating < 3.5) return { header: 'bg-lime-400 text-slate-950', fill: 'text-lime-400', border: 'border-lime-400/60' };
  if (rating < 4) return { header: 'bg-yellow-400 text-slate-950', fill: 'text-yellow-400', border: 'border-yellow-400/60' };
  if (rating < 4.5) return { header: 'bg-amber-500 text-slate-950', fill: 'text-amber-400', border: 'border-amber-500/60' };
  if (rating < 5) return { header: 'bg-orange-500 text-white', fill: 'text-orange-400', border: 'border-orange-500/60' };
  if (rating < 5.5) return { header: 'bg-red-500 text-white', fill: 'text-red-400', border: 'border-red-500/60' };
  if (rating < 6) return { header: 'bg-rose-500 text-white', fill: 'text-rose-400', border: 'border-rose-500/60' };
  if (rating < 6.5) return { header: 'bg-pink-500 text-white', fill: 'text-pink-400', border: 'border-pink-400/60' };
  if (rating < 7) return { header: 'bg-purple-600 text-white', fill: 'text-purple-400', border: 'border-purple-600/60' };
  if (rating < 8) return { header: 'bg-indigo-600 text-white', fill: 'text-indigo-400', border: 'border-indigo-600/60' };
  return { header: 'bg-indigo-950 text-white', fill: 'text-indigo-300', border: 'border-indigo-500/60' };
}

export function duelModStyle(mods: string) {
  const styles: Record<string, { bg: string; border: string; text: string }> = {
    NM: { bg: 'bg-slate-800/60', border: 'border-slate-600/60', text: 'text-slate-300' },
    HD: { bg: 'bg-amber-900/40', border: 'border-amber-500/60', text: 'text-amber-400' },
    HR: { bg: 'bg-rose-900/40', border: 'border-rose-500/60', text: 'text-rose-400' },
    DT: { bg: 'bg-sky-900/40', border: 'border-sky-500/60', text: 'text-sky-400' },
    HDHR: { bg: 'bg-purple-900/40', border: 'border-purple-500/60', text: 'text-purple-400' },
    HDDT: { bg: 'bg-indigo-900/40', border: 'border-indigo-500/60', text: 'text-indigo-400' },
    FM: { bg: 'bg-emerald-900/40', border: 'border-emerald-500/60', text: 'text-emerald-400' },
    EZ: { bg: 'bg-green-900/40', border: 'border-green-500/60', text: 'text-green-400' },
    FL: { bg: 'bg-violet-900/40', border: 'border-violet-500/60', text: 'text-violet-400' },
    HRDT: { bg: 'bg-orange-900/40', border: 'border-orange-500/60', text: 'text-orange-400' },
  };
  return styles[mods] ?? styles.NM;
}
