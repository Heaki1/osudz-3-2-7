# GuildMe — Adventurer Guild Documentation

Project: osu!DZ 3.2.7

This document describes the current Adventurer Guild implementation from the codebase. It distinguishes implemented rules from provisional or administrator-configurable rules.

## 1. Overview

The Adventurer Guild is a separate progression and challenge system. It contains:

- Guild registration and ranks.
- Guild EXP and an EXP audit trail.
- Beatmap Hunts.
- DZP bounty escrow and payouts.
- Guild Loans for Hunt upgrades.
- A one-time six-test Placement Exam.
- osu! score ownership verification.
- Hunt reports/moderation.
- Guild notifications.
- Administrator configuration and intervention.

The Guild is separate from the main platform Level system. Main platform Level is calculated from DZPP and challenge wins in server/src/repos/platform.ts, calculatePlayerLevel().

## 2. Main implementation files

Backend routes:
- server/src/routes/guild.ts
- server/src/routes/beatmapHunts.ts
- server/src/routes/guildAdmin.ts

Services:
- server/src/services/beatmapHunts.ts
- server/src/services/guildMaintenance.ts

Domain:
- server/src/domain/beatmapHunts/rules.ts
- server/src/domain/beatmapHunts/progression.ts

Repositories:
- server/src/repos/guild.ts
- server/src/repos/beatmapHunts.ts

Database:
- server/migrations/039_adventurer_guild.sql

Frontend:
- src/components/platform/guild/GuildPage.tsx
- src/components/platform/guild/GuildCreateHunt.tsx
- src/components/platform/guild/GuildHuntDetails.tsx
- src/components/platform/guild/GuildPosterPile.tsx
- src/components/platform/guild/GuildWelcomeModal.tsx
- src/components/platform/admin/AdminGuildTab.tsx

API clients:
- src/api/guild.ts
- src/api/guildAdmin.ts

## 3. Guild registration

Table: user_guild_profiles

Fields include:
- user_id
- registration_status
- guild_rank
- guild_exp
- attempted_hunts
- successful_hunts
- failed_hunts
- exam_used
- registered_at
- updated_at

Default state:

UNREGISTERED / IRON / 0 EXP / no Hunt history / exam_used=false.

Registration is implemented by:
server/src/services/beatmapHunts.ts -> registerIron()

Repository:
server/src/repos/guild.ts -> registerAsIron()

Endpoint:
POST /guild/register/iron

Users must be ACTIVE in the Guild before posting or submitting to Hunts.

## 4. Guild ranks

There are eight ranks:

1. IRON
2. COPPER
3. SILVER
4. GOLD
5. PLATINUM
6. MITHRIL
7. ORICHALCUM
8. ADAMANTITE

They are stored in guild_rank_definitions.

Each rank can define:
- rank_order
- family
- badge_asset
- min_exp
- required_hunt_tier
- required_successes
- is_active

Rank families:
- IRON/COPPER = BEGINNER
- SILVER/GOLD = ADVANCED
- PLATINUM/MITHRIL = ELITE
- ORICHALCUM/ADAMANTITE = LEGENDARY_MASTER

The mapping is in rules.ts -> rankFamily().

Important: final promotion thresholds are configurable. The schema intentionally permits min_exp, required_hunt_tier, and required_successes to be NULL. There is therefore no single hard-coded final promotion formula.

## 5. Guild EXP

Guild EXP is stored in user_guild_profiles.guild_exp.

Every EXP change is also written to guild_exp_events with:
- user_id
- hunt_id
- attempt_id
- delta_exp
- reason
- created_at

The central mutation is:
server/src/repos/guild.ts -> addGuildExp()

It writes the audit event and updates the profile in one database flow.

EXP is clamped at zero:

guild_exp = GREATEST(0, guild_exp + delta)

Therefore Guild EXP cannot become negative.

## 6. Canonical EXP policy

server/src/domain/beatmapHunts/progression.ts defines the Guild EXP economy.

Every Guild EXP event is calculated as:

`Base Event Value × Current Rank Multiplier = Final EXP Delta`

The multiplier at submission/event time is stored in `guild_exp_events` so the audit trail explains the resulting delta even after the player changes rank.

| Rank | Family | Multiplier |
|---|---|---:|
| IRON | BEGINNER | 1.0x |
| COPPER | BEGINNER | 1.4x |
| SILVER | ADVANCED | 2.0x |
| GOLD | ADVANCED | 2.8x |
| PLATINUM | ELITE | 3.8x |
| MITHRIL | ELITE | 5.0x |
| ORICHALCUM | LEGENDARY_MASTER | 7.0x |
| ADAMANTITE | LEGENDARY_MASTER | 10.0x |

