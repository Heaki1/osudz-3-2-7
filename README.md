# osu!DZ

osu!DZ is a web platform for the Algerian osu! community. It turns a recurring monthly beatmap competition into a persistent site with submissions, community voting, challenge leaderboards, DZPP rankings, player profiles, history, a DZP cosmetic economy, player-versus-player duels, progression, and administration tools.

This README documents the implementation that currently exists in this repository. It is intended to be useful to a new developer who needs to understand the site without first reading every source file.

> Repository version: **3.1.7**
>
> The repository documented here is `osudz-3-1-7`. Do not confuse it with the older `osudz-3-0-7` project.

---

## 1. What the site does

The central feature of osu!DZ is a monthly round.

Players discover or submit beatmaps, administrators review submissions, eligible community members vote, selected beatmaps become challenge maps, players import verified osu! scores, and the results become part of the DZPP competitive record.

Around that core loop, the site provides:

- Dashboard and current-round status.
- Beatmap submission and administration/review.
- Community voting.
- Multi-beatmap monthly challenges.
- Challenge score importing from osu!.
- Challenge leaderboards and challenge chat.
- DZPP competitive rankings and historical breakdowns.
- Player profiles, top plays, history, collections, progression, and activity.
- Player comparison.
- Round archive.
- Beatmap search and favorites.
- DZP shop and cosmetic equipment.
- Stealable titles with ownership history and compensation.
- Head-to-head DZPP duels.
- Level Rush / player progression.
- Administrative configuration, moderation, ranking recomputation, and economy controls.

The project deliberately separates competitive ranking points from the spendable shop economy:

```text
osu! performance + challenge participation
                |
                v
              DZPP  ------> competitive ranking / progression

challenge participation
                |
                v
               DZP  ------> shop / cosmetics / ownership
```

DZPP is never spent in the shop. DZP purchases do not modify a player's frozen monthly DZPP results.

---

## 2. High-level architecture

The project is a React/Vite single-page application backed by an Express API and PostgreSQL.

```text
Browser
  |
  | React + TypeScript + Tailwind
  v
Vite SPA
  |
  | /api/* and /uploads/* in development are proxied to the API
  v
Express API
  |
  +--> authentication/session layer
  +--> route handlers
  +--> repository/data layer
  +--> osu! API service
  +--> Discord service
  |
  v
PostgreSQL
```

In production the Express process also serves the built frontend. Client and API use the same origin in production so the signed session cookie can remain `SameSite=Lax`.

### Frontend

- React 19.
- TypeScript.
- Vite 8.
- Tailwind CSS 4 through `@tailwindcss/vite`.
- `lucide-react` for interface icons.
- Vitest for client tests.
- Lazy-loaded platform pages from `src/App.tsx`.

### Backend

- Node.js 22 or newer.
- Express 4.
- TypeScript.
- PostgreSQL through `pg`.
- `tsx` for development and migration scripts.
- Vitest for server tests.
- `multer` for upload handling.
- `dotenv` for environment configuration.
- CORS with credential support.

### External integration

The server integrates with the osu! API v2 for:

- osu! OAuth login.
- Current osu! user data.
- Beatmap lookups.
- Beatmapset search.
- Public osu! favorites.
- Recent/user scores used by challenge and duel score verification.

The application also contains a Discord service used by administrative functionality.

---

## 3. Frontend entry point and routing

`src/main.tsx` mounts the React application. `src/App.tsx` is the application-level coordinator.

There is no React Router dependency. Routing is implemented with `window.location.pathname`, `history.pushState`, and `popstate` handling.

The current platform routes are:

| Path | Platform page | Purpose |
|---|---|---|
| `/` | Landing | Public introduction and current platform information. |
| `/dashboard` | Dashboard | Current round, submissions, voting/challenge state, challenge maps, scores, progression panels. |
| `/submit` | Submit | Submit an osu! beatmap for the current round. |
| `/vote` | Vote | Review and vote on current-round submissions. |
| `/search` | Search | Search osu! beatmaps and favorite them. |
| `/rankings` | Rankings | DZPP leaderboard and ranking details. |
| `/player/:username` | Player profile | Public player profile and history. |
| `/compare` | Compare | Compare two players. |
| `/duels` | Duels | Head-to-head DZPP duel arena. |
| `/shop` | Shop | Browse and purchase/equip cosmetics with DZP. |
| `/archive` | Archive | Browse completed monthly rounds. |
| `/admin` | Admin | Administration and configuration. |

`App.tsx` owns the common authenticated user, current round, submissions, favorites, voting state, challenge beatmaps, settings, errors, and navigation callbacks. Individual pages receive this state and the operations they need.

The player profile URL is parsed by `src/lib/profileUrl.ts` so profile links are deep-linkable and can be restored with browser navigation.

### Lazy loading

Most large pages are loaded with `React.lazy()` and rendered inside `Suspense`. This keeps the initial application bundle from eagerly loading every platform section.

### Navigation

`src/components/platform/NavHeader.tsx` is the common navigation header. It exposes Dashboard, Submit, Vote, Search, Rankings, Compare, Duels, Shop, and Archive, with Admin available when appropriate.

The Compare navigation icon currently uses the standard Lucide `UserRound` icon.

---

## 4. Monthly round lifecycle

There is only one non-ended round at a time. PostgreSQL enforces this with a partial unique index.

The lifecycle is:

```text
submission -> voting -> challenge -> ended
```

### Submission phase

Eligible players can submit a beatmap that satisfies the administrator-configured beatmap rules.

The submission stores a snapshot of important osu! metadata rather than depending on a future live lookup for every display:

- Beatmapset ID.
- Difficulty ID.
- Title.
- Artist.
- Mapper.
- Difficulty name.
- osu! map status.
- Cover and preview URLs.
- Stars.
- BPM.
- Length.
- CS/AR/OD/HP.
- Required mods.
- Challenge requirement.

