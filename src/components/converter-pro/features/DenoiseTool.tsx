import React, { useState } from 'react';
import { Volume2, X, Check } from 'lucide-react';

interface DenoiseToolProps {
  fileName: string;
  onApply: (denoiseSettings: { videoDenoise: boolean; audioDenoise: boolean; loudness: boolean }) => void;
  onClose: () => void;
}

export const DenoiseTool: React.FC<DenoiseToolProps> = ({
  fileName,
  onApply,
  onClose
}) => {
  const [videoDenoise, setVideoDenoise] = useState<boolean>(false);
  const [audioDenoise, setAudioDenoise] = useState<boolean>(false);
  const [loudness, setLoudness] = useState<boolean>(false);

  const display = fileName.split(/[\\/]/).pop() || fileName;

  const toggles: Array<{
    key: 'videoDenoise' | 'audioDenoise' | 'loudness';
    title: string;
    sub: string;
  }> = [
    {
      key: 'videoDenoise',
      title: 'Video denoise',
      sub: 'hqdn3d -- softens film grain and blocky compression noise'
    },
    {
      key: 'audioDenoise',
      title: 'Audio denoise',
      sub: 'afftdn -- FFT filter that removes steady background hiss'
    },
    {
      key: 'loudness',
      title: 'Normalize volume',
      sub: 'loudnorm -- brings dialogue to broadcast loudness (EBU R128)'
    }
  ];

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
          border: '1px solid rgba(167, 139, 250, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(167, 139, 250, 0.25)',
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
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Volume2 size={18} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Denoise / Vol</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                {display}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {toggles.map(t => {
            const checked = t.key === 'videoDenoise' ? videoDenoise : t.key === 'audioDenoise' ? audioDenoise : loudness;
            const set = t.key === 'videoDenoise' ? setVideoDenoise : t.key === 'audioDenoise' ? setAudioDenoise : setLoudness;
            return (
              <label
                key={t.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid',
                  borderColor: checked ? 'rgba(167, 139, 250, 0.45)' : 'rgba(255, 255, 255, 0.08)',
                  background: checked ? 'rgba(167, 139, 250, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => set(e.target.checked)}
                  style={{ accentColor: '#a78bfa', width: '15px', height: '15px', marginTop: '2px' }}
                />
                <span>
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#fff' }}>{t.title}</span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '3px', lineHeight: '1.45' }}>{t.sub}</span>
                </span>
              </label>
            );
          })}
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: '1.5' }}>
            Each cleanup runs only when enabled, so an untouched
            file is not re-processed.
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
            onClick={() => { onApply({ videoDenoise, audioDenoise, loudness }); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
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
