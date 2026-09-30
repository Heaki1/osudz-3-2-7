# osu!dz

osu!dz is a community platform for Algerian osu! players. It combines monthly community challenges, DZPP competitive ranking, DZP shop currency, player profiles, Duels, and the Adventurer Guild.

## Main systems

- Monthly challenges: submit beatmaps, vote, play the winning challenge, and earn DZPP.
- DZPP: the platform's competitive ranking score. It is separate from DZP, the spendable shop currency.
- Shop: spend DZP on profile cosmetics and other platform items.
- Duels: head-to-head osu! challenges with replay support.
- Adventurer Guild: a persistent progression system with eight ranks, Placement Exams, Quest Hunts, Guild EXP, DZP bounties, notifications, reports, loans, and admin controls.
- Archive: preserves completed monthly rounds and their results.

## Adventurer Guild

The Guild is available at /guild for authenticated users.

### Rank ladder

| Order | Rank | Family |
| ---: | --- | --- |
| 1 | Iron | Beginner |
| 2 | Copper | Beginner |
| 3 | Silver | Advanced |
| 4 | Gold | Advanced |
| 5 | Platinum | Elite |
| 6 | Mithril | Elite |
| 7 | Orichalcum | Legendary Master |
| 8 | Adamantite | Legendary Master |

Rank thresholds, required hunt tiers, and required successes are stored in guild_rank_definitions and can be adjusted by Guild administrators.

### Guild assets

Guild identity artwork lives under:

~~~text
public/guild/guild-icon.png
~~~

Rank badges live under:

~~~text
public/guild/badges/
  iron.png
  copper.png
  silver.png
  gold.png
  platinum.png
  mithril.png
  orichalcum.png
  adamantite.png
~~~

Asset URLs are lowercase and intentionally match the database paths so they work on case-sensitive production filesystems.

The Guild page uses the Guild icon in its header crest and the rank-specific PNG returned by GET /api/guild/profile.

### Guild features

Authenticated player routes:

- GET /api/guild/profile
- POST /api/guild/register/iron
- GET /api/guild/notifications
- POST /api/guild/notifications/:id/read
- GET /api/guild/exam
- POST /api/guild/exam/start
- POST /api/guild/exam/import
- POST /api/guild/exam/cashout

Guild Hunt routes are exposed through the beatmap-hunt API and cover active posters, claimed posters, hunt details, attempts, leaderboards, and creation.

Admin-only Guild routes cover hunt tier overrides, reports, rank management, rank rules, hunt-tier rules, Placement Exam templates/reviews, and loan reconciliation.

All Guild player routes use the authenticated local users.id. osu! ownership checks and osu! API lookups use the user's stored users.osu_id where the osu! API requires it.

## Database

Guild schema was introduced by migration 039_adventurer_guild.sql. Subsequent badge migrations set the active badge assets:

- 040_guild_badge_png_assets.sql
- 041_guild_adamantite_badge_png.sql
- 042_guild_badge_svg_assets.sql
- 043_guild_badge_png_assets_active.sql

Migration 043 is the final active badge mapping and points every rank at the PNG assets.

Check migration state:

~~~bash
pnpm --dir server migrate:status
~~~

Apply pending migrations:

~~~bash
pnpm --dir server migrate
~~~

## Development

Requirements:

- Node.js 22+
- pnpm
- PostgreSQL
- osu! API credentials for server-side osu! integrations

Install dependencies:

~~~bash
pnpm install
pnpm --dir server install
~~~

Run the frontend:

~~~bash
pnpm dev
~~~

Run the backend:

~~~bash
pnpm --dir server dev
~~~

Useful checks:

~~~bash
pnpm exec tsc --noEmit --pretty false
pnpm --dir server exec tsc --noEmit --pretty false
pnpm test:client
pnpm test:server
pnpm build
pnpm --dir server build
~~~

## Project layout

~~~text
src/
  App.tsx
  api/
  components/platform/
    LandingPage.tsx
    guild/
      GuildPage.tsx
      GuildCreateHunt.tsx
      GuildHuntDetails.tsx
      GuildPosterPile.tsx
      GuildWelcomeModal.tsx
      guildHall.css

server/
  src/
    routes/
      guild.ts
      guildAdmin.ts
      beatmapHunts.ts
    services/
      beatmapHunts.ts
      guildMaintenance.ts
    repos/
      guild.ts
      beatmapHunts.ts
    domain/beatmapHunts/
  migrations/
    039_adventurer_guild.sql
    040_guild_badge_png_assets.sql
    041_guild_adamantite_badge_png.sql
    042_guild_badge_svg_assets.sql
    043_guild_badge_png_assets_active.sql

public/
  guild/
    guild-icon.png
    badges/
~~~

## Guild request flow

1. The frontend loads the authenticated Guild profile.
2. The backend resolves the local authenticated user through req.user.id.
3. Guild repositories read and update the local Guild profile and progression records.
4. When an osu! score must be verified, the server uses the user's stored osu! account identity (users.osu_id) for osu! API requests.
5. Qualified Guild actions update progression and write the relevant audit/history records.
6. The Guild page refreshes profile, hunt, exam, and notification state after mutations.

## Verification status

The local database currently has all 43 migrations applied with no pending migrations.

The codebase should be kept green with the frontend and server typechecks, client tests, server tests, and production builds listed above.