New submissions start as `pending` and are reviewed by an administrator.

### Voting phase

Approved submissions become the voting pool. A player can hold one vote per round. Changing the vote updates the existing ballot instead of creating another vote row.

The ballot is considered open only while:

```text
round.phase === "voting"
AND
round.winnerStatus === "none"
```

This matters because voting can remain in the `voting` phase while an administrator is resolving a pending result or tiebreak.

### Winner selection and challenge maps

When voting is closed, the administrator can approve the winner. The winner is persisted separately on the round.

The current architecture supports multiple challenge beatmaps through `round_challenge_beatmaps`. The administrator-configured `maxChallengeBeatmaps` controls how many approved submissions advance.

The winner is always recorded as vote rank 1. Remaining challenge slots are filled from the other approved submissions by vote count descending, with submission ID as a deterministic tie-breaker.

This is why challenge scores are scoped by both round and `submission_id`: every challenge beatmap has its own leaderboard.

### Challenge phase

Players play the selected challenge beatmaps on osu! and import eligible scores. The server verifies the score against the osu! API before recording it.

Challenge requirements currently include:

- `Full Combo`
- `Top #1 Score`
- `Best Accuracy`
- `Lowest Miss Count`

Mod requirements include normal combinations such as `HD`, `HR`, `DT`, `EZ`, `FL`, `HDHR`, `HDDT`, `HRDT`, and `FM` (Free Mods).

For a non-FM requirement, the challenge scorer requires an exact mod set. For example, an `HD` requirement is not satisfied by `HDHR`.

For `Full Combo`, qualification requires both the required mods and a play with zero misses whose max combo equals the beatmap max combo.

For the other challenge requirements, qualification is based on mod compliance; the leaderboard ordering determines the relative challenge result.

### Ended phase

When the challenge finishes, the round can be finalized. Frozen DZPP rows and challenge results become historical data. The archive can then display the completed round without depending on the live state of the current round.

---

## 5. Submissions and beatmap rules

The submission system is implemented across:

- `src/components/platform/PlatformSubmitPage.tsx`
- `src/components/platform/BeatmapCardPlatform.tsx`
- `server/src/routes/submissions.ts`
- `server/src/repo/submissions.ts`
- `server/src/repo/siteSettings.ts`
- `server/src/services/osu.ts`

The server is authoritative for submission eligibility.

Administrators can configure:

- Minimum stars.
- Maximum stars.
- Minimum length.
- Maximum length.
- Allowed osu! map statuses.
- Allowed mod requirements.
- Allowed challenge requirements.
- Maximum challenge beatmaps per round.
- Maximum non-rejected submissions per user per round.

`checkBeatmapRules()` is a pure server-side function used to explain why a beatmap does not satisfy the current rules.

The search page and submission lookup both ultimately rely on the osu! service. The submission route performs its own fresh lookup instead of trusting arbitrary client-supplied metadata.

---

## 6. Voting

Voting is deliberately constrained server-side rather than relying on the UI.

Rules include:

- Authentication is required.
- The caller must have the effective `canVote` capability.
- The round must be in the voting phase.
- The winner ballot must not already be finalized/tiebroken.
- A user has one active vote per round.

Votes are stored in the `votes` table and include `updated_at` so a changed ballot can be distinguished from an untouched one in administrative auditing.

Public APIs do not expose voter identity. The admin vote-audit endpoint does.

---

## 7. Challenge scores

Challenge scores are stored in `challenge_scores`.

Since migration 020, the primary application path identifies a score by:

```text
(round_id, submission_id, user_id)
```

This allows a player to have one score per challenge beatmap in the same round.

Stored score information includes:

- Score.
- Accuracy.
- Miss count.
- Maximum combo.
- Challenge beatmap max combo.
- Mods.
- Qualification result.
- osu! pp for the play.
- osu! score ID when imported.
- Submission timestamp.

The `qualified` decision is stored so historical results do not silently change when later code changes the challenge rules.

The leaderboard order is server-defined:

| Challenge requirement | Primary order |
|---|---|
| Top #1 Score | Score descending |
| Best Accuracy | Accuracy descending, then score descending |
| Lowest Miss Count | Misses ascending, then score descending |
| Full Combo | Score descending after qualification ordering |

---

## 8. DZPP ranking system

DZPP means **DZ Performance Points**. It is osu!DZ's own competitive ranking currency.

It is not osu! pp, although osu! pp is one input into the formula.

The current formula is version **4** in `server/src/repo/dzpp.ts`.

At a high level:

```text
Final DZPP
  = Performance Value
  + Completion Points
  + Qualification Points
  + Placement Points
```

### Performance Value

The performance term is the pp value of the player's imported osu! score.

The system does not read a player's profile pp total and does not use global osu! rank as a ranking term.

If osu! does not provide a usable pp value, the performance term is treated as null/zero for the arithmetic while the other DZPP terms can still exist.

### Completion Points

The current components are:

| Event | Points |
|---|---:|
| Challenge score exists | 2 |
| Approved submission for the round | 3 |
| Vote still held at finalization | 5 |
| Maximum completion | 10 |

### Qualification Points

The current components are:

| Event | Points |
|---|---:|
| Required mod compliance | 10 |
| Challenge-requirement achievement | 15 |
| Maximum qualification | 25 |

Requirement achievement is based on the challenge requirement. Ties share the achievement award.

### Placement Points

The current base table is:

```text
1st   40
2nd   36
3rd   32
4th   28
5th   24
6th   20
7th   16
8th   12
9th    8
10th   4
```

Placement points are multiplied by a field factor:

```text
fieldFactor = min(1, qualifiedPlayers / 10)
```

The factor applies only to placement points. Performance, completion, and qualification points are not reduced by field size.

Non-qualified players do not consume placement positions.

### Frozen formula versions

