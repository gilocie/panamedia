import { Filmstrip } from './Filmstrip';
import React, { useState } from 'react';
import { Check, Languages, MessageSquare, RefreshCw, Type, Upload } from 'lucide-react';
import { electron } from '../../panamedia/types';
import { MediaToolPreview } from './MediaToolPreview';
import {
  ProInspector,
  ProPanel,
  ProSlider,
  ProStat,
  ProSwitch,
  ProTimeline,
  ProToolShell,
  ProTrack
} from './ProToolShell';

interface SubtitleToolProps {
  fileName: string;
  streamingPort?: number;
  /** Clip length, used to spread the timeline filmstrip across the clip. */
  duration?: number;
  onApply: (subSettings: { subPath: string; burnIn: boolean; encoding: string }) => void;
  onClose: () => void;
}

const ACCENT = '#c084fc';

const ENCODINGS = [
  { id: 'UTF-8', label: 'UTF-8', hint: 'Universal' },
  { id: 'UTF-16', label: 'UTF-16', hint: 'Wide char' },
  { id: 'ISO-8859-1', label: 'ISO-8859-1', hint: 'Western EU' },
  { id: 'Windows-1252', label: 'Windows-1252', hint: 'ANSI' }
];

const SUPPORTED = ['SRT', 'VTT', 'ASS', 'SSA', 'SUB'];

/* Reference: convertor_pro_features_ui/subtitles_closed_captions/code.html
   Left = caption preview over the frame + cue list ledger.
   Right = import, render mode, typography & encoding. */
