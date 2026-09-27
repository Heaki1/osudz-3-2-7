import type { BeatmapStatus } from '../types';

export interface BeatmapStatusStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
}

export const BEATMAP_STATUS_STYLES: Record<BeatmapStatus, BeatmapStatusStyle> = {
  ranked: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    label: 'Ranked',
  },
  loved: {
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    label: 'Loved',
  },
  approved: {
    bg: 'bg-sky-500/20',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    label: 'Approved',
  },
};

export function getBeatmapStatusStyle(status: BeatmapStatus | string): BeatmapStatusStyle {
  return BEATMAP_STATUS_STYLES[status as BeatmapStatus] ?? {
    bg: 'bg-slate-500/20',
    text: 'text-slate-300',
    border: 'border-slate-500/30',
    label: status || 'Unknown',
  };
}
