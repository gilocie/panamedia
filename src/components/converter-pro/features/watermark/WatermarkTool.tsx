import React, { useState } from 'react';
import { Check, FlipHorizontal, Layers, Palette, RefreshCw, Type, Upload } from 'lucide-react';
import { electron } from '../../../panamedia/types';
import { Filmstrip } from '../timeline';
import { MediaToolPreview } from '../monitor';
import {
  ProInspector,
  ProPanel,
  ProSlider,
  ProTimeline,
  ProToolShell
} from '../ProToolShell';

export interface WatermarkToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (wmSettings: { type: 'text' | 'image'; text?: string; imagePath?: string; opacity: number; position: string }) => void;
  onClose: () => void;
}

const ACCENT = '#34d399';

const POSITIONS = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-right', label: 'Bottom Right' }
];

/* Reference: convertor_pro_features_ui/watermark_logo_overlay/code.html
   Left = canvas viewport with the live overlay + zoom row.
   Right = overlay source (text/logo), opacity, placement, styling. */
export const WatermarkTool: React.FC<WatermarkToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [wmType, setWmType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState<string>('Panamedia');
  const [imagePath, setImagePath] = useState<string>('');
  const [opacity, setOpacity] = useState<number>(80);
  const [position, setPosition] = useState<string>('bottom-right');

  const handleBrowseImage = async () => {
    if (!electron) return;
    try {
      const res = await electron.ipcRenderer.invoke('select-file-dialog', {
        title: 'Select Watermark Logo Image',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });
      if (res && !res.canceled && res.filePath) {
        setImagePath(res.filePath);
      }
    } catch (err) {
      console.error('Failed to select watermark image:', err);
    }
  };

  const reset = () => {
    setWmType('text');
    setText('Panamedia');
    setImagePath('');
    setOpacity(80);
    setPosition('bottom-right');
  };

  const basename = (imagePath.split(/[\\/]/).pop()) || 'No file selected';

  return (
    <ProToolShell
      title="Watermark & Logo Overlay"
      subtitle={fileName}
      icon={<Layers size={18} />}
      accent={ACCENT}
      badges={<span className="pw-badge pw-badge--flat">{wmType === 'text' ? 'TEXT DRAW' : 'IMAGE OVERLAY'}</span>}
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
          <span className="pw-eyebrow">{POSITIONS.find(p => p.id === position)?.label} · {opacity}%</span>
          <span className="pw-data" style={{ color: ACCENT }}>
            {wmType === 'text' ? `drawtext "${text || '—'}"` : `overlay ${basename}`}
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ type: wmType, text, imagePath, opacity, position });
        onClose();
      }}
    >
      {/* ── Canvas ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <Layers size={16} />
            <span>Canvas Viewport</span>
          </div>
          <div className="pro-row" style={{ gap: 6 }}>
            <span className="pw-badge">
              <i className="pw-badge__dot" /> LIVE OVERLAY
            </span>
            <span className="pw-badge pw-badge--flat">{position.toUpperCase()}</span>
          </div>
        </div>

        <MediaToolPreview
          fileName={fileName}
          streamingPort={streamingPort}
          note={`Placement preview · ${wmType === 'image' ? 'logo shown as placeholder' : 'text overlay'}`}
          watermarkText={wmType === 'text' ? text || 'WATERMARK' : 'LOGO'}
          watermarkIsImage={wmType === 'image'}
          watermarkPosition={position}
          watermarkOpacity={opacity}
          style={{ minHeight: 250, maxHeight: 340 }}
          overlay={
            <span className="pro-canvas__chip pro-canvas__chip--tr">
              <Palette size={11} style={{ color: ACCENT }} /> 1920 × 1080
            </span>
          }
        />

        <div className="pro-grid-3">
          {POSITIONS.map(p => (
            <button
              key={p.id}
              type="button"
              className="pw-tile"
              aria-pressed={position === p.id}
              onClick={() => setPosition(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <ProInspector>
        {/* ── Inspector ── */}
        <ProPanel
          title="Overlay Source"
          icon={<Type size={15} />}
          action={<span className="pw-badge">SELECTOR</span>}
        >
          <div className="pw-seg pw-seg--row">
            <button
              type="button"
              className="pw-seg__item"
              aria-pressed={wmType === 'text'}
              onClick={() => setWmType('text')}
            >
              <Type size={14} /> Text
            </button>
            <button
              type="button"
              className="pw-seg__item"
              aria-pressed={wmType === 'image'}
              onClick={() => setWmType('image')}
            >
              <Layers size={14} /> Logo PNG
            </button>
          </div>

          {wmType === 'text' ? (
            <label className="pw-field">
              <span className="pw-label">Watermark text</span>
              <input
                className="pw-input"
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Panamedia"
                aria-label="Watermark text"
              />
            </label>
          ) : (
            <div className="pw-field">
              <span className="pw-label">Logo image (PNG recommended)</span>
              <div className="pro-row" style={{ gap: 7 }}>
                <input
                  className="pw-input"
                  type="text"
                  placeholder="Select image file…"
                  value={imagePath}
                  onChange={e => setImagePath(e.target.value)}
                  aria-label="Logo image path"
                />
                <button type="button" className="pw-btn" onClick={handleBrowseImage} style={{ flexShrink: 0 }}>
                  <Upload size={13} /> Browse
                </button>
              </div>
              <span className="pw-data" style={{ color: 'var(--pw-text-faint)' }}>{basename}</span>
            </div>
          )}
        </ProPanel>

        <ProPanel
          title="Placement & Intensity"
          icon={<FlipHorizontal size={15} />}
          action={<span className="pw-badge pw-badge--flat">{POSITIONS.find(p => p.id === position)?.label}</span>}
        >
          <ProSlider
            label="Overlay opacity"
            readout={<span className="pw-data" style={{ color: ACCENT }}>{opacity}%</span>}
            value={opacity}
            min={10}
            max={100}
            step={1}
            onChange={setOpacity}
            scale={['10%', '55%', '100%']}
          />
          <div className="pw-tile-grid">
            {POSITIONS.map(p => (
              <button
                key={p.id}
                type="button"
                className="pw-tile"
                aria-pressed={position === p.id}
                onClick={() => setPosition(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </ProPanel>

        <div className="pro-note">
          Text overlays are composited with <strong>drawtext</strong>, logo overlays with{' '}
          <strong>overlay</strong>. Corner placement, opacity and the chosen source are what the encoder
          receives.
        </div>
      </ProInspector>

      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Layers size={15} />
              <span>Overlay Timeline</span>
            </div>
            <span className="pw-badge pw-badge--flat">OVERLAY APPLIES TO EVERY FRAME</span>
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
                  cellStyle={{ opacity: 0.6 }}
                />
                {/* Watermark footprint across the clip, at the chosen corner */}
                <div
                  className="pro-tracklane__wm"
                  style={{
                    [position.includes('top') ? 'top' : 'bottom']: '6px',
                    [position.includes('left') ? 'left' : 'right']: '8px',
                    opacity: opacity / 100
                  }}
                >
                  {wmType === 'image' ? 'LOGO' : (text || 'WATERMARK')}
                </div>
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">A</span>
              <div className="pro-tracklane__body" style={{ padding: '9px 12px', minHeight: 46 }}>
                <ProSlider
                  label="Overlay opacity across the clip"
                  readout={<span className="pw-data" style={{ color: ACCENT }}>{opacity}%</span>}
                  value={opacity}
                  min={10}
                  max={100}
                  onChange={setOpacity}
                />
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>{wmType === 'text' ? 'DRAWTEXT' : 'OVERLAY'}</span>
            <span>·</span>
            <span>{POSITIONS.find(p => p.id === position)?.label.toUpperCase()}</span>
            <span>·</span>
            <span>OPACITY {opacity}%</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> {basename || 'NO IMAGE'}
            </span>
          </div>
        </section>
      </ProTimeline>
    </ProToolShell>
  );
};
