import React from "react";
import { Filmstrip, AudioWaveform } from "../timeline";

interface TrimTimelineTracksProps {
  zoom: number;
  trackRef: React.RefObject<HTMLDivElement | null>;
  fileName: string;
  activeStreamingPort: number;
  timelineDuration: number;
  timelineOrigin: number;
  timelineEnd: number;
  usableDuration: number;
  strategy: 'keep' | 'delete';
  hasLeftUnwanted: boolean;
  hasRightUnwanted: boolean;
  startSec: number;
  endSec: number;
  playhead: number;
  pct: (sec: number) => number;
  dragging: 'in' | 'out' | 'playhead' | null;
  handleStyle: React.CSSProperties;
  inHandleProps: Record<string, any>;
  outHandleProps: Record<string, any>;
  formatTrimTime: (val: number) => string;
}

export const TrimTimelineTracks: React.FC<TrimTimelineTracksProps> = ({
  zoom,
  trackRef,
  fileName,
  activeStreamingPort,
  timelineDuration,
  timelineOrigin,
  timelineEnd,
  usableDuration,
  strategy,
  hasLeftUnwanted,
  hasRightUnwanted,
  startSec,
  endSec,
  playhead,
  pct,
  dragging,
  handleStyle,
  inHandleProps,
  outHandleProps,
  formatTrimTime,
}) => {
  return (
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
              key={`${fileName}:${activeStreamingPort}`}
              streamingPort={activeStreamingPort}
              duration={timelineDuration}
              sourceStart={timelineOrigin}
              sourceEnd={timelineEnd}
              frames={12}
            />
            {strategy === 'keep' ? (
              <>
                {hasLeftUnwanted && (
                  <div
                    className="pro-tracklane__scrim"
                    style={{
                      left: 0,
                      width: `${pct(startSec)}%`,
                      background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.18), rgba(248, 70, 86, 0.46))'
                    }}
                  />
                )}
                {hasRightUnwanted && (
                  <div
                    className="pro-tracklane__scrim"
                    style={{
                      left: `${pct(endSec)}%`,
                      right: 0,
                      background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.46), rgba(248, 70, 86, 0.18))'
                    }}
                  />
                )}
              </>
            ) : (
              <div
                className="pro-tracklane__scrim"
                style={{
                  left: `${pct(startSec)}%`,
                  width: `${Math.max(0, pct(endSec) - pct(startSec))}%`,
                  background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.18), rgba(248, 70, 86, 0.46), rgba(248, 70, 86, 0.18))'
                }}
              />
            )}
            <div
              className="pro-tracklane__sel"
              style={{
                left: `${pct(startSec)}%`,
                width: `${Math.max(0, pct(endSec) - pct(startSec))}%`,
                ...(strategy === 'delete'
                  ? ({ background: 'rgba(248, 70, 86, 0.16)', '--tool-accent': '#f87171' } as React.CSSProperties)
                  : {})
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
            {strategy === 'keep' ? (
              <>
                {hasLeftUnwanted && (
                  <div
                    className="pro-tracklane__scrim"
                    style={{
                      left: 0,
                      width: `${pct(startSec)}%`,
                      background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.18), rgba(248, 70, 86, 0.46))'
                    }}
                  />
                )}
                {hasRightUnwanted && (
                  <div
                    className="pro-tracklane__scrim"
                    style={{
                      left: `${pct(endSec)}%`,
                      right: 0,
                      background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.46), rgba(248, 70, 86, 0.18))'
                    }}
                  />
                )}
              </>
            ) : (
              <div
                className="pro-tracklane__scrim"
                style={{
                  left: `${pct(startSec)}%`,
                  width: `${Math.max(0, pct(endSec) - pct(startSec))}%`,
                  background: 'linear-gradient(90deg, rgba(248, 70, 86, 0.18), rgba(248, 70, 86, 0.46), rgba(248, 70, 86, 0.18))'
                }}
              />
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
  );
};
