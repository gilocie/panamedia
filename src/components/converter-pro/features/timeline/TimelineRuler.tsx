import React from "react";

export interface TimelineRulerProps {
  isRulerZooming: boolean;
  setIsRulerZooming: (val: boolean) => void;
  rulerCursorTimer: React.MutableRefObject<number | null>;
  zoomIn: (clientX?: number) => void;
  zoomOut: (clientX?: number) => void;
  trackRef: React.RefObject<HTMLDivElement | null>;
  timelineDuration: number;
  timelineOrigin: number;
  seekPreview: (time: number) => void;
  rulerMarks: Array<{ time: number; major: boolean }>;
  displayedRulerTicks: number[];
  visibleDuration: number;
  visibleStart: number;
  visibleEnd: number;
  playhead: number;
  touchAction: React.CSSProperties['touchAction'];
  handleProps: (handle: 'in' | 'out' | 'playhead', currentFraction: number) => Record<string, any>;
  formatTrimTime: (val: number) => string;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  isRulerZooming,
  setIsRulerZooming,
  rulerCursorTimer,
  zoomIn,
  zoomOut,
  trackRef,
  timelineDuration,
  timelineOrigin,
  seekPreview,
  rulerMarks,
  displayedRulerTicks,
  visibleDuration,
  visibleStart,
  visibleEnd,
  playhead,
  touchAction,
  handleProps,
  formatTrimTime,
}) => {
  return (
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
  );
};
