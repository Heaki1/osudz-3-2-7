import * as hunts from '../repos/beatmapHunts.js';
import * as guild from '../repos/guild.js';
import { pool } from '../db.js';
import type { PoolClient } from 'pg';
import { expireExam, expireHunt, reconcileDueLoans } from './beatmapHunts.js';
import { processGuildDemotionWarnings } from './guildProgression.js';
import { syncActiveWarScores } from './guildWar.js';

const GUILD_MAINTENANCE_LOCK_KEY = 1001;
const MAINTENANCE_YIELD_MS = 50;
let running = false;

export async function runGuildMaintenance() {
  if (running) return;
  running = true;
  let client: PoolClient | null = null;
  let acquired = false;
  try {
    client = await pool.connect();
    const { rows } = await client.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [GUILD_MAINTENANCE_LOCK_KEY],
    );
    acquired = rows[0]?.acquired === true;
    if (!acquired) return;

    const expired = await hunts.listExpiredActiveHunts();
    for (const hunt of expired) {
      try {
        await expireHunt(hunt.id);
      } catch (error) {
        console.error('[guild] failed to settle expired hunt', hunt.id, error);
      }
      await yieldToEventLoop();
    }
    const expiredExams = await guild.listExpiredExams();
    for (const exam of expiredExams) {
      try {
        await expireExam(exam.user_id);
      } catch (error) {
        console.error('[guild] failed to settle expired placement exam', exam.user_id, error);
      }
      await yieldToEventLoop();
    }
    try {
      await reconcileDueLoans();
    } catch (error) {
      console.error('[guild] failed to reconcile due loans', error);
    }
    try {
      await processGuildDemotionWarnings();
    } catch (error) {
      console.error('[guild] failed to process rank demotion warnings', error);
    }
    try {
      await syncActiveWarScores();
    } catch (error) {
      console.error('[guild] failed to sync Kingdoms War scores', error);
    }
  } finally {
    if (acquired && client) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [GUILD_MAINTENANCE_LOCK_KEY]);
      } catch (error) {
        console.error('[guild] failed to release maintenance advisory lock', error);
      }
    }
    client?.release();
    running = false;
  }
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, MAINTENANCE_YIELD_MS));
}
