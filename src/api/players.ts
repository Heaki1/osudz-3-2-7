import { get, send, uploadFile } from './clientCore';
import type * as T from './types';


export const playersApi = {
  profile: (username: string) =>
    get<T.ApiPlayerProfile>(`/players/${encodeURIComponent(username)}`),

  challengeCollection: (userId: number) =>
    get<T.ApiChallengeCollectionItem[]>(`/players/${userId}/challenge-collection`),

  giftChallengeMap: (roundId: number, submissionId: number, recipientUsername: string) =>
    send<{ ok: boolean }>("POST", "/players/challenge-collection/gift", {
      roundId,
      submissionId,
      recipientUsername,
    }),

  ownedItems: (userId: number) =>
    get<T.ApiPlayerShopItem[]>(`/players/${userId}/shop-items`),

  uploadBanner: (userId: number, file: File) =>
    uploadFile<{ profileBannerUrl: string }>(
      `/players/${userId}/banner`,
      "banner",
      file,
    ),
};