Beatmap Challenge base events:

| Event | Base EXP |
|---|---:|
| Qualified attempt | +75 |
| 1st-place winner | +100 |
| Terrible attempt | -15 × failed placement |
| 2nd place | +50 |
| 3rd place | +30 |
| 4th place | +20 |
| 5th place | +10 |
| 6th place | +8 |
| 7th place | +6 |
| 8th place | +4 |
| 9th place | +2 |
| 10th place | +1 |

Target Hunt base events (`BEAT_MY_SCORE` / `SNIPE_SCORE`):

| Event | Base EXP |
|---|---:|
| Qualified attempt | +200 |
| Terrible attempt | -15 × failed placement among unqualified attempts |
| 2nd–10th placement | Same 50/30/20/10/8/6/4/2/1 base schedule |

An unqualified placement receives 30% of the placement base value, representing the blueprint's 70% reduction. Non-terrible, unqualified submissions receive no separate participation EXP. Terrible attempts are not also paid a positive placement reward.

## 7. Rank progress and demotion

server/src/services/beatmapHunts.ts -> getGuildProfile() loads the current rank, next rank, next EXP threshold, progress percentage, badge, and active loan.

server/src/domain/beatmapHunts/progression.ts contains `rankProgress()`, `nextRank()`, `previousRank()`, and `isFamilyBoundary()`.

Rank thresholds are canonicalized by migration 044:

| Rank | Minimum EXP |
|---|---:|
| IRON | 0 |
| COPPER | 300 |
| SILVER | 1,000 |
| GOLD | 2,500 |
| PLATINUM | 6,000 |
| MITHRIL | 12,000 |
| ORICHALCUM | 25,000 |
| ADAMANTITE | 50,000 |

Promotion also requires the rank-specific gate. Promotion is handled by `services/guildProgression.ts -> maybePromoteGuildPlayer()` and emits `GUILD_RANK_ADJUSTED` with the theatrical promotion text defined by the Guild blueprint.

Demotion no longer happens immediately. At or below the current rank floor, the Guild starts a 24-hour warning window. If EXP recovers above the floor before the window expires, the warning is cleared. If the window expires while EXP remains at or below the floor, the player is demoted exactly one rank and receives `GUILD_DEMOTION`.

When the demotion crosses a family boundary — Silver→Copper, Platinum→Gold, or Orichalcum→Mithril — `family_gate_reset_at` is set. The corresponding entry gate must then be satisfied again using evidence from that reset point onward.

## 8. Beatmap Hunts

A Hunt is a player-created challenge containing:
- Hunt type
- osu!standard beatmap difficulty
- DZP bounty
- requirements
- optional target score
- description
- automatic tier
- optional admin tier
- expiry
- attempts
- winner

Table: beatmap_hunts

Supported Hunt types:
- BEAT_MY_SCORE
- SNIPE_SCORE
- BEATMAP_CHALLENGE

## 9. Hunt types

BEAT_MY_SCORE:
The poster supplies a score that must belong to the poster's own osu! account. A challenger must beat it and satisfy the Hunt requirements.

SNIPE_SCORE:
The poster supplies a target osu! score. A challenger must beat the target and satisfy the Hunt requirements.

BEATMAP_CHALLENGE:
There is no target score. Players submit qualifying scores. At expiry, the best qualifying attempt wins.

For Beatmap Challenge ranking, the ordering is qualification, score, accuracy, earlier submission time, then attempt ID.

## 10. Beatmap restrictions

Guild Hunts currently require:
- osu!standard
- ranked, loved, or approved beatmap status

This is enforced by createHunt().

## 11. Hunt bounty and escrow

Minimum bounty: 100 DZP.

The poster's spendable seasonal DZP balance is checked before creation.

The bounty is moved into escrow using the DZP ledger transaction type:
guild_hunt_escrow

If a Hunt is cancelled or expires without a qualifying winner, the escrow is refunded using:
guild_hunt_refund

If a winner exists, the bounty is paid using:
guild_hunt_payout

## 12. Hunt creation lifecycle

createHunt() performs approximately:

1. Validate bounty.
2. Fetch beatmap.
3. Validate osu!standard and map status.
4. Validate target score when needed.
5. Classify automatic Hunt tier.
6. Require ACTIVE Guild registration.
7. Lock the user row.
8. Check spendable DZP.
9. Escrow the bounty.
10. Insert the Hunt as ACTIVE.

Implementation:
server/src/services/beatmapHunts.ts -> createHunt()

## 13. Hunt requirements

