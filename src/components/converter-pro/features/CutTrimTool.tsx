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
  Volume2,
  RotateCcw,
  Undo2,
  Redo2
} from "lucide-react";
import { Filmstrip } from "./Filmstrip";
import { AudioWaveform } from "./AudioWaveform";
import { useTimelineDrag } from "./useTimelineDrag";
import { electron } from "../../panamedia/types";
import {
  ProInspector,
  ProPanel,
  ProTimeline,
  ProToolShell
} from "./ProToolShell";

type TrimStrategy = 'keep' | 'delete';
type CutSettings = { startSec: number; endSec: number; strategy: TrimStrategy; timelineOrigin?: number; rightCutApplied?: boolean };
type TrimSnapshot = { startSec: number; endSec: number; strategy: TrimStrategy; timelineOrigin: number; rightCutApplied: boolean };

interface CutTrimToolProps {
  fileName: string;
  duration?: number;
  streamingPort?: number;
  initialSettings?: CutSettings;
  onSettingsChange?: (cutSettings: CutSettings) => void;
  onApply: (cutSettings: CutSettings) => void;
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

const formatPreciseTrimTime = (value: number) => {
  const wholeSeconds = Math.floor(Math.max(0, value));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const splitTrimTime = (value: number) => {
  const totalSeconds = Math.floor(Math.max(0, value));
  return {
    hours: String(Math.floor(totalSeconds / 3600)).padStart(2, '0'),
    minutes: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0'),
    seconds: String(totalSeconds % 60).padStart(2, '0')
  };
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
  onSettingsChange,
  onApply,
  onClose
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Keep the requested seek authoritative until the media element catches up.
  // Browsers can emit a timeupdate for the previous frame after currentTime is set.
  const pendingSeekRef = useRef<number | null>(null);
  const undoHistoryRef = useRef<TrimSnapshot[]>([]);
  const redoHistoryRef = useRef<TrimSnapshot[]>([]);
  const hasEditedRange = useRef(Boolean(initialSettings));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [timelineContentWidth, setTimelineContentWidth] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(duration);
  const [activeStreamingPort, setActiveStreamingPort] = useState(streamingPort || 52322);
  const [startSec, setStartSec] = useState(initialSettings?.startSec ?? 0);
  const [endSec, setEndSec] = useState(initialSettings?.endSec ?? duration);
  const [strategy, setStrategy] = useState<TrimStrategy>(initialSettings?.strategy ?? 'keep');
  const [timelineOrigin, setTimelineOrigin] = useState(initialSettings?.timelineOrigin ?? 0);
  const [rightCutApplied, setRightCutApplied] = useState(initialSettings?.rightCutApplied ?? false);
  const [pendingSideCut, setPendingSideCut] = useState<'left' | 'right' | null>(null);
  const [playhead, setPlayhead] = useState(initialSettings?.startSec ?? 0);
  const [startDraft, setStartDraft] = useState(() => splitTrimTime(initialSettings?.startSec ?? 0));
  const [endDraft, setEndDraft] = useState(() => splitTrimTime(initialSettings?.endSec ?? duration));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRulerZooming, setIsRulerZooming] = useState(false);
  const rulerCursorTimer = useRef<number | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [zoom, setZoom] = useState(1); // 0.25x – 4x
  const volumeStorageKey = `converter_cut_volume:${encodeURIComponent(fileName.toLowerCase())}`;
  const [savedAudio] = useState(() => {
    try {
      const raw = localStorage.getItem(volumeStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        volume: typeof parsed?.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 1,
        muted: parsed?.muted === true
      };
    } catch { return { volume: 1, muted: false }; }
  });
  const [isMuted, setIsMuted] = useState(savedAudio.muted);
  const [volume, setVolume] = useState(savedAudio.volume);
  const lastAudibleVolume = useRef(savedAudio.volume || 1);
  const volumePercent = isMuted ? 0 : Math.round(volume * 100);
  const volumeRingColor = volumePercent >= 100 ? '#a78bfa' : '#38bdf8';

  useEffect(() => {
    if (!electron) return;
    electron.ipcRenderer.invoke('get-streaming-port').then((port: number) => {
      if (port) setActiveStreamingPort(port);
    }).catch(() => {});
  }, [streamingPort]);

  const adjustVolumeWithWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const next = Math.max(0, Math.min(1, (isMuted ? 0 : volume) + (event.deltaY < 0 ? 0.05 : -0.05)));
    setVolume(next);
    setIsMuted(next === 0);
    try { localStorage.setItem(volumeStorageKey, JSON.stringify({ volume: next, muted: next === 0 })); } catch { /* storage may be unavailable */ }
    if (next > 0) lastAudibleVolume.current = next;
    if (videoRef.current) {
      videoRef.current.volume = next;
      videoRef.current.muted = next === 0;
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
    try { localStorage.setItem(volumeStorageKey, JSON.stringify({ volume, muted: isMuted })); } catch { /* storage may be unavailable */ }
  }, [volume, isMuted, volumeStorageKey]);

