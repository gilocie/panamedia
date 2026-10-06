import React, { useEffect, useRef, useState } from "react";
import {
  Scissors,
  SkipBack,
  SkipForward,
  FastForward,
  Pause,
  Play,
  Check,
  Timer,
  Volume2
} from "lucide-react";
import { Filmstrip } from "./Filmstrip";
import { AudioWaveform } from "./AudioWaveform";
import { useTimelineDrag } from "./useTimelineDrag";
import {
  ProInspector,
  ProPanel,
  ProTimeline,
  ProToolShell
} from "./ProToolShell";

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

const ACCENT = '#38bdf8';

/* Reference: convertor_pro_features_ui/cut_trim_studio/code.html
   Left = live monitor + transport dock, then a full-width timeline stage.
   Right = trim mode, boundary telemetry inputs, presets, net length. */
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [mediaDuration, setMediaDuration] = useState(duration);
  const [startSec, setStartSec] = useState(initialSettings?.startSec ?? 0);
  const [endSec, setEndSec] = useState(initialSettings?.endSec ?? duration);
  const [playhead, setPlayhead] = useState(initialSettings?.startSec ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [zoom, setZoom] = useState(1); // 0.25x – 4x
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0); // 0.0 – 1.0

  const totalDuration = mediaDuration > 0 ? mediaDuration : duration;
  const usableDuration = Math.max(0, totalDuration);
  const clipDuration = Math.max(0, endSec - startSec);
  const pct = (value: number) => (usableDuration > 0 ? Math.min(100, Math.max(0, (value / usableDuration) * 100)) : 0);
  const mediaUrl = `http://127.0.0.1:${streamingPort}/stream?path=${encodeURIComponent(fileName)}`;
  const thumbnailUrl = `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(fileName)}`;
  const selectionPct = usableDuration > 0 ? Math.round((clipDuration / usableDuration) * 100) : 0;

  // Zoom helpers
  const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
  const zoomIn  = () => setZoom(z => { const next = ZOOM_STEPS.find(s => s > z); return next ?? z; });
  const zoomOut = () => setZoom(z => { const prev = [...ZOOM_STEPS].reverse().find(s => s < z); return prev ?? z; });
  const zoomReset = () => setZoom(1);

  // Dense adaptive ruler ticks: choose interval so ~12-20 ticks appear at 1x zoom.
  const buildRulerTicks = (dur: number, zoomLevel: number): number[] => {
    if (dur <= 0) return [];
    const visibleDur = dur / zoomLevel;
    const intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const targetTicks = 16;
    const interval = intervals.find(i => visibleDur / i <= targetTicks) ?? intervals[intervals.length - 1];
    const ticks: number[] = [];
    for (let t = 0; t <= dur; t += interval) ticks.push(t);
    return ticks;
  };
  const rulerTicks = buildRulerTicks(usableDuration, zoom);

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

  // Spacebar: play / pause (but don't hijack when a text input is focused).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        togglePreview();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // togglePreview is stable enough; re-running on re-render is harmless.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

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

  const applyPreset = (preset: 'first30' | 'last30' | 'middle') => {
    if (usableDuration <= 0) return;
    hasEditedRange.current = true;
    if (preset === 'first30') {
      setEndSec(Math.min(usableDuration, 30));
      setStartSec(0);
      seekPreview(0);
    } else if (preset === 'last30') {
      setStartSec(Math.max(0, usableDuration - 30));
      setEndSec(usableDuration);
      seekPreview(Math.max(0, usableDuration - 30));
    } else {
      const third = usableDuration / 3;
      setStartSec(third);
      setEndSec(third * 2);
      seekPreview(third);
    }
  };

  const handleApply = () => {
    if (clipDuration <= 0) return;
    onApply({ startSec, endSec });
    onClose();
  };

  /* ── Timeline dragging ────────────────────────────────────────────────
     The handles map a 0–1 fraction of the track straight onto seconds.
     While a drag is live the preview is parked at that timecode so the
     monitor follows the handle, which is what makes trimming feel direct. */
  const trackRef = useRef<HTMLDivElement | null>(null);

  const { dragging, handleProps, touchAction } = useTimelineDrag({
    trackRef,
    onDrag: (target, fraction) => {
      const seconds = fraction * usableDuration;
      if (target === 'in') updateStart(seconds);
      else if (target === 'out') updateEnd(seconds);
      else seekPreview(seconds);
    },
    onCommit: (target) => {
      // Snap the preview to whichever edge the drag left behind.
      if (target === 'in') seekPreview(startSec);
      else if (target === 'out') seekPreview(Math.max(startSec, endSec - 0.05));
    },
    onDragStateChange: (active) => {
      if (active) setIsPlaying(false);
    }
  });

  const inHandleProps = handleProps('in');
  const outHandleProps = handleProps('out');
  const handleStyle = { touchAction } as const;

  return (
    <ProToolShell
      title="Precision Cut & Trim Studio"
      subtitle={fileName}
      icon={<Scissors size={18} />}
      accent={ACCENT}
      inspectorHeader={
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderBottom: '1px solid var(--pw-line)',
          background: 'rgba(255,255,255,0.025)',
          minWidth: 0
        }}>
          <span style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: 'var(--pw-text)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {fileName.split(/[/\\]/).pop()}
          </span>
          <span className="pw-badge" style={{ flexShrink: 0 }}>READY</span>
          {fileName.match(/\.(mp4|mkv|mov|avi|webm|flv|ts)$/i) && (
            <span className="pw-badge pw-badge--flat" style={{ flexShrink: 0 }}>SOURCE</span>
          )}
        </div>
      }
      onClose={onClose}
      footerActionLabel="Apply"
      footerActionIcon={<Check size={14} />}
      applyDisabled={clipDuration <= 0}
      onApply={handleApply}
    >
      {/* ── Monitor + transport ── */}
      <section className="pro-panel pro-panel--canvas" style={{ gap: 6 }}>
        <div
          className="pro-monitor"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 8,
            background: 'var(--pw-lowest)'
          }}
        >
          {!previewFailed && (
            <video
              ref={videoRef}
              src={mediaUrl}
              poster={thumbnailUrl}
              preload="metadata"
              muted={isMuted}
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
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                padding: 20,
                textAlign: 'center',
                color: 'var(--pw-text-dim)',
                background: `linear-gradient(rgba(7,8,14,0.72), rgba(7,8,14,0.9)), url("${thumbnailUrl}") center / cover`,
                fontSize: 12
              }}
            >
              Preview unavailable. You can still set the trim range.
            </div>
          )}
          {/* Excluded-region scrims, driven by the live range */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${pct(startSec)}%`,
              background: 'rgba(4,5,11,0.78)',
              backdropFilter: 'blur(1px)'
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: `${100 - pct(endSec)}%`,
              background: 'rgba(4,5,11,0.78)',
              backdropFilter: 'blur(1px)'
            }}
          />
          {/* In/Out point hairlines removed — kept only on the timeline scrubber */}
          <span className="pro-canvas__chip pro-canvas__chip--br">
            {formatTrimTime(playhead)} / {formatTrimTime(usableDuration)}
          </span>
        </div>

        <div className="pro-transport" style={{ padding: '5px 8px' }}>
          {/* Duration readout removed per user request — timecode chip on the
              monitor already shows current position / total. */}
          <div className="pro-transport__cluster">
            <button type="button" className="pw-icon-btn" aria-label="Jump to start" onClick={() => seekPreview(0)}>
              <SkipBack size={11} />
            </button>
            <button type="button" className="pw-icon-btn" aria-label="Mark in point" onClick={() => updateStart(playhead)}>
              <Scissors size={11} />
            </button>
            <button type="button" className="pw-icon-btn" aria-label="Step back" onClick={() => seekPreview(Math.max(0, playhead - 1))}>
              <SkipBack size={10} />
            </button>
            <button type="button" className="pw-icon-btn pw-icon-btn--on" aria-label="Play or pause" onClick={togglePreview} style={{ width: 30, height: 30 }}>
              {isPlaying ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
            </button>
            <button type="button" className="pw-icon-btn" aria-label="Step forward" onClick={() => seekPreview(Math.min(usableDuration, playhead + 1))}>
              <FastForward size={10} />
            </button>
            <button type="button" className="pw-icon-btn" aria-label="Mark out point" onClick={() => updateEnd(playhead)}>
              <Scissors size={11} />
            </button>
            <button type="button" className="pw-icon-btn" aria-label="Jump to end" onClick={() => seekPreview(usableDuration)}>
              <SkipForward size={11} />
            </button>
          </div>
          <div className="pro-row" style={{ gap: 5, alignItems: 'center' }}>
            <button
              type="button"
              className="pw-icon-btn"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              onClick={() => {
                const next = !isMuted;
                setIsMuted(next);
                if (videoRef.current) videoRef.current.muted = next;
              }}
              title={isMuted ? 'Click to unmute' : 'Click to mute'}
              style={{ opacity: isMuted ? 1 : 0.6, flexShrink: 0 }}
            >
              <Volume2 size={11} style={{ color: isMuted ? '#f87171' : 'var(--pw-text-dim)' }} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (videoRef.current) {
                  videoRef.current.volume = v;
                  videoRef.current.muted = v === 0;
                }
                setIsMuted(v === 0);
              }}
              style={{
                width: 64,
                accentColor: ACCENT,
                cursor: 'pointer'
              }}
              title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
            {isMuted && <span className="pw-data" style={{ fontSize: 9, color: '#f87171', flexShrink: 0 }}>MUTED</span>}
          </div>
        </div>
      </section>

      <ProInspector>
      {/* ── Inspector ── */}
      <ProPanel
        title="Trimming Strategy"
        icon={<Timer size={13} />}
        action={<span className="pw-badge" style={{ fontSize: 8 }}>LIVE</span>}
      >
        <div className="pw-seg pw-seg--row">
          <button type="button" className="pw-seg__item" aria-pressed="true" style={{ fontSize: 10 }}>
            <Scissors size={11} /> Keep Range
          </button>
          <button type="button" className="pw-seg__item" aria-pressed="false" disabled title="Cut &amp; delete is not part of this pipeline" style={{ fontSize: 10 }}>
            Cut &amp; Delete
          </button>
        </div>

        <div className="pro-grid-2">
          <label className="pw-field">
            <span className="pw-label" style={{ color: ACCENT, fontSize: 9 }}>● Start Time [In]</span>
            <div className="pro-row" style={{ gap: 4 }}>
              <input
                className="pw-number"
                type="number"
                min={0}
                max={Math.max(0, endSec - 0.1)}
                step={0.1}
                value={Number(startSec.toFixed(2))}
                onChange={(event) => updateStart(Number(event.target.value))}
                style={{ color: ACCENT }}
                aria-label="Start time in seconds"
              />
              <button type="button" className="pw-icon-btn" aria-label="Set start to playhead" onClick={() => updateStart(playhead)}>
                <SkipBack size={10} />
              </button>
            </div>
          </label>
          <label className="pw-field">
            <span className="pw-label" style={{ color: '#d8b4fe', fontSize: 9 }}>● End Time [Out]</span>
            <div className="pro-row" style={{ gap: 4 }}>
              <input
                className="pw-number"
                type="number"
                min={Math.min(usableDuration, startSec + 0.1)}
                max={usableDuration || undefined}
                step={0.1}
                value={Number(endSec.toFixed(2))}
                onChange={(event) => updateEnd(Number(event.target.value))}
                style={{ color: '#d8b4fe' }}
                aria-label="End time in seconds"
              />
              <button type="button" className="pw-icon-btn" aria-label="Set end to playhead" onClick={() => updateEnd(playhead)}>
                <SkipForward size={10} />
              </button>
            </div>
          </label>
        </div>

        <div className="pro-transport__readout pro-telemetry" style={{ fontSize: 11, padding: '5px 8px' }}>
          <span style={{ color: 'var(--pw-text-dim)', fontSize: 9 }}>Trimmed Output Span:</span>
          <span style={{ color: ACCENT, marginLeft: 'auto', fontSize: 11 }}>{formatTrimTime(clipDuration)}</span>
        </div>
      </ProPanel>

      <ProPanel
        title="Quick Presets"
        icon={<Scissors size={13} />}
      >
        <div className="pw-tile-grid pw-tile-grid--4">
          <button type="button" className="pw-tile" onClick={() => applyPreset('first30')} disabled={usableDuration <= 0} style={{ padding: '5px 4px' }}>
            First 30s
          </button>
          <button type="button" className="pw-tile" onClick={() => applyPreset('last30')} disabled={usableDuration <= 0} style={{ padding: '5px 4px' }}>
            Last 30s
          </button>
          <button type="button" className="pw-tile" onClick={() => applyPreset('middle')} disabled={usableDuration <= 0} style={{ padding: '5px 4px' }}>
            Clip Middle
          </button>
          <button type="button" className="pw-tile pw-tile--reset" onClick={resetRange} style={{ padding: '5px 4px' }}>
            Reset
          </button>
        </div>
      </ProPanel>
      </ProInspector>

<ProTimeline>
        <section className="pro-timeline" style={{ padding: '6px 8px' }}>
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Timer size={13} />
              <span style={{ fontSize: 11 }}>Precision Cut Scrubber</span>
            </div>
            <div className="pro-row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="pw-badge pw-badge--flat" style={{ fontSize: 8 }}>SAMPLE-ACCURATE</span>
              {/* Zoom controls */}
              <button
                type="button"
                className="pw-btn"
                onClick={zoomOut}
                disabled={zoom <= 0.25}
                title="Zoom out timeline"
                style={{ minHeight: 20, padding: '2px 7px', fontSize: 10 }}
              >－</button>
              <span style={{ fontSize: 9, color: 'var(--pw-text-faint)', minWidth: 32, textAlign: 'center' }}>
                {zoom === 1 ? '1×' : zoom < 1 ? `${Math.round(zoom * 100)}%` : `${zoom}×`}
              </span>
              <button
                type="button"
                className="pw-btn"
                onClick={zoomIn}
                disabled={zoom >= 4}
                title="Zoom in timeline"
                style={{ minHeight: 20, padding: '2px 7px', fontSize: 10 }}
              >＋</button>
              <button
                type="button"
                className="pw-btn"
                onClick={zoomReset}
                title="Reset zoom"
                style={{ minHeight: 20, padding: '2px 6px', fontSize: 9 }}
              >FIT</button>
            </div>
          </div>

          {/* The ruler and both lanes live in one `surface` box so the drag
              overlay maps a pointer x straight onto a timecode. */}
          {/* Horizontally scrollable zoomed timeline surface */}
          {/* Scroll = zoom in/out; horizontal scroll when zoomed. */}
          <div
            ref={scrollRef}
            style={{
              overflowX: zoom > 1 ? 'auto' : 'hidden',
              overflowY: 'hidden',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--pw-hi-line) transparent',
            }}
            onWheel={(e) => {
              e.preventDefault();
              if (e.ctrlKey) {
                // Ctrl + scroll = zoom in / out
                if (e.deltaY < 0) zoomIn();
                else zoomOut();
              } else {
                // Plain scroll = horizontal pan along the timeline
                if (scrollRef.current) {
                  scrollRef.current.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
                }
              }
            }}
          >
          <div
            className="pro-timeline__surface"
            ref={trackRef}
            style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
          >
            {/* Dense ruler — ticks adapt to zoom level */}
            <div className="pw-scale pro-timeline__ruler" style={{ position: 'relative', display: 'block', height: 18 }}>
              {rulerTicks.map(t => (
                <span
                  key={t}
                  style={{
                    position: 'absolute',
                    left: `${(t / usableDuration) * 100}%`,
                    transform: 'translateX(-50%)',
                    fontSize: 8,
                    color: 'var(--pw-text-faint)',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  {formatTrimTime(t)}
                </span>
              ))}
            </div>

            <div className="pro-timeline__tracks">
              <div className="pro-tracklane">
                <span className="pro-tracklane__label">V1</span>
                <div className="pro-tracklane__body">
                  <Filmstrip
                    fileName={fileName}
                    streamingPort={streamingPort}
                    duration={usableDuration}
                    frames={20}
                  />
                  <div className="pro-tracklane__scrim" style={{ left: 0, width: `${pct(startSec)}%` }} />
                  <div className="pro-tracklane__scrim" style={{ left: `${pct(endSec)}%`, right: 0 }} />
                  <div
                    className="pro-tracklane__sel"
                    style={{ left: `${pct(startSec)}%`, width: `${Math.max(0, pct(endSec) - pct(startSec))}%` }}
                  />
                </div>
              </div>

              <div className="pro-tracklane">
                <span className="pro-tracklane__label">A1</span>
                <div className="pro-tracklane__body pro-tracklane__body--audio">
                  <AudioWaveform
                    fileName={fileName}
                    streamingPort={streamingPort}
                    height={52}
                    color="#38bdf8"
                  />
                  <div className="pro-tracklane__scrim" style={{ left: 0, width: `${pct(startSec)}%` }} />
                  <div className="pro-tracklane__scrim" style={{ left: `${pct(endSec)}%`, right: 0 }} />
                </div>
              </div>
            </div>

            {/* Draggable In / Out handles + playhead, pinned over the tracks. */}
            {usableDuration > 0 && (
              <div className={`pro-timeline__overlay${dragging ? ' is-dragging' : ''}`}>
                <button
                  type="button"
                  className="pro-timeline__handle pro-timeline__handle--in"
                  style={{ left: `${pct(startSec)}%`, ...handleStyle }}
                  aria-label="In point — drag along the timeline to trim the head"
                  title="Drag to set the in point"
                  {...inHandleProps}
                >
                  <i />
                </button>
                <button
                  type="button"
                  className="pro-timeline__handle pro-timeline__handle--out"
                  style={{ left: `${pct(endSec)}%`, ...handleStyle }}
                  aria-label="Out point — drag along the timeline to trim the tail"
                  title="Drag to set the out point"
                  {...outHandleProps}
                >
                  <i />
                </button>
                <div className="pro-timeline__playhead" style={{ left: `${pct(playhead)}%` }} aria-hidden="true">
                  <i />
                  <span>{formatTrimTime(playhead)}</span>
                </div>
              </div>
            )}
          </div>

          </div>{/* end scrollable wrapper */}

          {/* Footer status strip */}
          <div className="pro-timeline__status">
            <span>IN: {formatTrimTime(startSec)}</span>
            <span>·</span>
            <span>OUT: {formatTrimTime(endSec)}</span>
            <span>·</span>
            <em>SELECTED: {formatTrimTime(clipDuration)} ({selectionPct}% of clip)</em>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> KEYFRAME ACCURATE
            </span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
