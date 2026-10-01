import React, { useState } from 'react';
import { Sparkles, X, Check, RotateCcw } from 'lucide-react';

interface EffectToolProps {
  fileName: string;
  onApply: (effectSettings: { brightness: number; contrast: number; saturation: number; hue: number }) => void;
  onClose: () => void;
}

export const EffectTool: React.FC<EffectToolProps> = ({
  fileName,
  onApply,
  onClose
}) => {
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(0);
  const [hue, setHue] = useState<number>(0);

  const resetAll = () => {
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setHue(0);
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
          width: '520px',
          maxWidth: '96vw',
          background: 'linear-gradient(180deg, #161828 0%, #0d0e18 100%)',
          border: '1px solid rgba(236, 72, 153, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(236, 72, 153, 0.25)',
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
              background: 'linear-gradient(135deg, #db2777, #ec4899)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Sparkles size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                Video Effects & Color Grading
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
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
              <span>Brightness</span>
              <span style={{ fontWeight: 700, color: '#ec4899' }}>{brightness > 0 ? `+${brightness}` : brightness}</span>
            </div>
            <input
              type="range"
              min={-50}
              max={50}
              value={brightness}
              onChange={e => setBrightness(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#ec4899', cursor: 'pointer' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
              <span>Contrast</span>
              <span style={{ fontWeight: 700, color: '#ec4899' }}>{contrast > 0 ? `+${contrast}` : contrast}</span>
            </div>
            <input
              type="range"
              min={-50}
              max={50}
              value={contrast}
              onChange={e => setContrast(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#ec4899', cursor: 'pointer' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
              <span>Saturation</span>
              <span style={{ fontWeight: 700, color: '#ec4899' }}>{saturation > 0 ? `+${saturation}` : saturation}</span>
            </div>
            <input
              type="range"
              min={-50}
              max={50}
              value={saturation}
              onChange={e => setSaturation(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#ec4899', cursor: 'pointer' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
              <span>Hue</span>
              <span style={{ fontWeight: 700, color: '#ec4899' }}>{hue}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              value={hue}
              onChange={e => setHue(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#ec4899', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={resetAll}
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
              <RotateCcw size={12} /> Reset All Effects
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
              onApply({ brightness, contrast, saturation, hue });
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #db2777, #ec4899)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(236, 72, 153, 0.35)'
            }}
          >
            <Check size={14} /> Apply Effects
          </button>
        </div>
      </div>
    </div>
  );
};
