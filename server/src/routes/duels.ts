import express, { Router } from 'express';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { fetchBeatmap, fetchBeatmapsetArchive, fetchUserScoresForDifficulty, parseDifficultyId, ScoreNotFound, BeatmapNotFound } from '../services/osu.js';
import { acceptDuel, acceptRules, createDuel, getBalance, getDuel, hasAcceptedRules, listDuels, recordScore, setMockOpponent, setReplayPath, settleExpiredDuels, type DuelRow } from '../repos/duels.js';
const router=Router();
type DuelMeta = { beatmapsetId:number; coverUrl:string; previewUrl:string; mapper:string; bpm:number; lengthSeconds:number; cs:number|null; ar:number|null; od:number|null; hp:number|null; maxCombo:number|null; mapStatus:string; modeInt:number };
const beatmapMetaCache = new Map<number, { value:DuelMeta; expiresAt:number }>();
const dto=(d:DuelRow, meta?:DuelMeta)=>({id:d.id,status:d.status,challenger:d.challenger,challengerAvatar:d.challenger_avatar??undefined,opponent:d.mock_opponent?'ReplayTest':d.opponent??undefined,opponentAvatar:d.opponent_avatar??undefined,title:d.title,artist:d.artist,difficulty:d.difficulty_name,stars:Number(d.stars),mods:d.mods,requirement:d.requirement,stake:d.stake,endsAt:d.ends_at.toISOString(),challengerScore:d.challenger_score===null?undefined:Number(d.challenger_score),opponentScore:d.opponent_score===null?undefined:Number(d.opponent_score),challengerAccuracy:d.challenger_accuracy===null?undefined:Number(d.challenger_accuracy),opponentAccuracy:d.opponent_accuracy===null?undefined:Number(d.opponent_accuracy),challengerMisses:d.challenger_misses===null?undefined:Number(d.challenger_misses),opponentMisses:d.opponent_misses===null?undefined:Number(d.opponent_misses),challengerScoreId:d.challenger_score_id===null?undefined:Number(d.challenger_score_id),opponentScoreId:d.opponent_score_id===null?undefined:Number(d.opponent_score_id),difficultyId:Number(d.difficulty_id),beatmapsetId:meta?.beatmapsetId ?? (d.beatmapset_id===null?undefined:Number(d.beatmapset_id)),coverUrl:meta?.coverUrl,previewUrl:meta?.previewUrl,mapper:meta?.mapper,bpm:meta?.bpm,lengthSeconds:meta?.lengthSeconds,cs:meta?.cs,ar:meta?.ar,od:meta?.od,hp:meta?.hp,maxCombo:meta?.maxCombo,mapStatus:meta?.mapStatus,challengerUserId:d.challenger_user_id,opponentUserId:d.opponent_user_id??undefined,challengerReplayReady:!!d.challenger_replay_path,opponentReplayReady:!!d.opponent_replay_path});
async function duelDto(d:DuelRow) {
  if (d.beatmapset_id !== null) return dto(d);
  const cached = beatmapMetaCache.get(d.difficulty_id);
  if (cached && cached.expiresAt > Date.now()) return dto(d, cached.value);
  try {
    const b = await fetchBeatmap(d.difficulty_id);
    const value:DuelMeta = { beatmapsetId:b.beatmapsetId, coverUrl:b.coverUrl, previewUrl:b.previewUrl, mapper:b.mapper, bpm:b.bpm, lengthSeconds:b.lengthSeconds, cs:b.cs, ar:b.ar, od:b.od, hp:b.hp, maxCombo:b.maxCombo, mapStatus:b.mapStatus, modeInt:b.modeInt };
    beatmapMetaCache.set(d.difficulty_id, { value, expiresAt:Date.now()+10*60*1000 });
    return dto(d, value);
  } catch { return dto(d); }
}
router.get('/rules',requireAuth,async(req,res)=>res.json({accepted:await hasAcceptedRules(req.user!.id)}));
router.post('/rules/accept',requireAuth,async(req,res)=>{await acceptRules(req.user!.id);res.json({accepted:true});});
router.post('/lookup',requireAuth,async(req,res)=>{const url=typeof req.body?.url==='string'?req.body.url.trim():'';if(!url)return res.status(400).json({error:'Paste an osu! beatmap URL'});const difficultyId=parseDifficultyId(url);if(difficultyId===null)return res.status(400).json({error:'That link does not name a difficulty. Pick a difficulty on osu! and copy its URL.'});try{const b=await fetchBeatmap(difficultyId);if(b.modeInt!==0 && b.modeInt!==3)return res.status(422).json({error:'Duel challenges support osu!standard and osu!mania beatmaps only.'});res.json({difficultyId:b.difficultyId,beatmapsetId:b.beatmapsetId,title:b.title,artist:b.artist,mapper:b.mapper,difficultyName:b.difficultyName,coverUrl:b.coverUrl,previewUrl:b.previewUrl,stars:b.stars,bpm:b.bpm,lengthSeconds:b.lengthSeconds,modeInt:b.modeInt});}catch(err){if(err instanceof BeatmapNotFound)return res.status(404).json({error:'osu! has no beatmap difficulty with that id'});console.error('[duels] beatmap lookup failed',err);res.status(503).json({error:'Could not read that beatmap from osu!'});}});
router.get('/',optionalAuth,async(req,res)=>{try{await settleExpiredDuels();const [duels,balance]=await Promise.all([listDuels(req.user?.id),req.user?getBalance(req.user.id):Promise.resolve(0)]);res.json({duels:await Promise.all(duels.map(duelDto)),balance});}catch(err){console.error('[duels] list failed',err);res.status(503).json({error:'Duel data unavailable'});}});

