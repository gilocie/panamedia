import React, { useState } from 'react';
import { Crop, X, Check, RotateCcw } from 'lucide-react';

interface CropToolProps {
  fileName: string;
  onApply: (cropSettings: { aspectRatio: string; zoom: number }) => void;
  onClose: () => void;
}

export const CropTool: React.FC<CropToolProps> = ({
  fileName,
  onApply,
  onClose
}) => {
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');
  const [zoom, setZoom] = useState<number>(100);

  const RATIOS = [
    { id: 'original', label: 'Original', desc: 'Keep source ratio' },
    { id: '16:9', label: '16:9', desc: 'Widescreen TV & YouTube' },
    { id: '4:3', label: '4:3', desc: 'Classic TV & Standard' },
    { id: '1:1', label: '1:1', desc: 'Square / Social Feed' },
    { id: '9:16', label: '9:16', desc: 'Vertical / TikTok & Shorts' },
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
          width: '540px',
          maxWidth: '96vw',
          background: 'linear-gradient(180deg, #161828 0%, #0d0e18 100%)',
          border: '1px solid rgba(129, 140, 248, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(129, 140, 248, 0.25)',
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
              background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Crop size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                Crop & Aspect Ratio
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
              Select Aspect Ratio Frame
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
              {RATIOS.map(r => {
                const isSelected = aspectRatio === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setAspectRatio(r.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(129, 140, 248, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1.5px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#c7d2fe' : '#fff' }}>
                      {r.label}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {r.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
              <span>Frame Zoom Scale</span>
              <span style={{ fontWeight: 700, color: '#818cf8' }}>{zoom}%</span>
            </div>
            <input
              type="range"
              min={100}
              max={200}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#818cf8', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => { setAspectRatio('16:9'); setZoom(100); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#cbd5e1',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={12} /> Reset to Default
            </button>
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
              onApply({ aspectRatio, zoom });
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(129, 140, 248, 0.35)'
            }}
          >
            <Check size={14} /> Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
};