Every frozen DZPP row stores the formula version. Changing a ranking rule therefore requires a new formula version rather than silently changing the meaning of historical results.

The admin dashboard includes a DZPP recomputation/audit workflow for controlled recomputation.

### Algeria ranking scope

The competitive DZPP ranking is country-scoped. The ranking repository filters to the configured ranking country, currently `DZ`.

---

## 9. DZP economy

DZP is the site's spendable currency.

The reward constants are:

```text
Challenge score:       2 DZP
Approved submission:   3 DZP
Vote:                  5 DZP
```

The same participation concepts are used for the DZP reward calculation, but DZP is maintained separately from DZPP.

### Ledger design

DZP uses an append-only ledger in `dzp_ledger` rather than a mutable balance column.

Transaction types include:

- `challenge_reward`
- `challenge_reward_adjustment`
- `purchase`
- `steal_purchase`
- `steal_compensation`
- `refund`
- `admin_adjustment`

Current-season balance is derived from ledger rows belonging to the current season. Historical season entries remain available for auditing.

The original finalized challenge reward has an idempotency constraint so the same reward cannot accidentally be issued twice.

---

## 10. Seasons

The application derives shop/ranking seasons from round numbers.

The current DZPP implementation defines:

```text
SEASON_SIZE = 3 rounds
```

The season number is derived rather than stored as a separate mutable global state. DZP ledger entries retain their season number so historical transactions remain attributable after a new season begins.

---

## 11. Shop

The shop is implemented across:

- `src/components/platform/ShopPage.tsx`
- `src/components/platform/shop.types.ts`
- `src/components/platform/TitleRenderer.tsx`
- `server/src/routes/shop.ts`
- `server/src/repo/shop.ts`
- shop-related migrations 025 through 031.

Shop item categories currently include:

- `title`
- `badge`
- `frame`
- `username_decoration`
- `profile_decoration`

Shop item lifecycle is:

```text
draft -> ready -> active -> retired
```

Normal ownership is stored in `user_shop_items` and is permanent.

Artwork is stored separately in `shop_item_assets`. Only one active artwork asset can exist for an item at a time.

### Stealable titles

Stealable items use `shop_item_transfers` instead of normal permanent ownership because the title can change hands.

The current pricing policy is:

```text
next steal price = ceil(current price * 1.5)
```

The previous owner receives compensation based on their own acquisition price:

```text
compensation = floor(previous owner's acquisition price * 0.5)
```

The current steal price only increases. There is no seasonal price decay in the current implementation.

The acquisition price for each owner is immutable in the transfer history, allowing the full ownership chain to be audited.

### Profile equipment

Shop cosmetics can be equipped into profile slots. Profile equipment is stored independently so the shop inventory and the player's active presentation remain separate concepts.

---

## 12. Player profiles

The player profile system is centered around:

- `src/components/platform/PlayerProfilePage.tsx`
- `src/components/platform/PlayerProfileSections.tsx`
- `src/components/platform/PlayerCareerProgression.tsx`
- `src/components/platform/PlayerRankingDetail.tsx`
- `server/src/routes/players.ts`
- `server/src/repo/players.ts`
- `server/src/repo/platform.ts`

Profiles can expose:

- osu! identity and avatar.
- Country.
- Global osu! rank snapshot.
- DZ rank.
- Cumulative DZPP.
- Career/progression statistics.
- Top challenge plays.
- Historical monthly DZPP results.
- Challenge-map collection.
- Shop collection/equipment.
- Mapping statistics.
- Activity/progression data.

Profile links use `/player/:username` and can be opened directly or reached from rankings, duel participants, and other player-facing surfaces.

### Challenge collection

The platform records ownership of challenge maps through `challenge_map_ownership`. This allows selected challenge beatmaps to become part of a player's collection and supports transfer/gifting functionality.

### Profile banners

Authenticated players can upload their own profile banner through `PUT /api/players/:userId/banner`. The server restricts the operation to the owning account, limits uploads to 5 MB, accepts JPEG/PNG/WebP/GIF, stores the file under `uploads/profile-banners`, and replaces the previous locally managed banner file when a new one is saved.

---

## 13. Player comparison

`/compare` is implemented by `PlayerComparePage.tsx` and the `/api/platform/compare` backend endpoint.

The comparison system is intended to show the measurable differences between two players using server-provided data rather than recreating ranking calculations in the client.

The navigation entry currently uses the standard `UserRound` icon.

---

## 14. Progression and Level Rush

The platform has a progression layer on top of DZPP.

Current constants in `server/src/repo/platform.ts` include:

```text
100 DZPP per base level
5 challenge wins per additional challenge-win level
Level 50 reward: four months of osu!supporter
```

The backend exposes Level Rush entries and individual player progression.

Progression also tracks a challenge-win streak and mapping statistics.

The `activity_events` table provides a persistent activity stream for platform events.

---

## 15. Duels

The Duels page is a separate head-to-head arena. It is not the monthly DZPP ranking system.

The implementation lives in:

- `src/components/platform/DuelsPage.tsx`
- `server/src/routes/duels.ts`
- `server/src/repo/duels.ts`
- migrations 033 and 036.

### Duel lifecycle

```text
open -> live -> settled
```

Posting a duel locks the challenger's stake. Accepting a duel locks the opponent's matching stake. A live duel lasts 24 hours in the current implementation.

The duel stores:

- Challenger.
- Opponent.
- Beatmap difficulty/set.
- Title/artist/difficulty.
- Stars.
- Mod requirement.
- Win requirement.
- Stake.
- End time.
- Each player's score, accuracy, misses, and osu! score ID.

### Duel rules

Players must accept the current duel-arena rules before posting or accepting a duel. Rule acceptance is versioned with `DUEL_RULES_VERSION` and stored in `duel_rules_acceptance`.

### Duel score verification

The server reads recent osu! scores for the exact duel difficulty and checks the required mods before recording a score.