const DUEL_REPLAY_DIR = path.resolve(process.cwd(), 'uploads', 'duel-replays');
const DUEL_REPLAY_MAX_BYTES = 25 * 1024 * 1024;
const replayUpload = multer({
  dest: DUEL_REPLAY_DIR,
  limits: { fileSize: DUEL_REPLAY_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const accepted = file.mimetype === 'application/octet-stream'
      || file.mimetype === 'application/x-osr'
      || file.originalname.toLowerCase().endsWith('.osr');
    if (!accepted) {
      callback(new Error('Replay must be an .osr file'));
      return;
    }
    callback(null, true);
  },
});

function runReplayUpload(req: express.Request, res: express.Response, next: express.NextFunction) {
  void mkdir(DUEL_REPLAY_DIR, { recursive: true }).then(() => {
    replayUpload.single('replay')(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Replay must be 25 MB or smaller' });
      }
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid replay upload' });
    });
  }).catch(next);
}

function parseOsrBeatmapHash(buffer: Buffer): string | null {
  let offset = 0;
  const readByte = () => buffer[offset++];
  const readInt32 = () => {
    if (offset + 4 > buffer.length) throw new Error('TRUNCATED_REPLAY');
    const value = buffer.readInt32LE(offset);
    offset += 4;
    return value;
  };
  const readString = () => {
    const marker = readByte();
    if (marker === 0) return '';
    if (marker !== 0x0b) throw new Error('INVALID_REPLAY');
    let value = 0;
    let shift = 0;
    while (true) {
      const b = readByte();
      if (b === undefined) throw new Error('TRUNCATED_REPLAY');
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw new Error('INVALID_REPLAY');
    }
    if (offset + value > buffer.length) throw new Error('TRUNCATED_REPLAY');
    const text = buffer.subarray(offset, offset + value).toString('utf8');
    offset += value;
    return text;
  };
  try {
    readByte();
    readInt32();
    return readString();
  } catch {
    return null;
  }
}

