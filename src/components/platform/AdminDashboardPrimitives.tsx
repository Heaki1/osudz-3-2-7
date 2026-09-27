import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <div className="bg-[#0d1526] border border-slate-800 rounded-2xl p-6 space-y-5"><div><h3 className="text-sm font-black text-white">{title}</h3>{description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}</div>{children}</div>;
}

export function Banner({ tone, text, onDismiss }: { tone: 'error' | 'ok'; text: string; onDismiss: () => void }) {
  const style = tone === 'error' ? 'bg-rose-500/10 border-rose-500/25 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300';
  return <div className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 ${style}`}>{tone === 'error' ? <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-px" />}<p className="text-xs flex-1">{text}</p><button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"><X className="w-3.5 h-3.5" /></button></div>;
}