### Duel requirements

The route currently accepts:

- `Full Combo`
- `Top #1 Score`
- `Best Accuracy`
- `Lowest Miss Count`

Supported mod requirements include `FM`, `HD`, `HR`, `DT`, `EZ`, `FL`, `HDHR`, `HDDT`, and `HRDT`.

### Duel accounting

Duels have a separate `duel_ledger`. Stake, payout, refund, and adjustment transactions are kept separately from the DZP and DZPP ledgers.

The UI explicitly communicates that duel points are separate from monthly platform DZPP.

---

## 16. Search and favorites

The Search page talks to `GET /api/search/beatmaps`.

Search supports:

- Text search.
- Mapper filtering.
- Minimum/maximum stars.
- Minimum/maximum BPM.
- Map status filtering.
- Relevance/newest/star/BPM sorting.

osu! search returns beatmapsets, while the platform's card model represents a useful difficulty from each set. The server handles this flattening and rechecks returned difficulty ranges.

Favorites have two sources:

- `dz` — a favorite created on osu!DZ.
- `osu` — a favorite imported from the player's osu! favorites.

These sources are intentionally presented as one player-facing collection while remaining distinguishable in the data model.

---

## 17. Archive

The Archive page reads completed rounds and displays their frozen historical state.

For modern rounds it can show multiple challenge beatmaps, each with its own leaderboard snapshot. Older rounds that predate the multi-beatmap feature are supported through the legacy winner/leaderboard fields.

Archive data includes:

- Round number and date.
- Winning beatmap.
- Vote count and vote share.
- Participant count.
- Challenge requirement/mod requirement.
- Challenge leaderboards.
- Beatmap preview audio.

The archive deliberately reads historical round data rather than trying to reconstruct it from the current round state.

---

## 18. Challenge chat and comments

There are two related but separate discussion systems.

### Challenge chat

`/api/challenge/chat` provides round-level challenge chat. Authenticated users can post and administrators can remove messages.

### Comments

`/api/comments` supports comments associated with rounds and submissions. Comment creation is authenticated and rate-limited.

These systems are backed by dedicated PostgreSQL tables and indexes.

---

## 19. Authentication and osu! OAuth

Authentication is based on osu! OAuth.

The flow is:

```text
Browser
  |
  | GET /api/auth/login
  v
osu! OAuth
  |
  | callback with code + state
  v
GET /api/auth/callback
  |
  +--> exchange code for osu! token
  +--> read osu! user
  +--> upsert local user
  +--> create signed session cookie
  v
Browser authenticated
```

The OAuth state is protected with a short-lived signed state cookie and a nonce comparison.

### Sessions

The application does not use a session table or a session-library database store.

The `osudz_session` cookie contains a signed payload containing:

- osu! user ID.
- Expiry timestamp.
- Session epoch.

The payload is HMAC-SHA256 signed with `SESSION_SECRET`.

The normal session lifetime is 30 days.

### Session revocation

`users.session_epoch` provides revocation without introducing a session table.

When an account's epoch is incremented, every older session cookie for that account becomes invalid on the next authenticated request.

### Authentication middleware

The server provides:

- `requireAuth` — authentication required.
- `optionalAuth` — use a valid session when present, otherwise continue signed out.
- `requireAdmin` — authenticated administrator required.
- `requireCanSubmit` — authentication plus effective submit capability.
- `requireCanVote` — authentication plus effective vote capability.
- `requireCanChallenge` — authentication plus effective challenge eligibility.

---

## 20. Eligibility and permissions

Eligibility is server-controlled.

The effective submission/voting decision is derived from two inputs:

1. The enabled country allowlist.
2. An optional per-player administrator override.

The override is three-valued per capability:

```text
null  = no override; use country rule
true  = explicitly allow
false = explicitly deny
```

Submission and voting are independent capabilities. An administrator can therefore block one without necessarily blocking the other.

Challenge eligibility is derived from the effective participation capabilities rather than introducing a third independent permission field.

The initial allowlist contains Algeria (`DZ`).

---

## 21. Admin system

The administration interface is centered on `AdminDashboard.tsx` and has been split into dedicated tabs/components.

Current admin areas include:

- Round configuration and phase control.
- Voting close/skip/winner selection.
- Tiebreak information.
- Result corrections.
- Submission review.
- Challenge score administration.
- DZPP recomputation and audit history.
- User management.
- Country allowlist.
- Participant permission overrides.
- Site/beatmap rules.
- Shop configuration.
- DZP adjustments.
- Shop item artwork/assets.
- Item lifecycle management.
- Discord test functionality.
- Session revocation.

The admin router is protected by `requireAdmin`.

---

## 22. API surface

The Express server mounts these route groups:

```text
/api/auth
/api/stats
/api/rounds
/api/submissions
/api/votes
/api/challenge
/api/rankings
/api/search
/api/favorites
/api/settings
/api/comments
/api/challenge/chat
/api/shop
/api/players
/api/dzp
/api/admin
/api/duels
/api/platform
```

The platform router is also exposed at `/api/v1` as a stable read-only public API namespace.

### Authentication

```text
GET  /api/auth/login
GET  /api/auth/callback
GET  /api/auth/me
POST /api/auth/logout
POST /api/auth/logout-all
```

### Rounds

```text
GET /api/rounds/current
GET /api/rounds
GET /api/rounds/:id
```

### Submissions

```text
GET    /api/submissions
GET    /api/submissions/mine
GET    /api/submissions/:id
POST   /api/submissions/lookup
POST   /api/submissions
DELETE /api/submissions/:id
```

### Votes

```text
GET    /api/votes/my
POST   /api/votes
DELETE /api/votes
```

### Challenge

```text
GET  /api/challenge/beatmaps
GET  /api/challenge/scores
GET  /api/challenge/my
GET  /api/challenge/scores/available
POST /api/challenge/scores
```

