import {
  acceptDuel,
  acceptRules,
  createDuel,
  getBalance,
  getDuel,
  hasAcceptedRules,
  listDuels,
  recordScore,
  setMockOpponent,
  setReplayPath,
  settleExpiredDuels,
  type DuelRow,
} from '../repos/duels.js';
import {
  BeatmapNotFound,
  fetchBeatmap,
  fetchBeatmapsetArchive,
  fetchUserScoresForDifficulty,
  parseDifficultyId,
  ScoreNotFound,
} from './osu.js';
import {
  parseOsrBeatmapHash,
  parseOsrScoreHeader,
  readReplay,
  removeReplayFile,
  replaceReplay,
  replayExists,
  replayTarget,
} from './replay.js';

type DuelMeta = {
  beatmapsetId:number; coverUrl:string; previewUrl:string; mapper:string; bpm:number;
  lengthSeconds:number; cs:number|null; ar:number|null; od:number|null; hp:number|null;
  maxCombo:number|null; mapStatus:string; modeInt:number;
};

const beatmapMetaCache = new Map<number, { value:DuelMeta; expiresAt:number }>();

const dto = (d:DuelRow, meta?:DuelMeta) => ({
  id:d.id,status:d.status,challenger:d.challenger,challengerAvatar:d.challenger_avatar??undefined,
  opponent:d.mock_opponent?'ReplayTest':d.opponent??undefined,opponentAvatar:d.opponent_avatar??undefined,
  title:d.title,artist:d.artist,difficulty:d.difficulty_name,stars:Number(d.stars),mods:d.mods,
  requirement:d.requirement,stake:d.stake,endsAt:d.ends_at.toISOString(),
  challengerScore:d.challenger_score===null?undefined:Number(d.challenger_score),
  opponentScore:d.opponent_score===null?undefined:Number(d.opponent_score),
  challengerAccuracy:d.challenger_accuracy===null?undefined:Number(d.challenger_accuracy),
  opponentAccuracy:d.opponent_accuracy===null?undefined:Number(d.opponent_accuracy),
  challengerMisses:d.challenger_misses===null?undefined:Number(d.challenger_misses),
  opponentMisses:d.opponent_misses===null?undefined:Number(d.opponent_misses),
  challengerScoreId:d.challenger_score_id===null?undefined:Number(d.challenger_score_id),
  opponentScoreId:d.opponent_score_id===null?undefined:Number(d.opponent_score_id),
  difficultyId:Number(d.difficulty_id),
  beatmapsetId:meta?.beatmapsetId ?? (d.beatmapset_id===null?undefined:Number(d.beatmapset_id)),
  coverUrl:meta?.coverUrl,previewUrl:meta?.previewUrl,mapper:meta?.mapper,bpm:meta?.bpm,
  lengthSeconds:meta?.lengthSeconds,cs:meta?.cs,ar:meta?.ar,od:meta?.od,hp:meta?.hp,
  maxCombo:meta?.maxCombo,mapStatus:meta?.mapStatus,
  challengerUserId:d.challenger_user_id,opponentUserId:d.opponent_user_id??undefined,
  challengerReplayReady:!!d.challenger_replay_path,opponentReplayReady:!!d.opponent_replay_path,
});

export async function duelDto(d:DuelRow) {
  if (d.beatmapset_id !== null) return dto(d);
  const cached = beatmapMetaCache.get(d.difficulty_id);
  if (cached && cached.expiresAt > Date.now()) return dto(d, cached.value);
  try {
    const b = await fetchBeatmap(d.difficulty_id);
    const value:DuelMeta = {
      beatmapsetId:b.beatmapsetId,coverUrl:b.coverUrl,previewUrl:b.previewUrl,mapper:b.mapper,
      bpm:b.bpm,lengthSeconds:b.lengthSeconds,cs:b.cs,ar:b.ar,od:b.od,hp:b.hp,maxCombo:b.maxCombo,
      mapStatus:b.mapStatus,modeInt:b.modeInt,
    };
    beatmapMetaCache.set(d.difficulty_id,{value,expiresAt:Date.now()+10*60*1000});
    return dto(d,value);
  } catch { return dto(d); }
}

export { BeatmapNotFound, ScoreNotFound };

