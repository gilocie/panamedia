import React, { useState } from 'react';
import { Scissors, X, Check, RotateCcw } from 'lucide-react';
import { formatSeconds } from '../types';

interface CutTrimToolProps {
  fileName: string;
  duration?: number;
  onApply: (cutSettings: { startSec: number; endSec: number }) => void;
  onClose: () => void;
}

export const CutTrimTool: React.FC<CutTrimToolProps> = ({
  fileName,
  duration = 180,
  onApply,
  onClose
}) => {
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(duration);

  const clipDuration = Math.max(0, endSec - startSec);

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
          width: '560px',
          maxWidth: '96vw',
          background: 'linear-gradient(180deg, #161828 0%, #0d0e18 100%)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(56, 189, 248, 0.25)',
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
              background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Scissors size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                Cut / Trim Video Range
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
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Time Displays */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            textAlign: 'center'
          }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>START POINT</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                {formatSeconds(startSec)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>DURATION</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#4ade80', fontFamily: 'monospace' }}>
                {formatSeconds(clipDuration)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>END POINT</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#ec4899', fontFamily: 'monospace' }}>
                {formatSeconds(endSec)}
              </div>
            </div>
          </div>

          {/* Slider Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
              <span>Trim Start: {formatSeconds(startSec)}</span>
              <span>Total Video: {formatSeconds(duration)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, endSec - 1)}
              value={startSec}
              onChange={e => setStartSec(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
              <span>Trim End: {formatSeconds(endSec)}</span>
            </div>
            <input
              type="range"
              min={startSec + 1}
              max={duration}
              value={endSec}
              onChange={e => setEndSec(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#ec4899', cursor: 'pointer' }}
            />
          </div>

          {/* Quick Shortcuts */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => { setStartSec(0); setEndSec(duration); }}
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
              <RotateCcw size={12} /> Reset to Full Clip
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
              onApply({ startSec, endSec });
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(56, 189, 248, 0.35)'
            }}
          >
            <Check size={14} /> Apply Cut Range
          </button>
        </div>
      </div>
    </div>
  );
};
