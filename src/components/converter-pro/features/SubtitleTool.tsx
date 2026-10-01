import React, { useState } from 'react';
import { MessageSquare, X, Check, Upload } from 'lucide-react';
import { electron } from '../../panamedia/types';

interface SubtitleToolProps {
  fileName: string;
  onApply: (subSettings: { subPath: string; burnIn: boolean; encoding: string }) => void;
  onClose: () => void;
}

export const SubtitleTool: React.FC<SubtitleToolProps> = ({
  fileName,
  onApply,
  onClose
}) => {
  const [subPath, setSubPath] = useState<string>('');
  const [burnIn, setBurnIn] = useState<boolean>(true);
  const [encoding, setEncoding] = useState<string>('UTF-8');

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
          width: '540px',
          maxWidth: '96vw',
          background: 'linear-gradient(180deg, #161828 0%, #0d0e18 100%)',
          border: '1px solid rgba(192, 132, 252, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(192, 132, 252, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
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
              background: 'linear-gradient(135deg, #9333ea, #c084fc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                Embed / Burn Subtitles
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {fileName.split(/[\\/]/).pop()}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Subtitle File (.srt, .vtt, .ass)
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Choose .srt or .vtt subtitle file..."
                value={subPath}
                onChange={e => setSubPath(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: '#fff',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={handleBrowseSub}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'rgba(192, 132, 252, 0.2)',
                  border: '1px solid rgba(192, 132, 252, 0.4)',
                  color: '#e9d5ff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Upload size={14} /> Browse
              </button>
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={burnIn}
                onChange={e => setBurnIn(e.target.checked)}
                style={{ accentColor: '#c084fc', width: '16px', height: '16px' }}
              />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                  Hardcode / Burn Subtitles into Video Frame
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  Guarantees subtitles display on all car players, old TVs, and mobile screens.
                </div>
              </div>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>Character Encoding:</span>
              <select
                value={encoding}
                onChange={e => setEncoding(e.target.value)}
                style={{
                  background: '#1a1b2d',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px'
                }}
              >
                <option value="UTF-8">UTF-8 (Universal)</option>
                <option value="UTF-16">UTF-16</option>
                <option value="ISO-8859-1">ISO-8859-1 (Western European)</option>
                <option value="Windows-1252">Windows-1252 (ANSI)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          <button
            type="button"
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
            type="button"
            onClick={() => {
              onApply({ subPath, burnIn, encoding });
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #9333ea, #c084fc)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(192, 132, 252, 0.35)'
            }}
          >
            <Check size={14} /> Apply Subtitles
          </button>
        </div>
      </div>
    </div>
  );
};
