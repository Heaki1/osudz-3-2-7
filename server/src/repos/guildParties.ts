import type { PoolClient } from 'pg';
import { pool } from '../db.js';

export async function createParty(leaderUserId: number, name: string, client: PoolClient) {
  const id = cryptoRandomUuid();
  await client.query('INSERT INTO guild_parties (id, leader_user_id, name) VALUES ($1, $2, $3)', [id, leaderUserId, name]);
  await client.query('INSERT INTO guild_party_members (party_id, user_id) VALUES ($1, $2)', [id, leaderUserId]);
  return id;
}

export async function findPartyForUser(userId: number, client: PoolClient | typeof pool = pool) {
  const { rows } = await client.query(
    "SELECT p.id, p.leader_user_id, p.name, p.created_at, p.updated_at FROM guild_parties p JOIN guild_party_members m ON m.party_id = p.id WHERE m.user_id = $1 ORDER BY p.created_at DESC LIMIT 1",
    [userId],
  );
  return rows[0] ?? null;
}

export async function listPartyQuestTemplates(client: PoolClient | typeof pool = pool) {
  const { rows } = await client.query("SELECT id, title, exp_bounty, enabled FROM guild_party_quest_templates WHERE enabled = true ORDER BY exp_bounty DESC, title ASC");
  return rows;
}

export async function addMember(partyId: string, userId: number, client: PoolClient) {
  await client.query('INSERT INTO guild_party_members (party_id, user_id) VALUES ($1, $2)', [partyId, userId]);
}

export async function removeMember(partyId: string, userId: number, client: PoolClient) {
  await client.query('DELETE FROM guild_party_members WHERE party_id = $1 AND user_id = $2', [partyId, userId]);
}

export async function listMembers(partyId: string, client: PoolClient | typeof pool = pool) {
  const { rows } = await client.query(
    "SELECT m.user_id, u.username, m.joined_at FROM guild_party_members m JOIN users u ON u.id = m.user_id WHERE m.party_id = $1 ORDER BY m.joined_at ASC, m.user_id ASC",
    [partyId],
  );
  return rows;
}

export async function lockPartyQuest(id: string, client: PoolClient) {
  const { rows } = await client.query('SELECT id, party_id, template_id, accepted_by, exp_bounty, status, accepted_at, completed_at FROM guild_party_quests WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] ?? null;
}

export async function findPartyQuestTemplate(id: string, client: PoolClient) {
  const { rows } = await client.query('SELECT id, title, exp_bounty, enabled FROM guild_party_quest_templates WHERE id = $1 AND enabled = true', [id]);
  return rows[0] ?? null;
}

export async function createPartyQuestTemplate(title: string, expBounty: number, client: PoolClient) {
  const id = cryptoRandomUuid();
  await client.query('INSERT INTO guild_party_quest_templates (id, title, exp_bounty) VALUES ($1, $2, $3)', [id, title, expBounty]);
  return id;
}

export async function createPartyQuest(partyId: string, templateId: string, acceptedBy: number, expBounty: number, client: PoolClient) {
  const id = cryptoRandomUuid();
  await client.query('INSERT INTO guild_party_quests (id, party_id, template_id, accepted_by, exp_bounty) VALUES ($1, $2, $3, $4, $5)', [id, partyId, templateId, acceptedBy, expBounty]);
  const members = await listMembers(partyId, client);
  for (const member of members) {
    await client.query('INSERT INTO guild_party_quest_members (party_quest_id, user_id, outcome) VALUES ($1, $2, \'LEECH\')', [id, member.user_id]);
  }
  return id;
}

export async function setQuestMemberResult(id: string, userId: number, outcome: 'ACTIVE' | 'LEECH', contribution: number, attemptId: string | null, client: PoolClient) {
  await client.query(
    'UPDATE guild_party_quest_members SET outcome = $3, contribution = $4, attempt_id = $5 WHERE party_quest_id = $1 AND user_id = $2',
    [id, userId, outcome, contribution, attemptId],
  );
}

export async function listQuestMembers(id: string, client: PoolClient) {
  const { rows } = await client.query('SELECT party_quest_id, user_id, outcome, contribution, exp_awarded, attempt_id FROM guild_party_quest_members WHERE party_quest_id = $1 ORDER BY user_id', [id]);
  return rows;
}

export async function awardQuestMember(id: string, userId: number, exp: number, client: PoolClient) {
  await client.query('UPDATE guild_party_quest_members SET exp_awarded = $3 WHERE party_quest_id = $1 AND user_id = $2', [id, userId, exp]);
}

export async function completePartyQuest(id: string, status: 'COMPLETED' | 'FAILED', client: PoolClient) {
  await client.query('UPDATE guild_party_quests SET status = $2, completed_at = now() WHERE id = $1', [id, status]);
}

function cryptoRandomUuid(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
