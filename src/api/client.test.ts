import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

describe('API read error semantics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('distinguishes an empty current round from an API failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(null), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result = await api.rounds.current();

    expect(result).toEqual({ ok: true, data: null });
  });

  it('marks a network failure separately from an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    const result = await api.rounds.current();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('network');
      expect(result.status).toBe(0);
    }
  });

  it('preserves the server error and classifies HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'No active round' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result = await api.rounds.current();

    expect(result).toEqual({
      ok: false,
      kind: 'http',
      status: 503,
      error: 'No active round',
    });
  });
});