  useEffect(() => {
    onSettingsChange?.({ startSec, endSec, strategy, timelineOrigin, rightCutApplied });
  }, [startSec, endSec, strategy, timelineOrigin, rightCutApplied, onSettingsChange]);

  useEffect(() => setStartDraft(splitTrimTime(startSec)), [startSec]);
  useEffect(() => setEndDraft(splitTrimTime(endSec)), [endSec]);

  const totalDuration = mediaDuration > 0 ? mediaDuration : duration;
  const usableDuration = Math.max(0, totalDuration);
  const timelineEnd = rightCutApplied ? endSec : usableDuration;
  const timelineDuration = Math.max(0, timelineEnd - timelineOrigin);
  const selectedDuration = Math.max(0, endSec - startSec);
  const clipDuration = strategy === 'keep' ? selectedDuration : Math.max(0, usableDuration - selectedDuration);
  const pct = (value: number) => (timelineDuration > 0 ? Math.min(100, Math.max(0, ((value - timelineOrigin) / timelineDuration) * 100)) : 0);
  const mediaUrl = `http://127.0.0.1:${activeStreamingPort}/stream?path=${encodeURIComponent(fileName)}`;
  const thumbnailUrl = `http://127.0.0.1:${activeStreamingPort}/thumbnail?path=${encodeURIComponent(fileName)}`;
  const selectionPct = timelineDuration > 0 ? Math.round((selectedDuration / timelineDuration) * 100) : 0;

  // The stream port can resolve after the first media request. Clear a failed
  // first attempt when the port or selected source changes so the video can
  // mount again against the live stream server.
  useEffect(() => {
    setPreviewFailed(false);
  }, [fileName, activeStreamingPort]);

