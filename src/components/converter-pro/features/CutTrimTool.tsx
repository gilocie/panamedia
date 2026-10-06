import React, { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, Scissors, X } from 'lucide-react';

interface CutTrimToolProps {
  fileName: string;
  duration?: number;
  streamingPort?: number;
  initialSettings?: { startSec: number; endSec: number };
  onApply: (cutSettings: { startSec: number; endSec: number }) => void;
  onClose: () => void;
}

const formatTrimTime = (value: number) => {
  const tenths = Math.round(Math.max(0, value) * 10);
  const wholeSeconds = Math.floor(tenths / 10);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const time = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
  return `${time}.${tenths % 10}`;
};

export const CutTrimTool: React.FC<CutTrimToolProps> = ({
  fileName,
  duration = 0,
  streamingPort = 52322,
  initialSettings,
  onApply,
  onClose
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasEditedRange = useRef(Boolean(initialSettings));
  const [mediaDuration, setMediaDuration] = useState(duration);
  const [startSec, setStartSec] = useState(initialSettings?.startSec ?? 0);
  const [endSec, setEndSec] = useState(initialSettings?.endSec ?? duration);
  const [playhead, setPlayhead] = useState(initialSettings?.startSec ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const totalDuration = mediaDuration > 0 ? mediaDuration : duration;
  const usableDuration = Math.max(0, totalDuration);
  const clipDuration = Math.max(0, endSec - startSec);
  const startPercent = usableDuration > 0 ? (startSec / usableDuration) * 100 : 0;
  const endPercent = usableDuration > 0 ? (endSec / usableDuration) * 100 : 100;
  const mediaUrl = `http://127.0.0.1:${streamingPort}/stream?path=${encodeURIComponent(fileName)}`;
  const thumbnailUrl = `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(fileName)}`;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const seekPreview = (time: number) => {
    setPlayhead(time);
    if (videoRef.current && videoRef.current.readyState >= 1) {
      videoRef.current.currentTime = time;
    }
  };

  const updateStart = (value: number) => {
    if (!Number.isFinite(value)) return;
    hasEditedRange.current = true;
    const next = Math.max(0, Math.min(value, Math.max(0, endSec - 0.1)));
    setStartSec(next);
    if (playhead < next || playhead > endSec) seekPreview(next);
  };

  const updateEnd = (value: number) => {
    if (!Number.isFinite(value)) return;
    hasEditedRange.current = true;
    const next = Math.min(usableDuration || value, Math.max(startSec + 0.1, value));
    setEndSec(next);
    if (playhead > next) seekPreview(startSec);
  };

  const togglePreview = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < startSec || video.currentTime >= endSec) {
        video.currentTime = startSec;
      }
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setPreviewFailed(true);
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const resetRange = () => {
    hasEditedRange.current = true;
    setStartSec(0);
    setEndSec(usableDuration);
    seekPreview(0);
  };

  const handleLoadedMetadata = () => {
    const actualDuration = videoRef.current?.duration;
    if (!actualDuration || !Number.isFinite(actualDuration)) return;
    setMediaDuration(actualDuration);
    const minRange = Math.min(0.1, actualDuration);
    const safeStart = Math.min(startSec, Math.max(0, actualDuration - minRange));
    setStartSec(safeStart);
    setEndSec((current) => {
      if (!hasEditedRange.current) return actualDuration;
      return Math.max(Math.min(current, actualDuration), Math.min(actualDuration, safeStart + minRange));
    });
  };

  const handleApply = () => {
    if (clipDuration <= 0) return;
    onApply({ startSec, endSec });
    onClose();
  };

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(3, 5, 12, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cut-trim-title"
        style={{
          width: 'min(760px, 100%)',
          maxHeight: 'min(92vh, 820px)',
          overflowY: 'auto',
          borderRadius: '18px',
          border: '1px solid rgba(56,189,248,0.28)',
          background: 'linear-gradient(155deg, #191b29 0%, #101119 72%)',
          boxShadow: '0 32px 100px rgba(0,0,0,0.68), 0 0 45px rgba(14,165,233,0.1)',
          color: '#f8fafc'
        }}
      >
        <style>{`
          .cut-trim-range {
            appearance: none;
            -webkit-appearance: none;
            pointer-events: none;
            background: transparent;
          }
          .cut-trim-range::-webkit-slider-runnable-track {
            height: 6px;
            background: transparent;
          }
          .cut-trim-range::-moz-range-track {
            height: 6px;
            background: transparent;
          }
          .cut-trim-range::-webkit-slider-thumb {
            appearance: none;
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            margin-top: -5px;
            border: 2px solid #e0f2fe;
            border-radius: 50%;
            background: #0ea5e9;
            box-shadow: 0 0 0 3px rgba(14,165,233,0.18), 0 0 12px rgba(14,165,233,0.5);
            pointer-events: auto;
            cursor: ew-resize;
          }
          .cut-trim-range--end::-webkit-slider-thumb {
            background: #ec4899;
            border-color: #fce7f3;
            box-shadow: 0 0 0 3px rgba(236,72,153,0.16), 0 0 12px rgba(236,72,153,0.45);
          }
          .cut-trim-range::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border: 2px solid #e0f2fe;
            border-radius: 50%;
            background: #0ea5e9;
            box-shadow: 0 0 0 3px rgba(14,165,233,0.18), 0 0 12px rgba(14,165,233,0.5);
            pointer-events: auto;
            cursor: ew-resize;
          }
          .cut-trim-range--end::-moz-range-thumb {
            background: #ec4899;
            border-color: #fce7f3;
            box-shadow: 0 0 0 3px rgba(236,72,153,0.16), 0 0 12px rgba(236,72,153,0.45);
          }
        `}</style>
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '18px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.07)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style={{
              display: 'grid',
              placeItems: 'center',
              width: '40px',
              height: '40px',
              flexShrink: 0,
              borderRadius: '12px',
              color: '#e0f2fe',
              background: 'linear-gradient(145deg, #0284c7, #38bdf8)',
              boxShadow: '0 5px 18px rgba(14,165,233,0.25)'
            }}>
              <Scissors size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 id="cut-trim-title" style={{ margin: 0, fontSize: '16px', fontWeight: 750 }}>
                Cut &amp; Trim
              </h2>
              <div title={fileName} style={{
                marginTop: '4px',
                overflow: 'hidden',
                color: 'rgba(203,213,225,0.65)',
                fontSize: '11px',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {fileName.split(/[\\/]/).pop()}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trim editor"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '34px',
              height: '34px',
              flexShrink: 0,
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(226,232,240,0.75)',
              background: 'rgba(255,255,255,0.045)',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{
            position: 'relative',
            overflow: 'hidden',
            aspectRatio: '16 / 8.5',
            minHeight: '170px',
            maxHeight: '320px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.09)',
            background: '#08090f'
          }}>
            {!previewFailed && (
              <video
                ref={videoRef}
                src={mediaUrl}
                poster={thumbnailUrl}
                preload="metadata"
                muted
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={(event) => {
                  const video = event.currentTarget;
                  setPlayhead(video.currentTime);
                  if (video.currentTime >= endSec) {
                    video.pause();
                    video.currentTime = startSec;
                    setPlayhead(startSec);
                    setIsPlaying(false);
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => setPreviewFailed(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            )}
            {previewFailed && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                padding: '20px',
                color: 'rgba(203,213,225,0.72)',
                background: `linear-gradient(rgba(7,8,14,0.7), rgba(7,8,14,0.88)), url("${thumbnailUrl}") center / cover`,
                fontSize: '12px',
                textAlign: 'center'
              }}>
                Preview unavailable. You can still set the trim range below.
              </div>
            )}
            <button
              type="button"
              onClick={togglePreview}
              aria-label={isPlaying ? 'Pause preview' : 'Preview selected range'}
              style={{
                position: 'absolute',
                left: '16px',
                bottom: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '9px',
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#fff',
                background: 'rgba(8,10,18,0.78)',
                backdropFilter: 'blur(8px)',
                cursor: 'pointer'
              }}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
              <span style={{ fontSize: '11px', fontWeight: 650 }}>{isPlaying ? 'Pause preview' : 'Preview selection'}</span>
            </button>
            <span style={{
              position: 'absolute',
              right: '14px',
              bottom: '17px',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: '11px',
              textShadow: '0 1px 5px #000'
            }}>
              {formatTrimTime(playhead)} / {formatTrimTime(usableDuration)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            {[
              { label: 'START', value: startSec, color: '#38bdf8' },
              { label: 'CLIP LENGTH', value: clipDuration, color: '#4ade80' },
              { label: 'END', value: endSec, color: '#f472b6' }
            ].map((item) => (
              <div key={item.label} style={{
                minWidth: 0,
                padding: '11px 12px',
                borderRadius: '11px',
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.035)'
              }}>
                <div style={{ color: 'rgba(148,163,184,0.72)', fontSize: '9px', fontWeight: 750, letterSpacing: '0.08em' }}>
                  {item.label}
                </div>
                <div style={{ marginTop: '4px', color: item.color, fontFamily: 'monospace', fontSize: '17px', fontWeight: 750 }}>
                  {formatTrimTime(item.value)}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            padding: '15px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(6,8,15,0.42)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700 }}>Selected range</div>
                <div style={{ marginTop: '3px', color: 'rgba(148,163,184,0.72)', fontSize: '10px' }}>
                  Drag a handle or enter a time in seconds
                </div>
              </div>
              <button
                type="button"
                onClick={resetRange}
                disabled={usableDuration <= 0}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 9px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: 'rgba(203,213,225,0.85)',
                  background: 'rgba(255,255,255,0.04)',
                  fontSize: '10px',
                  cursor: usableDuration > 0 ? 'pointer' : 'not-allowed',
                  opacity: usableDuration > 0 ? 1 : 0.45
                }}
              >
                <RotateCcw size={12} /> Full clip
              </button>
            </div>

            <div style={{ position: 'relative', height: '30px', margin: '0 4px 12px' }}>
              <div style={{
                position: 'absolute',
                top: '12px',
                right: 0,
                left: 0,
                height: '6px',
                borderRadius: '99px',
                background: 'rgba(255,255,255,0.12)'
              }} />
              <div style={{
                position: 'absolute',
                top: '12px',
                left: `${startPercent}%`,
                width: `${Math.max(0, endPercent - startPercent)}%`,
                height: '6px',
                borderRadius: '99px',
                background: 'linear-gradient(90deg, #38bdf8, #818cf8, #ec4899)',
                boxShadow: '0 0 12px rgba(56,189,248,0.24)'
              }} />
              {usableDuration > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '5px',
                  left: `${Math.min(100, Math.max(0, (playhead / usableDuration) * 100))}%`,
                  width: '2px',
                  height: '20px',
                  background: '#fff',
                  boxShadow: '0 0 7px rgba(255,255,255,0.8)',
                  pointerEvents: 'none'
                }} />
              )}
              <input
                type="range"
                min={0}
                max={usableDuration || 1}
                step={0.1}
                value={Math.min(startSec, usableDuration || startSec)}
                onChange={(event) => updateStart(Number(event.target.value))}
                aria-label="Trim start time"
                className="cut-trim-range"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '30px', margin: 0, zIndex: 2 }}
              />
              <input
                type="range"
                min={0}
                max={usableDuration || 1}
                step={0.1}
                value={Math.min(endSec, usableDuration || endSec)}
                onChange={(event) => updateEnd(Number(event.target.value))}
                aria-label="Trim end time"
                className="cut-trim-range cut-trim-range--end"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '30px', margin: 0, zIndex: 3 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ color: 'rgba(203,213,225,0.72)', fontSize: '10px', fontWeight: 650 }}>
                Start time (seconds)
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, endSec - 0.1)}
                  step={0.1}
                  value={startSec}
                  onChange={(event) => updateStart(Number(event.target.value))}
                  style={{
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    marginTop: '6px',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e0f2fe',
                    background: 'rgba(255,255,255,0.045)',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                />
              </label>
              <label style={{ color: 'rgba(203,213,225,0.72)', fontSize: '10px', fontWeight: 650 }}>
                End time (seconds)
                <input
                  type="number"
                  min={Math.min(usableDuration, startSec + 0.1)}
                  max={usableDuration || undefined}
                  step={0.1}
                  value={endSec}
                  onChange={(event) => updateEnd(Number(event.target.value))}
                  style={{
                    display: 'block',
                    boxSizing: 'border-box',
                    width: '100%',
                    marginTop: '6px',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fce7f3',
                    background: 'rgba(255,255,255,0.045)',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        <footer style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '14px 22px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.15)'
        }}>
          <div style={{ color: 'rgba(148,163,184,0.78)', fontSize: '10px' }}>
            Apply saves these settings. RUN uses your destination and lists the result under its matching Output tab.
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 15px',
                borderRadius: '9px',
                border: '1px solid rgba(255,255,255,0.11)',
                color: '#e2e8f0',
                background: 'rgba(255,255,255,0.05)',
                fontSize: '11px',
                fontWeight: 650,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={clipDuration <= 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                padding: '9px 16px',
                borderRadius: '9px',
                border: '1px solid rgba(56,189,248,0.4)',
                color: '#fff',
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                boxShadow: '0 5px 18px rgba(14,165,233,0.2)',
                fontSize: '11px',
                fontWeight: 750,
                cursor: clipDuration > 0 ? 'pointer' : 'not-allowed',
                opacity: clipDuration > 0 ? 1 : 0.5
              }}
            >
              <Check size={14} /> Apply range
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};