function parseOsrScoreHeader(buffer: Buffer) {
  let offset = 0;
  const readByte = () => buffer[offset++];
  const readShort = () => {
    if (offset + 2 > buffer.length) throw new Error('TRUNCATED_REPLAY');
    const value = buffer.readInt16LE(offset);
    offset += 2;
    return value;
  };
  const readInt32 = () => {
    if (offset + 4 > buffer.length) throw new Error('TRUNCATED_REPLAY');
    const value = buffer.readInt32LE(offset);
    offset += 4;
    return value;
  };
  const readInt64 = () => {
    if (offset + 8 > buffer.length) throw new Error('TRUNCATED_REPLAY');
    const value = buffer.readBigInt64LE(offset);
    offset += 8;
    return value;
  };
  const readUleb = () => {
    let value = 0;
    let shift = 0;
    while (true) {
      const b = readByte();
      if (b === undefined) throw new Error('TRUNCATED_REPLAY');
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return value;
      shift += 7;
      if (shift > 28) throw new Error('INVALID_REPLAY');
    }
  };
  const readString = () => {
    const marker = readByte();
    if (marker === 0) return '';
    if (marker !== 0x0b) throw new Error('INVALID_REPLAY');
    const length = readUleb();
    if (offset + length > buffer.length) throw new Error('TRUNCATED_REPLAY');
    const value = buffer.subarray(offset, offset + length).toString('utf8');
    offset += length;
    return value;
  };

  const mode = readByte();
  readInt32();
  const beatmapHash = readString();
  const username = readString();
  readString();
  const count300 = readShort();
  const count100 = readShort();
  const count50 = readShort();
  const countGeki = readShort();
  const countKatu = readShort();
  const countMiss = readShort();
  const score = readInt32();
  const maxCombo = readShort();
  const perfect = readByte() === 1;
  const mods = readInt32();
  readString();
  readInt64();
  const compressedLength = readInt32();
  if (compressedLength < 0 || offset + compressedLength > buffer.length) throw new Error('INVALID_REPLAY');
  offset += compressedLength;
  const replayId = readInt64();
  const denominator = Math.max(
    1,
    mode === 3
      ? 6 * (countGeki + count300 + countKatu + count100 + count50 + countMiss)
      : mode === 1
        ? 300 * (count300 + count100 + countMiss)
        : 6 * (count300 + count100 + count50 + countMiss),
  );
  const numerator = mode === 3
    ? 6 * (countGeki + count300) + 4 * countKatu + 2 * count100 + count50
    : mode === 1
      ? 300 * count300 + 100 * count100
      : 6 * count300 + 2 * count100 + count50;
  return {
    mode,
    beatmapHash,
    username,
    score: Math.max(0, score),
    maxCombo: Math.max(0, maxCombo),
    perfect,
    mods,
    count300,
    count100,
    count50,
    countGeki,
    countKatu,
    countMiss,
    accuracy: Math.max(0, Math.min(1, numerator / denominator)),
    replayId,
  };
}

router.get('/:id/replays', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid duel id' });
  const duel = await getDuel(id);
  if (!duel || duel.status !== 'live') return res.status(404).json({ error: 'Live duel not found' });
  res.json({
    duelId: id,
    challenger: duel.challenger,
    opponent: duel.opponent,
    challengerReplayReady: !!duel.challenger_replay_path,
    opponentReplayReady: !!duel.opponent_replay_path,
    bothReady: !!duel.challenger_replay_path && !!duel.opponent_replay_path,
    beatmapUrl: '/api/duels/' + id + '/beatmap',
    challengerReplayUrl: duel.challenger_replay_path ? '/api/duels/' + id + '/replay/challenger' : null,
    opponentReplayUrl: duel.opponent_replay_path ? '/api/duels/' + id + '/replay/opponent' : null,
  });
});

router.get('/:id/beatmap', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  const duel = Number.isSafeInteger(id) && id > 0 ? await getDuel(id) : null;
  if (!duel || duel.status !== 'live' || duel.beatmapset_id === null) {
    return res.status(404).json({ error: 'Live duel beatmap is unavailable' });
  }
  try {
    const archive = await fetchBeatmapsetArchive(Number(duel.beatmapset_id));
    res.type('application/zip').set('Cache-Control', 'public, max-age=300').send(archive);
  } catch (err) {
    console.error('[duels] beatmap archive failed', err);
    res.status(503).json({ error: 'Could not load the duel beatmap' });
  }
});

router.get('/:id/replay/:side', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  const side = req.params.side === 'challenger' ? 'challenger' : req.params.side === 'opponent' ? 'opponent' : null;
  const duel = Number.isSafeInteger(id) && id > 0 ? await getDuel(id) : null;
  if (!duel || duel.status !== 'live' || !side) return res.status(404).json({ error: 'Replay is unavailable' });
  const replayPath = side === 'challenger' ? duel.challenger_replay_path : duel.opponent_replay_path;
  if (!replayPath || !existsSync(replayPath)) return res.status(404).json({ error: 'Replay has not been shared yet' });
  res.type('application/octet-stream').set('Cache-Control', 'no-store').sendFile(replayPath);
});

