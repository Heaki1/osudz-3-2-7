import { pool } from '../db.js';
import { fetchScoreById, fetchUserRecentScoresForDifficulty } from './osu.js';

const WAR_SYNC_YIELD_MS = 50;

export const KINGDOMS = ['RE_ESTIZE', 'BAHARUTH', 'SORCERER_KINGDOM', 'ROBLE_HOLY_KINGDOM'] as const;
export type Kingdom = typeof KINGDOMS[number];
export type WarPhase = 'REGISTRATION' | 'TRUMP' | 'REVIEW' | 'REVEAL' | 'MASCARA' | 'POSTPONED' | 'COMPLETED';

const isKingdom = (value: unknown): value is Kingdom => typeof value === 'string' && KINGDOMS.includes(value as Kingdom);

export function phaseFor(start: Date, now = new Date()): WarPhase {
  const days = (now.getTime() - start.getTime()) / 86_400_000;
  if (days < 6) return 'REGISTRATION';
  if (days < 8) return 'TRUMP';
  if (days < 10) return 'REVIEW';
  if (days < 11) return 'REVEAL';
  if (days < 20) return 'MASCARA';
  return 'COMPLETED';
}

export function warScore(baseExp: 500 | 0, placement: number | null, category: 'QUALIFIED' | 'ATTEMPT', bonuses: Map<number, number>): number {
  if (placement === null) return baseExp;
  const bonus = bonuses.get(placement) ?? 0;
  return baseExp + (category === 'ATTEMPT' ? Math.floor(bonus * 0.7) : bonus);
}

export function warSummonsOpen(start: Date, ends: Date, now = new Date()) {
  const phase = phaseFor(start, now);
  return phase === 'MASCARA' || (phase === 'COMPLETED' && now.getTime() < ends.getTime() + 2 * 86_400_000);
}

export async function getActiveWar(now = new Date()) {
  const { rows } = await pool.query("SELECT * FROM guild_war_cycles WHERE status NOT IN ('COMPLETED','POSTPONED') ORDER BY starts_at DESC LIMIT 1");
  const cycle = rows[0];
  if (!cycle) return null;
  return { ...cycle, phase: phaseFor(new Date(cycle.starts_at), now) as WarPhase };
}

export async function useWarSummons(cycleId: string, userId: number) {
  const active = await getActiveWar();
  if (!active || active.id !== cycleId || active.phase !== 'MASCARA') {
    throw new Error('War Summons is only available during the Mascara Phase.');
  }
  const { rows } = await pool.query(
    `UPDATE guild_war_participants
        SET summoned_at = COALESCE(summoned_at, now()),
            summons_expires_at = $3
      WHERE cycle_id = $1 AND user_id = $2 AND active = true
      RETURNING cycle_id, user_id, kingdom, summoned_at, summons_expires_at`,
    [cycleId, userId, new Date(new Date(active.ends_at).getTime() + 2 * 86_400_000)],
  );
  if (!rows[0]) throw new Error('You are not a participant in this war.');
  return { ...rows[0], costDzp: 0, durationHours: 0 };
}

export async function hasWarSummons(cycleId: string, userId: number) {
  const { rows } = await pool.query(
    `SELECT cycle_id, user_id, kingdom, summoned_at, summons_expires_at
       FROM guild_war_participants
      WHERE cycle_id = $1 AND user_id = $2 AND active = true
        AND summoned_at IS NOT NULL AND summons_expires_at > now()`,
    [cycleId, userId],
  );
  return rows[0] ?? null;
}

export async function createWarCycle(startsAt: Date) {
  if (!Number.isFinite(startsAt.getTime())) throw new Error('Invalid war start time.');
  const { rows: previous } = await pool.query('SELECT starts_at FROM guild_war_cycles ORDER BY starts_at DESC LIMIT 1');
  if (previous[0]) {
    const earliest = new Date(previous[0].starts_at);
    earliest.setMonth(earliest.getMonth() + 2);
    if (startsAt.getTime() < earliest.getTime()) throw new Error('Kingdoms War cycles must be at least two months apart.');
  }
  const id = crypto.randomUUID();
  const endsAt = new Date(startsAt.getTime() + 20 * 86_400_000);
  const result = await pool.query(
    "INSERT INTO guild_war_cycles (id, starts_at, ends_at) VALUES ($1,$2,$3) RETURNING *",
    [id, startsAt, endsAt],
  );
  return result.rows[0];
}

