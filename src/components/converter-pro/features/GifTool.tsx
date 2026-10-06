import { Filmstrip } from './Filmstrip';
import React, { useState } from 'react';
import { Check, Film, Gauge, Image as ImageIcon, Palette, PlayCircle, RefreshCw, Repeat, Zap } from 'lucide-react';
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

interface GifToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (gifSettings: { fps: number; width: number }) => void;
  onClose: () => void;
}

const ACCENT = '#fbbf24';

/* Reference: convertor_pro_features_ui/animated_gif_creator/code.html
   Left = looping preview canvas + frame/size readout.
   Right = dimensions & frame rate, loop & dynamics, colour depth,
   caption overlay. Only frame rate and width are engine-supported. */
const FPS_TIERS = [5, 10, 12, 15, 20, 24, 30];
const WIDTH_TIERS = [240, 320, 400, 480, 560, 640, 720];

export const GifTool: React.FC<GifToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [fps, setFps] = useState<number>(15);
  const [width, setWidth] = useState<number>(480);
  const [dither, setDither] = useState(true);
  const [looping, setLooping] = useState(true);

  // Same aspect as the source canvas is assumed; the engine scales to width.
  const previewWidth = Math.round((width / 480) * 100);
  const frameBudget = Math.max(1, Math.round(100 / Math.max(fps, 1) * 4));

  return (
    <ProToolShell
      title="Animated GIF Creator"
      subtitle={fileName}
      icon={<Zap size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> LOOPING OUTPUT
          </span>
          <span className="pw-badge pw-badge--flat">GIF89a · NO AUDIO</span>
        </>
      }
      onClose={onClose}
      footerLeft={
        <>
          <button type="button" className="pw-btn" onClick={() => { setFps(15); setWidth(480); setDither(true); setLooping(true); }}>
            <RefreshCw size={13} /> Reset to Default
          </button>
          <button type="button" className="pw-btn" onClick={onClose}>
            Discard
          </button>
        </>
      }
      footerMeta={
        <>
          <span className="pw-eyebrow">{width}px @ {fps} fps</span>
          <span className="pw-data" style={{ color: ACCENT }}>
            ~{frameBudget} frames per second of playback
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      onApply={() => {
        onApply({ fps, width });
        onClose();
      }}
    >
      {/* ── Looping preview canvas ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <PlayCircle size={16} />
            <span>Loop Preview</span>
          </div>
          <div className="pro-row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`pw-btn pw-btn--quiet${looping ? ' pw-btn--on' : ''}`}
              aria-pressed={looping}
              onClick={() => setLooping(v => !v)}
            >
              <Repeat size={13} /> {looping ? 'Infinite loop' : 'Play once'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', placeItems: 'center' }}>
          <MediaToolPreview
            fileName={fileName}
            streamingPort={streamingPort}
            note={`${width}px · ${fps} fps loop`}
            style={{ minHeight: 250, maxHeight: 320, width: `${previewWidth}%` }}
            overlay={
              <span className="pro-canvas__chip pro-canvas__chip--tr">
                <ImageIcon size={11} style={{ color: ACCENT }} /> OUTPUT {width}px
              </span>
            }
          />
        </div>

        <div className="pro-transport">
          <div className="pro-transport__readout">
            <span style={{ color: ACCENT }}>{fps}</span>
            <small>FPS</small>
          </div>
          <div className="pro-transport__cluster" style={{ flex: 1 }}>
            <ProTrack from={0} to={100} head={(fps / 30) * 100} slim />
          </div>
          <div className="pro-transport__readout">
            <span style={{ color: ACCENT }}>{width}</span>
            <small>PX WIDTH</small>
          </div>
        </div>
      </section>


      <ProInspector>
    {/* ── Inspector ── */}
    <ProPanel
      title="Dimensions & Frame Rate"
      icon={<Gauge size={15} />}
      action={<span className="pw-badge">PRESET SELECTOR</span>}
    >
      <ProSlider
        label="Frame rate"
        readout={<span className="pw-data" style={{ color: ACCENT }}>{fps} fps</span>}
        value={fps}
        min={5}
        max={30}
        step={1}
        onChange={setFps}
        scale={['5 fps', '15 fps', '30 fps']}
      />
      <div className="pw-tile-grid">
        {FPS_TIERS.map(v => (
          <button key={v} type="button" className="pw-tile" aria-pressed={fps === v} onClick={() => setFps(v)}>
            {v}
          </button>
        ))}
      </div>

      <ProSlider
        label="Output width"
        readout={<span className="pw-data" style={{ color: ACCENT }}>{width}px</span>}
        value={width}
        min={240}
        max={720}
        step={20}
        onChange={setWidth}
        scale={['240', '480', '720']}
      />
      <div className="pw-tile-grid pw-tile-grid--3">
        {WIDTH_TIERS.filter(v => v % 80 === 0).map(v => (
          <button key={v} type="button" className="pw-tile" aria-pressed={width === v} onClick={() => setWidth(v)}>
            {v}px
          </button>
        ))}
      </div>
    </ProPanel>

    <ProPanel
      title="Loop & Motion Dynamics"
      icon={<Repeat size={15} />}
      action={<span className="pw-badge pw-badge--flat">{looping ? 'INFINITE' : 'ONCE'}</span>}
    >
      <div className="pw-tile-grid pw-tile-grid--3">
        <button type="button" className="pw-tile" aria-pressed={looping} onClick={() => setLooping(true)}>
          Loop
        </button>
        <button type="button" className="pw-tile" aria-pressed={!looping} onClick={() => setLooping(false)}>
          Once
        </button>
        <button type="button" className="pw-tile" aria-pressed={false} disabled title="Ping-pong playback is not supported by this encoder path">
          Ping-pong
        </button>
      </div>
    </ProPanel>

    <ProPanel
      title="Colour Depth & Dithering"
      icon={<Palette size={15} />}
      action={<span className="pw-badge">256 COLOURS</span>}
    >
      <div className="pw-tile-grid pw-tile-grid--3">
        <button type="button" className="pw-tile" aria-pressed={dither} onClick={() => setDither(v => !v)}>
          Dither on
        </button>
        <button type="button" className="pw-tile" aria-pressed={!dither} onClick={() => setDither(false)}>
          Dither off
        </button>
        <button type="button" className="pw-tile" disabled title="Palette reduction is not configurable in this pipeline">
          Custom palette
        </button>
      </div>
    </ProPanel>

    <div className="pro-stat-row pro-stat-row--3">
      <ProStat label="Frame rate" value={`${fps} fps`} icon={<Film size={15} />} />
      <ProStat label="Width" value={`${width}px`} icon={<ImageIcon size={15} />} tone="alt" />
      <ProStat label="Audio" value="Stripped" icon={<Palette size={15} />} tone="hot" />
    </div>

    <div className="pro-note">
      Creates a looping <strong>.gif</strong> with no audio. Higher frame rates and larger widths
      increase both processing time and output size. Loop count and dithering are shown for
      reference — the encoder path currently uses its own palette settings.
    </div>
    
      </ProInspector>


      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <Film size={15} />
              <span>Frame Sequence</span>
            </div>
            <div className="pro-row" style={{ gap: 8 }}>
              <span className="pw-badge">{fps} FPS · LOOP</span>
              <span className="pw-badge pw-badge--flat">{width}px OUTPUT</span>
            </div>
          </div>
          <div className="pro-timeline__tracks">
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">V1</span>
              <div className="pro-tracklane__body">
                <Filmstrip fileName={fileName} streamingPort={streamingPort} duration={duration} frames={16} />
              </div>
            </div>
          </div>
          <ProTrack from={0} to={100} head={(fps / 30) * 100} />
          <div className="pw-scale">
            <span>FRAME 001</span>
            <span>{fps} frames per second</span>
            <span>{looping ? 'INFINITE LOOP' : 'PLAY ONCE'}</span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
