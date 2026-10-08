import React from 'react';
import { AlertCircle, Download, Loader2, Pause, Play } from 'lucide-react';
import playerBg from '../assets/playerbg.jpg';
import { getFriendlyErrorMessage } from '../utils/urlUtils';

interface BinarySetupScreenProps {
  installingBinaries: boolean;
  installProgress: {
    status: string;
    progress: number;
    isPaused?: boolean;
    error?: string | null;
  };
  onInstall: () => void;
  onResume: () => void;
  onPause: () => void;
  onCancel: () => void;
}

export const BinarySetupScreen: React.FC<BinarySetupScreenProps> = ({
  installingBinaries,
  installProgress,
  onInstall,
  onResume,
  onPause,
  onCancel,
}) => {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundImage: `linear-gradient(rgba(7, 7, 10, 0.75), rgba(7, 7, 10, 0.75)), url(${playerBg})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }}>
      <div className="titlebar">
        <div className="titlebar-logo" style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.1, WebkitAppRegion: 'drag' } as any}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '13px' }}>
            <img 
              src="favicon.svg" 
              style={{ width: '16px', height: '16px', objectFit: 'contain' }} 
              alt="" 
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'player.ico'; }}
            /> Panamedia
          </div>
          <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 'normal', paddingLeft: '22px' }}>All in One media manager</span>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel setup-panel">
          <div className="setup-title">System Initialization</div>
          <div className="setup-desc">
            To support fast YouTube playlist downloading and H.265/HEVC video compression, we need to configure <strong>yt-dlp.exe</strong> and <strong>ffmpeg.exe</strong>. Click below to download these static binaries automatically.
          </div>

          {!installingBinaries ? (
            <button className="btn-primary" onClick={onInstall} style={{ padding: '12px 28px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
              <Download size={16} /> Configure Runtimes
            </button>
          ) : (
            <div className="setup-progress-container">
              {installProgress.error ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontWeight: 'bold', fontSize: '14px' }}>
                    <AlertCircle size={18} /> Setup Failed
                  </div>
                  <div style={{ fontSize: '12px', color: '#ff8888', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px 14px', borderRadius: '10px', width: '100%', maxWidth: '400px', wordBreak: 'break-all' }}>
                    {getFriendlyErrorMessage(installProgress.error)}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                    <button className="btn-primary" onClick={onResume} style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Play size={12} /> Retry / Resume
                    </button>
                    <button className="titlebar-btn" onClick={onCancel} style={{ padding: '8px 16px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', height: 'auto', width: 'auto' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span className="setup-status">
                      {installProgress.isPaused ? 'Paused' : (installProgress.status.replace('_', ' ') + '...')}
                    </span>
                    <span>{Math.round(installProgress.progress)}% of 100%</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: '8px' }}>
                    <div className="progress-bar-fill" style={{ width: `${installProgress.progress}%` }}></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {!installProgress.isPaused ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> This may take a moment depending on your bandwidth
                        </>
                      ) : (
                        <>
                          <Pause size={12} /> Download paused
                        </>
                      )}
                    </div>
                    
                    {!installProgress.isPaused ? (
                      <button onClick={onPause} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Pause size={10} /> Pause
                      </button>
                    ) : (
                      <button onClick={onResume} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Play size={10} /> Resume
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
