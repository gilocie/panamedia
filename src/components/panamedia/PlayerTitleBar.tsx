import { useState, useEffect } from 'react';
import { 
  Sparkles, Maximize2, Play, Pause, Loader2, CheckCircle2, AlertCircle, X, Zap 
} from 'lucide-react';
import { electron } from './types';

interface PlayerTitleBarProps {
  currentTitle: string;
  onHelpClick: () => void;
  onOpenConverter?: () => void;
}

export function PlayerTitleBar({ currentTitle, onHelpClick, onOpenConverter }: PlayerTitleBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [converterState, setConverterState] = useState<{
    minimized?: boolean;
    queueCount?: number;
    currentFile?: string;
    progress?: number;
    converting?: boolean;
    isPaused?: boolean;
    status?: string;
    statusText?: string;
    useHwAccel?: boolean;
  } | null>(() => {
    try {
      const q = JSON.parse(localStorage.getItem('converter_queue') || '[]');
      if (Array.isArray(q) && q.length > 0) {
        const file = (q[0] || '').split(/[/\\]/).pop() || '';
        return {
          minimized: true,
          queueCount: q.length,
          currentFile: file,
          statusText: q.length > 1 ? `${q.length} files queued` : 'Ready to Convert'
        };
      }
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    if (!electron) return;
    const handleConverterState = (_event: any, state: any) => {
      setConverterState(state);
    };
    electron.ipcRenderer.on('converter-state-changed', handleConverterState);
    electron.ipcRenderer.invoke('get-converter-minimize-state').then((state: any) => {
      if (state) setConverterState(state);
    }).catch(() => {});

    return () => {
      electron.ipcRenderer.removeListener('converter-state-changed', handleConverterState);
    };
  }, []);

  const handleOpenOrRestoreConverter = () => {
    if (onOpenConverter) {
      onOpenConverter();
    }
    if (electron) {
      electron.ipcRenderer.send('converter-open-request');
      electron.ipcRenderer.send('converter-restore-request');
    }
  };

  let persistentQueueCount = 0;
  let persistentFile = '';
  let interruptedStatusText = '';
  try {
    const q = JSON.parse(localStorage.getItem('converter_queue') || '[]');
    if (Array.isArray(q)) {
      persistentQueueCount = q.length;
      if (q.length > 0) persistentFile = (q[0] || '').split(/[/\\]/).pop() || '';
    }
    const activeProg = JSON.parse(localStorage.getItem('converter_active_progress') || 'null');
    if (activeProg && activeProg.status === 'converting') {
      interruptedStatusText = `Resume [${(activeProg.currentFileIndex || 0) + 1}/${activeProg.totalFiles || persistentQueueCount}]`;
      if (activeProg.currentFile) {
        persistentFile = activeProg.currentFile.split(/[/\\]/).pop() || persistentFile;
      }
    }
  } catch (e) {}

  const activeQueueCount = converterState?.queueCount ?? persistentQueueCount;
  const activeFileName = converterState?.currentFile || persistentFile;

  const hasActiveQueue = Boolean(
    (converterState && (converterState.converting || (converterState.progress && converterState.progress > 0))) ||
    activeQueueCount > 0
  );

  const isCardExpanded = hasActiveQueue || isHovered;

  const isGpuEnabled = converterState?.useHwAccel !== undefined 
    ? converterState.useHwAccel 
    : (localStorage.getItem('converter_useHwAccel') !== 'false');

  return (
    <div className="titlebar" style={{ background: '#0f0f16', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '4px' }}>
      {/* Titlebar Left: App Logo & Current Media Name */}
      <div className="titlebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px', WebkitAppRegion: 'drag', background: 'none', WebkitTextFillColor: 'initial', textFillColor: 'initial', flexShrink: 0 } as any}>
        <img src="player.ico" style={{ width: '28px', height: '28px', display: 'block', borderRadius: '6px', objectFit: 'contain' }} alt="logo" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 'bold', fontSize: '13px', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' } as any}>Panamedia Player</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'normal', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTitle}</span>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1, WebkitAppRegion: 'drag' } as any} />

      {/* Titlebar Right: Converter Pro (Expands by default if has files, or on hover if idle) + Window Controls */}
      <div className="titlebar-controls" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, gap: '6px' }}>
        
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handleOpenOrRestoreConverter}
          style={{
            WebkitAppRegion: 'no-drag',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            height: '28px',
            maxWidth: isCardExpanded ? (hasActiveQueue ? '430px' : '230px') : '28px',
            width: isCardExpanded ? 'auto' : '28px',
            background: hasActiveQueue
              ? 'linear-gradient(135deg, rgba(18, 19, 32, 0.98) 0%, rgba(10, 11, 18, 0.98) 100%)'
              : isHovered
              ? 'linear-gradient(135deg, rgba(20, 22, 38, 0.95) 0%, rgba(12, 13, 24, 0.95) 100%)'
              : 'linear-gradient(135deg, rgba(24, 26, 42, 0.6) 0%, rgba(14, 15, 26, 0.6) 100%)',
            border: hasActiveQueue
              ? '1px solid rgba(168, 85, 247, 0.55)'
              : isHovered
              ? '1px solid rgba(99, 102, 241, 0.5)'
              : '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: hasActiveQueue
              ? '0 4px 18px rgba(0, 0, 0, 0.7), 0 0 12px rgba(168, 85, 247, 0.25)'
              : isHovered
              ? '0 4px 15px rgba(0, 0, 0, 0.5), 0 0 10px rgba(99, 102, 241, 0.2)'
              : 'none',
            borderRadius: '8px',
            padding: isCardExpanded ? '2px 8px 2px 3px' : '0',
            cursor: 'pointer',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            transition: 'max-width 0.28s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s, border 0.2s, box-shadow 0.2s',
            marginRight: '2px'
          } as any}
          title={isCardExpanded ? '' : (hasActiveQueue ? 'Converter Pro is active - Click to open' : 'Panamedia Converter Pro - Hover to open')}
        >
          {/* Always Visible Icon Button (Left Anchor) */}
          <div style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            background: hasActiveQueue && converterState?.converting
              ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.3), rgba(139, 92, 246, 0.3))'
              : 'linear-gradient(135deg, #06b6d4, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
            boxShadow: '0 2px 6px rgba(6, 182, 212, 0.3)',
            position: 'relative'
          }}>
            {converterState?.status === 'failed' ? (
              <AlertCircle size={13} style={{ color: '#ef4444' }} />
            ) : converterState?.converting ? (
              <Loader2 size={13} className={converterState.isPaused ? '' : 'animate-spin'} style={{ color: '#ec4899' }} />
            ) : converterState?.status === 'completed' ? (
              <CheckCircle2 size={13} style={{ color: '#10b981' }} />
            ) : (
              <Sparkles size={13} />
            )}

            {/* Tiny Indicator Dot when Queue is Active and Collapsed */}
            {!isCardExpanded && hasActiveQueue && (
              <span style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: converterState?.converting ? '#ec4899' : '#06b6d4',
                boxShadow: '0 0 6px currentColor'
              }} />
            )}
          </div>

          {/* Expanded Content: Default when has files, or on hover when idle */}
          {isCardExpanded && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginLeft: '8px',
              minWidth: 0,
              opacity: isCardExpanded ? 1 : 0,
              transition: 'opacity 0.2s ease 0.05s'
            }}>
              {hasActiveQueue ? (
                /* Active / Queued Converter Card */
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff', letterSpacing: '0.2px' }}>
                        {converterState?.statusText || interruptedStatusText || (converterState?.converting ? (converterState.isPaused ? 'Paused' : 'Converting...') : (activeQueueCount > 1 ? `${activeQueueCount} files queued` : 'Ready to Convert'))}
                      </span>
                      {converterState?.converting ? (
                        <span style={{ fontSize: '9.5px', color: '#c084fc', fontWeight: 700 }}>
                          {converterState.progress || 0}%
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '8.5px',
                          fontWeight: 700,
                          color: '#67e8f9',
                          background: 'rgba(6, 182, 212, 0.2)',
                          padding: '0 4px',
                          borderRadius: '3px'
                        }}>
                          {activeQueueCount} queued
                        </span>
                      )}
                      {isGpuEnabled && (
                        <span style={{
                          fontSize: '8px',
                          fontWeight: 700,
                          color: '#34d399',
                          background: 'rgba(52, 211, 153, 0.15)',
                          padding: '0 3px',
                          borderRadius: '3px'
                        }}>
                          GPU
                        </span>
                      )}
                    </div>

                    {activeFileName && (
                      <span style={{
                        fontSize: '8.5px',
                        color: '#94a3b8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '150px'
                      }}>
                        {activeFileName}
                      </span>
                    )}

                    {/* Progress Bar */}
                    {(converterState?.converting || (converterState?.progress && converterState.progress > 0)) && (
                      <div style={{ width: '100%', height: '2.5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden', marginTop: '1px' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.max(5, converterState?.progress || 0)}%`,
                          background: converterState?.status === 'completed'
                            ? '#10b981'
                            : converterState?.status === 'failed'
                            ? '#ef4444'
                            : 'linear-gradient(90deg, #ec4899, #8b5cf6)',
                          borderRadius: '2px',
                          transition: 'width 0.2s ease'
                        }} />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: 'auto', flexShrink: 0 }}>
                    {!converterState?.converting ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          electron?.ipcRenderer.send('converter-run-request');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '9px',
                          fontWeight: 800,
                          color: '#fff',
                          background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
                          border: 'none',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                        title="Start Conversion Now"
                      >
                        <Play size={8} fill="#fff" />
                        <span>RUN</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (converterState.isPaused) {
                            electron?.ipcRenderer.send('converter-resume-request');
                          } else {
                            electron?.ipcRenderer.send('converter-pause-request');
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '9px',
                          fontWeight: 800,
                          color: converterState.isPaused ? '#67e8f9' : '#fbcfe8',
                          background: converterState.isPaused ? 'rgba(6, 182, 212, 0.25)' : 'rgba(236, 72, 153, 0.25)',
                          border: converterState.isPaused ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(236, 72, 153, 0.5)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                        title={converterState.isPaused ? 'Resume' : 'Pause'}
                      >
                        {converterState.isPaused ? <Play size={8} fill="#67e8f9" /> : <Pause size={8} fill="#fbcfe8" />}
                        <span>{converterState.isPaused ? 'Resume' : 'Pause'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenOrRestoreConverter();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontSize: '9px',
                        fontWeight: 800,
                        color: '#38bdf8',
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        padding: '2px 5px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      title="Open Converter Pro Modal"
                    >
                      <span>Open</span>
                      <Maximize2 size={8} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        localStorage.removeItem('converter_queue');
                        electron?.ipcRenderer.send('converter-close-request');
                        setConverterState(null);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.45)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Dismiss"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </>
              ) : (
                /* Idle Converter Card */
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#fff', letterSpacing: '0.2px' }}>
                      Converter Pro
                    </span>
                    {isGpuEnabled && (
                      <span style={{
                        fontSize: '8px',
                        fontWeight: 700,
                        color: '#67e8f9',
                        background: 'rgba(6, 182, 212, 0.15)',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}>
                        <Zap size={8} style={{ color: '#06b6d4' }} /> GPU
                      </span>
                    )}
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#c084fc',
                    background: 'rgba(192, 132, 252, 0.15)',
                    border: '1px solid rgba(192, 132, 252, 0.3)',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    marginLeft: '2px'
                  }}>
                    <span>Open</span>
                    <Maximize2 size={8} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Help Button */}
        <button className="titlebar-btn" onClick={onHelpClick} title="Keyboard Shortcuts Help" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        </button>

        {/* Standard Window Controls */}
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