A Hunt can require:
- required mods
- exact mods
- minimum accuracy
- maximum misses
- minimum combo
- minimum score
- minimum PP
- Full Combo

Requirements are stored as JSON in beatmap_hunts.requirements.

Evaluation:
server/src/domain/beatmapHunts/rules.ts -> qualifyAttempt()

The result contains:
- qualifies
- failureReason
- terrible

## 14. Target-score mod behavior

For BEAT_MY_SCORE and SNIPE_SCORE Hunts, the target score's mods are copied into the effective requirements with exactMods=true.

This means challengers are expected to reproduce the target's mod configuration for score Hunts unless the implementation is changed.

## 15. Hunt expiration

Normal Hunt duration is 7 days.

Implemented by rules.ts -> huntExpiresAt().

On expiry:
- target Hunts use the first qualifying attempt.
- Beatmap Challenges use the best qualifying attempt.
- no qualifying winner causes an escrow refund and EXPIRED state.

Settlement is implemented by:
server/src/services/beatmapHunts.ts -> expireHunt()

## 16. Hunt attempt import

A player supplies an osu! score ID or score URL.

importHuntScore() then:
1. Requires ACTIVE Guild registration.
2. Loads the Hunt.
3. Checks Hunt is ACTIVE and not expired.
4. Parses the score ID.
5. Fetches the osu! score.
6. Verifies ownership.
7. Verifies beatmap and osu!standard ruleset.
8. Rejects duplicate use of the same score on that Hunt.
9. Evaluates requirements.
10. Checks whether the score beats the target.
11. Stores the attempt.
12. Awards provisional EXP.
13. Potentially claims the Hunt.
14. Potentially pays the winner.

Implementation:
server/src/services/beatmapHunts.ts -> importHuntScore()

## 17. Score ownership verification

Local users.id and osu! users are different ID namespaces.

The Guild correctly translates the local authenticated user ID to the linked osu! account ID through:

server/src/services/beatmapHunts.ts -> getOsuUserId()

The lookup is:

users.id -> users.osu_id

Imported score ownership is then checked as:

score.userId === getOsuUserId(localUserId)

This exact pattern is used by:
- importHuntScore()
- importPlacementExamScore()

This is the existing ownership-verification pattern to reuse for future imported-score features.

## 18. Attempt EXP

`importHuntScore()` applies the canonical base value immediately.

For a Beatmap Challenge, a qualified attempt is +75 base EXP. For a target Hunt, a qualified attempt is +200 base EXP. The current Guild rank multiplier is then applied by `repos/guild.ts -> addGuildExp()`.

Target Hunts are not immediately closed by the first qualifying score. They remain active until expiry so the Guild can establish final placements for the top-ten placement economy.

## 19. Terrible attempts

A failed attempt can be classified as terrible when all meaningful requirements fail and the attempt is not considered a near miss.

Near-miss checks exist for:
- accuracy
- misses
- combo

Terrible attempts receive a placement-scaled negative base value: `-15 × failed placement`. Beatmap Challenges place the failed attempt among qualified and unqualified attempts; Target Hunts calculate the failed placement among unqualified attempts. The negative base is then multiplied by the player's current rank multiplier.

## 20. Hunt claiming

Target-score Hunts resolve at expiry using the best qualifying attempt, allowing multiple challengers to compete for the same target Hunt.

Repository:
server/src/repos/beatmapHunts.ts -> claimHunt()

The finalization update is atomic and remains protected by PostgreSQL row locking. This prevents multiple expiry workers from settling the same Hunt.

## 21. Beatmap Challenge settlement

When a Beatmap Challenge expires:
1. Best qualifying attempt is selected.
2. Hunt is finalized.
3. Final placements are assigned.
4. Winner receives +100 base EXP in addition to the +75 qualified-attempt award.
5. Placements 2–10 receive the configured placement award, with unqualified placements receiving 30% of that base value.
6. Bounty is settled.

Placement bonuses are base values: 2nd +50, 3rd +30, 4th +20, 5th +10, 6th +8, 7th +6, 8th +4, 9th +2, 10th +1.

## 22. Hunt cancellation

Only the poster can cancel their active Hunt.

cancelHunt():
- verifies ownership
- requires ACTIVE state
- refunds escrow
- sets CANCELLED
- records completion time

## 23. Hunt tiers

Automatic Hunt classification uses both:
- beatmap stars
- bounty amount

Current defaults:

| Tier | Min stars | Min bounty |
|---|---:|---:|
| BEGINNER | 0.00 | 100 DZP |
| ADVANCED | 5.00 | 250 DZP |
| ELITE | 7.00 | 1000 DZP |
| LEGENDARY_MASTER | 8.50 | 5000 DZP |