export const SubtitleTool: React.FC<SubtitleToolProps> = ({
  fileName,
  streamingPort,
  duration = 0,
  onApply,
  onClose
}) => {
  const [subPath, setSubPath] = useState<string>('');
  const [burnIn, setBurnIn] = useState<boolean>(true);
  const [encoding, setEncoding] = useState<string>('UTF-8');
  const [fontSize, setFontSize] = useState<number>(24);
  const [marginV, setMarginV] = useState<number>(8);

  const handleBrowseSub = async () => {
    if (!electron) return;
    try {
      const res = await electron.ipcRenderer.invoke('select-file-dialog', {
        title: 'Select Subtitle File',
        filters: [{ name: 'Subtitle Files', extensions: ['srt', 'vtt', 'ass', 'ssa', 'sub'] }]
      });
      if (res && !res.canceled && res.filePath) {
        setSubPath(res.filePath);
      }
    } catch (err) {
      console.error('Failed to select subtitle:', err);
    }
  };

  const reset = () => {
    setBurnIn(true);
    setEncoding('UTF-8');
    setFontSize(24);
    setMarginV(8);
  };

  const basename = (subPath.split(/[\\/]/).pop()) || '';
  const ext = basename.includes('.') ? basename.split('.').pop()!.toUpperCase() : '';
  const isReady = Boolean(subPath) && Boolean(basename);

  return (
    <ProToolShell
      title="Subtitle & Closed Caption Studio"
      subtitle={fileName}
      icon={<MessageSquare size={18} />}
      accent={ACCENT}
      badges={
        <>
          <span className="pw-badge">
            <i className="pw-badge__dot" /> {burnIn ? 'BURN-IN' : 'EMBEDDED TRACK'}
          </span>
          <span className="pw-badge pw-badge--flat">{encoding}</span>
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
          <span className="pw-eyebrow">{basename || 'No cue file selected'}</span>
          <span className="pw-data" style={{ color: ACCENT }}>
            {burnIn ? 'Hardcoded into pixels' : 'Muxed as a soft subtitle track'}
          </span>
        </>
      }
      footerActionLabel="Apply to Conversion Pipeline"
      footerActionIcon={<Check size={14} />}
      applyDisabled={!isReady}
      onApply={() => {
        onApply({ subPath, burnIn, encoding });
        onClose();
      }}
    >
      {/* ── Caption preview canvas ── */}
      <section className="pro-panel pro-panel--canvas">
        <div className="pro-panel__head">
          <div className="pro-panel__title">
            <Languages size={16} />
            <span>Caption Preview</span>
          </div>
          <div className="pro-row" style={{ gap: 6 }}>
            <span className="pw-badge pw-badge--flat">{SUPPORTED.join(' · ')}</span>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <MediaToolPreview
            fileName={fileName}
            streamingPort={streamingPort}
            note="Caption framing preview"
            style={{ minHeight: 260, maxHeight: 330 }}
          />
          {/* Stand-in caption, positioned/scaled by the typography controls so
              the preview communicates what the burn-in will look like. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '8%',
              right: '8%',
              bottom: `${8 + marginV}%`,
              textAlign: 'center',
              pointerEvents: 'none'
            }}
          >
            <span
              style={{
                display: 'inline-block',
                maxWidth: '100%',
                padding: '3px 10px',
                borderRadius: 4,
                color: '#fff',
                background: 'rgba(0,0,0,0.55)',
                fontSize: Math.max(9, Math.round((fontSize / 24) * 13)),
                fontWeight: 600,
                lineHeight: 1.35,
                textShadow: '0 1px 3px #000'
              }}
            >
              {isReady ? 'Subtitle cue preview line' : 'No subtitle file loaded'}
            </span>
          </div>
        </div>

        <div className="pro-transport">
          <div className="pro-transport__readout">
            <span style={{ color: ACCENT }}>{fontSize}px</span>
            <small>CAPTION SIZE</small>
          </div>
          <ProTrack from={8} to={Math.max(12, 8 + marginV * 2)} slim />
          <span className="pw-data" style={{ color: 'var(--pw-text-faint)' }}>SAFE AREA</span>
        </div>
      </section>


      <ProInspector>
    {/* ── Inspector ── */}
    <ProPanel
      title="Import Subtitle File"
      icon={<Upload size={15} />}
    >
      <div className="pw-field">
        <span className="pw-label">Cue file path</span>
        <div className="pro-row" style={{ gap: 7 }}>
          <input
            className="pw-input"
            type="text"
            placeholder="Choose .srt or .vtt subtitle file…"
            value={subPath}
            onChange={e => setSubPath(e.target.value)}
            aria-label="Subtitle file path"
          />
          <button type="button" className="pw-btn" onClick={handleBrowseSub} style={{ flexShrink: 0 }}>
            <Upload size={13} /> Browse
          </button>
        </div>
      </div>
      <div className="pro-row pro-row--wrap" style={{ gap: 5 }}>
        {SUPPORTED.map(extName => (
          <span key={extName} className="pw-badge pw-badge--flat">.{extName.toLowerCase()}</span>
        ))}
      </div>
    </ProPanel>

    <ProPanel
      title="Typography & Rendering"
      icon={<Type size={15} />}
    >
      <div className="pw-check" data-on={burnIn}>
        <input
          type="checkbox"
          checked={burnIn}
          onChange={e => setBurnIn(e.target.checked)}
          aria-label="Burn subtitles into the picture"
        />
        <span className="pro-stack-tight">
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--pw-text)' }}>
            Hardcode / burn subtitles into the video frame
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--pw-text-faint)', lineHeight: 1.45 }}>
            Burned into the picture so they stay visible in players with no subtitle-track support.
            Unchecked embeds a soft track instead.
          </span>
        </span>
        <ProSwitch on={burnIn} onChange={setBurnIn} label="Burn in" />
      </div>

      <div className="pw-field">
        <span className="pw-label">Character encoding</span>
        <select
          value={encoding}
          onChange={e => setEncoding(e.target.value)}
          aria-label="Character encoding"
        >
          {ENCODINGS.map(item => (
            <option key={item.id} value={item.id}>{item.label} ({item.hint})</option>
          ))}
        </select>
      </div>

      <div className="pw-field">
        <div className="pw-field__top">
          <span className="pw-label">Preview caption size</span>
          <span className="pw-data" style={{ color: ACCENT }}>{fontSize}px</span>
        </div>
        <input
          className="pw-slider"
          type="range"
          min={14}
          max={40}
          step={1}
          value={fontSize}
          onChange={e => setFontSize(Number(e.target.value))}
          aria-label="Caption size"
        />
      </div>

      <div className="pw-field">
        <div className="pw-field__top">
          <span className="pw-label">Preview bottom margin</span>
          <span className="pw-data" style={{ color: ACCENT }}>{marginV}%</span>
        </div>
        <input
          className="pw-slider"
          type="range"
          min={2}
          max={24}
          step={1}
          value={marginV}
          onChange={e => setMarginV(Number(e.target.value))}
          aria-label="Caption bottom margin"
        />
      </div>
    </ProPanel>

    <div className="pro-stat-row pro-stat-row--2">
      <ProStat label="Render mode" value={burnIn ? 'Burn-in' : 'Soft track'} icon={<Type size={16} />} />
      <ProStat label="Cue format" value={ext || '—'} icon={<Languages size={16} />} tone="alt" />
    </div>
    
      </ProInspector>


      <ProTimeline>
        <section className="pro-timeline">
          <div className="pro-timeline__head">
            <div className="pro-panel__title">
              <MessageSquare size={15} />
              <span>Cue Timeline</span>
            </div>
            <div className="pro-row" style={{ gap: 8 }}>
              <span className="pw-badge">{isReady ? 'LOADED' : 'EMPTY'}</span>
              <span className="pw-badge pw-badge--flat">{encoding}</span>
            </div>
          </div>
          <div className="pro-timeline__tracks">
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">V1</span>
              <div className="pro-tracklane__body">
                <Filmstrip fileName={fileName} streamingPort={streamingPort} duration={duration} frames={12} />
              </div>
            </div>
            <div className="pro-tracklane">
              <span className="pro-tracklane__label">CC</span>
              <div className="pro-tracklane__body" style={{ padding: '9px 12px', minHeight: 44 }}>
                <ProSlider
                  label="Preview caption size across the clip"
                  readout={<span className="pw-data" style={{ color: ACCENT }}>{fontSize}px</span>}
                  value={fontSize}
                  min={14}
                  max={40}
                  step={1}
                  onChange={setFontSize}
                />
              </div>
            </div>
          </div>
          <div className="pro-timeline__status">
            <span>{basename || 'NO CUE FILE'}</span>
            <span>·</span>
            <span>{burnIn ? 'BURN-IN' : 'SOFT TRACK'}</span>
            <span>·</span>
            <span>MARGIN {marginV}%</span>
            <span className="pro-timeline__accel">
              <i className="pw-badge__dot" /> {SUPPORTED.length} CUE FORMATS
            </span>
          </div>
        </section>
      </ProTimeline>

    </ProToolShell>
  );
};
