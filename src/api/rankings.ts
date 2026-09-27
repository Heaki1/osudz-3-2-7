import { get, send } from './clientCore';
import type * as T from './types';


export const rankingsApi = {
    /**
     * A page of the DZ Performance Rankings.
     *
     * `scope` drives which filter the server applies:
     *   'all-time' (default) — every finalized round.
     *   'yearly'             — rounds in the given calendar year; requires `year`.
     *   'seasonal'           — rounds in the current season only; `year` is ignored.
     *
     * Omit `page` for the first page.
     */
    list: (params: { scope?: 'all-time' | 'yearly' | 'seasonal'; year?: number; page?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.scope !== undefined && params.scope !== 'all-time') query.set('scope', params.scope);
      if (params.scope === 'yearly' && params.year !== undefined) query.set('year', String(params.year));
      if (params.page !== undefined) query.set('page', String(params.page));
      const suffix = query.toString();
      return get<T.ApiRankingPage>(suffix === '' ? '/rankings' : `/rankings?${suffix}`);
    },
    /**
     * One player's frozen rounds, newest first. [] when they have none counted.
     *
     * `scope` must match what was active when the player row was opened, so the detail
     * panel shows only the rounds that were visible in the tab that launched it.
     */
    player: (userId: number, scope: 'all-time' | 'yearly' | 'seasonal' = 'all-time', year?: number) => {
      const query = new URLSearchParams();
      if (scope !== 'all-time') query.set('scope', scope);
      if (scope === 'yearly' && year !== undefined) query.set('year', String(year));
      const suffix = query.toString();
      return get<T.ApiPlayerDzppRound[]>(suffix === '' ? `/rankings/${userId}` : `/rankings/${userId}?${suffix}`);
    },
};
