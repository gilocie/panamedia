import React, { useEffect, useRef, useState } from "react";

interface AudioWaveformProps {
  fileName: string;
  streamingPort?: number;
  height?: number;
  color?: string;
  background?: string;
}

/**
 * Real audio waveform — fetches the media stream, decodes it with the
 * Web Audio API, bins the PCM samples into pixel-wide bars, and draws
 * amplitude bars onto a canvas. Looks like a professional NLE waveform.
 */
export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  fileName,
  streamingPort = 52322,
  height = 56,
  color = "#38bdf8",
  background = "transparent",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplesRef = useRef<Float32Array | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  const drawWaveform = (samples: Float32Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    const mid = H / 2;
    const numBars = W;
    const samplesPerBar = Math.max(1, Math.floor(samples.length / numBars));
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color);
    grad.addColorStop(0.45, color);
    grad.addColorStop(0.5, color);
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    for (let b = 0; b < numBars; b++) {
      const offset = b * samplesPerBar;
      let rms = 0;
      let peak = 0;
      for (let s = 0; s < samplesPerBar; s++) {
        const v = Math.abs(samples[offset + s] || 0);
        rms += v * v;
        if (v > peak) peak = v;
      }
      rms = Math.sqrt(rms / samplesPerBar);
      const rmsH = Math.max(1.5, rms * mid * 2.6);
      const peakH = Math.max(1.5, peak * mid * 1.15);
      ctx.globalAlpha = 0.88;
      ctx.fillRect(b, mid - rmsH / 2, 1, rmsH);
      ctx.globalAlpha = 0.38;
      ctx.fillRect(b, mid - peakH / 2, 1, peakH);
    }
    ctx.globalAlpha = 1;
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
    samplesRef.current = null;
    const url = `http://127.0.0.1:${streamingPort}/stream?path=${encodeURIComponent(fileName)}`;
    (async () => {
      try {
        const res = await fetch(url, {
          headers: { Range: "bytes=0-8388607" },
          credentials: "omit",
        });
        if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
        if (cancelled) return;
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(buf);
        await audioCtx.close();
        if (cancelled) return;
        const numChannels = decoded.numberOfChannels;
        const totalSamples = decoded.length;
        const mixed = new Float32Array(totalSamples);
        for (let c = 0; c < numChannels; c++) {
          const ch = decoded.getChannelData(c);
          for (let i = 0; i < totalSamples; i++) mixed[i] += ch[i] / numChannels;
        }
        samplesRef.current = mixed;
        drawWaveform(mixed);
        setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [fileName, streamingPort]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      if (samplesRef.current) drawWaveform(samplesRef.current);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [height, color, background]);

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
    </div>
  );
};
