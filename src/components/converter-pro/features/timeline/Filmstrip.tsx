import React, { useEffect, useState } from 'react';

/* ════════════════════════════════════════════════════════════════════════
   Filmstrip — Real video clips sampled across the timeline.

   Uses the streaming engine's high-speed /preview endpoint to extract
   crisp native video frames at precise time intervals across the clip.
   Zero hardware-decoder contention with the main player, no offscreen
   Chromium video throttling, and lightweight progressive loading.
   ════════════════════════════════════════════════════════════════════════ */

export interface FilmstripProps {
  fileName: string;
  /** Local C++ streaming server port. */
  streamingPort?: number;
  /** Clip length in seconds; frames are spread evenly across it. */
  duration?: number;
  /** Source-time window represented by this strip after a ripple edit. */
  sourceStart?: number;
  sourceEnd?: number;
  /** How many frames to sample. */
  frames?: number;
  /** Extra CSS applied to each cell (rotate / filter / flip previews). */
  cellStyle?: React.CSSProperties;
  className?: string;
}

// Module-level in-memory cache so revisiting or trimming files displays in 0ms with zero server requests
const filmstripCache = new Map<string, string[]>();

export const Filmstrip: React.FC<FilmstripProps> = ({
  fileName,
  streamingPort = 52322,
  duration = 0,
  sourceStart = 0,
  sourceEnd,
  frames = 12,
  cellStyle,
  className = ''
}) => {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeSourceStart = Math.max(0, sourceStart);
  const safeSourceEnd = Number.isFinite(sourceEnd) ? Math.max(safeSourceStart, sourceEnd as number) : safeSourceStart + safeDuration;
  const fallbackThumbnail = streamingPort && fileName ? `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(fileName)}` : '';
  const cacheKey = `${fileName}:${frames}:${safeDuration.toFixed(1)}:${safeSourceStart.toFixed(1)}:${safeSourceEnd.toFixed(1)}`;

  const [shots, setShots] = useState<string[]>(() => {
    if (filmstripCache.has(cacheKey)) {
      return filmstripCache.get(cacheKey)!;
    }
    return Array(frames).fill('');
  });

  useEffect(() => {
    // If already in memory cache, instantly apply with 0 CPU and 0 requests
    if (filmstripCache.has(cacheKey)) {
      const cached = filmstripCache.get(cacheKey)!;
      if (cached.length === frames && cached.some(Boolean)) {
        setShots(cached);
        return;
      }
    }

    setShots(Array(frames).fill(''));

    if (!fileName || !streamingPort || safeDuration <= 0 || frames <= 0) {
      return;
    }

    let cancelled = false;
    const slice = safeDuration / frames;

    // Queue real video frame URLs across the clip duration
    const queue = Array.from({ length: frames }, (_, i) => {
      const time = Math.min(safeSourceEnd - 0.05, safeSourceStart + (i + 0.5) * slice);
      return {
        index: i,
        url: `http://127.0.0.1:${streamingPort}/preview?path=${encodeURIComponent(fileName)}&time=${time.toFixed(2)}`
      };
    });

    let activeCount = 0;
    let nextIndex = 0;
    // Strict concurrency of 1 keeps the C++ server sockets and disk free for video playback
    const MAX_CONCURRENT = 1;

    const pump = () => {
      if (cancelled) return;

      while (activeCount < MAX_CONCURRENT && nextIndex < queue.length) {
        const item = queue[nextIndex++];
        activeCount++;

        const img = new Image();
        img.onload = () => {
          activeCount--;
          if (!cancelled) {
            setShots(prev => {
              const copy = prev.slice();
              copy[item.index] = item.url;
              filmstripCache.set(cacheKey, copy);
              return copy;
            });
            pump();
          }
        };
        img.onerror = () => {
          activeCount--;
          if (!cancelled) {
            pump();
          }
        };
        img.src = item.url;
      }
    };

    // Stagger start (750ms) so the main monitor video connects, decodes, and starts playing with 0 contention
    const timer = setTimeout(() => {
      pump();
    }, 750);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fileName, streamingPort, safeDuration, safeSourceStart, safeSourceEnd, frames]);

  return (
    <div
      className={`pro-filmstrip ${className}`}
      aria-hidden="true"
      style={{ '--filmstrip-frames': frames } as React.CSSProperties}
    >
      {Array.from({ length: frames }, (_, i) => {
        const frameUrl = shots[i];
        return (
          <span
            key={i}
            className="pro-filmstrip__cell"
            style={{
              backgroundImage: frameUrl
                ? `url("${frameUrl}")`
                : fallbackThumbnail
                ? `url("${fallbackThumbnail}")`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: frameUrl ? 1 : 0.45,
              transition: 'opacity 0.25s ease-in-out',
              ...cellStyle
            }}
          />
        );
      })}
    </div>
  );
};
