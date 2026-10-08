import React, { useState } from 'react';
import { Check, Layers, RefreshCw, Scissors, Split } from 'lucide-react';
import { formatSeconds } from '../../types';
import { Filmstrip, AudioWaveform } from '../timeline';
import { MediaToolPreview } from '../monitor';
import {
  ProInspector,
  ProPanel,
  ProSlider,
  ProStat,
  ProTimeline,
  ProToolShell,
  ProTrack
} from '../ProToolShell';

export interface SplitToolProps {
  fileName: string;
  streamingPort?: number;
  duration?: number;
  onApply: (splitSettings: { segmentSec: number }) => void;
  onClose: () => void;
}

const ACCENT = '#f87171';

/* Reference: no dedicated mockup — Split follows the same
   cut_trim_studio language: monitor + ledger on the left, parameter dock on the right. */
const TIERS = [
  { label: '10s', value: 10, blurb: 'Social clips' },
  { label: '30s', value: 30, blurb: 'Short inserts' },
  { label: '1m', value: 60, blurb: 'Default' },
  { label: '5m', value: 300, blurb: 'Long-form' },
  { label: '10m', value: 600, blurb: 'Chapters' }
];

export const SplitTool: React.FC<SplitToolProps> = ({
  fileName,
  streamingPort,
  duration,
  onApply,
  onClose
}) => {
  const [segmentSec, setSegmentSec] = useState<number>(60);

  const dur = duration && duration > 0 ? duration : 0;
  const count = dur > 0 ? Math.max(1, Math.ceil(dur / segmentSec)) : 0;

  // Ledger rows: show at most 6 so the panel stays compact.
  const rows = Array.from({ length: Math.min(count, 6) }, (_, i) => i + 1);
  const shown = Math.min(rows.length, 6);

  return (
    <ProToolShell
      title="Split & Segment File"
      subtitle={fileName}
      icon={<Split size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> STREAM SLICER
          </span>
          <span className="pw-badge pw-badge--flat">
            {count > 0 ? `${count} SEGMENT${count === 1 ? '' : 'S'}` : 'DURATION UNKNOWN'}
          </span>
        </>
      }
      onClose={onClose}
      footerLeft={
        <>
          <button type="button" className="pw-btn" onClick={() => setSegmentSec(60)}>
            <RefreshCw size={13} /> Reset to Default
          </button>
          <button type="button" className="pw-btn" onClick={onClose}>
            Discard
          </button>
        </>
      }
      footerMeta={
        <>
          <span className="pw-eyebrow">
            {dur > 0 ? `${count} × ~${formatSeconds(segmentSec)}` : `Segments of ${formatSeconds(segmentSec)}`}
          </span>
          <span className="pw-data" style={{ color: ACCENT }}>numbered name001, name002, …</span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ segmentSec });
        onClose();
      }}
    >
      {/* ── Canvas & Monitor column ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <Layers size={16} />
            <span>Split Preview & Ledger</span>
          </div>
          <span className="pw-badge">{count > 0 ? `${count} output file${count === 1 ? '' : 's'}` : 'Awaiting duration'}</span>
        </div>

        {/* Live monitor preview */}
        <MediaToolPreview
          fileName={fileName}
          streamingPort={streamingPort}
          note={`Split into ${formatSeconds(segmentSec)} slices`}
          style={{ minHeight: 180, maxHeight: 240 }}
        />

        {count > 0 ? (
          <div className="pro-col" style={{ gap: 5, marginTop: 8 }}>
            {rows.map(i => {
              const from = (i - 1) * segmentSec;
              const to = Math.min(dur, i * segmentSec);
              const fromPct = (from / dur) * 100;
              const toPct = (to / dur) * 100;
              return (
                <div
                  key={i}
                  className="pro-row"
                  style={{ gap: 10, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--pw-line)', background: 'var(--pw-high)' }}
                >
                  <span
                    className="pw-data"
                    style={{ color: ACCENT, width: 62, flexShrink: 0, fontWeight: 700 }}
                  >
                    SEG {String(i).padStart(2, '0')}
                  </span>
                  <span className="pw-data" style={{ flex: 1, minWidth: 0, color: 'var(--pw-text-dim)' }}>
                    {formatSeconds(from)} → {formatSeconds(to)}
                  </span>
                  <span style={{ width: 96, flexShrink: 0 }}>
                    <ProTrack from={fromPct} to={toPct} slim />
                  </span>
                </div>
              );
            })}
            {count > shown && (
              <span className="pw-data" style={{ color: 'var(--pw-text-faint)', fontSize: 10 }}>
                + {count - shown} more segment{count - shown === 1 ? '' : 's'} written during conversion
              </span>
            )}
          </div>
        ) : (
          <div className="pro-note">
            The source duration is not known yet. Set a segment length and the exact segment count is
            resolved when the conversion runs.
          </div>
        )}
      </section>

      <ProInspector>
        {/* ── Inspector ── */}
        <ProPanel
          title="Segment Length"
          icon={<Split size={15} />}
          action={<span className="pw-badge">{formatSeconds(segmentSec)}</span>}
        >
          <ProSlider
            label="Segment length"
            readout={<span className="pw-data" style={{ color: ACCENT }}>{formatSeconds(segmentSec)}</span>}
            value={segmentSec}
            min={10}
            max={600}
            step={5}
            onChange={setSegmentSec}
            scale={['10s', '5 min', '10 min']}
          />
          <div className="pw-tile-grid">
            {TIERS.map(t => (
              <button
                key={t.value}
                type="button"
                className="pw-tile"
                aria-pressed={segmentSec === t.value}
                onClick={() => setSegmentSec(t.value)}
              >
                {t.label}
                <span className="pw-data" style={{ fontSize: 9 }}>{t.blurb}</span>
              </button>
            ))}
          </div>
        </ProPanel>

        <div className="pro-stat-row pro-stat-row--3">
          <ProStat label="Segment length" value={formatSeconds(segmentSec)} icon={<Split size={15} />} />
          <ProStat label="Segment count" value={count > 0 ? String(count) : '—'} icon={<Layers size={15} />} tone="alt" />
          <ProStat label="Source length" value={dur > 0 ? formatSeconds(dur) : '—'} icon={<Scissors size={15} />} tone="hot" />
        </div>

        <div className="pro-note">
          Produces numbered segments (<strong>name001, name002, …</strong>) of the chosen length. Each plays
          independently and the engine lists them all under the matching Output tab.
        </div>
      </ProInspector>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Scissors size={15} />
              <span>Segment Boundary Map</span>
            </div>
            <div className="pro-row" style={{ gap: 8 }}>
              <span className="pw-badge pw-badge--flat">{formatSeconds(segmentSec)} PER SEGMENT</span>
              <span className="pw-badge">{count > 0 ? `${count} OUTPUT${count === 1 ? '' : 'S'}` : 'DURATION UNKNOWN'}</span>
            </div>
          </div>
          <div className="pro-timeline__tracks">
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">V1</span>
              <div className="pro-tracklane__body">
                <Filmstrip
                  fileName={fileName}
                  streamingPort={streamingPort}
                  duration={dur}
                  frames={12}
                />
                {count > 0 && (
                  Array.from({ length: Math.min(count, 24) }, (_, i) => {
                    const from = (i * segmentSec / dur) * 100;
                    const to = (Math.min(dur, (i + 1) * segmentSec) / dur) * 100;
                    return (
                      <span
                        key={i}
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${from}%`,
                          width: `${Math.max(0, to - from)}%`,
                          background: `color-mix(in srgb, var(--tool-accent) ${18 + (i % 3) * 8}%, transparent)`,
                          boxShadow: 'inset -2px 0 0 var(--tool-accent)',
                          pointerEvents: 'none'
                        }}
                        title={`Segment ${String(i + 1).padStart(2, '0')}`}
                      />
                    );
                  })
                )}
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">A1</span>
              <div className="pro-tracklane__body pro-tracklane__body--audio" style={{ height: 38, position: 'relative' }}>
                <AudioWaveform
                  fileName={fileName}
                  streamingPort={streamingPort}
                  mediaDuration={dur}
                  height={38}
                />
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>SEGMENT {formatSeconds(segmentSec)}</span>
            <span>·</span>
            <span>{count > 0 ? `${count} FILES` : 'COUNT PENDING'}</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> name001, name002, …
            </span>
          </div>
        </section>
      </ProTimeline>
    </ProToolShell>
  );
};
