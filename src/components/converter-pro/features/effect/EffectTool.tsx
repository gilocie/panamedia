import React, { useState } from 'react';
import { Check, RefreshCw, SlidersHorizontal, Sparkles, Wand2 } from 'lucide-react';
import { Filmstrip } from '../timeline';
import { MediaToolPreview } from '../monitor';
import {
  ProInspector,
  ProPanel,
  ProSlider,
  ProStat,
  ProTimeline,
  ProToolShell
} from '../ProToolShell';

export interface EffectToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (effectSettings: { brightness: number; contrast: number; saturation: number; hue: number }) => void;
  onClose: () => void;
}

const ACCENT = '#ec4899';

const PRESETS: Array<{ name: string; blurb: string; values: [number, number, number, number] }> = [
  { name: 'Neutral', blurb: 'Pass-through', values: [0, 0, 0, 0] },
  { name: 'Soft film', blurb: 'Lifted blacks', values: [4, -10, -6, 0] },
  { name: 'Vivid', blurb: 'Punchy social', values: [4, 12, 18, 0] },
  { name: 'Cool grade', blurb: 'Teal shadows', values: [-2, 8, 6, -14] },
  { name: 'Warm grade', blurb: 'Amber highlights', values: [5, 6, 4, 12] },
  { name: 'Mono', blurb: 'Desaturated', values: [0, 14, -100, 0] }
];

/* Reference: convertor_pro_features_ui/visual_effects_color_grading/code.html
   Left = before/after canvas + preset bento + telemetry.
   Right = color balance wheels, stylised optics, master strength. */