  // Zoom helpers
  const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
  const changeZoom = (nextZoom: number, clientX?: number) => {
    const scroller = scrollRef.current;
    const oldWidth = scroller?.scrollWidth || 1;
    const viewportWidth = scroller?.clientWidth || 1;
    const anchorX = scroller
      ? Math.max(0, Math.min(viewportWidth, (clientX ?? (scroller.getBoundingClientRect().left + viewportWidth / 2)) - scroller.getBoundingClientRect().left))
      : 0;
    const anchorTimeFraction = scroller && usableDuration > 0
      ? (scroller.scrollLeft + anchorX) / oldWidth
      : 0;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      if (!scroller) return;
      scroller.scrollLeft = Math.max(0, Math.min(
        scroller.scrollWidth - scroller.clientWidth,
        anchorTimeFraction * scroller.scrollWidth - anchorX
      ));
      setTimelineScrollLeft(scroller.scrollLeft);
      setTimelineContentWidth(scroller.scrollWidth);
    });
  };
  const zoomIn = (clientX?: number) => {
    const next = ZOOM_STEPS.find(step => step > zoom);
    if (next) changeZoom(next, clientX);
  };
  const zoomOut = (clientX?: number) => {
    const next = [...ZOOM_STEPS].reverse().find(step => step < zoom);
    if (next) changeZoom(next, clientX);
  };
  const zoomReset = () => {
    setZoom(1);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
      setTimelineScrollLeft(0);
      setTimelineContentWidth(scrollRef.current.scrollWidth);
    }
  };

  useEffect(() => () => {
    if (rulerCursorTimer.current !== null) window.clearTimeout(rulerCursorTimer.current);
  }, []);

  // The ruler stays pinned while its tick labels follow the visible clip range.
  const contentWidth = timelineContentWidth || scrollRef.current?.scrollWidth || 1;
  const timelineViewportWidth = scrollRef.current?.clientWidth || 1;
  const visibleDuration = timelineDuration > 0
    ? timelineDuration * Math.min(1, timelineViewportWidth / contentWidth)
    : 0;
  const visibleStart = timelineDuration > 0 && contentWidth > timelineViewportWidth
    ? (timelineScrollLeft / contentWidth) * timelineDuration
    : 0;

  useEffect(() => {
    const refreshTimelineSize = () => {
      if (!scrollRef.current) return;
      setTimelineContentWidth(scrollRef.current.scrollWidth);
      setTimelineScrollLeft(scrollRef.current.scrollLeft);
    };
    const frame = requestAnimationFrame(refreshTimelineSize);
    window.addEventListener('resize', refreshTimelineSize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', refreshTimelineSize);
    };
  }, [zoom]);

  // Dense adaptive ruler ticks: choose an interval so ~12-20 labels are visible.
  const rulerIntervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const rulerInterval = rulerIntervals.find(i => visibleDuration / i <= 16) ?? rulerIntervals[rulerIntervals.length - 1];
  const buildRulerTicks = (dur: number, from: number, visibleDur: number): number[] => {
    if (dur <= 0) return [];
    const interval = rulerIntervals.find(i => visibleDur / i <= 16) ?? rulerIntervals[rulerIntervals.length - 1];
    const ticks: number[] = [];
    const end = Math.min(dur, from + visibleDur);
    for (let t = Math.floor(from / interval) * interval; t <= end + interval * 0.01; t += interval) {
      if (t >= 0 && t <= dur) ticks.push(t);
    }
    return ticks;
  };
  const rulerTicks = buildRulerTicks(timelineDuration, visibleStart, visibleDuration);
  const visibleEnd = Math.min(timelineDuration, visibleStart + visibleDuration);
  const minorRulerInterval = rulerInterval / 5;
  const firstMinorMarkIndex = Math.ceil((visibleStart - 0.0001) / minorRulerInterval);
  const lastMinorMarkIndex = Math.floor((visibleEnd + 0.0001) / minorRulerInterval);
  const rulerMarks = Array.from(
    { length: timelineDuration > 0 ? Math.max(0, Math.min(500, lastMinorMarkIndex - firstMinorMarkIndex + 1)) : 0 },
    (_, index) => {
      const markIndex = firstMinorMarkIndex + index;
      return { time: markIndex * minorRulerInterval, major: markIndex % 5 === 0 };
    }
  );
  const displayedRulerTicks = timelineDuration > 0
    ? [...new Set([0, ...rulerTicks, timelineDuration].filter(t => t >= visibleStart - 0.001 && t <= visibleEnd + 0.001))]
    : [];

  const seekPreview = (time: number, bounds?: { start: number; end: number }, allowOutsideSelection = false) => {
    const activeBounds = bounds ?? (allowOutsideSelection || strategy === 'delete'
      ? { start: 0, end: usableDuration }
      : { start: startSec, end: endSec });
    const boundedTime = Math.max(activeBounds.start, Math.min(activeBounds.end, time));
    pendingSeekRef.current = boundedTime;
    setPlayhead(boundedTime);
    if (videoRef.current && videoRef.current.readyState >= 1) {
      videoRef.current.currentTime = boundedTime;
    } else {
      pendingSeekRef.current = null;
    }
  };

  const updateStart = (value: number) => {
    if (!Number.isFinite(value)) return;
    hasEditedRange.current = true;
    const minimumStart = strategy === 'keep' ? timelineOrigin : 0;
    const next = Math.max(minimumStart, Math.min(value, Math.max(minimumStart, endSec - 0.1)));
    setStartSec(next);
    // Keep the playhead inside the range once the in-grip reaches it.
    if (playhead < next) seekPreview(next);
  };

  const updateEnd = (value: number) => {
    if (!Number.isFinite(value)) return;
    hasEditedRange.current = true;
    const next = Math.min(usableDuration || value, Math.max(startSec + 0.1, value));
    setEndSec(next);
    // Keep the playhead inside the range once the out-grip reaches it.
    if (playhead > next) seekPreview(next);
  };

  const rememberEdit = () => {
    undoHistoryRef.current.push({ startSec, endSec, strategy, timelineOrigin, rightCutApplied });
    redoHistoryRef.current = [];
  };

  const restoreEdit = (edit: TrimSnapshot) => {
    setStartSec(edit.startSec);
    setEndSec(edit.endSec);
    setStrategy(edit.strategy);
    setTimelineOrigin(edit.timelineOrigin);
    setRightCutApplied(edit.rightCutApplied);
    seekPreview(edit.startSec, { start: edit.startSec, end: edit.endSec });
  };

  const undoEdit = () => {
    const previous = undoHistoryRef.current.pop();
    if (!previous) return;
    redoHistoryRef.current.push({ startSec, endSec, strategy, timelineOrigin, rightCutApplied });
    restoreEdit(previous);
  };

  const redoEdit = () => {
    const next = redoHistoryRef.current.pop();
    if (!next) return;
    undoHistoryRef.current.push({ startSec, endSec, strategy, timelineOrigin, rightCutApplied });
    restoreEdit(next);
  };

  const hasLeftUnwanted = strategy === 'keep' && startSec > timelineOrigin + 0.001;
  const hasRightUnwanted = strategy === 'keep' && !rightCutApplied && endSec < usableDuration - 0.001;
  const cutLeftActive = hasLeftUnwanted;
  const cutRightActive = hasRightUnwanted;
  const cutLeftDisabled = strategy === 'keep' && !hasLeftUnwanted;
  const cutRightDisabled = strategy === 'keep' && !hasRightUnwanted;

  const confirmSideCut = () => {
    if (!pendingSideCut) return;
    rememberEdit();
    if (pendingSideCut === 'left') {
      setTimelineOrigin(startSec);
      seekPreview(startSec, { start: startSec, end: endSec });
    } else {
      setRightCutApplied(true);
      seekPreview(Math.min(playhead, endSec), { start: startSec, end: endSec });
    }
    setPendingSideCut(null);
  };

  const commitStartDraft = () => {
    const parsed = Number(startDraft.hours) * 3600 + Number(startDraft.minutes) * 60 + Number(startDraft.seconds);
    const valid = Object.values(startDraft).every(part => /^\d{1,2}$/.test(part)) && Number(startDraft.minutes) < 60 && Number(startDraft.seconds) < 60;
    if (!valid || !Number.isFinite(parsed)) {
      setStartDraft(splitTrimTime(startSec));
      return;
    }
    const minimumStart = strategy === 'keep' ? timelineOrigin : 0;
    const next = Math.max(minimumStart, Math.min(parsed, Math.max(minimumStart, endSec - 0.1)));
    if (Math.abs(next - startSec) > 0.001) rememberEdit();
    updateStart(next);
    seekPreview(next, { start: next, end: endSec });
    setStartDraft(splitTrimTime(next));
  };

  const commitEndDraft = () => {
    const parsed = Number(endDraft.hours) * 3600 + Number(endDraft.minutes) * 60 + Number(endDraft.seconds);
    const valid = Object.values(endDraft).every(part => /^\d{1,2}$/.test(part)) && Number(endDraft.minutes) < 60 && Number(endDraft.seconds) < 60;
    if (!valid || !Number.isFinite(parsed)) {
      setEndDraft(splitTrimTime(endSec));
      return;
    }
    const next = Math.min(usableDuration || parsed, Math.max(startSec + 0.1, parsed));
    if (Math.abs(next - endSec) > 0.001) rememberEdit();
    updateEnd(next);
    seekPreview(next, { start: startSec, end: next });
    setEndDraft(splitTrimTime(next));
  };

  const renderTimeInputs = (
    draft: { hours: string; minutes: string; seconds: string },
    setDraft: React.Dispatch<React.SetStateAction<{ hours: string; minutes: string; seconds: string }>>,
    commit: () => void,
    color: string,
    label: string
  ) => (
    <div className="pro-row" style={{ gap: 4 }}>
      {usableDuration >= 3600 && (
      <input className="pw-number" type="text" inputMode="numeric" maxLength={2} value={draft.hours}
        onChange={event => setDraft(current => ({ ...current, hours: event.target.value.replace(/\D/g, '').slice(0, 2) }))}
        onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }}
          style={{ color, textAlign: 'center', minWidth: 0, flex: 1, height: 36, fontSize: 13 }} aria-label={`${label} hours`} />
      )}
      <input className="pw-number" type="text" inputMode="numeric" maxLength={2} value={draft.minutes}
        onChange={event => setDraft(current => ({ ...current, minutes: event.target.value.replace(/\D/g, '').slice(0, 2) }))}
        onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }}
        style={{ color, textAlign: 'center', minWidth: 0, flex: 1, height: 36, fontSize: 13 }} aria-label={`${label} minutes`} />
      <span aria-hidden="true" style={{ color: 'var(--pw-text-faint)' }}>:</span>
      <input className="pw-number" type="text" inputMode="numeric" maxLength={2} value={draft.seconds}
        onChange={event => setDraft(current => ({ ...current, seconds: event.target.value.replace(/\D/g, '').slice(0, 2) }))}
        onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }}
        style={{ color, textAlign: 'center', minWidth: 0, flex: 1, height: 36, fontSize: 13 }} aria-label={`${label} seconds`} />
      <button type="button" className="pw-icon-btn" aria-label={`Set ${label.toLowerCase()} to playhead`} onClick={() => label === 'Start time' ? updateStart(playhead) : updateEnd(playhead)}>
        {label === 'Start time' ? <SkipBack size={10} /> : <SkipForward size={10} />}
      </button>
    </div>
  );

  const togglePreview = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const target = strategy === 'keep'
        ? (playhead < startSec || playhead >= endSec ? startSec : Math.max(startSec, Math.min(endSec, playhead)))
        : (playhead >= startSec && playhead < endSec ? (endSec < usableDuration ? endSec : 0) : playhead);
      // Use the selected playhead as the source of truth, not a stale media time.
      seekPreview(target);
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

  const togglePreviewRef = useRef(togglePreview);
  togglePreviewRef.current = togglePreview;

  // Space and Backspace operate the active trim preview anywhere in the tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code !== 'Space' && e.code !== 'Backspace') || e.repeat) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      togglePreviewRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const resetRange = () => {
    rememberEdit();
    hasEditedRange.current = true;
    setTimelineOrigin(0);
    setRightCutApplied(false);
    setStartSec(0);
    setEndSec(usableDuration);
    seekPreview(0, { start: 0, end: usableDuration });
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
    rememberEdit();
    setTimelineOrigin(0);
    setRightCutApplied(false);
    hasEditedRange.current = true;
    let nextStart = 0;
    let nextEnd = usableDuration;
    if (preset === 'first30') {
      nextEnd = Math.min(usableDuration, 30);
    } else if (preset === 'last30') {
      nextStart = Math.max(0, usableDuration - 30);
    } else {
      const third = usableDuration / 3;
      nextStart = third;
      nextEnd = third * 2;
    }
    setStartSec(nextStart);
    setEndSec(nextEnd);
    // Presets always park the player at the new in point, even if React's
    // current playhead value already matches but the video is still seeking.
    seekPreview(nextStart, { start: nextStart, end: nextEnd });
  };

  const activePreset = (() => {
    if (usableDuration <= 0) return null;
    const same = (left: number, right: number) => Math.abs(left - right) <= 0.05;
    const firstEnd = Math.min(usableDuration, 30);
    const lastStart = Math.max(0, usableDuration - 30);
    const third = usableDuration / 3;
    if (usableDuration > 30 && same(startSec, 0) && same(endSec, firstEnd)) return 'first30';
    if (usableDuration > 30 && same(startSec, lastStart) && same(endSec, usableDuration)) return 'last30';
    if (same(startSec, third) && same(endSec, third * 2)) return 'middle';
    if (same(startSec, 0) && same(endSec, usableDuration)) return 'reset';
    return null;
  })();

  const handleApply = () => {
    if (clipDuration <= 0) return;
    onApply({ startSec, endSec, strategy, timelineOrigin, rightCutApplied });
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
      const seconds = timelineOrigin + fraction * timelineDuration;
      if (target === 'in') updateStart(seconds);
      else if (target === 'out') updateEnd(seconds);
      else seekPreview(seconds);
    },
    onCommit: (target, fraction) => {
      // Trim handles only change the range. Only the playhead seeks the preview.
      if (target === 'playhead') seekPreview(timelineOrigin + fraction * timelineDuration);
    },
    onDragStateChange: (active) => {
      if (active) {
        rememberEdit();
        videoRef.current?.pause();
        setIsPlaying(false);
      }
    }
  });

  const inHandleProps = handleProps('in', pct(startSec) / 100);
  const outHandleProps = handleProps('out', pct(endSec) / 100);
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
          onWheel={adjustVolumeWithWheel}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 8,
            background: 'var(--pw-lowest)'
          }}
        >
          {!previewFailed && (
            <video
              key={`${fileName}:${activeStreamingPort}`}
              ref={videoRef}
              src={mediaUrl}
              poster={thumbnailUrl}
              preload="metadata"
              muted={isMuted}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                const pendingSeek = pendingSeekRef.current;
                if (pendingSeek !== null) {
                  if (Math.abs(video.currentTime - pendingSeek) > 0.08) return;
                  pendingSeekRef.current = null;
                }
                // Moving either trim boundary must not seek the preview or
                // trigger the normal range-end jump while the user is editing.
                if (video.paused || dragging === 'in' || dragging === 'out') {
                  setPlayhead(video.currentTime);
                  return;
                }
                if (strategy === 'delete' && video.currentTime >= startSec && video.currentTime < endSec) {
                  if (endSec < usableDuration) {
                    video.currentTime = endSec;
                    setPlayhead(endSec);
                  } else {
                    const lastRetained = Math.max(0, startSec - 0.001);
                    video.pause();
                    video.currentTime = lastRetained;
                    setPlayhead(lastRetained);
                    setIsPlaying(false);
                  }
                  return;
                }
                if (video.currentTime < startSec) {
                  video.currentTime = startSec;
                  setPlayhead(startSec);
                  return;
                }
                setPlayhead(video.currentTime);
                if (strategy === 'keep' && video.currentTime >= endSec) {
                  video.pause();
                  video.currentTime = endSec;
                  setPlayhead(endSec);
                  setIsPlaying(false);
                }
              }}
              onSeeked={(event) => {
                const video = event.currentTarget;
                const pendingSeek = pendingSeekRef.current;
                if (pendingSeek !== null && Math.abs(video.currentTime - pendingSeek) > 0.08) {
                  video.currentTime = pendingSeek;
                  return;
                }
                if (pendingSeek !== null) pendingSeekRef.current = null;
                setPlayhead(video.currentTime);
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
          {/* In/Out point hairlines removed — kept only on the timeline scrubber */}
          <span className="pro-canvas__chip pro-canvas__chip--br">
            {formatPreciseTrimTime(Math.max(0, playhead - timelineOrigin))} / {formatPreciseTrimTime(timelineDuration)}
          </span>
        </div>

        <div className="pro-transport" style={{ padding: '5px 8px' }}>
          {/* Duration readout removed per user request — timecode chip on the
              monitor already shows current position / total. */}
          <div className="pro-transport__cluster">
            <button type="button" className="pw-icon-btn" aria-label="Jump to start" onClick={() => seekPreview(0)}>
              <SkipBack size={11} />
            </button>
            <button type="button" className={`pw-icon-btn${cutLeftActive ? ' pw-icon-btn--danger' : ''}`} aria-label={strategy === 'delete' ? 'Set left edge of range to playhead' : 'Remove unwanted left clip'} title={strategy === 'delete' ? 'Set the left edge of the middle section to the playhead' : 'Remove the unwanted left clip'} disabled={cutLeftDisabled} onClick={strategy === 'keep' ? () => setPendingSideCut('left') : () => updateStart(playhead)}>
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
            {strategy === 'keep' && (
              <button type="button" className={`pw-icon-btn${cutRightActive ? ' pw-icon-btn--danger' : ''}`} aria-label="Remove unwanted right clip" title="Remove the unwanted right clip" disabled={cutRightDisabled} onClick={() => setPendingSideCut('right')}>
                <Scissors size={11} />
              </button>
            )}
            <button type="button" className="pw-icon-btn" aria-label="Jump to end" onClick={() => seekPreview(usableDuration)}>
              <SkipForward size={11} />
            </button>
            <button type="button" className="pw-icon-btn" aria-label="Undo cut" title="Undo cut" disabled={undoHistoryRef.current.length === 0} onClick={undoEdit}>
              <Undo2 size={11} />
            </button>
            <button type="button" className="pw-icon-btn" aria-label="Redo cut" title="Redo cut" disabled={redoHistoryRef.current.length === 0} onClick={redoEdit}>
              <Redo2 size={11} />
            </button>
          </div>
          <div className="pro-row pw-volume-control" style={{ gap: 5, alignItems: 'center' }} onWheel={adjustVolumeWithWheel}>
            <button
              type="button"
              className="pw-icon-btn"
              aria-label={`${isMuted ? 'Unmute' : 'Mute'}, volume ${volumePercent} percent. Scroll to adjust.`}
              onClick={() => {
                const shouldMute = !isMuted && volume > 0;
                const restoredVolume = shouldMute ? volume : (volume > 0 ? volume : lastAudibleVolume.current);
                setIsMuted(shouldMute);
                if (!shouldMute) setVolume(restoredVolume);
                if (videoRef.current) {
                  videoRef.current.volume = restoredVolume;
                  videoRef.current.muted = shouldMute;
                }
              }}
              title={`${isMuted ? 'Click to unmute' : 'Click to mute'} · ${volumePercent}% (scroll to adjust)`}
              style={{ opacity: 1, flexShrink: 0, border: 'none', background: 'transparent', overflow: 'visible' }}
            >
              <span
                className="pw-volume-ring"
                style={{
                  '--volume-progress': `${volumePercent}%`,
                  '--volume-ring-color': volumeRingColor,
                } as React.CSSProperties}
                aria-hidden="true"
              >
                <Volume2 size={11} style={{ color: isMuted ? '#f87171' : 'var(--pw-text)' }} />
              </span>
            </button>
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
          <button type="button" className="pw-seg__item" aria-pressed={strategy === 'keep'} onClick={() => setStrategy('keep')} style={{ fontSize: 10 }}>
            <Scissors size={11} /> Keep Range
          </button>
          <button type="button" className="pw-seg__item" aria-pressed={strategy === 'delete'} onClick={() => setStrategy('delete')} style={{ fontSize: 10 }}>
            <RotateCcw size={11} /> Cut &amp; Delete
          </button>
        </div>
        <div className="pro-grid-2">
          <label className="pw-field">
            <span className="pw-label" style={{ color: ACCENT, fontSize: 9 }}>● Start Time [In]</span>
            {renderTimeInputs(startDraft, setStartDraft, commitStartDraft, ACCENT, 'Start time')}
          </label>
          <label className="pw-field">
            <span className="pw-label" style={{ color: '#d8b4fe', fontSize: 9 }}>● End Time [Out]</span>
            {renderTimeInputs(endDraft, setEndDraft, commitEndDraft, '#d8b4fe', 'End time')}
          </label>
        </div>

        <div className="pro-transport__readout pro-telemetry" style={{ fontSize: 11, padding: '5px 8px' }}>
          <span style={{ color: 'var(--pw-text-dim)', fontSize: 9 }}>Output Duration:</span>
          <span style={{ color: ACCENT, marginLeft: 'auto', fontSize: 11 }}>{formatTrimTime(clipDuration)}</span>
        </div>
      </ProPanel>

      <ProPanel
        title="Quick Presets"
        icon={<Scissors size={13} />}
      >
        <div className="pw-tile-grid pw-tile-grid--4 pw-tile-grid--compact">
          <button type="button" className="pw-tile pw-tile--duration pw-tile--preset-first" aria-pressed={activePreset === 'first30'} onClick={() => applyPreset('first30')} disabled={usableDuration <= 0} style={{ padding: '5px 4px' }}>
            <SkipBack className="pw-tile__preset-icon pw-tile__preset-icon--first" size={16} />
            <span className="pw-tile__duration-value pw-tile__duration-value--first">30s</span>
            <span className="pw-tile__duration-label">First</span>
          </button>
          <button type="button" className="pw-tile pw-tile--duration pw-tile--preset-last" aria-pressed={activePreset === 'last30'} onClick={() => applyPreset('last30')} disabled={usableDuration <= 0} style={{ padding: '5px 4px' }}>
            <SkipForward className="pw-tile__preset-icon pw-tile__preset-icon--last" size={16} />
            <span className="pw-tile__duration-value pw-tile__duration-value--last">30s</span>
            <span className="pw-tile__duration-label">Last</span>
          </button>
          <button type="button" className="pw-tile pw-tile--duration pw-tile--preset-middle" aria-pressed={activePreset === 'middle'} onClick={() => applyPreset('middle')} disabled={usableDuration <= 0} style={{ padding: '5px 4px' }}>
            <Scissors className="pw-tile__preset-icon pw-tile__preset-icon--clip" size={16} />
            <span className="pw-tile__duration-value pw-tile__duration-value--clip">Clip</span>
            <span className="pw-tile__duration-label">Middle</span>
          </button>
          <button type="button" className="pw-tile pw-tile--duration pw-tile--reset pw-tile--preset-reset" aria-pressed={activePreset === 'reset'} onClick={resetRange} style={{ padding: '5px 4px' }}>
            <RotateCcw className="pw-tile__preset-icon pw-tile__preset-icon--reset" size={16} />
            <span className="pw-tile__duration-value pw-tile__duration-value--reset">Reset</span>
            <span className="pw-tile__duration-label">Range</span>
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
                onClick={() => zoomOut()}
                disabled={zoom <= 1}
                title="Zoom out timeline"
                style={{ minHeight: 20, padding: '2px 7px', fontSize: 10 }}
              >－</button>
              <span style={{ fontSize: 9, color: 'var(--pw-text-faint)', minWidth: 32, textAlign: 'center' }}>
                {zoom === 1 ? '1×' : `${zoom}×`}
              </span>
              <button
                type="button"
                className="pw-btn"
                onClick={() => zoomIn()}
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

          <div
            className="pw-scale pro-timeline__ruler"
            style={{ cursor: isRulerZooming ? 'ew-resize' : 'pointer' }}
            onWheel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsRulerZooming(true);
              if (rulerCursorTimer.current !== null) window.clearTimeout(rulerCursorTimer.current);
              rulerCursorTimer.current = window.setTimeout(() => {
                setIsRulerZooming(false);
                rulerCursorTimer.current = null;
              }, 600);
              if (event.deltaY < 0) zoomIn(event.clientX);
              else zoomOut(event.clientX);
            }}
            onPointerLeave={() => setIsRulerZooming(false)}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('.pro-timeline__ruler-playhead')) return;
              const track = trackRef.current;
              const rect = track?.getBoundingClientRect();
              if (!rect || rect.width <= 0 || timelineDuration <= 0) return;
              const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
              seekPreview(timelineOrigin + fraction * timelineDuration);
            }}
            title="Scroll over the ruler to zoom the timeline"
          >
            <div className="pro-timeline__ruler-track">
              {rulerMarks.map(({ time, major }) => (
                <i
                  key={`mark-${time}`}
                  aria-hidden="true"
                  className={`pro-timeline__ruler-mark${major ? ' pro-timeline__ruler-mark--major' : ''}`}
                  style={{ left: `${visibleDuration > 0 ? ((time - visibleStart) / visibleDuration) * 100 : 0}%` }}
                />
              ))}
              {displayedRulerTicks.map((tick) => (
                <span
                  key={tick}
                  className={tick === 0 ? 'pro-timeline__ruler-start' : tick === timelineDuration ? 'pro-timeline__ruler-end' : undefined}
                  style={{ left: `${visibleDuration > 0 ? ((tick - visibleStart) / visibleDuration) * 100 : 0}%` }}
                >
                  {tick === 0 || tick === timelineDuration
                    ? `${Math.floor(tick / 60)}:${String(Math.floor(tick % 60)).padStart(2, '0')}`
                    : formatTrimTime(tick)}
                </span>
              ))}
              {timelineDuration > 0 && playhead - timelineOrigin >= visibleStart && playhead - timelineOrigin <= visibleEnd && (
                <button
                  type="button"
                  className="pro-timeline__ruler-playhead"
                  aria-label={`Playhead at ${formatTrimTime(playhead)}. Drag to seek.`}
                  title="Drag to move the playhead"
                  style={{
                    left: `${visibleDuration > 0 ? ((playhead - timelineOrigin - visibleStart) / visibleDuration) * 100 : 0}%`,
                    touchAction
                  }}
                  {...handleProps('playhead', timelineDuration > 0 ? (playhead - timelineOrigin) / timelineDuration : 0)}
                />
              )}
            </div>
          </div>

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
                if (e.deltaY < 0) zoomIn(e.clientX);
                else zoomOut(e.clientX);
              } else {
                // Plain scroll = horizontal pan along the timeline
                if (scrollRef.current) {
                  scrollRef.current.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
                  setTimelineScrollLeft(scrollRef.current.scrollLeft);
                }
              }
            }}
            onScroll={() => {
              if (!scrollRef.current) return;
              setTimelineScrollLeft(scrollRef.current.scrollLeft);
              setTimelineContentWidth(scrollRef.current.scrollWidth);
            }}
          >
          <div
            className="pro-timeline__surface"
            style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
          >
            <div className="pro-timeline__tracks" ref={trackRef}>
              <div className="pro-tracklane">
                <span className="pro-tracklane__label">V1</span>
                <div className="pro-tracklane__body">
                  <Filmstrip
                    fileName={fileName}
                    key={`${fileName}:${activeStreamingPort}:${timelineOrigin}:${timelineEnd}`}
                    streamingPort={activeStreamingPort}
                    duration={timelineDuration}
                    sourceStart={timelineOrigin}
                    sourceEnd={timelineEnd}
                    frames={32}
                  />
                  {strategy === 'keep' ? <>
                    {hasLeftUnwanted && <div className="pro-tracklane__scrim" style={{ left: 0, width: `${pct(startSec)}%`, background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.18), rgba(248, 70, 86, 0.46))' }} />}
                    {hasRightUnwanted && <div className="pro-tracklane__scrim" style={{ left: `${pct(endSec)}%`, right: 0, background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.46), rgba(248, 70, 86, 0.18))' }} />}
                  </> : (
                    <div className="pro-tracklane__scrim" style={{ left: `${pct(startSec)}%`, width: `${Math.max(0, pct(endSec) - pct(startSec))}%`, background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.18), rgba(248, 70, 86, 0.46), rgba(248, 70, 86, 0.18))' }} />
                  )}
                  <div
                    className="pro-tracklane__sel"
                    style={{
                      left: `${pct(startSec)}%`,
                      width: `${Math.max(0, pct(endSec) - pct(startSec))}%`,
                      ...(strategy === 'delete' ? { background: 'rgba(248, 70, 86, 0.16)', '--tool-accent': '#f87171' } as React.CSSProperties : {})
                    }}
                  />
                </div>
              </div>

              <div className="pro-tracklane">
                <span className="pro-tracklane__label">A1</span>
                <div className="pro-tracklane__body pro-tracklane__body--audio">
                  <AudioWaveform
                    key={`${fileName}:${activeStreamingPort}`}
                    fileName={fileName}
                    streamingPort={activeStreamingPort}
                    mediaDuration={usableDuration}
                    height={52}
                    color="#38bdf8"
                    sourceStart={timelineOrigin}
                    sourceEnd={timelineEnd}
                  />
                  {strategy === 'keep' ? <>
                    {hasLeftUnwanted && <div className="pro-tracklane__scrim" style={{ left: 0, width: `${pct(startSec)}%`, background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.18), rgba(248, 70, 86, 0.46))' }} />}
                    {hasRightUnwanted && <div className="pro-tracklane__scrim" style={{ left: `${pct(endSec)}%`, right: 0, background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.46), rgba(248, 70, 86, 0.18))' }} />}
                  </> : (
                    <div className="pro-tracklane__scrim" style={{ left: `${pct(startSec)}%`, width: `${Math.max(0, pct(endSec) - pct(startSec))}%`, background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.18), rgba(248, 70, 86, 0.46), rgba(248, 70, 86, 0.18))' }} />
                  )}
                </div>
              </div>
            </div>

            {/* Draggable In / Out handles + playhead, pinned over the tracks. */}
            {usableDuration > 0 && (
              <div className={`pro-timeline__overlay${dragging ? ' is-dragging' : ''}`}>
                <button
                  type="button"
                  className={`pro-timeline__handle pro-timeline__handle--in${startSec <= 0.001 ? ' is-edge' : ''}`}
                  style={{ left: `${pct(startSec)}%`, ...handleStyle }}
                  aria-label="In point — drag along the timeline to trim the head"
                  title="Drag to set the in point"
                  {...inHandleProps}
                >
                  <i />
                </button>
                <button
                  type="button"
                  className={`pro-timeline__handle pro-timeline__handle--out${endSec >= usableDuration - 0.001 ? ' is-edge' : ''}`}
                  style={{ left: `${pct(endSec)}%`, ...handleStyle }}
                  aria-label="Out point — drag along the timeline to trim the tail"
                  title="Drag to set the out point"
                  {...outHandleProps}
                >
                  <i />
                </button>
                <div className="pro-timeline__playhead" style={{ left: `${pct(playhead)}%` }} aria-hidden="true">
                  <i />
                  <span>{formatTrimTime(Math.max(0, playhead - timelineOrigin))}</span>
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
            <em>RANGE: {formatTrimTime(selectedDuration)} ({selectionPct}% of clip)</em>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> KEYFRAME ACCURATE
            </span>
          </div>
        </section>
      </ProTimeline>

      {pendingSideCut && (
        <div
          className="pw-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingSideCut(null);
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(3, 5, 12, 0.76)', backdropFilter: 'blur(6px)' }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="side-cut-title"
            aria-describedby="side-cut-description"
            style={{ width: 'min(420px, 100%)', padding: 22, borderRadius: 16, border: '1px solid rgba(248, 113, 113, 0.4)', background: 'linear-gradient(145deg, #171827, #0d0e17)', boxShadow: '0 24px 80px rgba(0,0,0,.55)', color: 'var(--pw-text, #f8fafc)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#f87171', background: 'rgba(248, 113, 113, .14)' }}><Scissors size={18} /></span>
              <div>
                <h2 id="side-cut-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{pendingSideCut === 'left' ? 'Remove the unwanted left clip?' : 'Remove the unwanted right clip?'}</h2>
                <span style={{ color: 'var(--pw-text-dim, #94a3b8)', fontSize: 11 }}>This action changes the edit timeline.</span>
              </div>
            </div>
            <p id="side-cut-description" style={{ margin: '0 0 20px', color: 'var(--pw-text-dim, #b7bdcc)', fontSize: 13, lineHeight: 1.55 }}>
              {pendingSideCut === 'left'
                ? 'The footage before your selected range will be removed. The selected clip shifts to the timeline start, and the right-side unwanted clip stays available until you remove it.'
                : 'The footage after your selected range will be removed. Your selected clip stays in place and remains selected.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="pw-btn pw-btn--secondary" onClick={() => setPendingSideCut(null)}>Cancel</button>
              <button type="button" className="pw-btn pw-btn--danger" onClick={confirmSideCut}><Scissors size={14} /> Remove clip</button>
            </div>
          </section>
        </div>
      )}

    </ProToolShell>
  );
};
