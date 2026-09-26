
interface PlayerHelpModalProps {
  onClose: () => void;
}

export function PlayerHelpModal({ onClose }: PlayerHelpModalProps) {
  const shortcuts = [
    { key: 'Space / K', desc: 'Play / Pause media playback' },
    { key: 'L', desc: 'Cycle Loop mode (Off ➔ Single Track ➔ Folder ➔ All Tracks)' },
    { key: 'Q', desc: 'Open / Close 10-Band Equalizer & Audio Effects panel' },
    { key: 'F', desc: 'Toggle Fullscreen mode' },
    { key: 'M', desc: 'Toggle Mute / Unmute audio' },
    { key: 'Arrow Up', desc: 'Increase Volume by 5% (Studio Boost up to 200%)' },
    { key: 'Arrow Down', desc: 'Decrease Volume by 5%' },
    { key: 'Arrow Right', desc: 'Seek forward 5 seconds (Ctrl + Right: 30s jump)' },
    { key: 'Arrow Left / J', desc: 'Seek backward 5 seconds (Ctrl + Left / J: 30s jump)' },
    { key: '0 – 9', desc: 'Quick jump to percentage of timeline (0% to 90%)' },
    { key: 'N', desc: 'Skip to Next track in active playlist' },
    { key: 'P', desc: 'Skip to Previous track in active playlist' },
    { key: 'S', desc: 'Open Send to USB Flash Drive dialog for current file' },
    { key: 'Esc', desc: 'Close dialogs, overlays, or exit fullscreen' },
    { key: 'Mouse Wheel', desc: 'Scroll over video screen to smoothly adjust volume' },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 5, 8, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '540px',
          maxWidth: '100%',
          background: 'rgba(15, 15, 22, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.01)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>Player Keyboard Shortcuts</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1,
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '20px',
          maxHeight: '380px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {shortcuts.map((sc, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.03)'
              }}
            >
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: '500' }}>
                {sc.desc}
              </span>
              <kbd style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 2px 0 rgba(0,0,0,0.5)',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: '5px',
                fontSize: '10px',
                fontFamily: 'Consolas, Monaco, monospace',
                fontWeight: '600',
                display: 'inline-block',
                textShadow: '0 1px 0 rgba(0,0,0,0.4)'
              }}>
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'rgba(255,255,255,0.01)'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(99,102,241,0.25)'
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