export const EffectTool: React.FC<EffectToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(0);
  const [hue, setHue] = useState<number>(0);
  const [compare, setCompare] = useState(false);

  const resetAll = () => {
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setHue(0);
    setCompare(false);
  };

  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const totalChange =
    Math.abs(brightness) + Math.abs(contrast) + Math.abs(saturation) + Math.abs(hue);

  const activePreset = PRESETS.find(
    p => p.values[0] === brightness && p.values[1] === contrast && p.values[2] === saturation && p.values[3] === hue
  );

  // Mirrors the ffmpeg `eq=` filter so the preview is representative.
  const filter = compare
    ? 'none'
    : `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100}) saturate(${1 + saturation / 100}) hue-rotate(${hue}deg)`;

  return (
    <ProToolShell
      title="Visual Effects & Color Grading"
      subtitle={fileName}
      icon={<Sparkles size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> REALTIME PREVIEW
          </span>
          <span className="pw-badge pw-badge--flat">REC.709</span>
        </>
      }
      onClose={onClose}
      footerLeft={
        <>
          <button type="button" className="pw-btn" onClick={resetAll}>
            <RefreshCw size={13} /> Reset to Default
          </button>
          <button type="button" className="pw-btn" onClick={onClose}>
            Discard
          </button>
        </>
      }
      footerMeta={
        <>
          <span className="pw-eyebrow">{activePreset ? activePreset.name : 'Custom grade'}</span>
          <span className="pw-data" style={{ color: ACCENT }}>
            eq=brightness({signed(brightness)}):contrast({signed(contrast)}):saturation({signed(saturation)}):hue({hue})
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ brightness, contrast, saturation, hue });
        onClose();
      }}
    >
      {/* ── Canvas ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <SlidersHorizontal size={16} />
            <span>Grade Preview</span>
          </div>
          <div className="pro-row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`pw-btn pw-btn--quiet${compare ? ' pw-btn--on' : ''}`}
              aria-pressed={compare}
              onMouseDown={() => setCompare(true)}
              onMouseUp={() => setCompare(false)}
              onMouseLeave={() => setCompare(false)}
              title="Hold to view the ungraded source"
            >
              {compare ? 'ORIGINAL' : 'Hold to Compare'}
            </button>
          </div>
        </div>

        <MediaToolPreview
          fileName={fileName}
          streamingPort={streamingPort}
          note={compare ? 'Source · ungraded' : 'Approximate filter preview'}
          imageStyle={{ filter }}
          style={{ minHeight: 260, maxHeight: 340 }}
          overlay={
            <span className="pro-canvas__chip pro-canvas__chip--br">
              {compare ? 'BYPASS' : `${totalChange === 0 ? 'NO ADJUSTMENT' : `${totalChange} TOTAL DELTA`}`}
            </span>
          }
        />
      </section>

      {/* ── Presets ── */}
      <ProPanel
        title="Presets & Creative Looks"
        icon={<Wand2 size={15} />}
        action={<span className="pw-badge">LOOK LIBRARY</span>}
      >
        <div className="pw-tile-grid pw-tile-grid--3">
          {PRESETS.map(preset => {
            const selected =
              brightness === preset.values[0] &&
              contrast === preset.values[1] &&
              saturation === preset.values[2] &&
              hue === preset.values[3];
            return (
              <button
                key={preset.name}
                type="button"
                className="pw-tile"
                aria-pressed={selected}
                onClick={() => {
                  setBrightness(preset.values[0]);
                  setContrast(preset.values[1]);
                  setSaturation(preset.values[2]);
                  setHue(preset.values[3]);
                }}
              >
                {preset.name}
                <span className="pw-data" style={{ fontSize: 9 }}>{preset.blurb}</span>
              </button>
            );
          })}
        </div>
      </ProPanel>

      <ProInspector>
        {/* ── Inspector ── */}
        <ProPanel
          title="Color Balance"
          icon={<SlidersHorizontal size={15} />}
          action={<span className="pw-badge pw-badge--flat">eq FILTER</span>}
        >
          <ProSlider
            label="Brightness"
            readout={<span className="pw-data" style={{ color: ACCENT }}>{signed(brightness)}</span>}
            value={brightness}
            min={-50}
            max={50}
            onChange={setBrightness}
            scale={['-50', '0', '+50']}
          />
          <ProSlider
            label="Contrast"
            readout={<span className="pw-data" style={{ color: ACCENT }}>{signed(contrast)}</span>}
            value={contrast}
            min={-50}
            max={50}
            onChange={setContrast}
            scale={['-50', '0', '+50']}
          />
          <ProSlider
            label="Saturation"
            readout={<span className="pw-data" style={{ color: ACCENT }}>{signed(saturation)}</span>}
            value={saturation}
            min={-50}
            max={50}
            onChange={setSaturation}
            scale={['-50', '0', '+50']}
          />
          <ProSlider
            label="Hue rotation"
            readout={<span className="pw-data" style={{ color: ACCENT }}>{hue}°</span>}
            value={hue}
            min={-180}
            max={180}
            step={1}
            onChange={setHue}
            scale={['-180°', '0°', '+180°']}
          />
        </ProPanel>

        <div className="pro-stat-row pro-stat-row--3">
          <ProStat label="Active look" value={activePreset ? activePreset.name : 'Custom grade'} icon={<Sparkles size={16} />} />
          <ProStat label="Look source" value={activePreset ? 'Preset' : 'Manual'} icon={<Wand2 size={16} />} tone="alt" />
          <ProStat label="Total delta" value={String(totalChange)} icon={<SlidersHorizontal size={16} />} tone="hot" />
        </div>
      </ProInspector>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Sparkles size={15} />
              <span>Grade Timeline</span>
            </div>
            <span className="pw-badge pw-badge--flat">FILTERS APPLY ACROSS EVERY FRAME</span>
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
                  cellStyle={{ filter: `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100}) saturate(${1 + saturation / 100}) hue-rotate(${hue}deg)` }}
                />
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">EQ</span>
              <div className="pro-tracklane__body" style={{ padding: '9px 12px', minHeight: 46 }}>
                <ProSlider
                  label="Saturation sweep across the clip"
                  readout={<span className="pw-data" style={{ color: ACCENT }}>{saturation > 0 ? `+${saturation}` : saturation}</span>}
                  value={saturation}
                  min={-50}
                  max={50}
                  onChange={setSaturation}
                />
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>BRIGHT {brightness > 0 ? `+${brightness}` : brightness}</span>
            <span>·</span>
            <span>CONTRAST {contrast > 0 ? `+${contrast}` : contrast}</span>
            <span>·</span>
            <span>HUE {hue}°</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> eq FILTER CHAIN
            </span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