router.post('/:id/replay', requireAuth, runReplayUpload, async (req, res) => {
  const id = Number(req.params.id);
  const duel = Number.isSafeInteger(id) && id > 0 ? await getDuel(id) : null;
  const file = req.file;
  if (!duel || duel.status !== 'live') {
    if (file?.path) await unlink(file.path).catch(() => undefined);
    return res.status(409).json({ error: 'Duel is not live' });
  }
  if (!file) return res.status(400).json({ error: 'Replay file is required' });
  const side = duel.challenger_user_id === req.user!.id ? 'challenger' : duel.opponent_user_id === req.user!.id ? 'opponent' : null;
  if (!side) {
    await unlink(file.path).catch(() => undefined);
    return res.status(403).json({ error: 'Only duel participants can share a replay' });
  }
  try {
    const beatmap = await fetchBeatmap(Number(duel.difficulty_id));
    const replayHash = parseOsrBeatmapHash(await readFile(file.path));
    if (!replayHash || !beatmap.checksum || replayHash !== beatmap.checksum) {
      await unlink(file.path).catch(() => undefined);
      return res.status(422).json({ error: 'This replay is not from the exact beatmap used by the duel.' });
    }
    const target = path.join(DUEL_REPLAY_DIR, id + '-' + side + '.osr');
    await unlink(target).catch(() => undefined);
    await rename(file.path, target);
    const updated = await setReplayPath(id, req.user!.id, target);
    res.json({ ok: true, duel: await duelDto(updated!), challengerReplayReady: !!updated?.challenger_replay_path, opponentReplayReady: !!updated?.opponent_replay_path });
  } catch (err) {
    await unlink(file.path).catch(() => undefined);
    console.error('[duels] replay upload failed', err);
    res.status(503).json({ error: 'Could not validate the replay' });
  }
});

router.post('/:id/mock-opponent-replay', requireAuth, runReplayUpload, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    if (req.file?.path) await unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ error: 'Mock opponent testing is disabled in production.' });
  }
  const id = Number(req.params.id);
  const duel = Number.isSafeInteger(id) && id > 0 ? await getDuel(id) : null;
  const file = req.file;
  if (!duel || duel.challenger_user_id !== req.user!.id) {
    if (file?.path) await unlink(file.path).catch(() => undefined);
    return res.status(403).json({ error: 'Only the challenger can use the mock opponent test.' });
  }
  if (!file) return res.status(400).json({ error: 'Replay file is required' });
  if (duel.opponent_user_id !== null || duel.mock_opponent) {
    await unlink(file.path).catch(() => undefined);
    return res.status(409).json({ error: 'This duel already has an opponent.' });
  }

  try {
    const beatmap = await fetchBeatmap(Number(duel.difficulty_id));
    const parsed = parseOsrScoreHeader(await readFile(file.path));
    if (parsed.beatmapHash !== beatmap.checksum) {
      await unlink(file.path).catch(() => undefined);
      return res.status(422).json({ error: 'This mock replay is not from the exact duel beatmap.' });
    }
    if (parsed.mode !== beatmap.modeInt) {
      await unlink(file.path).catch(() => undefined);
      return res.status(422).json({ error: 'This mock replay uses a different ruleset than the duel beatmap.' });
    }
    const target = path.join(DUEL_REPLAY_DIR, id + '-mock-opponent.osr');
    await unlink(target).catch(() => undefined);
    await rename(file.path, target);
    const scoreId = parsed.replayId <= BigInt(Number.MAX_SAFE_INTEGER) && parsed.replayId >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(parsed.replayId)
      : 0;
    const updated = await setMockOpponent(
      id,
      parsed.score,
      parsed.accuracy,
      parsed.countMiss,
      scoreId,
      target,
    );
    res.json({
      ok: true,
      mockOpponent: {
        username: 'ReplayTest',
        score: parsed.score,
        accuracy: parsed.accuracy,
        misses: parsed.countMiss,
        maxCombo: parsed.maxCombo,
        mods: parsed.mods,
      },
      duel: await duelDto(updated!),
    });
  } catch (err) {
    await unlink(file.path).catch(() => undefined);
    console.error('[duels] mock opponent replay failed', err);
    res.status(503).json({ error: 'Could not read the mock replay' });
  }
});

