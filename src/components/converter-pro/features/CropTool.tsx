import { Filmstrip } from './Filmstrip';
import React, { useState } from 'react';
import {
  AlignCenter,
  Check,
  Crop,
  Grid3x3,
  Magnet,
  Maximize,
  Ratio,
  RefreshCw,
  Scan
} from 'lucide-react';
import { MediaToolPreview } from './MediaToolPreview';
import {
  ProInspector,
  ProPanel,
  ProSlider,
  ProTimeline,
  ProToolShell,
  ProTrack
} from './ProToolShell';

interface CropToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (cropSettings: { aspectRatio: string; zoom: number }) => void;
  onClose: () => void;
}

/* Reference: convertor_pro_features_ui/crop_aspect_ratio/code.html
   Left column = interactive canvas + scrubber + alignment tiles.
   Right column = aspect preset bento, pixel dimensions, matte treatment. */
const RATIOS = [
  { id: 'original', label: 'Original', desc: 'Keep source ratio', icon: <Crop size={15} /> },
  { id: '16:9', label: '16:9 Landscape', desc: 'Widescreen TV & YouTube', icon: <Ratio size={15} /> },
  { id: '4:3', label: '4:3 Standard', desc: 'Classic TV & Standard', icon: <Crop size={15} /> },
  { id: '1:1', label: '1:1 Square', desc: 'Square / Social Feed', icon: <Crop size={15} /> },
  { id: '9:16', label: '9:16 Vertical', desc: 'TikTok, Shorts, Reels', icon: <Crop size={15} /> }
];

const ACCENT = '#818cf8';

export const CropTool: React.FC<CropToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const [zoom, setZoom] = useState<number>(100);
  const [showGuides, setShowGuides] = useState(true);
  const [magnet, setMagnet] = useState(true);

  const active = RATIOS.find(r => r.id === aspectRatio) ?? RATIOS[1];
  // Zoom drives a live transform on the preview so the crop box reads true.
  const previewScale = 1 + (zoom - 100) / 260;

  const reset = () => {
    setAspectRatio('16:9');
    setZoom(100);
  };

  return (
    <ProToolShell
      title="Crop & Aspect Ratio Editor"
      subtitle={fileName}
      icon={<Crop size={18} />}
      accent={ACCENT}
      badges={<span className="pw-badge pw-badge--flat">ACTIVE CLIP</span>}
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
          <span className="pw-eyebrow">Target: {active.label}</span>
          <span className="pw-data" style={{ color: ACCENT }}>
            {zoom}% optical zoom · {active.desc}
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ aspectRatio, zoom });
        onClose();
      }}
    >
      {/* ── Canvas column ── */}
      <div className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <Crop size={16} />
            <span>Framing Preview</span>
          </div>
          <div className="pro-row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`pw-btn pw-btn--quiet${showGuides ? ' pw-btn--on' : ''}`}
              aria-pressed={showGuides}
              onClick={() => setShowGuides(v => !v)}
            >
              <Grid3x3 size={13} /> Rule of 3rds
            </button>
            <button
              type="button"
              className={`pw-btn pw-btn--quiet${magnet ? ' pw-btn--on' : ''}`}
              aria-pressed={magnet}
              onClick={() => setMagnet(v => !v)}
            >
              <Magnet size={13} /> Magnet Snap
            </button>
          </div>
        </div>

        <MediaToolPreview
          fileName={fileName}
          streamingPort={streamingPort}
          note={`${active.label} · ${showGuides ? 'guides on' : 'guides off'}`}
          cropAspectRatio={aspectRatio === 'original' ? undefined : aspectRatio.replace(':', ' / ')}
          imageStyle={{ transform: `scale(${previewScale})` }}
          style={{ minHeight: 250, maxHeight: 340 }}
          overlay={
            <>
              <span className="pro-canvas__chip pro-canvas__chip--tr">
                <Ratio size={12} style={{ color: ACCENT }} /> SRC 16:9 NATIVE
              </span>
              {!showGuides && <span className="pro-canvas__chip pro-canvas__chip--bl">GUIDES OFF</span>}
            </>
          }
        />

        <div className="pw-tile-grid pw-tile-grid--5">
          <button type="button" className="pw-tile pw-tile--action">
            <AlignCenter size={17} />
            Center Horiz
          </button>
          <button type="button" className="pw-tile pw-tile--action">
            <AlignCenter size={17} style={{ transform: 'rotate(90deg)' }} />
            Center Vert
          </button>
          <button type="button" className="pw-tile pw-tile--action" onClick={() => setAspectRatio('16:9')}>
            <Ratio size={17} />
            Fit to Frame
          </button>
          <button type="button" className="pw-tile pw-tile--action" onClick={() => setZoom(200)}>
            <Scan size={17} />
            Fill Canvas
          </button>
          <button type="button" className="pw-tile pw-tile--action" onClick={reset}>
            <RefreshCw size={17} />
            Reset Box
          </button>
        </div>
      </div>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Maximize size={15} />
              <span>Frame Scale &amp; Composition</span>
            </div>
            <div className="pro-row" style={{ gap: 5 }}>
              <span className="pw-eyebrow">Scale</span>
              {[100, 150, 200].map(v => (
                <button
                  key={v}
                  type="button"
                  className={`pw-btn pw-btn--quiet${zoom === v ? ' pw-btn--on' : ''}`}
                  aria-pressed={zoom === v}
                  onClick={() => setZoom(v)}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>
          <div className="pro-timeline__tracks">
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">V1</span>
              <div className="pro-tracklane__body">
                <Filmstrip fileName={fileName} streamingPort={streamingPort} duration={duration} frames={12} />
              </div>
            </div>
          </div>
          <ProTrack from={0} to={100} head={((zoom - 100) / 100) * 100} />
          <div className="pw-scale">
            <span>100% (native)</span>
            <span>150%</span>
            <span>200% max</span>
          </div>
        </section>
      </ProTimeline>



      <ProInspector>
        <ProPanel
          title="Target Aspect Ratio"
          icon={<Ratio size={15} />}
          action={<span className="pw-badge">PRESET SELECTOR</span>}
        >
          <div className="pw-tile-grid">
            {RATIOS.map(r => (
              <button
                key={r.id}
                type="button"
                className="pw-option"
                aria-pressed={aspectRatio === r.id}
                onClick={() => setAspectRatio(r.id)}
              >
                <span className="pw-option__label">
                  {r.icon}
                  <span className="pw-option__stack">
                    <span>{r.label}</span>
                    <small>{r.desc}</small>
                  </span>
                </span>
                {aspectRatio === r.id ? <span className="pw-option__mark">✓</span> : null}
              </button>
            ))}
          </div>
        </ProPanel>

        <ProPanel
          title="Frame Scale"
          icon={<Maximize size={15} />}
          action={<span className="pw-badge pw-badge--flat">ZOOM</span>}
        >
          <ProSlider
            label="Optical zoom level"
            readout={<span className="pw-data" style={{ color: ACCENT }}>{zoom}%</span>}
            value={zoom}
            min={100}
            max={200}
            step={5}
            onChange={setZoom}
            scale={['100% (native)', '150%', '200% max']}
          />
        </ProPanel>

        <div className="pro-note">
          Zoom crops inward around the frame centre. Values below 100% are ignored — the engine never
          downscales the picture from this control.
          <br /><br />
          Matte padding, freeform aspect ratios and face-tracking reframing are not part of this
          pipeline yet, so only the ratio and optical zoom are sent to the encoder.
        </div>
    
      </ProInspector>

    </ProToolShell>
  );
};
