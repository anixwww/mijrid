import React, { useEffect, useState } from 'react';
import { Gender } from '../types/tree';
import { resolveMediaFallbackFromFirestore } from '../utils/mediaSync';

interface SilhouetteAvatarProps {
  gender: Gender;
  avatarUrl?: string;
  name: string;
  flagEmoji?: string;
  size?: 'sm' | 'card' | 'md' | 'lg';
}

export const SilhouetteAvatar: React.FC<SilhouetteAvatarProps> = ({
  gender,
  avatarUrl,
  name,
  flagEmoji,
  size = 'md',
}) => {
  const [imageError, setImageError] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);

  useEffect(() => {
    setImageError(false);
    setFallbackSrc(null);
  }, [avatarUrl]);

  // Size configurations (square rounded avatars)
  const dimensions = {
    sm: 'w-9 h-9 rounded-lg',
    card: 'w-12 h-12 rounded-lg',
    md: 'w-12 h-12 rounded-xl',
    lg: 'w-20 h-20 rounded-xl',
  }[size];

  const effectiveSrc = fallbackSrc || avatarUrl;
  const hasCustomPhoto = !!effectiveSrc && !imageError;

  return (
    <div className="relative inline-flex items-center justify-center">
      <div
        className={`${dimensions} overflow-hidden bg-white dark:bg-zinc-800 ring-2 ring-white/90 dark:ring-zinc-700/80 shadow-[0_2px_6px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] border border-stone-200/70 dark:border-zinc-700 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105`}
      >
        {hasCustomPhoto ? (
          <img
            src={effectiveSrc}
            alt={name}
            onError={() => {
              if (!fallbackSrc && avatarUrl?.startsWith('/uploads/')) {
                void resolveMediaFallbackFromFirestore(avatarUrl).then((resolved) => {
                  if (resolved) {
                    setFallbackSrc(resolved);
                  } else {
                    setImageError(true);
                  }
                });
              } else {
                setImageError(true);
              }
            }}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-700 dark:text-zinc-300 bg-gradient-to-b from-stone-50 to-stone-100/90 dark:from-zinc-800 dark:to-zinc-900">
            {gender === 'female' ? (
              // Contemporary female silhouette
              <svg
                viewBox="0 0 100 100"
                className="w-4/5 h-4/5 fill-current opacity-85"
                aria-label="Жіноча стать"
              >
                {/* Hair bun */}
                <ellipse cx="50" cy="22" rx="13" ry="11" />
                {/* Head */}
                <ellipse cx="50" cy="37" rx="16" ry="18" />
                {/* Elegant hair contour */}
                <path d="M 32 35 C 30 22, 40 17, 50 17 C 60 17, 70 22, 68 35 C 68 43, 64 49, 60 51 C 58 47, 56 45, 50 45 C 44 45, 42 47, 40 51 C 36 49, 32 43, 32 35 Z" />
                {/* Shoulders */}
                <path d="M 44 54 C 44 60, 43 64, 38 67 C 25 74, 17 84, 15 97 L 85 97 C 83 84, 75 74, 62 67 C 57 64, 56 60, 56 54 Z" />
              </svg>
            ) : (
              // Contemporary male silhouette
              <svg
                viewBox="0 0 100 100"
                className="w-4/5 h-4/5 fill-current opacity-85"
                aria-label="Чоловіча стать"
              >
                {/* Head */}
                <ellipse cx="50" cy="38" rx="17" ry="19" />
                {/* Parted hair */}
                <path d="M 31 37 C 30 21, 42 15, 50 15 C 62 15, 70 23, 69 37 C 65 29, 58 25, 49 25 C 40 25, 34 31, 31 37 Z" />
                {/* Neck & shoulders */}
                <path d="M 43 55 L 43 64 C 33 68, 21 75, 13 97 L 87 97 C 79 75, 67 68, 57 64 L 57 55 Z" />
              </svg>
            )}
          </div>
        )}
      </div>
      {flagEmoji && (
        <span className="absolute -bottom-1 -right-1 text-xs select-none drop-shadow-xs">
          {flagEmoji}
        </span>
      )}
    </div>
  );
};

