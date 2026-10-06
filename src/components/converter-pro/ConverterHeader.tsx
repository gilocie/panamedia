import React from 'react';
import { 
  ArrowLeft, Check, Sparkles, Zap, X, 
  Maximize2, Minimize2, Minus 
} from 'lucide-react';

interface ConverterHeaderProps {
  queueCount: number;
  showDone: boolean;
  isExpanded: boolean;
  useHwAccel?: boolean;
  /** When a tool studio is active, show a ← Queue back button on the left */
  onQueueBack?: () => void;
  onToggleExpand: () => void;
  onMinimize: () => void;
  onBack: () => void;
  onClose: () => void;
}

export const ConverterHeader: React.FC<ConverterHeaderProps> = ({
  queueCount,
  showDone,
  isExpanded,
  useHwAccel = true,
  onQueueBack,
  onToggleExpand,
  onMinimize,
  onBack,
  onClose
}) => {
  return (
    <div style={{
      height: '52px',
      padding: '0 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'rgba(255, 255, 255, 0.02)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
      flexShrink: 0
    }}>
      {/* Left: Queue back (when tool open) | Done | Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {onQueueBack && (
          <button
            type="button"
            onClick={onQueueBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '7px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.75)',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              flexShrink: 0
            }}
            title="Discard and return to queue"
          >
            <ArrowLeft size={13} />
            Queue
          </button>
        )}
        {showDone && (
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(99, 102, 241, 0.25))',
              border: '1px solid rgba(6, 182, 212, 0.45)',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(6, 182, 212, 0.2)',
              transition: 'all 0.15s ease'
            }}
            title="Close Converter Pro"
          >
            <Check size={14} style={{ color: '#67e8f9' }} />
            <span>Done</span>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 2px 10px rgba(6, 182, 212, 0.35)'
          }}>
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.3px', color: '#fff' }}>
                Panamedia Converter Pro
              </span>
              {useHwAccel && (
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  color: '#67e8f9',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease'
                }}>
                  <Zap size={10} style={{ color: '#06b6d4' }} /> GPU ACCELERATED
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Stats & Window Controls (Minimize, Expand/Restore, Close) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '5px 10px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          marginRight: '4px'
        }}>
          {queueCount} media item{queueCount === 1 ? '' : 's'} queued
        </div>

        {/* Window Controls Group */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '3px 4px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          {/* Minimize button (Run in background) */}
          <button
            type="button"
            onClick={onMinimize}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Minimize to Background Dock"
          >
            <Minus size={15} />
          </button>

          {/* Expand to fit device screen / Restore collapse */}
          <button
            type="button"
            onClick={onToggleExpand}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title={isExpanded ? 'Restore window size' : 'Expand to full screen'}
          >
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Close (Escape)"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
