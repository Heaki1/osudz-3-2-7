import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { ShopArtwork } from './shop.types';

interface PlayerAvatarProps {
  userId?: number;
  username: string;
  avatarUrl: string;
  size: number;
  frame?: {
    artwork: Pick<
      ShopArtwork,
      'url' | 'altText' | 'frameInnerDiameterRatio'
    > | null;
  } | null;
  frameXOffset?: number;
  frameYOffset?: number;
  className?: string;
}

export function PlayerAvatar({
  userId,
  username,
  avatarUrl,
  size,
  frame: suppliedFrame,
  frameXOffset = 0,
  frameYOffset = 0,
  className = '',
}: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [fetchedFrame, setFetchedFrame] = useState<{
    artwork: Pick<
      ShopArtwork,
      'url' | 'altText' | 'frameInnerDiameterRatio'
    > | null;
  } | null>(null);

  useEffect(() => {
    if (suppliedFrame !== undefined || userId === undefined) {
      return;
    }

    let live = true;

    void api.shop.publicProfile(userId).then((result) => {
      if (!live) return;

      if (!result.ok) {
        setFetchedFrame(null);
        return;
      }

      const frameItem = result.data.equipped.find(
        (item) => item.profileSlot === 'frame',
      );

      setFetchedFrame(frameItem ?? null);
    });

    return () => {
      live = false;
    };
  }, [userId, suppliedFrame]);

  const frame =
    suppliedFrame !== undefined
      ? suppliedFrame
      : fetchedFrame;

  const frameRatio = frame?.artwork?.frameInnerDiameterRatio;

  // FRAME SIZE — 0.94 is the global frame scale. Change this only for global frame sizing.
const frameSize =
  frameRatio && frameRatio > 0
    ? (size / frameRatio) * 0.93
    : 225;

  return (
    <div
      className="relative shrink-0 overflow-visible"
      style={{
        width: size,
        height: size,
      }}
    >
      {/* POSITION — AVATAR IMAGE: fills the 156px avatar box; its position is controlled by the parent box. */}
      <div className="absolute inset-0 overflow-hidden rounded-full">
        {avatarUrl && !failed ? (
          <img
            src={avatarUrl}
            alt={username}
            onError={() => setFailed(true)}
            referrerPolicy="no-referrer"
            className={`h-full w-full object-cover ${className}`}
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-slate-950 ${className}`}
          >
            <span className="text-xl font-black text-slate-500">
              {username.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {frame?.artwork && (
        <img
          src={frame.artwork.url}
          alt={frame.artwork.altText}
          className="pointer-events-none absolute z-10 max-w-none object-contain"
          style={{
  width: `${frameSize}px`,
  height: `${frameSize}px`,
            // FRAME POSITION — frameXOffset moves only the frame horizontally. Supports decimal pixels.
  left: `calc(50% + ${frameXOffset}px)`,
            // FRAME POSITION — frameYOffset moves only the frame vertically. Supports decimal pixels.
  top: `calc(50% + ${frameYOffset}px)`,
  transform: 'translate(-50%, -50%)',
}}
        />
      )}
    </div>
  );
}