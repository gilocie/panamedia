import React from 'react';
import {
  Scissors,
  RotateCcw,
  SkipBack,
  SkipForward,
  Timer
} from 'lucide-react';
import { ProInspector, ProPanel } from '../ProToolShell';

const ACCENT = '#38bdf8';

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

export interface TrimTelemetryPanelProps {
  strategy: 'keep' | 'delete';
  setStrategy: (strategy: 'keep' | 'delete') => void;
  startDraft: { hours: string; minutes: string; seconds: string };
  setStartDraft: React.Dispatch<React.SetStateAction<{ hours: string; minutes: string; seconds: string }>>;
  commitStartDraft: () => void;
  endDraft: { hours: string; minutes: string; seconds: string };
  setEndDraft: React.Dispatch<React.SetStateAction<{ hours: string; minutes: string; seconds: string }>>;
  commitEndDraft: () => void;
  clipDuration: number;
  activePreset: string | null;
  applyPreset: (preset: 'first30' | 'last30' | 'middle') => void;
  resetRange: () => void;
  usableDuration: number;
  playhead: number;
  updateStart: (val: number) => void;
  updateEnd: (val: number) => void;
}

export const TrimTelemetryPanel: React.FC<TrimTelemetryPanelProps> = ({
  strategy,
  setStrategy,
  startDraft,
  setStartDraft,
  commitStartDraft,
  endDraft,
  setEndDraft,
  commitEndDraft,
  clipDuration,
  activePreset,
  applyPreset,
  resetRange,
  usableDuration,
  playhead,
  updateStart,
  updateEnd
}) => {
  const renderTimeInputs = (
    draft: { hours: string; minutes: string; seconds: string },
    setDraft: React.Dispatch<React.SetStateAction<{ hours: string; minutes: string; seconds: string }>>,
    commit: () => void,
    color: string,
    label: string
  ) => (
    <div className="pw-input pw-input--sm pro-row pro-telemetry" style={{ gap: 2, padding: '0 4px', height: 36, display: 'flex', alignItems: 'center' }}>
      <input
        className="pw-number"
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={draft.minutes}
        onChange={event => setDraft(current => ({ ...current, minutes: event.target.value.replace(/\D/g, '').slice(0, 2) }))}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }}
        style={{ color, textAlign: 'center', minWidth: 0, flex: 1, height: 36, fontSize: 13 }}
        aria-label={`${label} minutes`}
      />
      <span aria-hidden="true" style={{ color: 'var(--pw-text-faint)' }}>:</span>
      <input
        className="pw-number"
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={draft.seconds}
        onChange={event => setDraft(current => ({ ...current, seconds: event.target.value.replace(/\D/g, '').slice(0, 2) }))}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }}
        style={{ color, textAlign: 'center', minWidth: 0, flex: 1, height: 36, fontSize: 13 }}
        aria-label={`${label} seconds`}
      />
      <button
        type="button"
        className="pw-icon-btn"
        aria-label={`Set ${label.toLowerCase()} to playhead`}
        onClick={() => label === 'Start time' ? updateStart(playhead) : updateEnd(playhead)}
      >
        {label === 'Start time' ? <SkipBack size={10} /> : <SkipForward size={10} />}
      </button>
    </div>
  );

  return (
    <ProInspector>
      <ProPanel
        title="Trimming Strategy"
        icon={<Timer size={13} />}
        action={<span className="pw-badge" style={{ fontSize: 8 }}>LIVE</span>}
      >
        <div className="pw-seg pw-seg--row">
          <button
            type="button"
            className="pw-seg__item"
            aria-pressed={strategy === 'keep'}
            onClick={() => setStrategy('keep')}
            style={{ fontSize: 10 }}
          >
            <Scissors size={11} /> Keep Range
          </button>
          <button
            type="button"
            className="pw-seg__item"
            aria-pressed={strategy === 'delete'}
            onClick={() => setStrategy('delete')}
            style={{ fontSize: 10 }}
          >
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

        <div
          className="pro-transport__readout pro-telemetry"
          style={{
            minHeight: '38px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '8px',
            boxSizing: 'border-box'
          }}
        >
          <span style={{ color: 'var(--pw-text-dim)', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
            Output Duration:
          </span>
          <span style={{ color: ACCENT, marginLeft: 'auto', fontSize: '16.5px', fontWeight: 800, fontFamily: 'monospace', textShadow: '0 0 10px rgba(6, 182, 212, 0.3)' }}>
            {formatTrimTime(clipDuration)}
          </span>
        </div>
      </ProPanel>

      <ProPanel
        title="Quick Presets"
        icon={<Scissors size={13} />}
      >
        <div className="pw-tile-grid pw-tile-grid--4 pw-tile-grid--compact">
          <button
            type="button"
            className="pw-tile pw-tile--duration pw-tile--preset-first"
            aria-pressed={activePreset === 'first30'}
            onClick={() => applyPreset('first30')}
            disabled={usableDuration <= 0}
            style={{ padding: '5px 4px' }}
          >
            <SkipBack className="pw-tile__preset-icon pw-tile__preset-icon--first" size={16} />
            <span className="pw-tile__duration-value pw-tile__duration-value--first">30s</span>
            <span className="pw-tile__duration-label">First</span>
          </button>
          <button
            type="button"
            className="pw-tile pw-tile--duration pw-tile--preset-last"
            aria-pressed={activePreset === 'last30'}
            onClick={() => applyPreset('last30')}
            disabled={usableDuration <= 0}
            style={{ padding: '5px 4px' }}
          >
            <SkipForward className="pw-tile__preset-icon pw-tile__preset-icon--last" size={16} />
            <span className="pw-tile__duration-value pw-tile__duration-value--last">30s</span>
            <span className="pw-tile__duration-label">Last</span>
          </button>
          <button
            type="button"
            className="pw-tile pw-tile--duration pw-tile--preset-middle"
            aria-pressed={activePreset === 'middle'}
            onClick={() => applyPreset('middle')}
            disabled={usableDuration <= 0}
            style={{ padding: '5px 4px' }}
          >
            <Scissors className="pw-tile__preset-icon pw-tile__preset-icon--clip" size={16} />
            <span className="pw-tile__duration-value pw-tile__duration-value--clip">Clip</span>
            <span className="pw-tile__duration-label">Middle</span>
          </button>
          <button
            type="button"
            className="pw-tile pw-tile--duration pw-tile--reset pw-tile--preset-reset"
            aria-pressed={activePreset === 'reset'}
            onClick={resetRange}
            style={{ padding: '5px 4px' }}
          >
            <RotateCcw className="pw-tile__preset-icon pw-tile__preset-icon--reset" size={16} />
            <span className="pw-tile__duration-value pw-tile__duration-value--reset">Reset</span>
            <span className="pw-tile__duration-label">Range</span>
          </button>
        </div>
      </ProPanel>
    </ProInspector>
  );
};