### Challenge chat

```text
GET    /api/challenge/chat
POST   /api/challenge/chat
DELETE /api/challenge/chat/:id
```

### Rankings

```text
GET /api/rankings
GET /api/rankings/:userId
```

### Search and favorites

```text
GET    /api/search/beatmaps
GET    /api/favorites
PUT    /api/favorites/:difficultyId
DELETE /api/favorites/:difficultyId
POST   /api/favorites/import
```

### Players

```text
GET /api/players/:username
GET /api/players/:userId/challenge-collection
POST /api/players/challenge-collection/gift
PUT /api/players/:userId/banner
GET /api/players/:userId/shop-items
```

### Platform/progression

```text
GET /api/platform/activity
GET /api/platform/level-rush
GET /api/platform/players/:userId/progression
GET /api/platform/mapping-stats
GET /api/platform/recap
GET /api/platform/compare
```

### Shop

```text
GET /api/shop
GET /api/shop/profile
GET /api/shop/profile/:userId
PUT /api/shop/profile/:profileSlot
GET /api/shop/items/:itemId
GET /api/shop/items/:itemId/history
POST /api/shop/purchase
POST /api/shop/steal
```

### DZP

```text
GET /api/dzp/history
```

### Duels

```text
GET  /api/duels/rules
POST /api/duels/rules/accept
POST /api/duels/lookup
GET  /api/duels
POST /api/duels
POST /api/duels/:id/accept
POST /api/duels/:id/import
```

### Admin

The admin API covers round phase/winner operations, tiebreaks, votes, manual challenge scores, DZPP recomputation, rounds, submission review, country management, users, participant overrides, site settings, result corrections, session revocation, DZP adjustments, shop item management, shop assets, item lifecycle, and Discord testing.

---

## 23. API response/error contract

The frontend uses `src/api/client.ts` as the typed API boundary.

The backend intentionally returns JSON errors for API failures rather than allowing Express to fall through to an HTML error page.

Examples of the contract include:

```json
{ "error": "Not authenticated" }
```

and:

```json
{ "error": "No API route for GET /api/example" }
```

The server also normalizes malformed JSON and oversized request bodies into JSON error responses.

The frontend distinguishes network failures from server-returned errors in its API layer so the application can show a meaningful API-unavailable message when the backend cannot be reached.

---

## 24. Database architecture

PostgreSQL is the persistent source of truth.

The main data areas are:

```text
users
rounds
submissions
votes
challenge_scores
round_challenge_beatmaps
round_dzpp
round_dzpp_maps
dzpp_recomputes
allowed_countries
participant_permissions
site_settings
comments
challenge_chat
favorites
dzp_ledger
shop_items
shop_item_assets
user_shop_items
shop_item_transfers
user_shop_profile_equipment
activity_events
duels
duel_ledger
duel_rules_acceptance
challenge_map_ownership
level_rush_winner
round_tiebreak_entries
round_result_corrections
```

### Important database invariants

- Only one non-ended round can exist.
- A user has one vote per round.
- Submissions and votes reference their owning round/user records.
- Challenge scores are unique per user/round/challenge-beatmap on the modern path.
- Challenge beatmaps record their vote rank.
- Frozen DZPP is stored rather than reconstructed from mutable current data.
- DZP is an append-only ledger.
- Normal shop ownership is unique per user/item.
- A stealable shop item has at most one current owner.
- Duel ledger records financial movement independently from the shop/DZP ledger.
- Rule/configuration changes are represented by migrations rather than editing already-applied migrations.

---

## 25. Database migrations

Migrations live in `server/migrations` and currently run through:

```text
036_duel_rules_and_beatmap_art.sql
```

The migration sequence currently covers:

| Migration | Feature |
|---|---|
| 001 | Core users, rounds, submissions, votes |
| 002 | Challenge scores |
| 003 | osu! global rank snapshot |
| 004 | Round winner and tiebreaks |
| 005 | Country allowlist |
| 006 | Participant permission overrides |
| 007 | Favorites |
| 008 | Vote update timestamps |
| 009 | Round result corrections |
| 010 | Session revocation epoch |
| 011 | Site settings |
| 012 | Comments |
| 013 | Frozen round DZPP |
| 014 | DZPP recomputation audit |
| 015 | FM mod support |
| 016 | Challenge chat |
| 017 | Challenge score combo data |
| 018 | Favorite mod statistics |
| 019 | Maximum challenge beatmaps setting |
| 020 | Multiple challenge beatmaps per round |
| 021 | Maximum submissions per user |
| 022 | Per-beatmap frozen DZPP |
| 023 | Per-map DZPP awards |
| 024 | Score reuse across challenge beatmaps |
| 025 | DZP/shop foundation |
| 026 | Shop seed data |
| 027 | DZP admin audit data |
| 028 | Shop profile equipment |
| 029 | Profile banner |
| 030 | Shop frame geometry |
| 031 | Animated shop artwork |
| 032 | Progress/activity data |
| 033 | Duels |
| 034 | Challenge map ownership |
| 035 | Level Rush winner |
| 036 | Duel rules acceptance and beatmap-set art metadata |

### Migration safety

The migration runner stores a SHA-256 checksum for each applied migration.

If an already-applied migration file is edited, the runner refuses to continue. The correct approach is to add a new numbered migration instead of changing history.

The database guard also verifies the intended database target before migration-related operations.

Useful commands:

```bash
cd server
pnpm run migrate:status
pnpm run migrate
pnpm run db:check
```

---

## 26. Important source directories

