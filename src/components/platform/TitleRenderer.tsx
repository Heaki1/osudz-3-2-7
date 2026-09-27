import React from 'react';
import type { ShopArtwork } from './shop.types';

export interface TitleRendererProps {
  title: {
    name: string;
    artwork: Pick<ShopArtwork, 'url' | 'altText' | 'assetType' | 'isAnimated'> | null;
  };
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Renders a profile title from its server-selected artwork.
 *
 * Animated formats (GIF/APNG/animated WebP) are intentionally handled by the
 * browser's native image renderer. The database only describes the asset; the
 * client does not synthesize or execute arbitrary CSS/HTML animation.
 */
export function TitleRenderer({
  title,
  size = 'md',
  className = '',
}: TitleRendererProps) {
  const artwork = title.artwork;
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-base';
  const maxHeight = size === 'sm' ? 'max-h-7' : 'max-h-9';

  if (!artwork) {
    return (
      <span
        className={`inline-flex items-center tracking-tight text-[#b8c9f4] ${textSize} ${className}`}
      >
        {title.name}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex min-w-0 items-center overflow-hidden ${className}`}
      title={title.name}
    >
      <img
        src={artwork.url}
        alt={artwork.altText}
        className={`h-auto w-auto max-w-full ${maxHeight} object-contain`}
        draggable={false}
      />
    </span>
  );
}
