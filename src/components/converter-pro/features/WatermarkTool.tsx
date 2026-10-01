import React, { useState } from 'react';
import { Image as ImageIcon, X, Check, Type, Upload } from 'lucide-react';
import { electron } from '../../panamedia/types';

interface WatermarkToolProps {
  fileName: string;
  onApply: (wmSettings: { type: 'text' | 'image'; text?: string; imagePath?: string; opacity: number; position: string }) => void;
  onClose: () => void;
}

export const WatermarkTool: React.FC<WatermarkToolProps> = ({
  fileName,
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
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }]
      });
      if (res && !res.canceled && res.filePath) {
        setImagePath(res.filePath);
      }
    } catch (err) {
      console.error('Failed to select watermark image:', err);
    }
  };

  const POSITIONS = [
    { id: 'top-left', label: 'Top Left' },
    { id: 'top-right', label: 'Top Right' },
    { id: 'center', label: 'Center' },
    { id: 'bottom-left', label: 'Bottom Left' },
    { id: 'bottom-right', label: 'Bottom Right' }
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
          border: '1px solid rgba(52, 211, 153, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(52, 211, 153, 0.25)',
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
              background: 'linear-gradient(135deg, #059669, #34d399)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <ImageIcon size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                Watermark & Logo Overlay
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
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Watermark Type Selector */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setWmType('text')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px',
                borderRadius: '8px',
                background: wmType === 'text' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                border: wmType === 'text' ? '1.5px solid #34d399' : '1px solid rgba(255, 255, 255, 0.08)',
                color: wmType === 'text' ? '#6ee7b7' : '#cbd5e1',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Type size={14} /> Text Watermark
            </button>
            <button
              type="button"
              onClick={() => setWmType('image')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px',
                borderRadius: '8px',
                background: wmType === 'image' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                border: wmType === 'image' ? '1.5px solid #34d399' : '1px solid rgba(255, 255, 255, 0.08)',
                color: wmType === 'image' ? '#6ee7b7' : '#cbd5e1',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <ImageIcon size={14} /> PNG Logo Image
            </button>
          </div>

          {wmType === 'text' ? (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Watermark Text
              </div>
              <input
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: '#fff',
                  outline: 'none'
                }}
              />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Logo Image (PNG recommended)
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Select image file..."
                  value={imagePath}
                  onChange={e => setImagePath(e.target.value)}
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
                  onClick={handleBrowseImage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'rgba(52, 211, 153, 0.2)',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    color: '#6ee7b7',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Upload size={14} /> Browse
                </button>
              </div>
            </div>
          )}

          {/* Position */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Overlay Position
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {POSITIONS.map(p => {
                const isSelected = position === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPosition(p.id)}
                    style={{
                      padding: '7px 8px',
                      borderRadius: '6px',
                      background: isSelected ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1.5px solid #34d399' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isSelected ? '#a7f3d0' : '#cbd5e1',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Opacity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
              <span>Opacity</span>
              <span style={{ fontWeight: 700, color: '#34d399' }}>{opacity}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={opacity}
              onChange={e => setOpacity(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#34d399', cursor: 'pointer' }}
            />
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
              onApply({ type: wmType, text, imagePath, opacity, position });
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #059669, #34d399)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(52, 211, 153, 0.35)'
            }}
          >
            <Check size={14} /> Apply Watermark
          </button>
        </div>
      </div>
    </div>
  );
};