```text
src/
  App.tsx                         Application state and SPA routing
  api/client.ts                   Typed frontend API boundary
  types.ts                        Shared frontend domain types
  index.css                       Global styling
  main.tsx                        React entry point

  components/
    BeatmapCard.tsx               General beatmap card
    beatmapCard/                  Shared card subcomponents
    beatmapCard.shared.ts         Shared beatmap-card utilities

    platform/
      Admin*.tsx                  Admin dashboard and feature tabs
      ArchivePage.tsx              Historical rounds
      ChallengeChat.tsx            Challenge discussion
      Dashboard*.tsx               Dashboard sections
      DuelsPage.tsx                Duel arena
      LandingPage.tsx              Public landing page
      NavHeader.tsx                Main navigation/header
      PlatformSubmitPage.tsx       Submission flow
      RankingsPage.tsx             DZPP rankings
      Player*.tsx                  Profiles, progression, comparison
      SearchPage.tsx               Beatmap search
      ShopPage.tsx                 Shop UI
      VotePage.tsx                 Voting UI
      TitleRenderer.tsx            Cosmetic title rendering

  lib/
    audioPreview.ts               Shared audio-preview state
    comments.ts                    Comment helpers
    profileUrl.ts                  Profile URL parsing/building
    rankings.ts                    Ranking presentation helpers
    round.ts                       Round phase/countdown/gating helpers
    submission.ts                  Submission/beatmap mapping helpers

server/src/
  index.ts                         Express application and route mounting
  env.ts                           Environment validation
  db.ts                            PostgreSQL pool
  session.ts                       Signed OAuth/session cookies

  middleware/
    auth.ts                        Authentication and capability gates
    rateLimit.ts                   Request/action rate limiting

  routes/
    *.ts                            HTTP API endpoints

  repo/
    *.ts                            PostgreSQL data access and domain rules

  services/
    osu.ts                          osu! API integration
    discord.ts                      Discord integration

  scripts/
    migrate.ts                      Migration runner
    guard.ts                        Database target guard
    check-db.ts                     Database safety checks
    verify-dzpp.ts                  DZPP verification utility

server/migrations/
  001_*.sql ... 036_*.sql           Incremental PostgreSQL schema history
```

---

## 27. Important frontend modules

### `App.tsx`

The application coordinator. It:

- Detects the current URL/page.
- Loads the current round.
- Loads submissions, favorites, votes, challenge beatmaps, and site settings.
- Maintains authenticated user state.
- Performs navigation with browser history.
- Handles voting, withdrawing submissions, importing challenge scores, favorites, and logout.
- Passes shared state into page components.

### `NavHeader.tsx`

The global header and phase-aware navigation. It displays authentication state, current round/phase information, and platform navigation.

### `DashboardPage.tsx`

The main active-round dashboard. It is composed from smaller dashboard sections including the challenge hero, challenge panels, level rush, and submission panels.

### `PlatformSubmitPage.tsx`

Handles beatmap lookup, submission configuration, favorites/imported favorites, submission rules, and withdrawal.

### `VotePage.tsx`

Displays the current voting pool and lets an eligible player cast/retract a vote.

### `RankingsPage.tsx`

Displays the server-provided DZPP leaderboard, pagination, seasons/years, and player navigation.

### `PlayerProfilePage.tsx`

Loads the player profile and combines the profile banner, career statistics, progression, top plays, history, challenge collection, and shop collection.

### `DuelsPage.tsx`

Provides the duel arena, open challenges, current/live duels, personal duel list, rule acceptance, duel creation, score import, and duel details.

### `ShopPage.tsx`

Displays the catalog, viewer balance/ownership state, item details, purchases, steals, and profile equipment.

### `AdminDashboard.tsx`

Coordinates the administrator tools. The feature-specific work is distributed into `Admin*` modules so the dashboard does not need to own every implementation detail itself.

---

## 28. Important backend modules

### `server/src/index.ts`

Creates Express, configures CORS/JSON/uploads, mounts every route, serves the production client, provides SPA fallback, and normalizes API errors.

### `server/src/repo/rounds.ts`

Owns round lifecycle rules, phase transitions, winner approval, tiebreak handling, corrections, and round DTO conversion.

### `server/src/repo/submissions.ts`

Owns submission persistence and review state.

### `server/src/repo/votes.ts`

Owns one-vote-per-round behavior and vote auditing.

### `server/src/repo/challengeScores.ts`

Owns score storage, mod compliance, challenge qualification, and leaderboard ordering.

### `server/src/repo/challengeBeatmaps.ts`

Owns the set of beatmaps selected for a challenge round.

### `server/src/repo/dzpp.ts`

Contains the pure DZPP formula, round scoring, finalization, historical storage, recomputation, season/ranking reads, and detailed per-map breakdowns.

### `server/src/repo/dzp.ts`

Contains pure DZP reward calculations. Ledger persistence is handled with the shop/economy data layer.

### `server/src/repo/shop.ts`

Owns the shop catalog, artwork, ownership, transfers, purchases, steals, compensation, profile equipment, and DZP accounting operations.

### `server/src/repo/duels.ts`

Owns duel creation, acceptance, score recording, settlement, rules acceptance, and duel ledger transactions.

### `server/src/services/osu.ts`

Owns communication with osu! API v2, including OAuth token exchange, user lookup, beatmap lookup, search, favorites, and score reads.

---

## 29. osu! API integration details

There are two broad credential contexts.

### OAuth/user context

The login flow uses the configured osu! OAuth client credentials and callback URL.

### Application/client-credentials context

The server also obtains an application token for public osu! API data such as beatmap search and public favorites.

The server normalizes osu! API data into project-specific DTOs instead of exposing raw osu! API response shapes throughout the frontend.

Important examples include:

- osu! accuracy fractions are converted into percentages for application storage/display.
- osu! mod arrays are normalized into joined acronyms such as `HDHR` or `NM`.
- beatmapset search results are flattened into the application's card model.
- numeric PostgreSQL `bigint`/`numeric` values are explicitly converted where necessary because `pg` returns them as strings.

---

## 30. Audio preview system

`src/lib/audioPreview.ts` provides shared preview playback state.

