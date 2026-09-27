import { get, send } from './clientCore';
import type * as T from './types';


export const roundsApi = {
    /** Resolves to null both when no round is open and when the API is down. */
    current: () => get<T.ApiRound | null>("/rounds/current"),
    /** Every round, newest first, with winner, leaderboard and participants. */
    list: () => get<T.ApiRoundDetail[]>("/rounds"),
    /** One round, in the same shape as the list. */
    get: (id: number) => get<T.ApiRoundDetail>(`/rounds/${id}`),
};
