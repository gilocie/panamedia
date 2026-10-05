import { useState, useEffect } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertCircle, CopyPlus } from 'lucide-react';
import { electron } from './types';

interface PlayerTitleBarProps {
  currentTitle: string;
  onHelpClick: () => void;
  onOpenConverter?: () => void;
}

export function PlayerTitleBar({ currentTitle, onHelpClick, onOpenConverter }: PlayerTitleBarProps) {
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
        return {
          minimized: true,
          queueCount: q.length,
          currentFile: (q[0] || '').split(/[/\\]/).pop() || '',
          statusText: q.length > 1 ? `${q.length} files queued` : 'Ready to Convert',
        };
      }
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    if (!electron) return;
    // Local const so the non-null narrowing survives into the cleanup closure.
    const bridge = electron;
    const handler = (_event: any, state: any) => setConverterState(state);
    bridge.ipcRenderer.on('converter-state-changed', handler);
    bridge.ipcRenderer.invoke('get-converter-minimize-state').then((state: any) => {
      if (state) setConverterState(state);
    }).catch(() => {});
    return () => { bridge.ipcRenderer.removeListener('converter-state-changed', handler); };
  }, []);

  // Only send open-request — restore-request can reset converter state mid-conversion
  const handleOpenConverter = () => {
    if (onOpenConverter) onOpenConverter();
    if (electron) electron.ipcRenderer.send('converter-open-request');
  };

  let persistentQueueCount = 0;
  try {
    const q = JSON.parse(localStorage.getItem('converter_queue') || '[]');
    if (Array.isArray(q)) persistentQueueCount = q.length;
  } catch (e) {}

  const activeQueueCount = converterState?.queueCount ?? persistentQueueCount;
  const hasActiveQueue = Boolean(
    (converterState && (converterState.converting || (converterState.progress && converterState.progress > 0))) ||
    activeQueueCount > 0
  );

  // Derived state for ring
  const pct       = converterState?.progress || 0;
  const r         = 13;
  const circ      = 2 * Math.PI * r;
  const isDone    = converterState?.status === 'completed';
  const isFailed  = converterState?.status === 'failed';
  const isPaused  = !!converterState?.isPaused;
  const isRunning = !!converterState?.converting && !isPaused;
  const offset    = isDone ? 0 : circ - (circ * Math.min(100, Math.max(0, pct)) / 100);
  const arcColor  = isDone ? '#10b981' : isFailed ? '#ef4444' : isPaused ? '#f59e0b' : 'url(#cvG)';
  const iconBg    = isDone
    ? 'linear-gradient(135deg,#10b981,#059669)'
    : isFailed
    ? 'linear-gradient(135deg,#ef4444,#dc2626)'
    : (isRunning || hasActiveQueue)
    ? 'linear-gradient(135deg,#ec4899,#8b5cf6)'
    : 'linear-gradient(135deg,#06b6d4,#6366f1)';

  const btnTitle = isRunning
    ? `Converting... ${pct}% — click to open`
    : isDone   ? 'Done — click to open'
    : isPaused ? 'Paused — click to open'
    : hasActiveQueue ? `${activeQueueCount} file${activeQueueCount !== 1 ? 's' : ''} queued — click to open`
    : 'Converter Pro — click to open';

  return (
    <div
      className="titlebar"
      style={{
        background: '#0f0f16',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: '4px',
      }}
    >
      {/* Left: logo + title */}
      <div
        className="titlebar-logo"
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          WebkitAppRegion: 'drag', background: 'none',
          WebkitTextFillColor: 'initial', textFillColor: 'initial', flexShrink: 0,
        } as any}
      >
        <img src="player.ico" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain', display: 'block' }} alt="logo" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 'bold', fontSize: '13px', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' } as any}>
            Panamedia Player
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'normal', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentTitle}
          </span>
        </div>
      </div>

      {/* Drag spacer */}
      <div style={{ flex: 1, WebkitAppRegion: 'drag' } as any} />

      {/* Right controls */}
      <div className="titlebar-controls" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, gap: '6px' }}>

        <style>{`
          @keyframes cvBlink {
            0%,100% { opacity: 1;   transform: scale(1); }
            50%      { opacity: 0.5; transform: scale(0.88); }
          }
          @keyframes cvGlow {
            0%,100% { box-shadow: 0 0 0px   rgba(236,72,153,0); }
            50%      { box-shadow: 0 0 14px  rgba(236,72,153,0.7), 0 0 26px rgba(139,92,246,0.4); }
          }
        `}</style>

        {/* Converter icon — uses div instead of button to avoid browser default padding/border offset */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpenConverter}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenConverter(); }}
          title={btnTitle}
          style={{
            position: 'relative',
            width: '32px',
            height: '32px',
            flexShrink: 0,
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag',
            boxSizing: 'border-box',
          } as any}
        >
          {/* SVG ring — same 32x32, absolutely fills the div */}
          <svg
            width="32" height="32"
            viewBox="0 0 32 32"
            style={{ position: 'absolute', top: 0, left: 0, width: '32px', height: '32px', pointerEvents: 'none' }}
          >
            <defs>
              <linearGradient id="cvG" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#ec4899" />
                <stop offset="50%"  stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            {/* track ring */}
            <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
            {/* progress arc */}
            {(hasActiveQueue || isDone || isFailed) && (
              <circle
                cx="16" cy="16" r={r}
                fill="none"
                stroke={arcColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                style={{
                  transformOrigin: '16px 16px',
                  transform: 'rotate(-90deg)',
                  transition: isDone ? 'none' : 'stroke-dashoffset 0.4s cubic-bezier(0.16,1,0.3,1)',
                  filter: isRunning ? 'drop-shadow(0 0 4px #ec4899)' : 'none',
                }}
              />
            )}
          </svg>

          {/* Icon square — 20x20 centered inside 32x32 = 6px offset each side */}
          <div
            style={{
              position: 'absolute',
              top: '6px',
              left: '6px',
              width: '20px',
              height: '20px',
              borderRadius: '6px',
              background: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              animation: isRunning
                ? 'cvBlink 1.8s ease-in-out infinite, cvGlow 1.8s ease-in-out infinite'
                : 'none',
              pointerEvents: 'none',
            }}
          >
            {isFailed             ? <AlertCircle  size={10} />
             : converterState?.converting ? <Loader2 size={10} className={isPaused ? '' : 'animate-spin'} />
             : isDone             ? <CheckCircle2 size={10} />
             :                      <Sparkles     size={10} />}
          </div>

          {/* Cyan dot: queued but not yet running */}
          {hasActiveQueue && !converterState?.converting && !isDone && (
            <span
              style={{
                position: 'absolute', top: '2px', right: '2px',
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#06b6d4', boxShadow: '0 0 5px #06b6d4',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {/* New player window */}
        <button
          className="titlebar-btn"
          onClick={() => electron?.ipcRenderer.invoke('open-new-player-window')}
          title="Open New Player Window"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <CopyPlus size={13} style={{ opacity: 0.85 }} />
        </button>

        {/* Help */}
        <button className="titlebar-btn" onClick={onHelpClick} title="Keyboard Shortcuts" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>

        {/* Window controls */}
        <button className="titlebar-btn" onClick={() => electron?.ipcRenderer.send('player-minimize-to-sidebar')} title="Minimize">
          <svg viewBox="0 0 10 1" width="10" height="1"><line x1="0" y1="0" x2="10" y2="0" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
        <button className="titlebar-btn" onClick={() => electron?.ipcRenderer.send('window-maximize')} title="Maximize">
          <svg viewBox="0 0 10 10" width="10" height="10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <button className="titlebar-btn close" onClick={() => electron?.ipcRenderer.send('window-close')} title="Close">
          <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1,1 L9,9 M9,1 L1,9" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
    </div>
  );
}