router.post('/',requireAuth,async(req,res)=>{const b=req.body??{};const difficultyId=Number(b.difficultyId),stake=Number(b.stake);const mods=String(b.mods||'FM').toUpperCase();const requirement=String(b.requirement||'Top #1 Score');if(!Number.isSafeInteger(difficultyId)||difficultyId<=0||!Number.isSafeInteger(stake)||stake<=0)return res.status(400).json({error:'Invalid duel request'});if(!['Full Combo','Top #1 Score','Best Accuracy','Lowest Miss Count'].includes(requirement))return res.status(400).json({error:'Invalid win condition'});try{const beatmap=await fetchBeatmap(difficultyId);if(beatmap.modeInt!==0 && beatmap.modeInt!==3)return res.status(422).json({error:'Duel challenges support osu!standard and osu!mania beatmaps only.'}); const standardMods=['FM','HD','HR','DT','EZ','FL','HDHR','HDDT','HRDT'];const maniaMods=['FM','EZ','NF','HT','HR','SD','PF','DT','NC','HD','FI','FL','1K','2K','3K','4K','5K','6K','7K','8K','9K','CP','MR','RD'];const allowedMods=beatmap.modeInt===3?maniaMods:standardMods;if(!allowedMods.includes(mods))return res.status(400).json({error:beatmap.modeInt===3?'Invalid osu!mania mod requirement':'Invalid mod requirement'});const id=await createDuel(req.user!.id,{difficultyId,beatmapsetId:beatmap.beatmapsetId,title:beatmap.title,artist:beatmap.artist,difficulty:beatmap.difficultyName,stars:beatmap.stars,mods,requirement,stake});res.status(201).json({id});}catch(err){if(err instanceof BeatmapNotFound)return res.status(404).json({error:'Beatmap difficulty not found'});if(err instanceof Error&&err.message==='INSUFFICIENT_FUNDS')return res.status(402).json({error:'Insufficient Duel DZPP'});if(err instanceof Error&&err.message==='RULES_NOT_ACCEPTED')return res.status(428).json({error:'Accept the arena rules before posting a duel'});console.error('[duels] create failed',err);res.status(503).json({error:'Duel could not be created'});}});
router.post('/:id/accept',requireAuth,async(req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Invalid duel id'});try{await acceptDuel(req.user!.id,id);res.json({ok:true});}catch(err){const code=err instanceof Error?err.message:'';const map:Record<string,[number,string]>={NOT_FOUND:[404,'Duel not found'],NOT_OPEN:[409,'Duel is no longer open'],SELF_ACCEPT:[409,'You cannot accept your own duel'],EXPIRED:[409,'This duel has expired'],RULES_NOT_ACCEPTED:[428,'Accept the arena rules before entering a duel'],INSUFFICIENT_FUNDS:[402,'Insufficient Duel DZPP']};const hit=map[code];if(hit)return res.status(hit[0]).json({error:hit[1]});console.error('[duels] accept failed',err);res.status(503).json({error:'Duel could not be accepted'});}});
router.post('/:id/import',requireAuth,async(req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Invalid duel id'});try{const duels=await listDuels(req.user!.id);const duel=duels.find(d=>d.id===id);if(!duel||duel.status!=='live')return res.status(409).json({error:'Duel is not live'});const beatmap=await fetchBeatmap(Number(duel.difficulty_id));const mode=beatmap.modeInt===3?'mania':'osu';const plays=await fetchUserScoresForDifficulty(Number(duel.difficulty_id),Number(req.user!.osu_id),mode);const required=duel.mods==='FM'?null:duel.mods.replace(/[^A-Z]/g,'').match(/.{1,2}/g)?.sort().join('');const play=plays.find(p=>{if(!p.passed||p.ruleset!==mode||p.beatmapId!==duel.difficulty_id)return false;if(required===null)return true;const actual=p.mods.toUpperCase().replace(/[^A-Z]/g,'').match(/.{1,2}/g)?.sort().join('')??'NM';return actual===required;});if(!play)return res.status(404).json({error:'No eligible score found for this exact beatmap and required mods. Set the required score on osu! first.'});const updated=await recordScore(id,req.user!.id,play.score,play.osuScoreId,play.accuracy,play.misses);res.json({score:play.score,duel:await duelDto(updated!)});}catch(err){if(err instanceof ScoreNotFound)return res.status(404).json({error:'No eligible score found for this exact beatmap and required mods. Set the required score on osu! first.'});console.error('[duels] import failed',err);res.status(503).json({error:'Could not verify your osu! score'});}});

export default router;