rules.ts -> classifyHuntTier() selects the highest tier whose requirements are both satisfied.

These thresholds are administrator-configurable.

## 24. Admin Hunt tier override

An administrator can override automatic classification.

Audit table:
guild_hunt_admin_actions

Stored information includes:
- admin user
- previous tier
- new tier
- top-up amount
- reason
- timestamp

If the new tier requires more bounty:
ACTIVE -> PENDING_UPGRADE

The poster must then pay the top-up or use a Guild Loan.

## 25. Hunt upgrades

Direct payment:
POST /beatmap-hunts/:id/upgrade/pay

payUpgrade() verifies ownership, state, and DZP balance, then adds the upgrade amount to escrow and republishes the Hunt.

Loan:
POST /beatmap-hunts/:id/upgrade/loan

acceptUpgradeLoan() requires no existing active loan, funds the upgrade, creates a loan, escrows the amount, and republishes the Hunt.

## 26. Guild Loans

Table: guild_loans

Rules currently implemented:
- one active loan per user
- principal must be positive
- remaining amount cannot exceed principal
- default installment percentage = 25%
- due date = 7 days after issuance

The default is defined by:
server/src/domain/beatmapHunts/rules.ts -> LOAN_DEFAULT_INSTALLMENT_PERCENT

## 27. Loan repayment

reconcileDueLoans() collects a scheduled installment from available seasonal DZP.

Current calculation:
min(remaining loan, floor(available DZP * 25%))

Repayment is written to the DZP ledger as:
guild_loan_repayment

The loan becomes PAID when remaining_dzp reaches zero.

## 28. Loan repayment from Hunt winnings

If a winner has an overdue Guild Loan, settleWinner() reduces the Hunt payout by the applicable repayment amount before paying the remainder.

Flow:

Hunt bounty -> loan repayment -> remaining winner payout

## 29. Placement Exam

The Guild has a one-time six-test Placement Exam.

Tables:
- guild_placement_exam_templates
- guild_placement_exams
- guild_placement_exam_attempts

A player can start only once.

startPlacementExam() requires:
- not already registered
- exam_used=false
- no existing exam
- all six templates configured

Starting the exam sets:
- exam_used=true
- status=IN_PROGRESS
- current_test_number=1
- highest_cleared_test=0

## 30. Exam duration

The Placement Exam lasts 72 hours / 3 days.

Implemented by:
rules.ts -> examExpiresAt()

Expired exams are finalized using the highest cleared test.

## 31. Exam tests

There are exactly six sequential tests.

Each template contains:
- test number
- difficulty ID
- requirements
- optional reward rank
- DZP reward
- enabled flag

Administrators configure the beatmaps and requirements.

## 32. Exam score ownership

importPlacementExamScore() fetches the score from osu! and checks:

score.userId === getOsuUserId(localUserId)

It also requires:
- correct current exam beatmap
- requirements satisfied

This prevents a local user from importing another osu! user's score.

## 33. Exam milestone rewards

Current EXAM_REWARDS:

| Highest cleared test | Rank | DZP |
|---|---|---:|
| 1 | SILVER | 500 |
| 2 | GOLD | 750 |
| 3 | GOLD | 750 |
| 4 | PLATINUM | 2000 |
| 5 | MITHRIL | 3000 |
| 6 | final review | 5000 |

Tests 1-5 can conclude the exam at their milestone.

Test 6 enters PENDING_REVIEW instead of automatically selecting a final rank.

## 34. Exam cash-out and failure

cashOutExam() lets a player conclude an active exam after clearing at least one test. The highest cleared milestone determines the rank/reward.

If a test fails, the exam ends and the highest previously cleared milestone is used.

Attempts remain stored in guild_placement_exam_attempts.

## 35. Test 6 review

After all six tests:
IN_PROGRESS -> PENDING_REVIEW

Only:
- ORICHALCUM
- ADAMANTITE

may be assigned by the final review.

adminApproveFinalExam():
- registers the user
- assigns the selected final rank
- awards 5000 DZP
- marks exam APPROVED
- records reviewer and note
- sends GUILD_EXAM_APPROVED notification

## 36. Guild notifications

Table: guild_notifications

Notifications include:
- HUNT_CLAIMED
- HUNT_TIER_UPGRADE
- LOAN_ISSUED
- GUILD_RANK_ADJUSTED
- GUILD_DEMOTION
- GUILD_EXAM_APPROVED

Routes:
GET /guild/notifications
POST /guild/notifications/:id/read