export async function setKingdom(userId: number, kingdom: Kingdom) {
  if (!isKingdom(kingdom)) throw new Error('Invalid kingdom.');
  const { rows } = await pool.query(
    "UPDATE user_guild_profiles SET kingdom=$2, updated_at=now() WHERE user_id=$1 AND registration_status='ACTIVE' RETURNING user_id,kingdom",
    [userId, kingdom],
  );
  if (!rows[0]) throw new Error('Active Guild profile not found.');
  return rows[0];
}

export async function selectTopRoster(cycleId: string): Promise<{ postponed: boolean; counts: Record<Kingdom, number> }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = {} as Record<Kingdom, number>;
    for (const kingdom of KINGDOMS) {
      const { rows } = await client.query(
        `SELECT p.user_id, p.kingdom, p.guild_rank, p.guild_exp,
                row_number() OVER (ORDER BY r.rank_order DESC, p.guild_exp DESC, p.user_id ASC) AS roster_rank
           FROM user_guild_profiles p
           JOIN guild_rank_definitions r ON r.rank = p.guild_rank
          WHERE p.registration_status = 'ACTIVE' AND p.kingdom = $1
          ORDER BY r.rank_order DESC, p.guild_exp DESC, p.user_id ASC
          LIMIT 3`, [kingdom],
      );
      counts[kingdom] = rows.length;
      for (const row of rows) {
        await client.query(
          `INSERT INTO guild_war_participants (cycle_id,user_id,kingdom,roster_rank,guild_rank,guild_exp)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cycle_id,user_id) DO UPDATE SET kingdom=EXCLUDED.kingdom,roster_rank=EXCLUDED.roster_rank,guild_rank=EXCLUDED.guild_rank,guild_exp=EXCLUDED.guild_exp,active=true`,
          [cycleId, row.user_id, kingdom, Number(row.roster_rank), row.guild_rank, Number(row.guild_exp)],
        );
      }
    }
    const postponed = KINGDOMS.some((kingdom) => counts[kingdom] < 2);
    await client.query("UPDATE guild_war_cycles SET status = $2, postponed_reason = $3 WHERE id = $1", [cycleId, postponed ? 'POSTPONED' : 'REGISTRATION', postponed ? 'Every kingdom must have at least 2 eligible top adventurers.' : null]);
    await client.query('COMMIT');
    return { postponed, counts };
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}

