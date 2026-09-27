import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiAdminUser } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { AlertCircle, CheckCircle2, Users } from 'lucide-react';

// ── USERS ─────────────────────────────────────────────────────────────────────
//
// C5. The six fabricated players and the mock Ban/Unban button are gone. This reads
// GET /api/admin/users and writes per-player overrides, and the two capabilities are
// SEPARATE controls because C5's decision is that they are set independently — a single
// ban toggle could not express "may still submit, may not vote".
//
// The old "Submissions" column is gone with the fixtures: nothing counts submissions per
// account, and a column filled with a plausible number would be the exact kind of
// fabrication the rest of this work has been deleting.

/** What an administrator can set a capability to. null means "let the country rule decide". */
type Override = boolean | null;

const OVERRIDE_CYCLE: Override[] = [null, true, false];

const OVERRIDE_LOOK: { value: Override; label: string; className: string }[] = [
  { value: null,  label: 'Auto',  className: 'bg-slate-800 border-slate-700 text-slate-400' },
  { value: true,  label: 'Allow', className: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400' },
  { value: false, label: 'Block', className: 'bg-rose-500/15 border-rose-500/35 text-rose-400' },
];

/**
 * One capability, as a three-state button that cycles Auto -> Allow -> Block.
 *
 * Three states rather than a switch, because the underlying column is three-valued and
 * collapsing it would lose the difference that matters: "Auto" means the country allowlist
 * decides and will keep deciding if an administrator later changes it, while "Allow" is a
 * standing grant that survives the country being disabled.
 */
function CapabilityButton({
  value,
  effective,
  busy,
  onCycle,
}: {
  value: Override;
  effective: boolean;
  busy: boolean;
  onCycle: (next: Override) => void;
}) {
  const look = OVERRIDE_LOOK.find((o) => o.value === value) ?? OVERRIDE_LOOK[0];
  const next = OVERRIDE_CYCLE[(OVERRIDE_CYCLE.indexOf(value) + 1) % OVERRIDE_CYCLE.length];

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onCycle(next)}
      title={
        value === null
          ? `Auto — the country allowlist decides, and currently ${effective ? 'allows' : 'refuses'} it`
          : value
            ? 'Allowed by an administrator, whatever the country rule says'
            : 'Refused by an administrator, whatever the country rule says'
      }
      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40 ${look.className}`}
    >
      {look.label}
      {value === null && <span className="ml-1 opacity-60">{effective ? '✓' : '✕'}</span>}
    </button>
  );
}

export function UsersTab() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<ApiAdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
const rows = await api.admin.users();

if (!rows.ok) {
  setError(`Could not read the user list: ${rows.error}`);
  return;
}

setError(null);
setUsers(rows.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Writes one capability. Clearing the last remaining override deletes the row rather
   * than storing one that overrides nothing — the server refuses that anyway, and a row
   * saying an administrator decided to change nothing is not a record of anything.
   */
  const setCapability = async (u: ApiAdminUser, capability: 'submit' | 'vote', next: Override) => {
    const canSubmit = capability === 'submit' ? next : (u.override?.canSubmit ?? null);
    const canVote = capability === 'vote' ? next : (u.override?.canVote ?? null);

    setBusy(u.id);
    const res =
      canSubmit === null && canVote === null
        ? u.override === null
          ? { ok: true as const }
          : await api.admin.clearParticipant(u.id)
        : await api.admin.setParticipant(u.id, { canSubmit, canVote, note: u.override?.note ?? null });
    setBusy(null);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    await load();
  };

  const revoke = async (u: ApiAdminUser) => {
    setBusy(u.id);
    const res = await api.admin.revokeSessions(u.id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    // Its own state rather than the error banner: a revocation that worked is not a failure,
    // and reporting it in red would teach an administrator to ignore the red box.
    setNotice(`Signed ${u.username} out of every device. They stay out until they log in again.`);
  };

  const needle = q.trim().toLowerCase();
  const shown = (users ?? []).filter(
    (u) => needle === '' || u.username.toLowerCase().includes(needle) || String(u.osuId).includes(needle)
  );

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2.5 bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" />
          <p className="text-xs text-rose-300/90">{error}</p>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2.5 bg-emerald-500/8 border border-emerald-500/25 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-px" />
          <p className="text-xs text-emerald-300/90">{notice}</p>
        </div>
      )}

      <div className="relative">
        <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by username or osu! id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full bg-[#0d1526] border border-slate-800 focus:border-amber-400/50 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
        />
      </div>

      <p className="text-[11px] text-slate-500">
        Auto leaves a capability to the country allowlist; the tick or cross beside it is what
        that currently decides. Allow and Block override it in either direction, and the two are
        independent — an account can be blocked from voting and still enter a beatmap. Blocking
        is forward-only: a vote already cast stays counted.
      </p>

      <p className="text-[11px] text-slate-500">
        Challenge is <span className="text-slate-400">derived, not set</span>: the country
        allowlist decides unless you block or grant <em>both</em> capabilities, which is the only
        unambiguous way to say an account does or does not take part. Blocking just one leaves
        the challenge alone.
      </p>

      {users === null ? (
        <p className="text-xs text-slate-500">Loading accounts…</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-slate-500">
          {users.length === 0 ? 'Nobody has signed in yet.' : 'No account matches that search.'}
        </p>
      ) : (
        <div className="bg-[#0d1526] border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {['Player', 'Country', 'Rank', 'Submit', 'Vote', 'Challenge', 'Note', 'Sessions'].map((h) => (
                  <th key={h} className="text-left text-[10px] uppercase tracking-wider text-slate-600 font-mono px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((u, i) => (
                <tr
                  key={u.id}
                  className={`border-b border-slate-800/50 last:border-0 ${i % 2 === 1 ? 'bg-slate-900/20' : ''}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      {u.avatarUrl && (
  <PlayerAvatar
    userId={u.id}
    username={u.username}
    avatarUrl={u.avatarUrl ?? ''}
    size={28}
  />
)}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{u.username}</p>
                        <p className="text-[10px] text-slate-600 font-mono">
                          {u.osuId}
                          {u.isAdmin && <span className="ml-1.5 text-amber-400/80">admin</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-sm font-mono ${u.countryAllowed ? 'text-slate-300' : 'text-slate-500'}`}
                      title={u.countryAllowed ? 'On the allowlist' : 'Not on the allowlist'}
                    >
                      {u.country || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-slate-400">
                    {u.globalRank === null ? '—' : `#${u.globalRank.toLocaleString()}`}
                  </td>
                  <td className="px-5 py-3">
                    <CapabilityButton
                      value={u.override?.canSubmit ?? null}
                      effective={u.canSubmit}
                      busy={busy === u.id}
                      onCycle={(next) => void setCapability(u, 'submit', next)}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <CapabilityButton
                      value={u.override?.canVote ?? null}
                      effective={u.canVote}
                      busy={busy === u.id}
                      onCycle={(next) => void setCapability(u, 'vote', next)}
                    />
                  </td>
                  {/* DERIVED, so it is shown rather than set. It answers the question
                      the two switches beside it raise: did blocking both actually stop this
                      account competing for the prize? The rule is canEnterChallenge in
                      server/src/repo/users.ts. */}
                  <td className="px-5 py-3">
                    <span
                      title={
                        u.canChallenge
                          ? 'May post a challenge score'
                          : u.override?.canSubmit === false && u.override?.canVote === false
                            ? 'Blocked from both submitting and voting, so blocked here too'
                            : 'Country is not on the allowlist'
                      }
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                        u.canChallenge
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-slate-800/60 border-slate-700 text-slate-500'
                      }`}
                    >
                      {u.canChallenge ? 'Eligible' : 'No'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[11px] text-slate-500 max-w-[16rem] truncate">
                    {u.override?.note ?? ''}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {/* G6. Separate from the capability controls: a revocation signs somebody
                        out of every device, which is a different act from refusing them a
                        vote, and folding it into a block would kick a player out of the site
                        as a side effect of adjusting one switch. */}
                    <button
                      type="button"
                      disabled={busy === u.id}
                      onClick={() => void revoke(u)}
                      title="Ends every session this account holds. They stay signed out until they log in again."
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border bg-slate-800 border-slate-700 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 transition-all disabled:opacity-40"
                    >
                      Sign out
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

