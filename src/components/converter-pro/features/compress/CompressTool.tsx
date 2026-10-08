import React, { useState } from 'react';
import { Check, Gauge, Minimize2, RefreshCw, Target, Zap } from 'lucide-react';
import { Filmstrip } from '../timeline';
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

export interface CompressToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (compressSettings: { targetReduction: number }) => void;
  onClose: () => void;
}

const ACCENT = '#2dd4bf';

/* Reference: convertor_pro_features_ui/smart_compression_studio/code.html
   Left = dual-quality loupe over the frame + allocation chart.
   Right = target size optimizer, encoding engine, master strength. */
const TIERS = [
  { id: 'quality', label: 'Higher quality', blurb: 'Small reduction, keeps detail' },
  { id: 'balanced', label: 'Balanced', blurb: 'Recommended default' },
  { id: 'size', label: 'Smaller file', blurb: 'Aggressive reduction' }
];

export const CompressTool: React.FC<CompressToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [targetReduction, setTargetReduction] = useState<number>(50);
  const [lossless, setLossless] = useState(false);

  const tier = targetReduction < 40 ? 'quality' : targetReduction > 60 ? 'size' : 'balanced';
  const keptPct = 100 - targetReduction;

  return (
    <ProToolShell
      title="Smart Compression Studio"
      subtitle={fileName}
      icon={<Minimize2 size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> ENCODER PREVIEW
          </span>
          <span className="pw-badge pw-badge--flat">{tier.toUpperCase()}</span>
        </>
      }
      onClose={onClose}
      footerLeft={
        <>
          <button type="button" className="pw-btn" onClick={() => setTargetReduction(50)}>
            <RefreshCw size={13} /> Reset to Default
          </button>
          <button type="button" className="pw-btn" onClick={onClose}>
            Discard
          </button>
        </>
      }
      footerMeta={
        <>
          <span className="pw-eyebrow">Target {targetReduction}% reduction</span>
          <span className="pw-data" style={{ color: ACCENT }}>
            {lossless ? 'Bypass re-encode' : `~${keptPct}% of source bitrate retained`}
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ targetReduction });
        onClose();
      }}
    >
      {/* ── Dual quality loupe ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <Target size={16} />
            <span>Dual Quality Loupe</span>
          </div>
          <div className="pro-row" style={{ gap: 6 }}>
            <span className="pw-badge pw-badge--flat">SRC</span>
            <span className="pw-badge">OUT {keptPct}%</span>
          </div>
        </div>

        <div className="pro-grid-2">
          {[
            { label: 'Source', note: 'Original frame', reduce: 0 },
            { label: 'Compressed', note: `${keptPct}% of original`, reduce: targetReduction }
          ].map(view => (
            <div key={view.label} className="pro-col" style={{ gap: 6 }}>
              <div className="pro-row pro-row--between">
                <span className="pw-eyebrow">{view.label}</span>
                <span className="pw-data" style={{ color: view.reduce ? ACCENT : 'var(--pw-text-faint)' }}>
                  {view.note}
                </span>
              </div>
              <MediaToolPreview
                fileName={fileName}
                streamingPort={streamingPort}
                note={view.label}
                imageStyle={view.reduce ? { filter: `contrast(${1 + view.reduce / 320})` } : undefined}
                style={{ minHeight: 150, maxHeight: 190 }}
              />
            </div>
          ))}
        </div>

        <div className="pro-transport">
          <div className="pro-transport__readout">
            <span style={{ color: ACCENT }}>-{targetReduction}%</span>
            <small>SIZE DELTA</small>
          </div>
          <ProTrack from={0} to={keptPct} head={keptPct} slim />
          <span className="pw-data" style={{ color: 'var(--pw-text-faint)' }}>{keptPct}% RETAINED</span>
        </div>
      </section>

      {/* ── Dynamic allocation chart ── */}
      <ProPanel
        title="Dynamic Bitrate Allocation"
        icon={<Gauge size={15} />}
        action={<span className="pw-badge">SCENE COMPLEXITY</span>}
      >
        {/* Bar read-out: coarse allocation profile, illustrative. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 72 }}>
          {Array.from({ length: 32 }, (_, i) => {
            const wave = Math.sin(i * 0.7) * 0.5 + 0.5;
            const h = Math.round(22 + wave * (100 - targetReduction * 0.7));
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: `${h}%`,
                  borderRadius: 2,
                  background: `linear-gradient(180deg, var(--tool-accent), color-mix(in srgb, var(--tool-accent) 20%, transparent))`
                }}
              />
            );
          })}
        </div>
        <div className="pro-stat-row pro-stat-row--3">
          <ProStat label="Reduction" value={`${targetReduction}%`} icon={<Minimize2 size={15} />} />
          <ProStat label="Retained" value={`${keptPct}%`} icon={<Gauge size={15} />} tone="alt" />
          <ProStat label="Strategy" value={TIERS.find(t => t.id === tier)!.label} icon={<Zap size={15} />} tone="hot" />
        </div>
      </ProPanel>

      <ProInspector>
        {/* ── Inspector ── */}
        <ProPanel
          title="Target File Size Optimizer"
          icon={<Target size={15} />}
          action={<span className="pw-badge">{targetReduction}%</span>}
        >
          <ProSlider
            label="Compression strength"
            readout={<span className="pw-data" style={{ color: ACCENT }}>{targetReduction}%</span>}
            value={targetReduction}
            min={20}
            max={80}
            step={5}
            onChange={setTargetReduction}
            scale={['20% · higher quality', '50%', '80% · smaller file']}
          />
          <div className="pw-tile-grid pw-tile-grid--3">
            {TIERS.map(t => (
              <button
                key={t.id}
                type="button"
                className="pw-tile"
                aria-pressed={tier === t.id}
                onClick={() => setTargetReduction(t.id === 'quality' ? 30 : t.id === 'balanced' ? 50 : 70)}
              >
                {t.label}
                <span className="pw-data" style={{ fontSize: 9 }}>{t.blurb}</span>
              </button>
            ))}
          </div>
        </ProPanel>

        <ProPanel
          title="Encoding Engine"
          icon={<Zap size={15} />}
          action={<span className="pw-badge pw-badge--flat">{lossless ? 'COPY' : 'RE-ENCODE'}</span>}
        >
          <div className="pw-tile-grid">
            <button
              type="button"
              className="pw-option"
              aria-pressed={!lossless}
              onClick={() => setLossless(false)}
            >
              <span className="pw-option__label">
                <span className="pw-option__glyph"><Gauge size={15} /></span>
                <span className="pw-option__stack">
                  <span>Quality re-encode</span>
                  <small>Re-encodes with the target quality</small>
                </span>
              </span>
              {!lossless && <span className="pw-option__mark">✓</span>}
            </button>
            <button
              type="button"
              className="pw-option"
              aria-pressed={lossless}
              onClick={() => setLossless(true)}
            >
              <span className="pw-option__label">
                <span className="pw-option__glyph"><Zap size={15} /></span>
                <span className="pw-option__stack">
                  <span>Stream copy</span>
                  <small>No re-encode, no size change</small>
                </span>
              </span>
              {lossless && <span className="pw-option__mark">✓</span>}
            </button>
          </div>
          <div className="pro-note">
            This adjusts encoder quality to trade visual detail for a smaller output. The final file size
            varies with the source and content, so a specific reduction is not guaranteed — and the
            stream-copy path is informational only, since this tool always re-encodes.
          </div>
        </ProPanel>
      </ProInspector>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Gauge size={15} />
              <span>Compression Timeline</span>
            </div>
            <span className="pw-badge pw-badge--flat">CONSTANT-QUALITY PASS ACROSS EVERY FRAME</span>
          </div>
          <div className="pro-timeline__tracks">
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">V1</span>
              <div className="pro-tracklane__body">
                <Filmstrip
                  fileName={fileName}
                  streamingPort={streamingPort}
                  duration={duration}
                  frames={12}
                  cellStyle={{ filter: `contrast(${1 + targetReduction / 320})` }}
                />
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">KBPS</span>
              <div className="pro-tracklane__body" style={{ padding: '9px 12px', minHeight: 46 }}>
                <ProSlider
                  label="Bitrate retention across the clip"
                  readout={<span className="pw-data" style={{ color: ACCENT }}>{keptPct}%</span>}
                  value={targetReduction}
                  min={20}
                  max={80}
                  step={5}
                  onChange={setTargetReduction}
                />
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>REDUCTION {targetReduction}%</span>
            <span>·</span>
            <span>RETAINED {keptPct}%</span>
            <span>·</span>
            <span>STRATEGY {TIERS.find(t => t.id === tier)!.label.toUpperCase()}</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> {lossless ? 'STREAM COPY' : 'CONSTANT QUALITY'}
            </span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