export async function getWarBoard(cycleId: string, viewerUserId?: number) {
  const { rows: cycleRows } = await pool.query("SELECT * FROM guild_war_cycles WHERE id = $1", [cycleId]);
  if (!cycleRows[0]) return null;
  const { rows: participants } = await pool.query(
    `SELECT p.*, u.username, u.id AS user_id FROM guild_war_participants p JOIN users u ON u.id=p.user_id WHERE p.cycle_id=$1 AND p.active=true ORDER BY p.kingdom,p.roster_rank`, [cycleId],
  );
  const { rows: quests } = await pool.query(
    `SELECT q.id,q.quest_number,m.difficulty_id,m.beatmap_id,m.beatmapset_id,m.mod_requirement,m.challenge_requirement,m.source,m.kingdom
       FROM guild_war_quests q JOIN guild_war_maps m ON m.id=q.map_id WHERE q.cycle_id=$1 ORDER BY q.quest_number`, [cycleId],
  );
  const { rows: attempts } = await pool.query(
    `SELECT a.*, u.username, p.kingdom FROM guild_war_attempts a JOIN users u ON u.id=a.user_id JOIN guild_war_participants p ON p.cycle_id=a.cycle_id AND p.user_id=a.user_id WHERE a.cycle_id=$1 ORDER BY a.quest_id,a.category DESC,a.score DESC`, [cycleId],
  );
  const { rows: leaderboard } = await pool.query(
    `SELECT p.kingdom,p.roster_rank,p.user_id,u.username,p.guild_rank,
            COUNT(a.id)::int AS quests_played,
            COUNT(a.id) FILTER (WHERE a.category='QUALIFIED')::int AS quests_qualified,
            COALESCE(SUM(a.war_score),0)::int AS total_war_score
       FROM guild_war_participants p
       JOIN users u ON u.id=p.user_id
       LEFT JOIN guild_war_attempts a ON a.cycle_id=p.cycle_id AND a.user_id=p.user_id
      WHERE p.cycle_id=$1 AND p.active=true
      GROUP BY p.kingdom,p.roster_rank,p.user_id,u.username,p.guild_rank
      ORDER BY total_war_score DESC,quests_qualified DESC,quests_played DESC,p.user_id ASC`, [cycleId],
  );
  const phase = phaseFor(new Date(cycleRows[0].starts_at));
  const viewer = viewerUserId == null ? null : participants.find((p) => Number(p.user_id) === viewerUserId);
  return {
    cycle: {
      ...cycleRows[0],
      phase,
      summonsOpen: warSummonsOpen(new Date(cycleRows[0].starts_at), new Date(cycleRows[0].ends_at)),
    },
    participants,
    quests,
    attempts,
    leaderboard,
    viewerIsParticipant: viewer != null,
    viewerSummonsActive: viewer?.summoned_at != null && viewer.summons_expires_at != null && new Date(viewer.summons_expires_at).getTime() > Date.now(),
  };
}

export async function submitTrumpCard(cycleId: string, userId: number, input: { beatmapId: number; beatmapsetId?: number | null; difficultyId: number; modRequirement?: string; notes?: string }) {
  const { rows: participant } = await pool.query("SELECT kingdom FROM guild_war_participants WHERE cycle_id=$1 AND user_id=$2 AND active=true", [cycleId, userId]);
  if (!participant[0]) throw new Error('You are not a participant in this war.');
  const { rows } = await pool.query(
    `INSERT INTO guild_war_trump_cards (id,cycle_id,user_id,kingdom,beatmap_id,beatmapset_id,difficulty_id,mod_requirement,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (cycle_id,user_id) DO UPDATE SET beatmap_id=EXCLUDED.beatmap_id,beatmapset_id=EXCLUDED.beatmapset_id,difficulty_id=EXCLUDED.difficulty_id,mod_requirement=EXCLUDED.mod_requirement,notes=EXCLUDED.notes,status='SUBMITTED',submitted_at=now(),reviewed_by=NULL,reviewed_at=NULL,review_note=NULL
     RETURNING *`, [crypto.randomUUID(),cycleId,userId,participant[0].kingdom,input.beatmapId,input.beatmapsetId ?? null,input.difficultyId,input.modRequirement ?? 'FM',input.notes ?? '']);
  return rows[0];
}