Notifications are scoped to the authenticated local user.

## 37. Reports and moderation

Players can report an attempt.

Minimum report reason length: 10 characters.

Table: hunt_reports

Statuses:
- PENDING
- RESOLVED_BANNED
- RESOLVED_CLEARED

Admins can resolve pending reports and add a resolution note.

## 38. Main Guild routes

Profile:
GET /guild/profile

Registration:
POST /guild/register/iron

Notifications:
GET /guild/notifications
POST /guild/notifications/:id/read

Placement Exam:
GET /guild/exam
POST /guild/exam/start
POST /guild/exam/import
POST /guild/exam/cashout

## 39. Hunt routes

GET /beatmap-hunts
GET /beatmap-hunts/claimed
GET /beatmap-hunts/:id
GET /beatmap-hunts/target-scores?difficultyId=...

POST /beatmap-hunts
POST /beatmap-hunts/:id/import
DELETE /beatmap-hunts/:id/attempts/:attemptId
POST /beatmap-hunts/:id/cancel
POST /beatmap-hunts/:id/upgrade/pay
POST /beatmap-hunts/:id/upgrade/loan
POST /beatmap-hunts/attempts/:attemptId/report

## 40. Admin routes

All server/src/routes/guildAdmin.ts routes use requireAdmin.

Hunts:
GET /admin/guild/hunts
POST /admin/guild/hunts/:id/tier

Reports:
GET /admin/guild/reports
POST /admin/guild/reports/:id/resolve

Player rank:
POST /admin/guild/players/:userId/rank

Rank rules:
GET /admin/guild/rank-rules
PUT /admin/guild/rank-rules/:rank

Tier rules:
GET /admin/guild/tier-rules
PUT /admin/guild/tier-rules/:tier

Exam configuration:
GET /admin/guild/exam/beatmap/:difficultyId
GET /admin/guild/exam/templates
PUT /admin/guild/exam/templates/:testNumber

Exam review:
GET /admin/guild/exam/reviews
POST /admin/guild/exam/reviews/:userId/approve

Loans:
POST /admin/guild/loans/reconcile

## 41. Database tables

Core tables created by 039_adventurer_guild.sql:

- user_guild_profiles — current Guild state
- guild_rank_definitions — rank configuration
- guild_exp_events — EXP audit trail
- guild_notifications — user notifications
- guild_hunt_tier_rules — automatic Hunt tier policy
- beatmap_hunts — Hunt posters and lifecycle
- beatmap_hunt_attempts — score submissions
- guild_hunt_admin_actions — admin tier override audit
- hunt_reports — moderation reports
- guild_loans — Guild Loans
- guild_placement_exam_templates — six exam test definitions
- guild_placement_exams — per-user exam state
- guild_placement_exam_attempts — exam score submissions

## 42. State machines

User:

UNREGISTERED -> ACTIVE / IRON -> Guild EXP/rank progression

Hunt:

ACTIVE -> CLAIMED
ACTIVE -> CANCELLED
ACTIVE -> EXPIRED
ACTIVE -> PENDING_UPGRADE -> ACTIVE

Placement Exam:

IN_PROGRESS -> CASHED_OUT
IN_PROGRESS -> EXPIRED
IN_PROGRESS -> PENDING_REVIEW -> APPROVED

## 43. Security and identity model

Guild authorization uses the authenticated local user ID:

req.user!.id

Guild database relations reference users.id.

When an osu! score must be proven to belong to the local user, the system resolves:

users.id -> users.osu_id -> osu score userId

The important existing functions are:
- getOsuUserId()
- importHuntScore()
- importPlacementExamScore()

This distinction is essential because users.id and users.osu_id are not the same identifier.

## 44. Transaction/concurrency model

Money and important state transitions use PostgreSQL transactions and locks.

Examples:
- Hunt creation locks the poster before spending DZP.
- Hunt claims use an atomic ACTIVE -> CLAIMED update.
- Hunt expiry locks the Hunt.
- Loan operations run inside transactions.
- Placement Exam changes run inside transactions.
- EXP audit and profile update happen through addGuildExp().

These protections are intended to prevent duplicate claims, double spending, and inconsistent progression.

## 45. Main Level vs Guild Rank

These are different systems.

Main platform Level:
server/src/repos/platform.ts -> calculatePlayerLevel()

Current formula:
Base Level = floor(DZPP / 100) + 1
Challenge-win bonus = challenge wins * 5
Final Level = Base Level + challenge-win bonus

Guild progression:
user_guild_profiles.guild_exp -> guild_rank_definitions

Guild Rank is not automatically derived from main platform Level.

