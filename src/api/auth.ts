import { get, send, BASE } from './clientCore';
import type * as T from './types';

export const authApi = {
    me: () => get<T.ApiUser | null>("/auth/me"),
    loginUrl: () => `${BASE}/auth/login`,
    logout: () => send<{ ok: boolean }>("POST", "/auth/logout"),
    /**
     * Ends every session this account holds (G6). Plain logout only clears this browser's
     * cookie; a copy taken from another device would stay valid for its full thirty days.
     *
     * The caller keeps a fresh cookie for the tab they clicked in — ending your other sessions
     * and ending this one are different intentions, and the second already has a button.
     */
    logoutEverywhere: () => send<{ ok: boolean }>("POST", "/auth/logout-all"),
};
