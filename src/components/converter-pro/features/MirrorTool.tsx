import { Filmstrip } from './Filmstrip';
import React, { useState } from 'react';
import { Check, FlipHorizontal, Headphones, RefreshCw, Repeat2, Settings2, SplitSquareHorizontal } from 'lucide-react';
import { MediaToolPreview } from './MediaToolPreview';
import {
  ProInspector,
  ProPanel,
  ProSlider,
  ProStat,
  ProSwitch,
  ProTimeline,
  ProToolShell
} from './ProToolShell';

interface MirrorToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (mirrorSettings: { flipH: boolean; flipV: boolean }) => void;
  onClose: () => void;
}

const ACCENT = '#60a5fa';
const ACCENT_2 = '#a855f7';

type Axis = 'horizontal' | 'vertical' | 'both';

/* Reference: convertor_pro_features_ui/mirror_flip_studio/code.html
   Left = split-wipe preview canvas + transport + stereo alignment strip.
   Right = transform direction, kaleidoscope/symmetry, audio & engine.
   Only flipH / flipV reach the encoder; the rest is visual affordance. */
const DIRECTIONS: Array<{
  id: Axis;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  { id: 'horizontal', label: 'Flip Horizontal', hint: 'Mirror left to right — selfie / vlog fix', icon: <FlipHorizontal size={17} /> },
  { id: 'vertical', label: 'Flip Vertical', hint: 'Invert upside down — ceiling-mounted camera', icon: <FlipHorizontal size={17} style={{ transform: 'rotate(90deg)' }} /> },
  { id: 'both', label: 'Both (180° Inversion)', hint: 'Dual-axis matrix flip', icon: <Repeat2 size={17} /> }
];

