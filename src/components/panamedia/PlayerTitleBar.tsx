import { electron } from './types';

interface PlayerTitleBarProps {
  currentTitle: string;
  onHelpClick: () => void;
}

export function PlayerTitleBar({ currentTitle, onHelpClick }: PlayerTitleBarProps) {
  return (
    <div className="titlebar" style={{ background: '#0f0f16', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="titlebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px', WebkitAppRegion: 'drag', background: 'none', WebkitTextFillColor: 'initial', textFillColor: 'initial' } as any}>
        <img src="player.ico" style={{ width: '28px', height: '28px', display: 'block', borderRadius: '6px', objectFit: 'contain' }} alt="logo" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 'bold', fontSize: '13px', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' } as any}>Panamedia Player</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'normal', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTitle}</span>
        </div>
      
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={onHelpClick} title="Keyboard Shortcuts Help" style={{ WebkitAppRegion: 'no-drag', marginRight: '4px' } as any}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        </button>
        <button className="titlebar-btn" onClick={() => electron?.ipcRenderer.send('player-minimize-to-sidebar')} title="Minimize to sidebar">
          <svg viewBox="0 0 10 1" width="10" height="1"><line x1="0" y1="0" x2="10" y2="0" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
        <button className="titlebar-btn" onClick={() => electron?.ipcRenderer.send('window-maximize')}>
          <svg viewBox="0 0 10 10" width="10" height="10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <button className="titlebar-btn close" onClick={() => electron?.ipcRenderer.send('window-close')}>
          <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1,1 L9,9 M9,1 L1,9" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
    </div>
  );
}