## 46. Current implementation caveats

1. The canonical Guild EXP economy and rank thresholds are defined by migration 044 and `domain/beatmapHunts/progression.ts`.
2. Administrators can still override individual Hunt tiers and manually assign player ranks; these are explicit interventions, not the normal progression path.
3. Hunt tier classification thresholds remain administrator-configurable.
4. Test 6 of the Placement Exam still requires administrator review.
5. Guild Loans currently use a 25% installment and seven-day due date.
6. Hunts currently last seven days.
7. Placement Exams currently last 72 hours.
8. Guild score ownership is verified against the linked users.osu_id, not the local users.id.
9. The Guild is independent from the main DZPP-based Level system.
10. The 6th–10th placement values (8/6/4/2/1 base EXP) are the implementation's explicit descending continuation of the blueprint's "scaling down" instruction.

## 47. Most important source functions

Guild profile:
- services/beatmapHunts.ts -> getGuildProfile()
- services/beatmapHunts.ts -> registerIron()

EXP:
- repos/guild.ts -> addGuildExp()
- domain/beatmapHunts/progression.ts -> GUILD_EXP_POLICY
- domain/beatmapHunts/progression.ts -> GUILD_RANK_MULTIPLIERS
- services/guildProgression.ts -> maybePromoteGuildPlayer()
- services/guildProgression.ts -> processGuildDemotionWarnings()
- domain/beatmapHunts/progression.ts -> rankProgress()

Hunt:
- services/beatmapHunts.ts -> createHunt()
- services/beatmapHunts.ts -> importHuntScore()
- services/beatmapHunts.ts -> expireHunt()
- services/beatmapHunts.ts -> cancelHunt()
- repos/beatmapHunts.ts -> claimHunt()

Score ownership:
- services/beatmapHunts.ts -> getOsuUserId()
- services/beatmapHunts.ts -> importHuntScore()
- services/beatmapHunts.ts -> importPlacementExamScore()

Loans:
- services/beatmapHunts.ts -> acceptUpgradeLoan()
- services/beatmapHunts.ts -> payUpgrade()
- services/beatmapHunts.ts -> reconcileDueLoans()
- services/beatmapHunts.ts -> settleWinner()

Placement Exam:
- services/beatmapHunts.ts -> startPlacementExam()
- services/beatmapHunts.ts -> importPlacementExamScore()
- services/beatmapHunts.ts -> cashOutExam()
- services/beatmapHunts.ts -> expireExam()
- services/beatmapHunts.ts -> adminApproveFinalExam()

Administration:
- services/beatmapHunts.ts -> adminOverrideHuntTier()
- services/beatmapHunts.ts -> adminSetPlayerRank()
- services/beatmapHunts.ts -> adminApproveFinalExam()
- services/guildProgression.ts -> approveGuildRankReview()
- services/guildProgression.ts -> rejectGuildRankReview()

## 48. Summary

The Adventurer Guild is currently a self-contained system:

Guild registration
  -> Guild Rank + Guild EXP
  -> Beatmap Hunts
  -> DZP escrow/payout
  -> Hunt attempts
  -> rank-multiplied EXP changes
  -> hard rank gates
  -> 24-hour demotion grace
  -> family gate reset when a family boundary is crossed

and separately:

One-time Placement Exam
  -> six sequential tests
  -> milestone rank/DZP rewards
  -> Test 6 administrator review
  -> Orichalcum or Adamantite

The implementation already has:
- persistent progression
- EXP auditing
- score ownership verification
- configurable rank rules
- configurable Hunt tiers
- Hunt escrow
- loans
- moderation
- notifications
- administrator controls
- transactional/concurrency protections

The canonical Guild progression economy is now implemented: per-rank EXP multipliers, hunt-specific event values, failed-placement penalties, top-ten placement rewards, rank thresholds, hard gates, 24-hour demotion grace, family gate resets, promotion notifications, and the Adamantite Tribunal workflow.

## 49. Canonical promotion gates

The minimum EXP threshold is necessary but not sufficient. `services/guildProgression.ts -> maybePromoteGuildPlayer()` evaluates the gate for the next rank before changing the player's rank.

### IRON → COPPER

Requirement: 3 qualified `BEATMAP_CHALLENGE` Hunts.

### COPPER → SILVER — The Rival's Blood

Requirement: 2 qualified Target Hunts, where the Hunt type is `BEAT_MY_SCORE` or `SNIPE_SCORE`.

When this gate is being redone after a Silver→Copper family-boundary demotion, only qualifying evidence at or after `family_gate_reset_at` is counted.

### SILVER → GOLD — The Flawless Streak

