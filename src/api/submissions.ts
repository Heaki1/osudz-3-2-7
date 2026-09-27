import { get, send } from './clientCore';
import type * as T from './types';


export const submissionsApi = {
    /** Approved entries in the open round; [] when no round is open. */
    list: () => get<T.ApiSubmission[]>("/submissions"),
    get: (id: number) => get<T.ApiSubmission>(`/submissions/${id}`),
    /** The caller's own entry, pending included — GET /submissions hides it. */
    mine: () => get<T.ApiSubmission[]>("/submissions/mine"),
    /** Resolves a pasted osu! URL to beatmap metadata for the preview card. */
    lookup: (url: string) => send<T.ApiBeatmapPreview>("POST", "/submissions/lookup", { url }),
    /** Withdraws the caller's entry. Submission phase only, server-enforced. */
    withdraw: (submissionId: number) =>
  send<{ ok: boolean }>("DELETE", `/submissions/${submissionId}`),
    submit: (body: {
      difficultyId: number;
      modRequirement: string;
      challengeRequirement: string;
    }) => send<T.ApiSubmission>("POST", "/submissions", body),
};
