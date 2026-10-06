import { Filmstrip } from './Filmstrip';
import React, { useState } from 'react';
import {
  Check,
  FlipHorizontal,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Zap
} from 'lucide-react';
import { MediaToolPreview } from './MediaToolPreview';
import {
  ProInspector,
  ProPanel,
  ProSlider,
  ProStat,
  ProTimeline,
  ProToolShell,
  ProTrack
} from './ProToolShell';

interface RotateToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (rotateSettings: { angle: number; flipH: boolean; flipV: boolean }) => void;
  onClose: () => void;
}

const ACCENT = '#f59e0b';

/* Reference: convertor_pro_features_ui/rotate_orientation_studio/code.html
   Left = NLE canvas with corner HUD crosshairs + horizon grid, then a
   3-up telemetry strip. Right = quick rotations, precision leveling,
   edge fill & pipeline. */
export const RotateTool: React.FC<RotateToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [angle, setAngle] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState(true);
  const [autoFill, setAutoFill] = useState(true);

  // Engine contract: angle is a plain degree number. Snap to the orthogonal
  // quadrants when no fine tilt is dialled in, otherwise keep the exact value.
  const isQuadrant = [0, 90, 180, 270].includes(angle);
  const quadrant = isQuadrant ? angle : null;
  const tilt = isQuadrant ? 0 : angle;

  const step = (delta: number) => setAngle(prev => {
    const next = prev + delta;
    if (next < -45 || next > 315) return prev;
    return Math.round(next * 10) / 10;
  });

  const rotateBy = (delta: number) => setAngle(prev => (((prev + delta) % 360) + 360) % 360);

  const reset = () => {
    setAngle(0);
    setFlipH(false);
    setFlipV(false);
    setAutoFill(true);
  };

  const aspectLabel = quadrant === 90 || quadrant === 270 ? '9:16 Portrait' : '16:9 Landscape';
  const angleLabel = quadrant !== null ? `${quadrant}°` : `${angle > 0 ? '+' : ''}${angle.toFixed(1)}°`;

  return (
    <ProToolShell
      title="Rotate & Orientation Studio"
      subtitle={fileName}
      icon={<RotateCw size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> RENDER: GPU
          </span>
          <span className="pw-badge pw-badge--flat">{aspectLabel.toUpperCase()}</span>
        </>
      }
      onClose={onClose}
      footerLeft={
        <>
          <button type="button" className="pw-btn" onClick={reset}>
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
            Output angle {quadrant !== null ? `${quadrant}°` : `${angle > 0 ? '+' : ''}${angle.toFixed(1)}°`}
          </span>
          <span className="pw-data" style={{ color: ACCENT }}>
            {flipH && flipV ? 'H+V mirror' : flipH ? 'H-mirror' : flipV ? 'V-mirror' : 'No flip'}
            {autoFill ? ' · edge fill on' : ''}
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ angle, flipH, flipV });
        onClose();
      }}
    >
      {/* ── Canvas ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <RotateCw size={16} />
            <span>Orientation Preview</span>
          </div>
          <div className="pro-row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`pw-btn pw-btn--quiet${showGrid ? ' pw-btn--on' : ''}`}
              aria-pressed={showGrid}
              onClick={() => setShowGrid(v => !v)}
            >
              <SlidersHorizontal size={13} /> Horizon Grid
            </button>
            <button type="button" className="pw-btn pw-btn--quiet" onClick={() => setAngle(0)}>
              <RefreshCw size={13} /> Reset 0.0°
            </button>
          </div>
        </div>

        <MediaToolPreview
          fileName={fileName}
          streamingPort={streamingPort}
          note={`${quadrant !== null ? `${quadrant}° quadrant` : `${angle.toFixed(1)}° tilt`} · ${aspectLabel}`}
          imageStyle={{
            transform: `rotate(${angle}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`
          }}
          style={{ minHeight: 250, maxHeight: 320 }}
          overlay={
            <>
              {/* Corner alignment crosshairs */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  width: 16,
                  height: 16,
                  borderTop: `2px solid ${ACCENT}`,
                  borderLeft: `2px solid ${ACCENT}`,
                  opacity: 0.7
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 16,
                  height: 16,
                  borderTop: `2px solid ${ACCENT}`,
                  borderRight: `2px solid ${ACCENT}`,
                  opacity: 0.7
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  width: 16,
                  height: 16,
                  borderBottom: `2px solid ${ACCENT}`,
                  borderLeft: `2px solid ${ACCENT}`,
                  opacity: 0.7
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  bottom: 12,
                  right: 12,
                  width: 16,
                  height: 16,
                  borderBottom: `2px solid ${ACCENT}`,
                  borderRight: `2px solid ${ACCENT}`,
                  opacity: 0.7
                }}
              />

              {/* Horizon leveling guide */}
              {showGrid && (
                <>
                  <span aria-hidden="true" style={{ position: 'absolute', left: '25%', top: 0, bottom: 0, width: 1, background: `color-mix(in srgb, ${ACCENT} 22%, transparent)` }} />
                  <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: `color-mix(in srgb, ${ACCENT} 30%, transparent)` }} />
                  <span aria-hidden="true" style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: 1, background: `color-mix(in srgb, ${ACCENT} 22%, transparent)` }} />
                  <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: `color-mix(in srgb, ${ACCENT} 55%, transparent)`, boxShadow: `0 0 10px ${ACCENT}` }} />
                </>
              )}

              {autoFill && (
                <span className="pro-canvas__chip pro-canvas__chip--tl">
                  <Zap size={11} style={{ color: ACCENT }} /> AUTO-FILL ACTIVE
                </span>
              )}
            </>
          }
        />

        <div className="pro-transport">
          <div className="pro-transport__readout">
            <span style={{ color: ACCENT }}>
              {quadrant !== null ? `${quadrant}°` : `${angle > 0 ? '+' : ''}${angle.toFixed(1)}°`}
            </span>
            <small>ROTATION</small>
          </div>
          <div className="pro-row" style={{ gap: 8 }}>
            <span className="pw-eyebrow">Res</span>
            <span className="pw-data" style={{ color: 'var(--pw-text)' }}>1920 × 1080</span>
          </div>
        </div>
      </section>

      {/* ── Telemetry strip ── */}
      <div className="pro-stat-row pro-stat-row--3">
        <ProStat
          label="Leveling status"
          value={tilt === 0 ? 'Balanced (0.0°)' : `Tilted (${tilt > 0 ? '+' : ''}${tilt.toFixed(1)}°)`}
          icon={<SlidersHorizontal size={17} />}
        />
        <ProStat label="Aspect ratio" value={aspectLabel} icon={<RotateCw size={17} />} tone="alt" />
        <ProStat label="Output angle" value={angleLabel} icon={<Zap size={17} />} tone="hot" />
      </div>


      <ProInspector>
    {/* ── Inspector ── */}
    <ProPanel
      title="Quick Rotations"
      icon={<RotateCcw size={15} />}
      action={<span className="pw-badge pw-badge--flat">90° STEPS</span>}
      subtitle="Shift the canvas by fixed orthogonal increments."
    >
      <div className="pro-grid-3">
        <button type="button" className="pw-tile pw-tile--action" aria-pressed={quadrant === 270} onClick={() => rotateBy(270)}>
          <RotateCcw size={19} />
          90° Left
          <span className="pw-data">CCW</span>
        </button>
        <button type="button" className="pw-tile pw-tile--action" aria-pressed={quadrant === 90} onClick={() => rotateBy(90)}>
          <RotateCw size={19} />
          90° Right
          <span className="pw-data">CW</span>
        </button>
        <button type="button" className="pw-tile pw-tile--action" aria-pressed={quadrant === 180} onClick={() => setAngle(180)}>
          <FlipHorizontal size={19} />
          180° Flip
          <span className="pw-data">Invert</span>
        </button>
      </div>
    </ProPanel>

    <ProPanel
      title="Precision Horizon Leveling"
      icon={<SlidersHorizontal size={15} />}
      action={<span className="pw-badge pw-badge--flat">±45° RANGE</span>}
    >
      <ProSlider
        label="Horizon angle"
        readout={
          <span className="pw-data" style={{ color: ACCENT }}>
            {angle > 0 ? '+' : ''}{angle.toFixed(1)}°
          </span>
        }
        value={angle}
        min={-45}
        max={315}
        step={0.1}
        onChange={setAngle}
        scale={['0°', '90°', '180°', '270°', '360°']}
      />
      <div className="pw-steppers">
        <button type="button" className="pw-stepper" onClick={() => step(-1)}>-1.0°</button>
        <button type="button" className="pw-stepper" onClick={() => step(-0.1)}>-0.1°</button>
        <button type="button" className="pw-stepper" onClick={() => step(0.1)}>+0.1°</button>
        <button type="button" className="pw-stepper" onClick={() => step(1)}>+1.0°</button>
      </div>
    </ProPanel>

    <ProPanel
      title="Mirror & Edge Fill"
      icon={<FlipHorizontal size={15} />}
    >
      <div className="pw-tile-grid">
        <button type="button" className="pw-tile pw-tile--action" aria-pressed={flipH} onClick={() => setFlipH(v => !v)}>
          <FlipHorizontal size={18} />
          Flip Horizontal
        </button>
        <button type="button" className="pw-tile pw-tile--action" aria-pressed={flipV} onClick={() => setFlipV(v => !v)}>
          <FlipHorizontal size={18} style={{ transform: 'rotate(90deg)' }} />
          Flip Vertical
        </button>
      </div>
      <label className="pw-check" data-on={autoFill}>
        <input type="checkbox" checked={autoFill} onChange={e => setAutoFill(e.target.checked)} />
        <span className="pro-row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <Zap size={15} style={{ color: ACCENT, flexShrink: 0, marginTop: 1 }} />
          <span className="pro-stack-tight">
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--pw-text)' }}>Auto edge fill preview</span>
            <span style={{ fontSize: 10.5, color: 'var(--pw-text-faint)', lineHeight: 1.45 }}>
              Previews how the encoder will reframe to hide the corner gaps a rotation introduces.
            </span>
          </span>
        </span>
      </label>
      <ProTrack from={0} to={33} head={33} slim />
      <div className="pro-note">
        Angle, horizontal flip and vertical flip are sent to the encoder as an ffmpeg{' '}
        <strong>transpose / hflip / vflip</strong> chain. The edge-fill and lossless-metadata
        strategies in the mockup are not part of this pipeline.
      </div>
    </ProPanel>
    
      </ProInspector>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <SlidersHorizontal size={15} />
              <span>Orientation Timeline</span>
            </div>
            <span className="pw-badge pw-badge--flat">ANGLE APPLIED ACROSS THE WHOLE CLIP</span>
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
                  cellStyle={{ transform: `rotate(${angle}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})` }}
                />
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">R</span>
              <div className="pro-tracklane__body" style={{ padding: '9px 12px', minHeight: 46 }}>
                <ProSlider
                  label="Rotation applied across the clip"
                  readout={<span className="pw-data" style={{ color: ACCENT }}>{angleLabel}</span>}
                  value={angle}
                  min={-45}
                  max={315}
                  step={0.1}
                  onChange={setAngle}
                />
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>ANGLE {angleLabel}</span>
            <span>·</span>
            <span>{flipH ? 'H-MIRROR' : 'NO H-FLIP'}</span>
            <span>·</span>
            <span>{flipV ? 'V-MIRROR' : 'NO V-FLIP'}</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> TRANSPOSE / HFLIP / VFLIP
            </span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
