import { pool } from '../db.js';
import type { PoolClient } from 'pg';
import { rankFamily } from '../domain/beatmapHunts/rules.js';
import { calculatePartyExpShares } from '../domain/guildParty.js';
import * as guild from '../repos/guild.js';
import * as parties from '../repos/guildParties.js';
import { maybePromoteGuildPlayer } from './guildProgression.js';

export class GuildPartyRuleError extends Error {}

export async function getPartyDashboard(userId: number) {
  const profile = await guild.getGuildProfile(userId);
  if (profile.registration_status !== 'ACTIVE') return null;
  const party = await parties.findPartyForUser(userId);
  if (!party) return { party: null, templates: [] };
  return { party: { ...party, members: await parties.listMembers(party.id) }, templates: await parties.listPartyQuestTemplates() };
}

async function requireEliteMember(userId: number, client: PoolClient | typeof pool = pool) {
  const profile = await guild.getGuildProfile(userId, client);
  if (profile.registration_status !== 'ACTIVE') throw new GuildPartyRuleError('Register with the Adventurer Guild before joining a Party.');
  const family = rankFamily(profile.guild_rank);
  if (family !== 'ELITE' && family !== 'LEGENDARY_MASTER') {
    throw new GuildPartyRuleError('Adventurer Parties unlock at the Elite Family (Platinum/Mithril).');
  }
  return profile;
}

export async function createAdventurerParty(userId: number, name: string) {
  if (!name.trim()) throw new GuildPartyRuleError('Party name is required.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await requireEliteMember(userId, client);
    if (await parties.findPartyForUser(userId, client)) throw new GuildPartyRuleError('You are already in an Adventurer Party.');
    const id = await parties.createParty(userId, name.trim().slice(0, 80), client);
    await client.query('COMMIT');
    return { id, name: name.trim().slice(0, 80), leaderUserId: userId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function joinAdventurerParty(userId: number, partyId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await requireEliteMember(userId, client);
    if (await parties.findPartyForUser(userId, client)) throw new GuildPartyRuleError('You are already in an Adventurer Party.');
    const { rows } = await client.query('SELECT id FROM guild_parties WHERE id = $1', [partyId]);
    if (!rows[0]) throw new GuildPartyRuleError('Party not found.');
    await parties.addMember(partyId, userId, client);
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function acceptPartyQuest(userId: number, partyId: string, templateId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await requireEliteMember(userId, client);
    const party = await parties.findPartyForUser(userId, client);
    if (!party || party.id !== partyId || party.leader_user_id !== userId) throw new GuildPartyRuleError('Only the Party Leader can accept a Party Quest for this party.');
    const template = await parties.findPartyQuestTemplate(templateId, client);
    if (!template) throw new GuildPartyRuleError('That Party Quest is no longer available.');
    const existing = await client.query("SELECT id FROM guild_party_quests WHERE party_id = $1 AND status = 'ACCEPTED' LIMIT 1 FOR UPDATE", [partyId]);
    if (existing.rows[0]) throw new GuildPartyRuleError('This party already has an active Party Quest.');
    const members = await parties.listMembers(partyId, client);
    if (members.length < 2) throw new GuildPartyRuleError('A Party Quest requires at least two party members.');
    const id = await parties.createPartyQuest(partyId, template.id, userId, Number(template.exp_bounty), client);
    await client.query('COMMIT');
    return { id, templateId: template.id, title: template.title, expBounty: Number(template.exp_bounty) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function resolvePartyQuest(userId: number, partyQuestId: string, results: Array<{ userId: number; attemptId?: string | null; outcome: 'ACTIVE' | 'LEECH' }>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quest = await parties.lockPartyQuest(partyQuestId, client);
    if (!quest || quest.status !== 'ACCEPTED') throw new GuildPartyRuleError('This Party Quest is no longer active.');
    await requireEliteMember(userId, client);
    const party = await parties.findPartyForUser(userId, client);
    if (!party || party.id !== quest.party_id || party.leader_user_id !== userId) throw new GuildPartyRuleError('Only the Party Leader can finalize a Party Quest.');
    const members = await parties.listQuestMembers(partyQuestId, client);
    const memberIds = new Set(members.map((member) => Number(member.user_id)));
    if (results.some((result) => !memberIds.has(result.userId))) throw new GuildPartyRuleError('Every Party Quest result must belong to the party.');

    for (const member of members) {
      const result = results.find((candidate) => candidate.userId === Number(member.user_id));
      if (!result || result.outcome === 'LEECH') {
        await parties.setQuestMemberResult(partyQuestId, Number(member.user_id), 'LEECH', 0, null, client);
        continue;
      }
      if (!result.attemptId) throw new GuildPartyRuleError('An active Party Quest participant must provide a qualifying attempt.');
      const attempt = await client.query('SELECT id, user_id, qualifies, score FROM beatmap_hunt_attempts WHERE id = $1 AND deleted_at IS NULL', [result.attemptId]);
      const row = attempt.rows[0];
      if (!row || Number(row.user_id) !== Number(member.user_id) || row.qualifies !== true) throw new GuildPartyRuleError('Each active Party Quest participant must reference their own qualifying attempt.');
      await parties.setQuestMemberResult(partyQuestId, Number(member.user_id), 'ACTIVE', Number(row.score), result.attemptId, client);
    }

    const finalized = await parties.listQuestMembers(partyQuestId, client);
    const activeCount = finalized.filter((member) => member.outcome === 'ACTIVE').length;
    if (activeCount < 2) {
      await parties.completePartyQuest(partyQuestId, 'FAILED', client);
      await client.query('COMMIT');
      return { status: 'FAILED', shares: [] };
    }

    const shares = calculatePartyExpShares(Number(quest.exp_bounty), finalized.map((member) => ({
      userId: Number(member.user_id),
      outcome: member.outcome,
      contribution: Number(member.contribution),
    })));
    for (const share of shares) {
      const application = await guild.addGuildExp(share.userId, share.exp, share.outcome === 'ACTIVE' ? 'Party Quest active share' : 'Party Quest passive leech share', null, null, client, 'PARTY_QUEST');
      await parties.awardQuestMember(partyQuestId, share.userId, application.appliedDelta, client);
      await maybePromoteGuildPlayer(share.userId, client);
    }
    await parties.completePartyQuest(partyQuestId, 'COMPLETED', client);
    await client.query('COMMIT');
    return { status: 'COMPLETED', shares };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