Requirement: 5 consecutive qualified `ADVANCED` Hunt attempts. Any non-qualifying attempt breaks the current streak; this includes an attempt recorded with a Terrible Attempt penalty.

### GOLD → PLATINUM — The Veteran's Ledger

Beginner portfolio:
- 2 qualified Target Hunts.
- 2 qualified `BEATMAP_CHALLENGE` Hunts, including at least 1 Top-3 placement.

Advanced portfolio:
- 4 qualified Target Hunts, exactly 2 `BEAT_MY_SCORE` and 2 `SNIPE_SCORE` for the required target count.
- 2 qualified `BEATMAP_CHALLENGE` Hunts, including at least 1 first-place finish, 1 Top-3 finish, and 1 Top-5 finish.

The first-place result may also satisfy the Top-3 and Top-5 placement conditions because those are placement bands over the same portfolio.

### PLATINUM → MITHRIL — The Ironclad Contract

Requirement: 3 qualified `ELITE` Hunts whose requirements explicitly enforce `exactMods=true`.

### MITHRIL → ORICHALCUM — The Master's Resume

Advanced portfolio:
- 3 qualified Target Hunts.
- 2 qualified `BEATMAP_CHALLENGE` Hunts, including at least 1 first-place finish.

Elite portfolio:
- 4 qualified Target Hunts, exactly 2 `BEAT_MY_SCORE` and 2 `SNIPE_SCORE`.
- 3 qualified `BEATMAP_CHALLENGE` Hunts, including at least 1 first-place finish.

After an Orichalcum→Mithril family-boundary demotion, all resume evidence for the Orichalcum gate must be earned after `family_gate_reset_at`.

### ORICHALCUM → ADAMANTITE — The Apex Predator

All of the following are required:
1. 3 wins in `LEGENDARY_MASTER` Target Hunts.
2. At least 1 player-posted `LEGENDARY_MASTER` `BEAT_MY_SCORE` Hunt that expires without a qualifying winner, resulting in the existing `guild_hunt_refund` settlement path.
3. 50,000 Guild EXP and current Orichalcum rank.
4. A `PENDING_REVIEW` Guild rank review approved by Guild administration.

The normal progression path creates the review request instead of auto-promoting to Adamantite. The Tribunal rechecks the current rank, EXP threshold, and gate evidence before approval.

## 50. Promotion multiplier timing

The multiplier is determined from the rank held when the EXP event is created, not the rank that may result from that event. For example, a +75 base qualifying Beatmap Challenge attempt at Copper creates +105 EXP; if that pushes the player to the Silver threshold and the Silver gate passes, the player is then promoted. Future events use Silver's 2.0x multiplier.

This timing is intentional and is visible in `guild_exp_events.base_exp`, `guild_exp_events.rank_multiplier`, `guild_exp_events.rank_at_event`, and `guild_exp_events.delta_exp`.

## 51. First-time onboarding and identity

The Guild onboarding flow is mandatory for new Guild users and is persisted on `user_guild_profiles`.

Flow:
1. Guild briefing explains the eight ranks, four families, economy, mod requirements, and Terrible Attempt risk.
2. The user chooses an Adventurer Name, independent from the osu! username.
3. The Crossroads offers `IRON` or the one-time six-test Placement Exam.
4. The user selects one of four starting kingdoms.
5. The onboarding record is marked complete and the selected kingdom becomes the user's home Guild.

Relevant code:
- `src/components/platform/guild/GuildWelcomeModal.tsx`
- `server/src/services/beatmapHunts.ts -> completeGuildOnboarding()`
- `server/src/repos/guild.ts -> completeOnboarding()`
- `server/migrations/045_guild_kingdoms_onboarding.sql`

## 52. Four kingdoms and isolated Guild access

The canonical kingdom keys are:
- `RE_ESTIZE` — Re-Estize Kingdom.
- `BAHARUTH` — Baharuth Empire.
- `SORCERER_KINGDOM` — The Sorcerer Kingdom / E-Rantel.
- `ROBLE_HOLY_KINGDOM` — Roble Holy Kingdom.

Kingdom lore is stored in `guild_kingdoms`. Hunts are tagged with their kingdom, and the normal Hunt board only returns Hunts belonging to the player's current kingdom.

Standard travel:
- configurable DZP cost, currently seeded at 500 DZP;
- exactly 8 hours in transit;
- the Guild board is sealed during transit;
- arrival starts a 2-month migration cooldown.

