import React, { useEffect, useState } from 'react';
import { api, ApiAdminConfig } from '../../../api/client';
import { Banner, Section } from './AdminDashboardPrimitives';
import { AlertCircle } from 'lucide-react';

export function ConfigTab() {
  const [config, setConfig] = useState<ApiAdminConfig | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);
  const [discordMessage, setDiscordMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
 const c = await api.admin.config();

if (!c.ok) {
  setError(`Could not read the server configuration: ${c.error}`);
  return;
}

setConfig(c.data);
    })();
  }, []);

  if (error) {
    return (
      <div className="flex items-start gap-2.5 bg-rose-500/8 border border-rose-500/25 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-px" />
        <p className="text-xs text-rose-300/90">{error}</p>
      </div>
    );
  }

  const rows: { label: string; value: string; tone?: 'good' | 'warn' }[] = config
    ? [
        {
          label: 'Discord announcements',
          value: config.discordConfigured ? 'Enabled' : 'Not configured — announcements are silent',
          tone: config.discordConfigured ? 'good' : 'warn',
        },
        {
          label: 'Administrators',
          value: `${config.adminCount} account${config.adminCount === 1 ? '' : 's'} in ADMIN_OSU_IDS`,
          tone: config.adminCount > 0 ? 'good' : 'warn',
        },
        {
          label: 'Session cookie',
          value: config.secureCookies ? 'Secure' : 'Not Secure — development only',
          tone: config.secureCookies ? 'good' : 'warn',
        },
        { label: 'Client origin', value: config.clientOrigin },
        { label: 'Public base URL', value: config.publicBaseUrl },
      ]
    : [];

  return (
    <div className="space-y-5">
      <Section
        title="Server Configuration"
        description="Read-only. These come from the server environment, not from this page — a webhook and an admin list are credentials, and a page that could set them is a page that could leak them."
      >
        {config === null ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-2">
            {rows.map(({ label, value, tone }) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 py-2 border-b border-slate-800/60 last:border-0"
              >
                <p className="text-sm text-slate-300">{label}</p>
                <p
                  className={`text-xs font-mono text-right ${
                    tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400/90' : 'text-slate-400'
                  }`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Changing these"
        description="Edit server/.env and restart the API. Admin status is re-derived from ADMIN_OSU_IDS at each login, so granting or revoking it is an env change plus a re-login rather than a database edit."
      >
        <p className="text-xs text-slate-500">
          Everything a round needs is on the other tabs: schedule and phase in Round Control,
          submission limits in Beatmap Rules, mods and challenge types in Challenge, eligibility
          in Eligibility and Users.
        </p>
      </Section>

      <Section
        title="Discord Integration"
        description="Round lifecycle announcements use the server-side DISCORD_WEBHOOK. The webhook itself is never exposed in the browser."
      >
        <div className="flex items-center justify-between gap-4 border-y border-slate-800/80 py-4">
          <div>
            <p className="text-sm font-bold text-white">Connection test</p>
            <p className="text-xs text-slate-500 mt-1">Send a single test message to the configured channel.</p>
          </div>
          <button
            type="button"
            disabled={!config?.discordConfigured || discordBusy}
            onClick={async () => {
              setDiscordBusy(true); setDiscordMessage(null);
              const result = await api.admin.discordTest();
              setDiscordMessage(result.ok ? 'Test announcement sent.' : result.error);
              setDiscordBusy(false);
            }}
            className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-black text-slate-300 hover:border-amber-400/40 hover:text-amber-300 disabled:opacity-40"
          >
            {discordBusy ? 'Sending…' : 'Send test'}
          </button>
        </div>
        {discordMessage && <p className="text-xs text-slate-400 mt-3">{discordMessage}</p>}
      </Section>
    </div>
  );
}
