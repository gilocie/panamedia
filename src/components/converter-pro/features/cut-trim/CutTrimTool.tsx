import React, { useEffect, useRef, useState } from "react";
import { Scissors, Check, Timer } from "lucide-react";
import { TimelineRuler, useTimelineDrag } from "../timeline";
import { electron } from "../../../panamedia/types";
import { ProTimeline, ProToolShell } from "../ProToolShell";
import { TrimTelemetryPanel } from "./TrimTelemetryPanel";
import { TrimTransportBar } from "./TrimTransportBar";
import { TrimSideCutModal } from "./TrimSideCutModal";
import { TrimTimelineTracks } from "./TrimTimelineTracks";

export type TrimStrategy = 'keep' | 'delete';
export type CutSettings = { startSec: number; endSec: number; strategy: TrimStrategy; timelineOrigin?: number; rightCutApplied?: boolean };
export type TrimSnapshot = { startSec: number; endSec: number; strategy: TrimStrategy; timelineOrigin: number; rightCutApplied: boolean };

export interface CutTrimToolProps {
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
  const retryCountRef = useRef(0);
  const [zoom, setZoom] = useState(1); // 0.25x – 4x
  const volumeStorageKey = `converter_cut_volume:${encodeURIComponent(fileName.toLowerCase())}`;
  const [savedAudio] = useState(() => {
    try {
      const raw = localStorage.getItem(volumeStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed.volume === 'number') {
        return {
          volume: Math.max(0, Math.min(1, parsed.volume)),
          muted: parsed.muted === true
        };
      }
      const sharedVol = localStorage.getItem('player_volume');
      if (sharedVol !== null) {
        const v = Number(sharedVol);
        if (!isNaN(v)) {
          return { volume: v > 1 ? v / 100 : v, muted: false };
        }
      }
    } catch { /* storage fallback */ }
    return { volume: 1, muted: false };
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
    const onPort = (_e: unknown, port: number) => {
      if (port) setActiveStreamingPort(port);
    };
    electron.ipcRenderer.on('streaming-port-ready', onPort);
    return () => {
      try { electron.ipcRenderer.removeListener('streaming-port-ready', onPort); } catch (_) {}
    };
  }, [streamingPort]);