export const MirrorTool: React.FC<MirrorToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [axis, setAxis] = useState<Axis>('horizontal');
  const [wipe, setWipe] = useState(52);
  const [swapAudio, setSwapAudio] = useState(true);
  const [kaleidoscope, setKaleidoscope] = useState(false);
  const [axisPos, setAxisPos] = useState(50);
  const [recode, setRecode] = useState(false);

  const flipH = axis === 'horizontal' || axis === 'both';
  const flipV = axis === 'vertical' || axis === 'both';

  const reset = () => {
    setAxis('horizontal');
    setWipe(52);
    setSwapAudio(true);
    setKaleidoscope(false);
    setAxisPos(50);
    setRecode(false);
  };

  return (
    <ProToolShell
      title="Mirror & Flip Studio"
      subtitle={fileName}
      icon={<FlipHorizontal size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> FLIP: {axis.toUpperCase()}
          </span>
          <span className="pw-badge pw-badge--flat">1920 × 1080</span>
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
            {flipH && flipV ? '180° inversion' : flipH ? 'X-axis mirror' : flipV ? 'Y-axis mirror' : 'No flip'}
          </span>
          <span className="pw-data" style={{ color: ACCENT }}>
            {recode ? 'Full transcode (NVENC)' : 'hflip/vflip filter chain'}
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ flipH, flipV });
        onClose();
      }}
    >
      {/* ── Split-wipe canvas ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <SplitSquareHorizontal size={16} />
            <span>Spatial Flip Matrix</span>
          </div>
          <div className="pro-row" style={{ gap: 6 }}>
            <span className="pw-badge">REALTIME PREVIEW</span>
          </div>
        </div>

        <MediaToolPreview
          fileName={fileName}
          streamingPort={streamingPort}
          note={`${axis} flip · ${kaleidoscope ? 'symmetry on' : 'symmetry off'}`}
          imageStyle={{ transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})` }}
          style={{ minHeight: 250, maxHeight: 320 }}
          overlay={
            <>
              {/* Kaleidoscope symmetry axis */}
              {kaleidoscope && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${axisPos}%`,
                    width: 1,
                    background: ACCENT_2,
                    boxShadow: `0 0 12px ${ACCENT_2}`
                  }}
                />
              )}
              {/* Split-wipe boundary */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${wipe}%`,
                  width: 2,
                  background: ACCENT,
                  boxShadow: `0 0 12px ${ACCENT}`
                }}
              />
              <span className="pro-canvas__chip pro-canvas__chip--tl">
                <i className="pw-badge__dot" /> {axis === 'both' ? '180° INVERTED' : axis === 'vertical' ? 'Y-AXIS' : 'X-AXIS MIRRORED'}
              </span>
            </>
          }
        />

        <div className="pro-transport">
          <div className="pro-transport__readout">
            <span style={{ color: ACCENT }}>50.0%</span>
            <small>WIPE POSITION</small>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ProSlider
              label="Compare wipe"
              readout={<span className="pw-data" style={{ color: ACCENT }}>{wipe}%</span>}
              value={wipe}
              min={0}
              max={100}
              step={1}
              onChange={setWipe}
            />
          </div>
        </div>
      </section>

      {/* ── Stereo alignment strip ── */}
      <div className="pro-telemetry">
        <div style={{ gap: 8 }}>
          <Headphones size={14} style={{ color: ACCENT_2 }} />
          <span>Stereo panning alignment</span>
          <span className={`pw-badge${swapAudio ? ' pw-badge--2' : ' pw-badge--flat'}`}>
            {swapAudio ? 'CH1 [L→R] • CH2 [R→L]' : 'CH1 [L] • CH2 [R]'}
          </span>
        </div>
        <div style={{ gap: 8 }}>
          <span className="pw-meter" style={{ width: 70 }}>
            <span className="pw-meter__fill pw-meter__fill--2" style={{ width: '72%' }} />
          </span>
          <span>-14.2 LUFS</span>
        </div>
      </div>


      <ProInspector>
    {/* ── Inspector ── */}
    <ProPanel
      title="Transform Direction"
      icon={<FlipHorizontal size={15} />}
      action={
        <button type="button" className="pw-btn pw-btn--quiet" onClick={() => setAxis('horizontal')}>
          <RefreshCw size={12} /> Reset
        </button>
      }
    >
      <div className="pro-stack-tight">
        {DIRECTIONS.map(d => (
          <button
            key={d.id}
            type="button"
            className="pw-option"
            aria-pressed={axis === d.id}
            onClick={() => setAxis(d.id)}
          >
            <span className="pw-option__label">
              <span className="pw-option__glyph">{d.icon}</span>
              <span className="pw-option__stack">
                <span>{d.label}</span>
                <small>{d.hint}</small>
              </span>
            </span>
            {axis === d.id ? <span className="pw-option__mark">✓</span> : null}
          </button>
        ))}
      </div>
    </ProPanel>

    <ProPanel
      title="Symmetry & Kaleidoscope"
      icon={<Settings2 size={15} />}
      action={<span className="pw-badge pw-badge--2">FX SHADER</span>}
    >
      <div className="pw-check" data-on={kaleidoscope} style={{ alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={kaleidoscope}
          onChange={e => setKaleidoscope(e.target.checked)}
          aria-label="Center split mirror mode"
        />
        <span className="pro-stack-tight">
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--pw-text)' }}>Center split mirror mode</span>
          <span style={{ fontSize: 10.5, color: 'var(--pw-text-faint)', lineHeight: 1.45 }}>
            Clone one half of the frame onto the other half — preview only.
          </span>
        </span>
        <ProSwitch on={kaleidoscope} onChange={setKaleidoscope} label="Center split mirror mode" />
      </div>
      <ProSlider
        label="Symmetry axis position"
        readout={<span className="pw-data" style={{ color: ACCENT_2 }}>{axisPos.toFixed(1)}%</span>}
        value={axisPos}
        min={0}
        max={100}
        step={0.5}
        onChange={setAxisPos}
        scale={['0% (left)', 'Center', '100% (right)']}
      />
    </ProPanel>

    <ProPanel
      title="Audio & Transcode Pipeline"
      icon={<Settings2 size={15} />}
      action={<span className="pw-badge pw-badge--flat">{recode ? 'NVENC' : 'PASS-THRU READY'}</span>}
    >
      <div className="pw-check" data-on={swapAudio} style={{ alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={swapAudio}
          onChange={e => setSwapAudio(e.target.checked)}
          aria-label="Mirror audio stereo panning"
        />
        <span className="pro-stack-tight">
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--pw-text)' }}>Mirror audio stereo panning</span>
          <span style={{ fontSize: 10.5, color: 'var(--pw-text-faint)', lineHeight: 1.45 }}>
            Swaps left/right so sound matches the flipped visual — preview only.
          </span>
        </span>
        <ProSwitch on={swapAudio} onChange={setSwapAudio} label="Mirror audio stereo panning" />
      </div>

      <div className="pw-tile-grid">
        <button type="button" className="pw-option" aria-pressed={!recode} onClick={() => setRecode(false)}>
          <span className="pw-option__label">
            <span className="pw-option__stack">
              <span>Filter chain</span>
              <small>Default — hflip / vflip on the video stream</small>
            </span>
          </span>
          {!recode && <span className="pw-option__mark">✓</span>}
        </button>
        <button type="button" className="pw-option" aria-pressed={recode} onClick={() => setRecode(true)}>
          <span className="pw-option__label">
            <span className="pw-option__stack">
              <span>Full transcode</span>
              <small>Flattens the pixel matrix for legacy players</small>
            </span>
          </span>
          {recode && <span className="pw-option__mark">✓</span>}
        </button>
      </div>

      <div className="pro-note">
        The encoder receives <strong>flipH</strong> and <strong>flipV</strong> as an ffmpeg hflip/vflip
        chain. Kaleidoscope symmetry, audio panning swap and the lossless-matrix strategy are not part
        of this pipeline.
      </div>
    </ProPanel>

    <div className="pro-stat-row pro-stat-row--3">
      <ProStat label="Axis" value={axis} icon={<FlipHorizontal size={15} />} />
      <ProStat label="Wipe" value={`${wipe}%`} icon={<SplitSquareHorizontal size={15} />} tone="alt" />
      <ProStat label="Symmetry" value={kaleidoscope ? `${axisPos.toFixed(0)}%` : 'Off'} icon={<Settings2 size={15} />} tone="hot" />
    </div>
    
      </ProInspector>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <FlipHorizontal size={15} />
              <span>Flip Matrix Timeline</span>
            </div>
            <span className="pw-badge pw-badge--flat">TRANSFORM APPLIES TO EVERY FRAME</span>
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
                  cellStyle={{ transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})` }}
                />
                {kaleidoscope && (
                  <div
                    className="pro-tracklane__scrim"
                    style={{ left: 0, width: `${axisPos}%` }}
                  />
                )}
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">X</span>
              <div className="pro-tracklane__body" style={{ padding: '9px 12px', minHeight: 46 }}>
                <ProSlider
                  label="Compare wipe across the clip"
                  readout={<span className="pw-data" style={{ color: ACCENT }}>{wipe}%</span>}
                  value={wipe}
                  min={0}
                  max={100}
                  step={1}
                  onChange={setWipe}
                />
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>AXIS {axis.toUpperCase()}</span>
            <span>·</span>
            <span>{flipH ? 'HFLIP' : 'NO HFLIP'}</span>
            <span>·</span>
            <span>{flipV ? 'VFLIP' : 'NO VFLIP'}</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> {swapAudio ? 'AUDIO PAN SWAPPED' : 'STEREO UNCHANGED'}
            </span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
