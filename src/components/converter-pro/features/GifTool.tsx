import React, { useState } from 'react';
import { Zap, X, Check } from 'lucide-react';

interface GifToolProps {
  fileName: string;
  onApply: (gifSettings: { fps: number; width: number }) => void;
  onClose: () => void;
}

export const GifTool: React.FC<GifToolProps> = ({
  fileName,
  onApply,
  onClose
}) => {
  const [fps, setFps] = useState<number>(15);
  const [width, setWidth] = useState<number>(480);

  const display = fileName.split(/[\\/]/).pop() || fileName;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '520px',
          maxWidth: '96vw',
          background: 'linear-gradient(180deg, #161828 0%, #0d0e18 100%)',
          border: '1px solid rgba(251, 191, 36, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(251, 191, 36, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #d97706, #fbbf24)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Zap size={18} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Make GIF</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                {display}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Frame rate</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24' }}>{fps} fps</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={fps}
              onChange={e => setFps(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fbbf24' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
              <span>5 (smaller file)</span>
              <span>30 (smoother)</span>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Width</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24' }}>{width}px</span>
            </div>
            <input
              type="range"
              min={240}
              max={720}
              step={20}
              value={width}
              onChange={e => setWidth(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fbbf24' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
              <span>240</span>
              <span>720</span>
            </div>
          </div>

          <div style={{
            fontSize: '11px',
            color: 'rgba(251, 191, 36, 0.75)',
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
            borderRadius: '8px',
            padding: '10px 12px',
            lineHeight: '1.5'
          }}>
            Output is an animated <strong>.gif</strong> built with a
            per-video colour palette, whatever format the dock
            selector shows. Loops forever, carries no audio.
            VP9-class quality at GIF size.
          </div>
        </div>

        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onApply({ fps, width }); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #d97706, #fbbf24)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <Check size={14} />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