Relevant code:
- `server/src/services/beatmapHunts.ts -> travelToKingdom()`
- `server/src/repos/guild.ts -> startTravel()` / `completeTravel()`
- `server/src/routes/beatmapHunts.ts` board access checks
- `src/components/platform/guild/GuildPage.tsx` kingdom/travel panel

## 53. Adventurer Parties

Parties unlock at the Elite Family: Platinum, Mithril, Orichalcum, and Adamantite.

Party rules:
- persistent party with a designated leader;
- only the leader accepts a Guild-supplied Party Quest template;
- at least 2 members must qualify for the Party Quest to succeed;
- success increases the template's base EXP by 25%;
- each non-participating member receives 5% of the total gained EXP;
- qualifying members split the remaining EXP proportionally by contribution;
- active submissions are checked against the submitting member's own qualifying Hunt attempt.

Relevant code:
- `server/src/domain/guildParty.ts -> calculatePartyExpShares()`
- `server/src/services/guildParties.ts`
- `server/src/repos/guildParties.ts`
- `src/components/platform/guild/GuildPartyPanel.tsx`
- `server/migrations/046_guild_parties.sql`
- `server/migrations/050_guild_party_quest_templates.sql`

## 54. Theatrical promotion sequence

Every normal rank promotion creates a `GUILD_RANK_ADJUSTED` notification with `payload.type = PROMOTION`. The Guild page opens `GuildPromotionModal` for the unread notification and marks it read when the adventurer accepts the new rank.

The modal contains the canonical seven rank-promotion speeches and rank-specific visual treatments from the Guild blueprint, using the existing badge assets and reduced-motion support.

Relevant code:
- `src/components/platform/guild/GuildPromotionModal.tsx`
- `src/components/platform/guild/GuildPage.tsx`
- `src/components/platform/guild/guildHall.css`
- `server/src/services/guildProgression.ts -> maybePromoteGuildPlayer()`

## 55. Kingdoms War / Mascara

The Kingdoms War is isolated from normal Guild EXP and Hunt penalties.

Cycle:
- 20 days total;
- Registration days 1–6;
- Trump Card submission days 7–8;
- Guild Review days 9–10;
- Reveal day 11;
- Mascara days 12–20.

Roster:
- top 3 ranked adventurers from each kingdom;
- maximum 12 participants;
- if any kingdom has fewer than 2 eligible adventurers, the cycle is postponed.

Maps:
- 8 approved player submissions, exactly 2 per kingdom;
- 2 VIP maps supplied during Reveal;
- 10 total Throne Quests;
- Throne Quests do not apply normal Terrible Attempt EXP penalties.

Scoring:
`Total War Score = sum(Base EXP + Placement Bonus)`.

- Qualified and Attempt both receive +500 base score.
- No submission contributes 0.
- Placement bonuses begin at +10,000 for 1st, +7,000 for 2nd, +5,000 for 3rd, and +4,000 for 4th, then continue downward through 12th.
- Attempts remain below all Qualified submissions for placement and lose 30% of the placement bonus.

Score imports verify the linked osu! account, beatmap, passed state, and required mods. Active Mascara score synchronization runs from Guild maintenance and on participant login.

Relevant code:
- `server/src/services/guildWar.ts`
- `server/src/routes/guild.ts`
- `server/src/routes/guildAdmin.ts`
- `server/migrations/047_kingdoms_war.sql`
- `server/migrations/048_kingdoms_war_summons.sql`
- `server/migrations/049_kingdoms_war_kingdom_keys.sql`
- `src/components/platform/guild/GuildWarPanel.tsx`
- `server/test/guildWar.test.ts`

## 56. War Summons

During Mascara, a participant can activate War Summons to access the E-Rantel/Sorcerer Kingdom Guild board without DZP cost or the standard travel duration/cooldown.

The summons access window remains available through the end of the 20-day cycle plus 2 days. Access is participant-only and does not change the adventurer's permanent home kingdom.

Relevant code:
- `server/src/services/guildWar.ts -> useWarSummons()` / `hasWarSummons()`
- `server/src/routes/guild.ts -> /war/:cycleId/summons`
- `src/components/platform/guild/GuildWarPanel.tsx`

## 57. Database migrations for the complete blueprint

The Guild blueprint is now represented by migrations 039–050. The migration runner reports all 50 migrations applied locally with no checksum drift.

The later additions are intentionally split so already-applied migrations remain immutable:
- 045 — onboarding, kingdoms, travel, Hunt kingdom scoping.
- 046 — Party core tables.
- 047 — Kingdoms War core tables.
- 048 — War Summons state.
- 049 — canonical kingdom-key correction after the original war migration had already been applied.
- 050 — Party Quest templates and one-party-per-user enforcement.
