import express from 'express';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export const DUEL_REPLAY_DIR = path.resolve(process.cwd(), 'uploads', 'duel-replays');
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

export function runReplayUpload(req: express.Request, res: express.Response, next: express.NextFunction) {
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

export type ParsedReplay = {
  mode: number;
  beatmapHash: string;
  username: string;
  score: number;
  maxCombo: number;
  perfect: boolean;
  mods: number;
  count300: number;
  count100: number;
  count50: number;
  countGeki: number;
  countKatu: number;
  countMiss: number;
  accuracy: number;
  replayId: bigint;
};

export async function removeReplayFile(filePath?: string | null) {
  if (filePath) await unlink(filePath).catch(() => undefined);
}

export function replayExists(filePath: string) {
  return existsSync(filePath);
}

export async function readReplay(filePath: string) {
  return readFile(filePath);
}

export function parseOsrBeatmapHash(buffer: Buffer): string | null {
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

export function parseOsrScoreHeader(buffer: Buffer): ParsedReplay {
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

export async function replaceReplay(tempPath: string, targetPath: string) {
  await unlink(targetPath).catch(() => undefined);
  await rename(tempPath, targetPath);
}

export function replayTarget(duelId: number, side: 'challenger' | 'opponent' | 'mock-opponent') {
  return path.join(DUEL_REPLAY_DIR, duelId + '-' + side + '.osr');
}

