import React from 'react';
import { X, Sparkles, Check } from 'lucide-react';
import type { MediaToolItem } from '../types';

interface ToolInfoModalProps {
  tool: MediaToolItem;
  fileName: string;
  onClose: () => void;
}

export const ToolInfoModal: React.FC<ToolInfoModalProps> = ({
  tool,
  fileName,
  onClose
}) => {
  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.8)',
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
          width: '460px',
          maxWidth: '96vw',
          background: 'linear-gradient(180deg, #161828 0%, #0d0e18 100%)',
          border: `1px solid ${tool.color}55`,
          borderRadius: '16px',
          boxShadow: `0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px ${tool.color}33`,
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
              background: `linear-gradient(135deg, ${tool.color}, #06b6d4)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Sparkles size={16} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                {tool.label}
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {tool.sub}
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

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12.5px', color: '#e2e8f0', lineHeight: '1.6' }}>
            {tool.desc}
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '10px',
            padding: '12px 14px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11.5px',
            color: 'var(--text-muted)'
          }}>
            Selected Target: <span style={{ color: '#fff', fontWeight: 600 }}>{fileName.split(/[\\/]/).pop()}</span>
          </div>
        </div>

        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 20px',
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${tool.color}, #06b6d4)`,
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            <Check size={14} /> Got It
          </button>
        </div>
      </div>
    </div>
  );
};