export async function getRules(userId:number) {
  return { accepted: await hasAcceptedRules(userId) };
}

export async function acceptRulesForUser(userId:number) {
  await acceptRules(userId);
  return { accepted:true };
}

export async function lookupBeatmap(url:string) {
  const difficultyId = parseDifficultyId(url);
  if (difficultyId===null) throw new Error('INVALID_DIFFICULTY_URL');
  const b=await fetchBeatmap(difficultyId);
  if (b.modeInt!==0 && b.modeInt!==3) throw new Error('UNSUPPORTED_RULESET');
  return {
    difficultyId:b.difficultyId,beatmapsetId:b.beatmapsetId,title:b.title,artist:b.artist,mapper:b.mapper,
    difficultyName:b.difficultyName,coverUrl:b.coverUrl,previewUrl:b.previewUrl,stars:b.stars,
    bpm:b.bpm,lengthSeconds:b.lengthSeconds,modeInt:b.modeInt,
  };
}

export async function listDuelData(userId?:number) {
  await settleExpiredDuels();
  const [duels,balance]=await Promise.all([listDuels(userId),userId?getBalance(userId):Promise.resolve(0)]);
  return {duels:await Promise.all(duels.map(duelDto)),balance};
}

export async function getReplayStatus(id:number) {
  const duel=await getDuel(id);
  if (!duel || duel.status!=='live') throw new Error('LIVE_DUEL_NOT_FOUND');
  return {
    duelId:id,challenger:duel.challenger,opponent:duel.opponent,
    challengerReplayReady:!!duel.challenger_replay_path,opponentReplayReady:!!duel.opponent_replay_path,
    bothReady:!!duel.challenger_replay_path && !!duel.opponent_replay_path,
    beatmapUrl:'/api/duels/'+id+'/beatmap',
    challengerReplayUrl:duel.challenger_replay_path?'/api/duels/'+id+'/replay/challenger':null,
    opponentReplayUrl:duel.opponent_replay_path?'/api/duels/'+id+'/replay/opponent':null,
  };
}

export async function getBeatmapArchive(id:number) {
  const duel=await getDuel(id);
  if (!duel || duel.status!=='live' || duel.beatmapset_id===null) throw new Error('LIVE_DUEL_BEATMAP_UNAVAILABLE');
  return fetchBeatmapsetArchive(Number(duel.beatmapset_id));
}

export async function getReplayPath(id:number,side:'challenger'|'opponent') {
  const duel=await getDuel(id);
  if (!duel || duel.status!=='live') throw new Error('REPLAY_UNAVAILABLE');
  const replayPath=side==='challenger'?duel.challenger_replay_path:duel.opponent_replay_path;
  if (!replayPath || !replayExists(replayPath)) throw new Error('REPLAY_NOT_SHARED');
  return replayPath;
}

export async function uploadReplay(id:number,userId:number,filePath:string) {
  const duel=await getDuel(id);
  if (!duel || duel.status!=='live') { await removeReplayFile(filePath); throw new Error('DUEL_NOT_LIVE'); }
  const side=duel.challenger_user_id===userId?'challenger':duel.opponent_user_id===userId?'opponent':null;
  if (!side) { await removeReplayFile(filePath); throw new Error('REPLAY_FORBIDDEN'); }
  try {
    const beatmap=await fetchBeatmap(Number(duel.difficulty_id));
    const replayHash=parseOsrBeatmapHash(await readReplay(filePath));
    if (!replayHash || !beatmap.checksum || replayHash!==beatmap.checksum) {
      await removeReplayFile(filePath);
      throw new Error('REPLAY_BEATMAP_MISMATCH');
    }
    const target=replayTarget(id,side);
    await replaceReplay(filePath,target);
    const updated=await setReplayPath(id,userId,target);
    return { ok:true,duel:await duelDto(updated!),challengerReplayReady:!!updated?.challenger_replay_path,opponentReplayReady:!!updated?.opponent_replay_path };
  } catch (err) {
    await removeReplayFile(filePath);
    throw err;
  }
}