The same state can be used by multiple pages/cards so preview playback does not become a separate uncontrolled audio implementation in every component.

Beatmap previews are used in places such as:

- Beatmap cards.
- Search/submission views.
- Archive round cards.

---

## 31. Styling and visual system

The platform uses a dark interface built primarily with Tailwind utility classes.

Common visual patterns include:

- Deep navy page backgrounds.
- Slate panels and borders.
- Amber/gold for competitive points and important ranking state.
- Emerald for accepted/positive challenge states.
- Rose/red for duel/action emphasis and destructive/error states.
- Small uppercase monospace labels for metadata.
- Dense competitive tables and cards.
- Lucide icons rather than image files for ordinary UI icons.

Beatmap and shop artwork is stored under `public/assets` and related public asset directories where applicable.

The DZPP currency image currently used by duel/open-challenge UI is:

```text
public/assets/dzpp-currency.png
```

---

## 32. Environment configuration

The backend expects the following values from `server/.env`.

```env
NODE_ENV=production

PUBLIC_BASE_URL=https://your-domain.example
CLIENT_ORIGIN=https://your-domain.example

SESSION_SECRET=replace-with-a-long-random-secret

OSU_CLIENT_ID=your-osu-client-id
OSU_CLIENT_SECRET=your-osu-client-secret
OSU_REDIRECT_URI=https://your-domain.example/api/auth/callback

DATABASE_URL=postgresql://app_user:password@host:5432/database
DATABASE_SSL=true

ADMIN_OSU_IDS=your-osu-user-id
```

### Required values

`SESSION_SECRET`, `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, and `OSU_REDIRECT_URI` are required at server startup.

`PUBLIC_BASE_URL` and `CLIENT_ORIGIN` default to localhost during development but are required in production.

`ADMIN_OSU_IDS` is a comma-separated list of osu! account IDs that receive administrator access when they log in.

`DATABASE_URL` and the PostgreSQL SSL configuration are consumed by the database layer; the exact connection setup is deployment-dependent.

---

## 33. Local development

Install frontend dependencies from the repository root:

```bash
pnpm install
```

Install server dependencies:

```bash
cd server
pnpm install
```

Create `server/.env` from `server/.env.example` and provide the local database, osu! OAuth, session, and admin values.

### Start the frontend

From the repository root:

```bash
pnpm dev
```

The Vite development server defaults to:

```text
http://localhost:8443
```

### Start the backend

From `server`:

```bash
pnpm dev
```

The API defaults to:

```text
http://localhost:3001
```

Vite proxies `/api` and `/uploads` to the backend using `API_PORT` when provided, otherwise port `3001`.

Run the frontend and backend together when developing the complete site.

### Database setup

Check the configured database target:

```bash
cd server
pnpm run db:check
```

Check migration state:

```bash
pnpm run migrate:status
```

Apply pending migrations:

```bash
pnpm run migrate
```

---

## 34. Build, typecheck, and tests

### Frontend typecheck

```bash
pnpm run typecheck
```

### Frontend build

```bash
pnpm run build
```

### Client tests

```bash
pnpm run test:client
```

### Server tests

```bash
pnpm run test:server
```

### Full test command

```bash
pnpm test
```

The root `test` script runs client tests and then server tests.

The server package also provides:

```bash
cd server
pnpm run typecheck
pnpm run build
pnpm run dzpp:verify
```

Before considering a broad frontend change complete, the useful baseline is:

```bash
pnpm run typecheck
pnpm run test:client
pnpm run test:server
pnpm run build
```

---

## 35. Testing philosophy

The codebase deliberately keeps important business rules as pure functions where practical.

Examples include:

- Round phase transitions.
- Round ballot-open checks.
- Beatmap submission rule validation.
- DZPP scoring.
- DZPP field-factor calculations.
- DZP reward calculations.
- Challenge mod compliance.
- Challenge qualification.
- Search query composition.
- Ranking pagination helpers.
- Profile URL parsing.

This allows critical competitive rules to be tested without requiring React rendering, Express, osu!, or a live database.

Server repositories also have focused tests for challenge scores, challenge beatmaps, rounds, users, DZPP, DZP, platform behavior, site settings, and related functionality.

---

## 36. Production deployment model

The production model is intentionally simple:

```text
Browser
   |
   v
