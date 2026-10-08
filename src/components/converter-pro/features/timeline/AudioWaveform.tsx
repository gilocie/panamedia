import React, { useEffect, useRef, useState } from "react";

export interface AudioWaveformProps {
  fileName: string;
  streamingPort?: number;
  mediaDuration?: number;
  height?: number;
  color?: string;
  background?: string;
  sourceStart?: number;
  sourceEnd?: number;
}

/**
 * The native media engine analyzes the source audio with FFmpeg. This works
 * for audio tracks inside video containers regardless of browser codec support.
 */
export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  fileName,
  streamingPort = 52322,
  mediaDuration = 0,
  height = 56,
  color = "#38bdf8",
  background = "transparent",
  sourceStart = 0,
  sourceEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  const drawWaveform = (rangeStart = sourceStart, rangeEnd = sourceEnd) => {
    const canvas = canvasRef.current;
    const image = waveformRef.current;
    if (!canvas || !image?.complete || image.naturalWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 800;
    const H = height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    if (background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
    }
    const duration = mediaDuration || (rangeEnd ?? 0);
    const from = duration > 0 ? Math.max(0, Math.min(1, rangeStart / duration)) : 0;
    const to = duration > 0 ? Math.max(from, Math.min(1, (rangeEnd ?? duration) / duration)) : 1;
    const sourceX = from * image.naturalWidth;
    const sourceWidth = Math.max(1, (to - from) * image.naturalWidth);
    ctx.drawImage(image, sourceX, 0, sourceWidth, image.naturalHeight, 0, 0, W, H);
    if (color !== "#38bdf8") {
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }
    const mid = H / 2;
    ctx.strokeStyle = "rgba(56,189,248,0.18)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(W, mid);
    ctx.stroke();
  };

  useEffect(() => {
    if (!fileName) return;
    let cancelled = false;
    setStatus("loading");
    waveformRef.current = null;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      waveformRef.current = image;
      drawWaveform();
      setStatus("done");
    };
    image.onerror = () => { if (!cancelled) setStatus("error"); };
    image.crossOrigin = "anonymous";
    image.src = `http://127.0.0.1:${streamingPort}/waveform?path=${encodeURIComponent(fileName)}&width=4096&height=128`;
    return () => {
      cancelled = true;
    };
  }, [fileName, streamingPort]);

  useEffect(() => {
    drawWaveform(sourceStart, sourceEnd);
  }, [sourceStart, sourceEnd, height, color, background, mediaDuration, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      drawWaveform(sourceStart, sourceEnd);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [height, color, background, sourceStart, sourceEnd, mediaDuration]);

  return (
    <div style={{ position: "relative", width: "100%", height: `${height}px` }}>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: `${height}px`,
          opacity: status === "loading" ? 0.25 : 1,
          transition: "opacity 0.5s ease",
        }}
      />
      {status === "loading" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
          color: "rgba(56,189,248,0.5)", textTransform: "uppercase",
          pointerEvents: "none",
        }}>
          Analysing audio…
        </div>
      )}
      {status === "error" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.42)", textTransform: "uppercase",
          pointerEvents: "none",
        }}>
          Waveform unavailable
        </div>
      )}
    </div>
  );
};
