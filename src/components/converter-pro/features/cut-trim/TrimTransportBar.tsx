import React from 'react';
import {
  Scissors,
  SkipBack,
  SkipForward,
  FastForward,
  Pause,
  Play,
  Volume2,
  Undo2,
  Redo2
} from 'lucide-react';

export interface TrimTransportBarProps {
  seekPreview: (time: number) => void;
  playhead: number;
  usableDuration: number;
  strategy: 'keep' | 'delete';
  cutLeftActive: boolean;
  cutLeftDisabled: boolean;
  setPendingSideCut: (side: 'left' | 'right') => void;
  updateStart: (time: number) => void;
  isPlaying: boolean;
  togglePreview: () => void;
  cutRightActive: boolean;
  cutRightDisabled: boolean;
  undoEdit: () => void;
  redoEdit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  adjustVolumeWithWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  volume: number;
  setVolume: (vol: number) => void;
  lastAudibleVolume: React.MutableRefObject<number>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  volumePercent: number;
  volumeRingColor: string;
}

export const TrimTransportBar: React.FC<TrimTransportBarProps> = ({
  seekPreview,
  playhead,
  usableDuration,
  strategy,
  cutLeftActive,
  cutLeftDisabled,
  setPendingSideCut,
  updateStart,
  isPlaying,
  togglePreview,
  cutRightActive,
  cutRightDisabled,
  undoEdit,
  redoEdit,
  canUndo,
  canRedo,
  adjustVolumeWithWheel,
  isMuted,
  setIsMuted,
  volume,
  setVolume,
  lastAudibleVolume,
  videoRef,
  volumePercent,
  volumeRingColor
}) => {
  return (
    <div className="pro-transport" style={{ padding: '5px 8px' }}>
      <div className="pro-transport__cluster">
        <button type="button" className="pw-icon-btn" aria-label="Jump to start" onClick={() => seekPreview(0)}>
          <SkipBack size={11} />
        </button>
        <button
          type="button"
          className={`pw-icon-btn${cutLeftActive ? ' pw-icon-btn--danger' : ''}`}
          aria-label={strategy === 'delete' ? 'Set left edge of range to playhead' : 'Remove unwanted left clip'}
          title={strategy === 'delete' ? 'Set the left edge of the middle section to the playhead' : 'Remove the unwanted left clip'}
          disabled={cutLeftDisabled}
          onClick={strategy === 'keep' ? () => setPendingSideCut('left') : () => updateStart(playhead)}
        >
          <Scissors size={11} />
        </button>
        <button type="button" className="pw-icon-btn" aria-label="Step back" onClick={() => seekPreview(Math.max(0, playhead - 1))}>
          <SkipBack size={10} />
        </button>
        <button
          type="button"
          className={`pw-icon-btn${isPlaying ? ' pw-icon-btn--on' : ''}`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePreview}
          style={{ width: 30, height: 30 }}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
        </button>
        <button type="button" className="pw-icon-btn" aria-label="Step forward" onClick={() => seekPreview(Math.min(usableDuration, playhead + 1))}>
          <FastForward size={10} />
        </button>
        {strategy === 'keep' && (
          <button
            type="button"
            className={`pw-icon-btn${cutRightActive ? ' pw-icon-btn--danger' : ''}`}
            aria-label="Remove unwanted right clip"
            title="Remove the unwanted right clip"
            disabled={cutRightDisabled}
            onClick={() => setPendingSideCut('right')}
          >
            <Scissors size={11} />
          </button>
        )}
        <button type="button" className="pw-icon-btn" aria-label="Jump to end" onClick={() => seekPreview(usableDuration)}>
          <SkipForward size={11} />
        </button>
        <button type="button" className="pw-icon-btn" aria-label="Undo cut" title="Undo cut" disabled={!canUndo} onClick={undoEdit}>
          <Undo2 size={11} />
        </button>
        <button type="button" className="pw-icon-btn" aria-label="Redo cut" title="Redo cut" disabled={!canRedo} onClick={redoEdit}>
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
          style={{
            width: 26,
            height: 26,
            position: 'relative',
            opacity: 1,
            flexShrink: 0,
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <div style={{
            position: 'relative',
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg
              width={20}
              height={20}
              viewBox="0 0 20 20"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none'
              }}
              aria-hidden="true"
            >
              <circle
                cx={10}
                cy={10}
                r={8}
                fill="none"
                stroke="rgba(255, 255, 255, 0.18)"
                strokeWidth={1.75}
              />
              <circle
                cx={10}
                cy={10}
                r={8}
                fill="none"
                stroke={isMuted ? '#f87171' : volumeRingColor}
                strokeWidth={1.75}
                strokeDasharray={2 * Math.PI * 8}
                strokeDashoffset={(2 * Math.PI * 8) * (1 - (isMuted ? 0 : volumePercent) / 100)}
                strokeLinecap="round"
                transform="rotate(-90 10 10)"
                style={{ transition: 'stroke-dashoffset 0.12s ease, stroke 0.15s ease' }}
              />
            </svg>
            <Volume2
              size={10}
              style={{
                position: 'relative',
                zIndex: 2,
                color: isMuted ? '#f87171' : (volumePercent === 0 ? 'rgba(255,255,255,0.4)' : '#fff')
              }}
            />
          </div>
        </button>
        {isMuted && <span className="pw-data" style={{ fontSize: 9, color: '#f87171', flexShrink: 0 }}>MUTED</span>}
      </div>
    </div>
  );
};
