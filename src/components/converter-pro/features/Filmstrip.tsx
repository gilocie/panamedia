import React, { useEffect, useRef, useState } from 'react';

/* ════════════════════════════════════════════════════════════════════════
   Filmstrip — real frames sampled across the clip, drawn in the renderer.

   Why not reuse /thumbnail? That endpoint hard-codes `-ss 00:00:01` and
   caches one JPEG per source path, so every cell would show the same frame
   (or nothing). Seeking the existing /stream endpoint from a hidden <video>
   and painting each seek into a canvas gives a genuine filmstrip with no
   backend change, and it reuses the frame the user is already streaming.
   ════════════════════════════════════════════════════════════════════════ */

interface FilmstripProps {
  fileName: string;
  /** Local C++ streaming server port. Optional to match the other tools. */
  streamingPort?: number;
  /** Clip length in seconds; frames are spread evenly across it. */
  duration?: number;
  /** How many frames to sample. */
  frames?: number;
  /** Extra CSS applied to each cell (rotate / filter / flip previews). */
  cellStyle?: React.CSSProperties;
  className?: string;
}

export const Filmstrip: React.FC<FilmstripProps> = ({
  fileName,
  streamingPort = 52322,
  duration = 0,
  frames = 10,
  cellStyle,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIndexRef = useRef(0);
  const cancelledRef = useRef(false);
  const [shots, setShots] = useState<string[]>([]);

  // Callers pass an optional duration; treat anything non-positive as unknown
  // rather than dividing by zero when spreading the sample points.
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  // Reset whenever the clip changes.
  useEffect(() => {
    cancelledRef.current = false;
    frameIndexRef.current = 0;
    setShots([]);
    return () => { cancelledRef.current = true; };
  }, [fileName]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || safeDuration <= 0) return;

    const capture = () => {
      const canvas = canvasRef.current;
      const videoEl = videoRef.current;
      if (!canvas || !videoEl || cancelledRef.current) return;

      const w = videoEl.videoWidth || 160;
      const h = videoEl.videoHeight || 90;
      // Small cells — 160px wide is plenty and keeps memory trivial.
      canvas.width = 160;
      canvas.height = Math.max(2, Math.round((160 * h) / w));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      const index = frameIndexRef.current;
      setShots(prev => {
        const next = prev.slice();
        next[index] = canvas.toDataURL('image/jpeg', 0.62);
        return next;
      });

      frameIndexRef.current += 1;
      if (frameIndexRef.current >= frames) return;

      // Sample at the midpoint of each slice so key frames are more likely.
      const slice = safeDuration / frames;
      const nextTime = Math.min(safeDuration - 0.05, (index + 0.5) * slice);
      videoEl.currentTime = nextTime;
    };

    const onSeeked = () => {
      // Give the decoder a beat, then paint.
      window.setTimeout(capture, 30);
    };

    video.addEventListener('loadeddata', capture);
    video.addEventListener('seeked', onSeeked);

    // The <video> src is already set in JSX; only nudge the seek here. If the
    // metadata has not arrived yet, `loadeddata` will kick the chain off.
    if (video.readyState >= 2) {
      const slice = safeDuration / frames;
      video.currentTime = Math.min(safeDuration - 0.05, slice * 0.5);
    }

    return () => {
      video.removeEventListener('loadeddata', capture);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [fileName, streamingPort, safeDuration, frames]);

  return (
    <>
      {/* Offscreen sampler. Kept in the DOM (not display:none) because some
          Chromium builds refuse to decode a fully hidden video. */}
      <video
        ref={videoRef}
        src={`http://127.0.0.1:${streamingPort}/stream?path=${encodeURIComponent(fileName)}`}
        crossOrigin="anonymous"
        preload="auto"
        muted
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: 'absolute',
          width: '2px',
          height: '2px',
          opacity: 0,
          pointerEvents: 'none',
          left: -9999
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className={`pro-filmstrip ${className}`} aria-hidden="true">
        {Array.from({ length: frames }, (_, i) => (
          <span
            key={i}
            className="pro-filmstrip__cell"
            style={{
              ...(shots[i] ? { backgroundImage: `url("${shots[i]}")` } : { background: 'var(--pw-lowest)' }),
              ...cellStyle
            }}
          />
        ))}
      </div>
    </>
  );
};
