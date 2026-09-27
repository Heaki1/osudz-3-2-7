/**
 * App.tsx — additions for the player profile page.
 *
 * DIFF SUMMARY vs the original file (every other line is unchanged):
 *
 *  1. New import: PlayerProfilePage + parseProfileUrl + profileUrl
 *  2. New import: RankingsPage (already existed — shown here because the
 *     profile is closely related and RankingsPage will call navigateToPlayer)
 *  3. getPageFromPath() — handle /player/* before the existing switch
 *  4. getProfileUsernameFromPath() — new helper, local to this file
 *  5. State: profileUsername — tracks the username for the active profile
 *  6. navigate() — guard: never navigate to 'player' via this function;
 *     use navigateToPlayer() instead (existing signature unchanged)
 *  7. navigateToPlayer() — new callback, exported via prop to child pages
 *  8. popstate handler — also updates profileUsername when restoring state
 *  9. Initial-load effect — also sets profileUsername from the URL
 * 10. JSX — renders PlayerProfilePage when platformPage === 'player'
 */

import React, {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  Suspense,
  useState,
  useSyncExternalStore,
} from 'react';
import { NavHeader, AuthUser } from './components/platform/NavHeader';
import { audioPreview } from './lib/audioPreview';

import { parseProfileUrl, profileUrl } from './lib/profileUrl';