export async function syncWarScoresForUser(cycleId: string, userId: number) {
  const { rows: participant } = await pool.query("SELECT 1 FROM guild_war_participants WHERE cycle_id=$1 AND user_id=$2 AND active=true", [cycleId,userId]);
  if (!participant[0]) return 0;
  const { rows: users } = await pool.query('SELECT osu_id FROM users WHERE id=$1', [userId]);
  const osuId = Number(users[0]?.osu_id);
  if (!Number.isFinite(osuId)) return 0;
  const { rows: quests } = await pool.query(`SELECT q.id,q.quest_number,m.difficulty_id,m.beatmap_id,m.mod_requirement,m.challenge_requirement FROM guild_war_quests q JOIN guild_war_maps m ON m.id=q.map_id WHERE q.cycle_id=$1`, [cycleId]);
  let imported = 0;
  for (const quest of quests) {
    const scores = await fetchUserRecentScoresForDifficulty(Number(quest.difficulty_id), osuId);
    const candidate = scores
      .filter((score) => score.beatmapId === Number(quest.beatmap_id) && score.passed && modsMatch(score.mods, String(quest.mod_requirement)))
      .sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || b.maxCombo - a.maxCombo)[0];
    if (!candidate) continue;
    const detail = await fetchScoreById(candidate.osuScoreId);
    if (detail.userId !== osuId || detail.beatmapId !== Number(quest.beatmap_id) || !detail.passed) continue;
    const category = qualifiesWar(detail, quest.challenge_requirement) ? 'QUALIFIED' : 'ATTEMPT';
    await pool.query(
      `INSERT INTO guild_war_attempts (id,cycle_id,quest_id,user_id,osu_score_id,score,accuracy,max_combo,misses,mods,pp,passed,category,ended_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (quest_id,user_id) DO UPDATE SET osu_score_id=EXCLUDED.osu_score_id,score=EXCLUDED.score,accuracy=EXCLUDED.accuracy,max_combo=EXCLUDED.max_combo,misses=EXCLUDED.misses,mods=EXCLUDED.mods,pp=EXCLUDED.pp,passed=EXCLUDED.passed,category=EXCLUDED.category,ended_at=EXCLUDED.ended_at,imported_at=now()`,
      [crypto.randomUUID(),cycleId,quest.id,userId,detail.osuScoreId,detail.score,detail.accuracy,detail.maxCombo,detail.misses,detail.mods,detail.pp,detail.passed,category,detail.endedAt],
    );
    imported++;
    await yieldToEventLoop();
  }
  return imported;
}