  const adjustVolumeWithWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const next = Math.max(0, Math.min(1, (isMuted ? 0 : volume) + (event.deltaY < 0 ? 0.05 : -0.05)));
    setVolume(next);
    setIsMuted(next === 0);
    if (next > 0) lastAudibleVolume.current = next;
    try {
      localStorage.setItem(volumeStorageKey, JSON.stringify({ volume: next, muted: next === 0 }));
      localStorage.setItem('player_volume', String(Math.round(next * 100)));
      window.dispatchEvent(new CustomEvent('converter-volume-change', {
        detail: { file: fileName, volume: next, muted: next === 0 }
      }));
    } catch { /* storage may be unavailable */ }
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
    try {
      localStorage.setItem(volumeStorageKey, JSON.stringify({ volume, muted: isMuted }));
      localStorage.setItem('player_volume', String(Math.round((isMuted ? 0 : volume) * 100)));
      window.dispatchEvent(new CustomEvent('converter-volume-change', {
        detail: { file: fileName, volume, muted: isMuted }
      }));
    } catch { /* storage may be unavailable */ }
  }, [volume, isMuted, volumeStorageKey, fileName]);

  // Synchronize with external volume changes from preview monitor
  useEffect(() => {
    const onVolumeSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        const { file, volume: syncVol, muted: syncMuted } = customEvent.detail;
        if (!file || !fileName || file.toLowerCase() === fileName.toLowerCase()) {
          if (typeof syncVol === 'number' && Math.abs(syncVol - volume) > 0.01) {
            setVolume(syncVol);
            if (syncVol > 0) lastAudibleVolume.current = syncVol;
            if (videoRef.current) videoRef.current.volume = syncVol;
          }
          if (typeof syncMuted === 'boolean' && syncMuted !== isMuted) {
            setIsMuted(syncMuted);
            if (videoRef.current) videoRef.current.muted = syncMuted;
          }
        }
      }
    };
    window.addEventListener('converter-volume-change', onVolumeSync);
    return () => window.removeEventListener('converter-volume-change', onVolumeSync);
  }, [fileName, volume, isMuted]);

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
    retryCountRef.current = 0;
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
    setPlayhead(boundedTime);
    const video = videoRef.current;
    if (video) {
      if (video.seeking) {
        pendingSeekRef.current = boundedTime;
      } else {
        try {
          video.currentTime = boundedTime;
        } catch (_) {}
      }
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

  const togglePreview = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (electron) {
        electron.ipcRenderer.send('player-remote-command', 'pause');
      }
      pendingSeekRef.current = null;
      if (strategy === 'keep' && (video.currentTime < startSec - 0.2 || video.currentTime >= endSec)) {
        try { video.currentTime = startSec; } catch (_) {}
      }
      try {
        await video.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('[CutTrimTool] Playback blocked or interrupted:', err);
        if (videoRef.current && !videoRef.current.paused) {
          setIsPlaying(true);
        } else {
          setIsPlaying(false);
        }
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
    retryCountRef.current = 0;
    setPreviewFailed(false);
    const video = videoRef.current;
    const actualDuration = video?.duration;
    if (!actualDuration || !Number.isFinite(actualDuration)) return;
    setMediaDuration(actualDuration);
    const minRange = Math.min(0.1, actualDuration);
    const safeStart = Math.min(startSec, Math.max(0, actualDuration - minRange));
    setStartSec(safeStart);
    setEndSec((current) => {
      if (!hasEditedRange.current) return actualDuration;
      return Math.max(Math.min(current, actualDuration), Math.min(actualDuration, safeStart + minRange));
    });
    if (video) {
      const targetTime = playhead > 0 ? playhead : safeStart;
      try {
        video.currentTime = targetTime;
      } catch (_) {}
    }
  };

  const handlePreviewError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const err = e.currentTarget.error;
    // Ignore MEDIA_ERR_ABORTED (code 1) which happens on normal re-mount or seek cancel
    if (err && err.code === 1) return;
    console.warn('[CutTrimTool] Video preview stream error:', err);
    if (retryCountRef.current < 3) {
      retryCountRef.current += 1;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.load();
        }
      }, 350 * retryCountRef.current);
      return;
    }
    setPreviewFailed(true);
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
          <video
            key={`${fileName}:${activeStreamingPort}`}
            ref={videoRef}
            src={mediaUrl}
            crossOrigin="anonymous"
            preload="auto"
            muted={isMuted}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (video.seeking) return;
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
              if (strategy === 'keep') {
                if (video.currentTime >= endSec) {
                  video.pause();
                  video.currentTime = endSec;
                  setPlayhead(endSec);
                  setIsPlaying(false);
                  return;
                }
              }
              setPlayhead(video.currentTime);
              if (video.currentTime >= usableDuration) {
                video.pause();
                video.currentTime = usableDuration;
                setPlayhead(usableDuration);
                setIsPlaying(false);
              }
            }}
            onSeeked={(event) => {
              const video = event.currentTarget;
              const pendingSeek = pendingSeekRef.current;
              if (pendingSeek !== null) {
                pendingSeekRef.current = null;
                if (Math.abs(video.currentTime - pendingSeek) > 0.05) {
                  try { video.currentTime = pendingSeek; } catch (_) {}
                  return;
                }
              }
              setPlayhead(video.currentTime);
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={handlePreviewError}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
          {previewFailed && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: 20,
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.85)',
                background: `linear-gradient(rgba(7,8,14,0.8), rgba(7,8,14,0.92)), url("${thumbnailUrl}") center / cover`,
                fontSize: 12,
                zIndex: 3
              }}
            >
              <span>Preview stream is buffering. You can still set the trim range.</span>
              <button
                type="button"
                onClick={() => {
                  retryCountRef.current = 0;
                  setPreviewFailed(false);
                  setTimeout(() => {
                    if (videoRef.current) videoRef.current.load();
                  }, 100);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  background: 'rgba(56, 189, 248, 0.22)',
                  border: '1px solid rgba(56, 189, 248, 0.55)',
                  color: '#38bdf8',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reload Stream
              </button>
            </div>
          )}
          {/* In/Out point hairlines removed — kept only on the timeline scrubber */}
          <span className="pro-canvas__chip pro-canvas__chip--br">
            {formatPreciseTrimTime(Math.max(0, playhead - timelineOrigin))} / {formatPreciseTrimTime(timelineDuration)}
          </span>
        </div>

        <TrimTransportBar
          seekPreview={seekPreview}
          playhead={playhead}
          usableDuration={usableDuration}
          strategy={strategy}
          cutLeftActive={cutLeftActive}
          cutLeftDisabled={cutLeftDisabled}
          setPendingSideCut={setPendingSideCut}
          updateStart={updateStart}
          isPlaying={isPlaying}
          togglePreview={togglePreview}
          cutRightActive={cutRightActive}
          cutRightDisabled={cutRightDisabled}
          undoEdit={undoEdit}
          redoEdit={redoEdit}
          canUndo={undoHistoryRef.current.length > 0}
          canRedo={redoHistoryRef.current.length > 0}
          adjustVolumeWithWheel={adjustVolumeWithWheel}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          volume={volume}
          setVolume={setVolume}
          lastAudibleVolume={lastAudibleVolume}
          videoRef={videoRef}
          volumePercent={volumePercent}
          volumeRingColor={volumeRingColor}
        />
      </section>

      <TrimTelemetryPanel
        strategy={strategy}
        setStrategy={setStrategy}
        startDraft={startDraft}
        setStartDraft={setStartDraft}
        commitStartDraft={commitStartDraft}
        endDraft={endDraft}
        setEndDraft={setEndDraft}
        commitEndDraft={commitEndDraft}
        clipDuration={clipDuration}
        activePreset={activePreset}
        applyPreset={applyPreset}
        resetRange={resetRange}
        usableDuration={usableDuration}
        playhead={playhead}
        updateStart={updateStart}
        updateEnd={updateEnd}
      />

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

          <TimelineRuler
            isRulerZooming={isRulerZooming}
            setIsRulerZooming={setIsRulerZooming}
            rulerCursorTimer={rulerCursorTimer}
            zoomIn={zoomIn}
            zoomOut={zoomOut}
            trackRef={trackRef}
            timelineDuration={timelineDuration}
            timelineOrigin={timelineOrigin}
            seekPreview={seekPreview}
            rulerMarks={rulerMarks}
            displayedRulerTicks={displayedRulerTicks}
            visibleDuration={visibleDuration}
            visibleStart={visibleStart}
            visibleEnd={visibleEnd}
            playhead={playhead}
            touchAction={touchAction}
            handleProps={handleProps}
            formatTrimTime={formatTrimTime}
          />

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
            <TrimTimelineTracks
              zoom={zoom}
              trackRef={trackRef}
              fileName={fileName}
              activeStreamingPort={activeStreamingPort}
              timelineDuration={timelineDuration}
              timelineOrigin={timelineOrigin}
              timelineEnd={timelineEnd}
              usableDuration={usableDuration}
              strategy={strategy}
              hasLeftUnwanted={hasLeftUnwanted}
              hasRightUnwanted={hasRightUnwanted}
              startSec={startSec}
              endSec={endSec}
              playhead={playhead}
              pct={pct}
              dragging={dragging}
              handleStyle={handleStyle}
              inHandleProps={inHandleProps}
              outHandleProps={outHandleProps}
              formatTrimTime={formatTrimTime}
            />
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
        <TrimSideCutModal
          side={pendingSideCut}
          onConfirm={confirmSideCut}
          onCancel={() => setPendingSideCut(null)}
        />
      )}

    </ProToolShell>
  );
};