const LandingPage = lazy(() => import('./components/platform/LandingPage'));
const ShopPage = lazy(() => import('./components/platform/shop/ShopPage'));
const DashboardPage = lazy(() => import('./components/platform/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const VotePage = lazy(() => import('./components/platform/VotePage').then((m) => ({ default: m.VotePage })));
const SearchPage = lazy(() => import('./components/platform/SearchPage').then((m) => ({ default: m.SearchPage }))); 
const AdminDashboard = lazy(() => import('./components/platform/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const PlatformSubmitPage = lazy(() => import('./components/platform/PlatformSubmitPage').then((m) => ({ default: m.PlatformSubmitPage })));
const ArchivePage = lazy(() => import('./components/platform/ArchivePage').then((m) => ({ default: m.ArchivePage }))); 
const RankingsPage = lazy(() => import('./components/platform/RankingsPage').then((m) => ({ default: m.RankingsPage })));
const PlayerProfilePage = lazy(() => import('./components/platform/player/PlayerProfilePage'));
const PlayerComparePage = lazy(() => import('./components/platform/player/PlayerComparePage').then((m) => ({ default: m.PlayerComparePage })));
const DuelsPage = lazy(() => import('./components/platform/duels/DuelsPage').then((m) => ({ default: m.DuelsPage })));
import {
  api,
  ApiChallengeBeatmap,
  ApiChallengeScore,
  ApiFavorite,
  ApiSiteSettings,
  ApiSubmission,
  ApiUser,
} from './api/client';
import { CurrentRound, toCurrentRound } from './lib/round';
import { favoriteToBeatmap, toBeatmap } from './lib/submission';
import { Beatmap, Phase, PlatformPage } from './types';

// ── Routing helpers ───────────────────────────────────────────────────────────

/**
 * Maps window.location.pathname to the active PlatformPage.
 *
 * CHANGED: /player/* is detected before the switch so profiles can be
 * bookmarked and deep-linked. All other cases are identical to the original.
 */
const getPageFromPath = (): PlatformPage => {
  // ── NEW: detect /player/:username before the existing switch ─────────────
  if (window.location.pathname.startsWith('/player/')) return 'player';
  if (window.location.pathname === '/compare') return 'compare';
  if (window.location.pathname === '/duels') return 'duels';
  // ─────────────────────────────────────────────────────────────────────────

  switch (window.location.pathname) {
    case '/submit':
      return 'submit';
    case '/vote':
      return 'vote';
    case '/shop':
      return 'shop';
    case '/search':
      return 'search';
    case '/rankings':
      return 'rankings';
    case '/archive':
      return 'archive';
    case '/admin':
      return 'admin';
    case '/dashboard':
      return 'dashboard';
    case '/':
    default:
      return 'landing';
  }
};

/**
 * Extracts the username from a /player/:username pathname.
 * Returns null for any other path, including a bare /player with no segment.
 *
 * Uses parseProfileUrl from PlayerProfilePage so the pattern is defined once.
 */
const getProfileUsernameFromPath = (): string | null =>
  parseProfileUrl(window.location.pathname);

const toAuthUser = (u: ApiUser): AuthUser => ({
  id: u.id,
  username: u.username,
  rank: u.globalRank,
  country: u.country,
  avatarUrl: u.avatarUrl,
  isAdmin: u.isAdmin,
  canVote: u.canVote,
  canSubmit: u.canSubmit,
  canChallenge: u.canChallenge,
});

export default function App() {
  const [platformPage, setPlatformPage] = useState<PlatformPage>(getPageFromPath);

  // ── NEW: tracks the username of the currently open player profile ─────────
  const [profileUsername, setProfileUsername] = useState<string | null>(
    getProfileUsernameFromPath,
  );
  // ─────────────────────────────────────────────────────────────────────────

  const [submitDifficultyId, setSubmitDifficultyId] = useState<number | null>(null);
  const [platformUser, setPlatformUser] = useState<AuthUser | null>(null);
  const [round, setRound] = useState<CurrentRound | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [maps, setMaps] = useState<Beatmap[]>([]);
  const [mySubmissions, setMySubmissions] = useState<ApiSubmission[]>([]);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [challengeBeatmaps, setChallengeBeatmaps] = useState<ApiChallengeBeatmap[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<ApiFavorite[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ApiSiteSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  const audioState = useSyncExternalStore(
    audioPreview.subscribe,
    audioPreview.getState,
    audioPreview.getState,
  );

  const phase: Phase = round?.phase ?? 'submission';

  const favoritedIds = useMemo(
    () => new Set(favorites.map((f) => f.difficultyId)),
    [favorites],
  );

  const favoriteMaps = useMemo(
    () => favorites.map(favoriteToBeatmap),
    [favorites],
  );

  const mapsWithFavorites = useMemo(
    () =>
      maps.map((m) => ({
        ...m,
        isFavorited: m.difficultyId !== undefined && favoritedIds.has(m.difficultyId),
      })),
    [maps, favoritedIds],
  );

  const handleTogglePlay = (id: string) => {
    const map = mapsWithFavorites.find((m) => m.id === id);
    if (!map?.previewUrl) return;
    void audioPreview.toggle(id, map.previewUrl);
  };

  const handleScrub = (id: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioPreview.seek(id, progress);
  };

  const refresh = useCallback(async () => {
    const results = await Promise.all([
      api.rounds.current(),
      api.submissions.list(),
      api.submissions.mine(),
      api.votes.my(),
      api.challenge.beatmaps(),
      api.favorites.list(),
      api.settings.get(),
    ]);

    const [current, submissions, mine, vote, beatmaps, favs, rules] = results;

    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) {
      setApiError(
        failed.kind === 'network'
          ? 'The API is unavailable. Check that the server is running and try again.'
          : failed.error,
      );
    } else {
      setApiError(null);
    }

    const votedId = vote.ok ? (vote.data?.submissionId ?? null) : null;
    const newRound = current.ok ? toCurrentRound(current.data) : null;

    setRound(newRound);
    setMaps(
      submissions.ok
        ? submissions.data.map((s) => ({ ...toBeatmap(s), isVoted: s.id === votedId }))
        : [],
    );

    const newBeatmaps = beatmaps.ok ? beatmaps.data : [];
    setChallengeBeatmaps(newBeatmaps);

    setSelectedChallengeId((prev) => {
      if (newBeatmaps.length === 0) return null;
      if (prev !== null && newBeatmaps.some((b) => b.submissionId === prev)) return prev;
      return newBeatmaps[0].submissionId;
    });

    setFavorites(favs.ok ? favs.data : []);
    setSettings(rules.ok ? rules.data : null);
    setMySubmissions(mine.ok ? (mine.data ?? []) : []);
    setMyVote(votedId);
    setLoaded(true);
  }, []);

  // Session restore on load — identical to original.
  useEffect(() => {
    api.auth.me().then((result) => {
      if (result.ok && result.data) {
        setPlatformUser(toAuthUser(result.data));

        const returnPath = sessionStorage.getItem('osudz:return-after-login');
        if (returnPath && returnPath.startsWith('/') && !returnPath.startsWith('//')) {
          sessionStorage.removeItem('osudz:return-after-login');
          window.history.replaceState({}, '', returnPath);
          setPlatformPage(getPageFromPath());
        }
      }
    });

    void refresh();

    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'failed') {
      setAuthError(params.get('reason') ?? 'unknown');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refresh]);

  // ── popstate — CHANGED: also sync profileUsername on back/forward ─────────
  useEffect(() => {
    const handlePopState = () => {
      setPlatformPage(getPageFromPath());
      // Sync the username whenever the browser navigates back/forward into
      // or out of a /player/:username URL.
      setProfileUsername(getProfileUsernameFromPath());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Navigate to a named page (unchanged signature).
   *
   * Player profiles must NOT be opened via navigate('player') — use
   * navigateToPlayer(username) instead. If 'player' is somehow passed, this
   * function returns early to prevent the URL going to a bare /player path
   * with no username.
   */
  const navigate = useCallback(
    (page: PlatformPage) => {
      // ── NEW guard ─────────────────────────────────────────────────────────
      if (page === 'player') return; // use navigateToPlayer(username)
      // ─────────────────────────────────────────────────────────────────────

      const path =
        page === 'landing' ? '/' : page === 'dashboard' ? '/dashboard' : `/${page}`;

      if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
      }

      setPlatformPage(page);

      if (page !== 'submit') {
        setSubmitDifficultyId(null);
      }
    },
    [],
  );

  // ── NEW: navigate to a player profile ────────────────────────────────────
  /**
   * Opens the dedicated player profile page for username.
   *
   * Pushes /player/:username to the history stack so the browser back button
   * returns to wherever the user was. The popstate handler in this component
   * restores platformPage and profileUsername on back/forward.
   *
   * Pass this callback as onNavigateToPlayer to any child that has a
   * clickable username (e.g. RankingsPage).
   */
  const navigateToPlayer = useCallback((username: string) => {
    const path = profileUrl(username);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setProfileUsername(username);
    setPlatformPage('player');
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmitBeatmap = useCallback(
    (map: Beatmap) => {
      setSubmitDifficultyId(map.difficultyId ?? null);
      navigate('submit');
    },
    [navigate],
  );

  const handleLogin = () => {
    window.location.href = api.auth.loginUrl();
  };

  const handleLogout = async () => {
    await api.auth.logout();
    setPlatformUser(null);
    setPlatformPage((page) => (page === 'admin' ? 'dashboard' : page));
    void refresh();
  };

  const handleLogoutEverywhere = async () => {
    const result = await api.auth.logoutEverywhere();
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionError(null);
    void refresh();
  };

  const handleVote = async (id: string) => {
    const submissionId = Number(id);
    if (!Number.isInteger(submissionId)) return;
    if (voteBusy) return;

    setVoteBusy(id);
    setVoteError(null);

    const result =
      myVote === submissionId
        ? await api.votes.retract()
        : await api.votes.cast(submissionId);

    if (result.ok) await refresh();
    else setVoteError(result.error);

    setVoteBusy(null);
  };

  const handleWithdraw = async (submissionId: number): Promise<string | null> => {
    const result = await api.submissions.withdraw(submissionId);
    if (!result.ok) return result.error;
    await refresh();
    return null;
  };

  const handleImportScore = async (
    osuScoreId: number,
    submissionId: number,
  ): Promise<string | null> => {
    const result = await api.challenge.importMine(osuScoreId, submissionId);
    if (!result.ok) return result.error;
    await refresh();
    return null;
  };

  const handleFavorite = async (map: Beatmap) => {
    const difficultyId = map.difficultyId;
    if (difficultyId === undefined) return;

    const result = favoritedIds.has(difficultyId)
      ? await api.favorites.remove(difficultyId)
      : await api.favorites.add(difficultyId);

    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionError(null);

    const wasFavorited = favoritedIds.has(difficultyId);

    if (!wasFavorited) {
      if (!('favorite' in result.data)) {
        setActionError('Favorite could not be added because the API returned an unexpected response.');
        return;
      }
      const addedFavorite: ApiFavorite = result.data.favorite;
      setFavorites((current) => [
        addedFavorite,
        ...current.filter((favorite) => favorite.difficultyId !== difficultyId),
      ]);
      return;
    }

    setFavorites((current) => {
      return current.filter((favorite) => favorite.difficultyId !== difficultyId);
    });
  };

  const handleImportFavorites = async (): Promise<string | null> => {
    const result = await api.favorites.import();
    if (!result.ok) return result.error;
    setFavorites(result.data.favorites);
    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-[#0b1730] text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/bg1.jpg')" }}
      />
      <div className="relative z-10">
      <NavHeader
        page={platformPage}
        phase={phase}
        round={round}
        onNavigate={navigate}
        user={platformUser}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onLogoutEverywhere={handleLogoutEverywhere}
      />

      {authError && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-6 py-2.5 flex items-center justify-between gap-4">
          <p className="text-xs text-rose-300">
            osu! login failed (<span className="font-mono">{authError}</span>). Most often the
            callback URL registered on the osu! application does not match{' '}
            <span className="font-mono">OSU_REDIRECT_URI</span>.
          </p>
          <button
            type="button"
            onClick={() => setAuthError(null)}
            className="text-rose-400 hover:text-rose-300 text-xs font-bold px-2 flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {apiError && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-6 py-2.5 flex items-center justify-between gap-4">
          <p className="text-xs text-rose-300">{apiError}</p>
          <button
            type="button"
            onClick={() => {
              setApiError(null);
              void refresh();
            }}
            className="text-[10px] font-bold text-rose-300/70 hover:text-rose-200 transition-colors flex-shrink-0"
          >
            RETRY
          </button>
        </div>
      )}

      {actionError && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-6 py-2.5 flex items-center justify-between gap-4">
          <p className="text-xs text-rose-300">{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-[10px] font-bold text-rose-300/70 hover:text-rose-200 transition-colors flex-shrink-0"
          >
            DISMISS
          </button>
        </div>
      )}

      <main>
        <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-xs text-slate-500">Loading…</div>}>
        {platformPage === 'dashboard' && (
          <DashboardPage
            round={round}
            maps={mapsWithFavorites}
            favorites={favoriteMaps}
            onFavorite={handleFavorite}
            onImportFavorites={handleImportFavorites}
            onSubmitBeatmap={handleSubmitBeatmap}
            mySubmission={mySubmissions[0] ?? null}
            onWithdraw={handleWithdraw}
            myVote={myVote}
            voteBusy={voteBusy}
            voteError={voteError}
            onVote={handleVote}
            onDismissVoteError={() => setVoteError(null)}
            challengeBeatmaps={challengeBeatmaps}
            selectedChallengeId={selectedChallengeId}
            onSelectChallenge={setSelectedChallengeId}
            onImportScore={handleImportScore}
            onNavigate={navigate}
            user={platformUser}
            onLogin={handleLogin}
          />
        )}
        {platformPage === 'vote' && (
          <VotePage
            maps={mapsWithFavorites}
            round={round}
            mySubmissionId={mySubmissions[0]?.id ?? null}
            loading={!loaded}
            voteBusy={voteBusy}
            voteError={voteError}
            onDismissVoteError={() => setVoteError(null)}
            playingId={audioState.playing ? audioState.id : null}
            audioProgress={(id) => (audioState.id === id ? audioState.progress : 0)}
            onTogglePlay={handleTogglePlay}
            onScrub={handleScrub}
            onVote={handleVote}
            onFavorite={handleFavorite}
            onNavigate={navigate}
            user={platformUser}
            onLogin={handleLogin}
          />
        )}
        {platformPage === 'search' && (
          <SearchPage favoritedIds={favoritedIds} onFavorite={handleFavorite} />
        )}
        {platformPage === 'submit' && (
          <PlatformSubmitPage
            round={round}
            mySubmissions={mySubmissions}
            favorites={favoriteMaps}
            onFavorite={handleFavorite}
            preselectedDifficultyId={submitDifficultyId}
            settings={settings}
            loading={!loaded}
            onSubmitted={() => {
              void refresh();
            }}
            onWithdraw={handleWithdraw}
            onNavigate={navigate}
            user={platformUser}
            onLogin={handleLogin}
            onImportFavorites={handleImportFavorites}
          />
        )}
        {platformPage === 'landing' && <LandingPage />}
        {platformPage === 'admin' && (
          <AdminDashboard
            round={round}
            user={platformUser}
            onRoundChange={refresh}
            onLogin={handleLogin}
          />
        )}
        {platformPage === 'shop' && <ShopPage />}
        {platformPage === 'rankings' && (
          <RankingsPage
            user={platformUser}
            // ── NEW: pass navigateToPlayer so the rankings page can open profiles ──
            onNavigateToPlayer={navigateToPlayer}
          />
        )}
        {platformPage === 'archive' && <ArchivePage />}
        {platformPage === 'compare' && <PlayerComparePage />}
          {platformPage === 'duels' && <DuelsPage user={platformUser} onLogin={handleLogin} onNavigateToPlayer={navigateToPlayer} />}

        {/* ── NEW: player profile page ─────────────────────────────────────── */}
        {platformPage === 'player' && profileUsername !== null && (
          <PlayerProfilePage
            username={profileUsername}
            onBack={() => {
              // Return to the rankings page (most common entry point), or to
              // landing if the profile was the first URL the user visited.
              if (window.history.length > 1) {
                window.history.back();
              } else {
                navigate('rankings');
              }
            }}
          />
        )}
        {/* ──────────────────────────────────────────────────────────────────── */}
        </Suspense>
      </main>
      </div>
    </div>
  );
}