Express process
   |
   +---- /api/*
   +---- /uploads/*
   +---- built React assets
   |
   v
PostgreSQL
```

The server reads `PORT` first, then `API_PORT`, then defaults to `3001`.

The client build is served from the root `dist` directory when `NODE_ENV=production`.

Non-API production paths fall back to `index.html`, allowing browser refreshes on routes such as `/rankings` and `/player/Heaki`.

API paths that do not exist remain JSON 404 responses.

The production CORS origin is validated through `CLIENT_ORIGIN`, and cookies become secure when production mode is enabled or the configured public base URL uses HTTPS.

---

## 37. Public API namespace

The normal application routes live under `/api`.

The same platform handlers are also mounted under:

```text
/api/v1
```

This namespace is intended as a stable read-only public API surface. The implementation deliberately reuses the platform handlers so the public API and normal application contract do not drift into two independently maintained implementations.

---

## 38. Security and integrity model

Important security boundaries are enforced on the server rather than trusting the client.

### Authentication

Signed HTTP-only cookies identify the authenticated osu! account.

### OAuth CSRF protection

The OAuth state parameter is paired with a signed short-lived state cookie.

### Session revocation

The session epoch invalidates old signed cookies without a session table.

### Capability enforcement

Submit, vote, challenge, and admin permissions are checked on the server.

### Database constraints

Important uniqueness and state constraints are enforced in PostgreSQL, not just React code.

### Score verification

Challenge and duel score imports are checked against osu! data rather than accepting arbitrary client-entered scores.

### Idempotent rewards

The primary finalized DZP reward has an idempotency key/unique index to prevent accidental duplicate reward issuance.

### Migration checksums

Applied migrations are checksum-protected to prevent schema drift caused by editing migration history.

---

## 39. Data ownership and source of truth

The application follows a few important ownership rules.

### Server owns competitive state

The server/database decides:

- Current round.
- Round phase.
- Voting eligibility.
- Submission eligibility.
- Challenge beatmap selection.
- Challenge qualification.
- Challenge leaderboard order.
- DZPP calculation.
- Frozen historical results.

The frontend displays these decisions.

### osu! owns osu! identity and play evidence

The platform uses osu! as the source for:

- Player identity during OAuth login.
- Beatmap metadata lookups.
- Beatmap search.
- Public favorites.
- Score verification.

### PostgreSQL owns platform history

The database stores the platform's authoritative historical record, including round snapshots, votes, submissions, challenge scores, frozen DZPP, shop accounting, and duel accounting.

---

## 40. Historical compatibility

The codebase has evolved through a sequence of migrations rather than replacing the original schema.

Several APIs therefore intentionally support legacy records. The clearest example is challenge beatmaps:

- Modern rounds have `round_challenge_beatmaps` rows and challenge scores with `submission_id`.
- Older rounds may have only the original winning beatmap/flat leaderboard representation.
- Archive code can display either representation.

When adding a new feature, preserve these compatibility paths unless the old data is explicitly migrated.

---

## 41. Current codebase conventions

Several conventions are important when extending the project.

### Keep business rules pure where possible

If a rule can be represented as a function of its inputs, keep it outside the HTTP/database layer and test it directly.

### Keep server and client contracts typed

Add/update the corresponding API DTO in `src/api/client.ts` when changing an endpoint rather than spreading untyped response assumptions through components.

### Treat database values carefully

PostgreSQL `bigint` and `numeric` values can arrive from `pg` as strings. Explicit conversion is used throughout repository DTO conversion.

### Do not duplicate competitive formulas in React

The ranking server is authoritative. Frontend helpers should format or paginate server results, not recreate DZPP ranking decisions.

### Do not edit applied migrations

Add a new migration.

### Preserve round/challenge scope

Challenge data must remain scoped to both the round and the selected challenge beatmap where applicable.

### Keep DZPP and DZP separate

Do not use the shop ledger as a ranking source or the ranking tables as a shop balance source.

### Preserve authenticated route guards

UI visibility is not authorization. Every protected write must still be protected by the corresponding backend middleware.

---

## 42. Known architectural areas under active development

The repository is functional but still actively evolving. Areas that have been identified for continued engineering work include:

1. Improve API read failure semantics so a legitimate absence of a current round is distinguishable from an unavailable API/database.
2. Continue consolidating duplicate beatmap-card implementations.
3. Continue breaking very large React modules into focused components.
4. Continue addressing audio-preview and beatmap-route edge cases.
5. Remove any remaining duplicated ranking constants from the client where the server should remain authoritative.
6. Continue improving archive freshness and search contracts.
7. Expand integration/CI coverage.
8. Continue hardening multi-beatmap challenge flows and historical compatibility.

These are engineering priorities, not descriptions of missing core architecture; many of the underlying systems already exist in this version.

---

## 43. Repository files at a glance

```text
osudz-3-1-7/
├── .figma/                         Figma Make project configuration
├── .github/                        CI/workflow configuration
├── public/                         Static frontend assets
│   └── assets/
├── src/                            React application
│   ├── api/
│   ├── components/
│   │   └── platform/
│   ├── lib/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
├── server/
│   ├── migrations/                 PostgreSQL migration history
│   ├── src/
│   │   ├── middleware/
│   │   ├── repo/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   ├── db.ts
│   │   ├── env.ts
│   │   ├── index.ts
│   │   └── session.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── vitest.client.config.ts
└── vitest.server.config.ts
```

---

## 44. Typical developer workflow

For a normal feature change:

```text
1. Identify the page/component and its API endpoint.
2. Inspect the existing DTO in src/api/client.ts.
3. Inspect the matching Express route.
4. Inspect the repository/business rule behind the route.
5. Check the database migration history if the data model changes.
6. Make the smallest focused change.
7. Run typecheck.
8. Run relevant tests.
9. Run the production build for frontend changes.
10. Inspect git diff/status before considering the work complete.
```

For a schema change:

```text
1. Add a new numbered migration.
2. Add/update repository types and queries.
3. Update route DTOs.
4. Update frontend API types.
5. Update UI behavior.
6. Add focused tests for the new rule.
7. Run migration status/checks.
8. Run server and client validation.
```

---

## 45. Summary of the complete product model

The site can be understood as several connected systems sharing the same player identity:

```text
                         osu! API
                            |
                 +----------+----------+
                 |                     |
              Identity              Scores/maps
                 |                     |
                 v                     v
              Users ------------ Beatmaps
                 |
                 +-------------------------------+
                 |                               |
                 v                               v
           Monthly rounds                    Duels
                 |                               |
       +---------+---------+                     v
       |         |         |                  Duel ledger
       v         v         v
  Submission   Voting   Challenge
       |         |         |
       +---------+---------+
                 |
                 v
              DZPP
                 |
       +---------+---------+
       |                   |
       v                   v
   Rankings            Progression
       |
       v
  Player profiles

Challenge participation
          |
          v
         DZP
          |
          v
        Shop
          |
          +--> Cosmetics
          +--> Titles
          +--> Frames
          +--> Profile equipment
          +--> Stealable ownership chains
```

The important conceptual boundaries are:

```text
DZPP = competitive monthly performance/ranking record
DZP  = spendable shop/economy currency
Duels = separate stake/payout ledger
osu! = external identity, beatmap, and score source
PostgreSQL = platform source of truth and historical record
React = presentation and interaction layer
Express/repositories = authoritative business rules and API
```

That separation is the core architecture of osu!DZ 3.1.7.