export async function uploadMockOpponentReplay(id:number,userId:number,filePath:string) {
  if (!Number.isSafeInteger(id) || id <= 0) { await removeReplayFile(filePath); throw new Error('MOCK_FORBIDDEN'); }
  const duel=await getDuel(id);
  if (!duel || duel.challenger_user_id!==userId) { await removeReplayFile(filePath); throw new Error('MOCK_FORBIDDEN'); }
  if (!filePath) throw new Error('REPLAY_REQUIRED');
  if (duel.opponent_user_id!==null || duel.mock_opponent) { await removeReplayFile(filePath); throw new Error('OPPONENT_EXISTS'); }
  try {
    const beatmap=await fetchBeatmap(Number(duel.difficulty_id));
    const parsed=parseOsrScoreHeader(await readReplay(filePath));
    if (parsed.beatmapHash!==beatmap.checksum) { await removeReplayFile(filePath); throw new Error('MOCK_BEATMAP_MISMATCH'); }
    if (parsed.mode!==beatmap.modeInt) { await removeReplayFile(filePath); throw new Error('MOCK_RULESET_MISMATCH'); }
    const target=replayTarget(id,'mock-opponent');
    await replaceReplay(filePath,target);
    const scoreId=parsed.replayId<=BigInt(Number.MAX_SAFE_INTEGER)&&parsed.replayId>=BigInt(Number.MIN_SAFE_INTEGER)?Number(parsed.replayId):0;
    const updated=await setMockOpponent(id,parsed.score,parsed.accuracy,parsed.countMiss,scoreId,target);
    return {
      ok:true,
      mockOpponent:{username:'ReplayTest',score:parsed.score,accuracy:parsed.accuracy,misses:parsed.countMiss,maxCombo:parsed.maxCombo,mods:parsed.mods},
      duel:await duelDto(updated!),
    };
  } catch (err) {
    await removeReplayFile(filePath);
    throw err;
  }
}

export async function createDuelForUser(userId:number,input:{difficultyId:number;stake:number;mods:string;requirement:string}) {
  const beatmap=await fetchBeatmap(input.difficultyId);
  if (beatmap.modeInt!==0 && beatmap.modeInt!==3) throw new Error('UNSUPPORTED_RULESET');
  const standardMods=['FM','HD','HR','DT','EZ','FL','HDHR','HDDT','HRDT'];
  const maniaMods=['FM','EZ','NF','HT','HR','SD','PF','DT','NC','HD','FI','FL','1K','2K','3K','4K','5K','6K','7K','8K','9K','CP','MR','RD'];
  const allowedMods=beatmap.modeInt===3?maniaMods:standardMods;
  if (!allowedMods.includes(input.mods)) throw new Error(beatmap.modeInt===3?'INVALID_MANIA_MOD':'INVALID_MOD');
  return createDuel(userId,{difficultyId:input.difficultyId,beatmapsetId:beatmap.beatmapsetId,title:beatmap.title,artist:beatmap.artist,difficulty:beatmap.difficultyName,stars:beatmap.stars,mods:input.mods,requirement:input.requirement,stake:input.stake});
}

export async function acceptDuelForUser(userId:number,id:number) {
  await acceptDuel(userId,id);
  return {ok:true};
}

export async function importScoreForUser(id:number,userId:number,osuId:number) {
  const duels=await listDuels(userId);
  const duel=duels.find(d=>d.id===id);
  if (!duel || duel.status!=='live') throw new Error('DUEL_NOT_LIVE');
  const beatmap=await fetchBeatmap(Number(duel.difficulty_id));
  const mode=beatmap.modeInt===3?'mania':'osu';
  const plays=await fetchUserScoresForDifficulty(Number(duel.difficulty_id),osuId,mode);
  const required=duel.mods==='FM'?null:duel.mods.replace(/[^A-Z]/g,'').match(/.{1,2}/g)?.sort().join('');
  const play=plays.find(p=>{
    if(!p.passed||p.ruleset!==mode||p.beatmapId!==duel.difficulty_id)return false;
    if(required===null)return true;
    const actual=p.mods.toUpperCase().replace(/[^A-Z]/g,'').match(/.{1,2}/g)?.sort().join('')??'NM';
    return actual===required;
  });
  if(!play) throw new Error('SCORE_NOT_FOUND');
  const updated=await recordScore(id,userId,play.score,play.osuScoreId,play.accuracy,play.misses);
  return {score:play.score,duel:await duelDto(updated!)};
}

