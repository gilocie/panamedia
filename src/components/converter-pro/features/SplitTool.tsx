import React, { useState } from 'react';
import { Split, X, Check } from 'lucide-react';
import { formatSeconds } from '../types';

interface SplitToolProps {
  fileName: string;
  duration?: number;
  onApply: (splitSettings: { segmentSec: number }) => void;
  onClose: () => void;
}

export const SplitTool: React.FC<SplitToolProps> = ({
  fileName,
  duration,
  onApply,
  onClose
}) => {
  const [segmentSec, setSegmentSec] = useState<number>(60);

  const display = fileName.split(/[\\/]/).pop() || fileName;
  const dur = duration && duration > 0 ? duration : 0;
  const count = dur > 0 ? Math.max(1, Math.ceil(dur / segmentSec)) : 0;

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
          border: '1px solid rgba(248, 113, 113, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(248, 113, 113, 0.25)',
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
              background: 'linear-gradient(135deg, #dc2626, #f87171)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Split size={18} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Split File</div>
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
              <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Segment length</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f87171' }}>{formatSeconds(segmentSec)}</span>
            </div>
            <input
              type="range"
              min={10}
              max={600}
              step={5}
              value={segmentSec}
              onChange={e => setSegmentSec(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#f87171' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
              <span>10s</span>
              <span>10 min</span>
            </div>
          </div>

          <div style={{
            fontSize: '11px',
            color: 'rgba(248, 113, 113, 0.75)',
            background: 'rgba(248, 113, 113, 0.08)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
            borderRadius: '8px',
            padding: '10px 12px',
            lineHeight: '1.5'
          }}>
            {dur > 0
              ? `Produces ${count} segment${count === 1 ? '' : 's'} of about ${formatSeconds(segmentSec)} each, numbered name001, name002, ... Each plays independently.`
              : 'Produces numbered segments (name001, name002, ...) of the chosen length. Each plays independently.'}
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
            onClick={() => { onApply({ segmentSec }); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #dc2626, #f87171)',
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