export async function publishWarMaps(cycleId: string, vipMaps: Array<{ difficultyId: number; beatmapId: number; beatmapsetId?: number | null; modRequirement?: string; challengeRequirement?: Record<string, unknown> }>) {
  if (vipMaps.length !== 2) throw new Error('Exactly 2 VIP maps are required.');
  const { rows: cycle } = await pool.query('SELECT starts_at FROM guild_war_cycles WHERE id=$1', [cycleId]);
  if (!cycle[0] || phaseFor(new Date(cycle[0].starts_at)) !== 'REVEAL') throw new Error('Maps can only be revealed on Day 11.');
  const { rows: approved } = await pool.query("SELECT * FROM guild_war_trump_cards WHERE cycle_id=$1 AND status='APPROVED' ORDER BY kingdom, submitted_at, id", [cycleId]);
  if (approved.length !== 8) throw new Error('Exactly 8 approved player trump cards are required.');
  const counts = new Map<string, number>();
  for (const card of approved) counts.set(card.kingdom, (counts.get(card.kingdom) ?? 0) + 1);
  if (KINGDOMS.some((kingdom) => counts.get(kingdom) !== 2)) throw new Error('Exactly 2 approved player maps are required from every kingdom.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM guild_war_quests WHERE cycle_id=$1', [cycleId]);
    await client.query('DELETE FROM guild_war_maps WHERE cycle_id=$1', [cycleId]);
    const maps: string[] = [];
    let slot = 1;
    for (const card of approved) {
      const id = crypto.randomUUID(); maps.push(id);
      await client.query(`INSERT INTO guild_war_maps (id,cycle_id,slot,source,kingdom,difficulty_id,beatmap_id,beatmapset_id,mod_requirement,challenge_requirement,created_by) VALUES ($1,$2,$3,'PLAYER',$4,$5,$6,$7,$8,'{}',$9)`, [id,cycleId,slot++,card.kingdom,card.difficulty_id,card.beatmap_id,card.beatmapset_id,card.mod_requirement,card.reviewed_by]);
    }
    for (const vip of vipMaps) {
      const id = crypto.randomUUID(); maps.push(id);
      await client.query(`INSERT INTO guild_war_maps (id,cycle_id,slot,source,difficulty_id,beatmap_id,beatmapset_id,mod_requirement,challenge_requirement) VALUES ($1,$2,$3,'VIP',$4,$5,$6,$7,$8)`, [id,cycleId,slot++,vip.difficultyId,vip.beatmapId,vip.beatmapsetId ?? null,vip.modRequirement ?? 'FM',JSON.stringify(vip.challengeRequirement ?? {})]);
    }
    for (let i=0;i<maps.length;i++) await client.query('INSERT INTO guild_war_quests (id,cycle_id,map_id,quest_number,no_penalty) VALUES ($1,$2,$3,$4,true)', [crypto.randomUUID(),cycleId,maps[i],i+1]);
    await client.query("UPDATE guild_war_cycles SET status='MASCARA', revealed_at=now() WHERE id=$1", [cycleId]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function reviewTrumpCard(cycleId: string, cardId: string, adminUserId: number, approved: boolean, note: string) {
  const { rows } = await pool.query(
    "UPDATE guild_war_trump_cards SET status=$3,reviewed_by=$4,reviewed_at=now(),review_note=$5 WHERE id=$1 AND cycle_id=$2 AND status='SUBMITTED' RETURNING *",
    [cardId,cycleId,approved ? 'APPROVED' : 'REJECTED',adminUserId,note],
  );
  if (!rows[0]) throw new Error('Trump card is unavailable for review.');
  return rows[0];
}

export async function syncActiveWarScores() {
  const active = await getActiveWar();
  if (!active || active.phase !== 'MASCARA') return 0;
  const { rows: claimed } = await pool.query(
    `UPDATE guild_war_cycles
        SET last_score_sync_at = now()
      WHERE id = $1
        AND (last_score_sync_at IS NULL OR last_score_sync_at <= now() - interval '12 hours')
      RETURNING id`,
    [active.id],
  );
  if (!claimed[0]) return 0;

  const { rows } = await pool.query('SELECT user_id FROM guild_war_participants WHERE cycle_id=$1 AND active=true', [active.id]);
  let imported = 0;
  for (const row of rows) {
    try { imported += await syncWarScoresForUser(active.id, Number(row.user_id)); } catch (error) { console.error('[guild-war] score sync failed', row.user_id, error instanceof Error ? error.message : error); }
    await yieldToEventLoop();
  }
  await recalculateWarScore(active.id);
  return imported;
}

export async function recalculateWarScore(cycleId: string) {
  const { rows: bonusesRows } = await pool.query('SELECT placement, bonus FROM guild_war_placement_bonuses');
  const bonuses = new Map<number, number>(bonusesRows.map((r) => [Number(r.placement), Number(r.bonus)]));
  const { rows: quests } = await pool.query('SELECT id FROM guild_war_quests WHERE cycle_id=$1', [cycleId]);
  for (const quest of quests) {
    const { rows } = await pool.query(`SELECT id,category FROM guild_war_attempts WHERE quest_id=$1 ORDER BY CASE WHEN category='QUALIFIED' THEN 0 ELSE 1 END, score DESC, accuracy DESC, user_id ASC`, [quest.id]);
    for (let i=0;i<rows.length;i++) {
      const placement=i+1; const category=rows[i].category as 'QUALIFIED'|'ATTEMPT';
      await pool.query('UPDATE guild_war_attempts SET placement=$2,war_score=$3 WHERE id=$1',[rows[i].id,placement,warScore(500,placement,category,bonuses)]);
    }
  }
}

function modsMatch(actual: string, required: string) {
  const r = required.toUpperCase();
  if (r === 'FM' || r === 'NM' || r === '') return true;
  return actual.toUpperCase() === r;
}

function qualifiesWar(score: { accuracy: number; maxCombo: number; misses: number }, requirements: unknown) {
  const r = (requirements && typeof requirements === 'object') ? requirements as Record<string, unknown> : {};
  if (typeof r.minAccuracy === 'number' && score.accuracy < r.minAccuracy) return false;
  if (typeof r.accuracy === 'number' && score.accuracy < r.accuracy) return false;
  if (typeof r.minCombo === 'number' && score.maxCombo < r.minCombo) return false;
  if (typeof r.combo === 'number' && score.maxCombo < r.combo) return false;
  if (typeof r.maxMisses === 'number' && score.misses > r.maxMisses) return false;
  if (r.fullCombo === true && score.misses !== 0) return false;
  return true;
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, WAR_SYNC_YIELD_MS));
}
