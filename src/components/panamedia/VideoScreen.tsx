import React, { type RefObject, useEffect, useRef } from 'react';
import { PlayCircle, Lock, ShieldCheck, KeyRound, Eye, EyeOff, Film, Music, AlertCircle, RefreshCw, SkipForward, FolderOpen, Trash2, X } from 'lucide-react';
import playerBg from '../../assets/playerbg.jpg';
import { type VideoFilters, electron } from './types';

interface VideoScreenProps {
  videoScreenRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  isAudioFile: boolean;
  isIdle: boolean;
  isBuffering: boolean;
  isCheckingMedia: boolean;
  mediaUrl: string;
  videoStyle: React.CSSProperties;
  repeatMode: 'off' | 'one' | 'folder' | 'all';
  speed: number;
  hudVolume: number | null;
  hudMessage?: string | null;
  hudSkip?: { amount: number; direction: 'forward' | 'backward' } | null;
  thumbnailToShow: string | null;
  imgErrors: Record<string, boolean>;
  setImgErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  togglePlay?: () => void;
  toggleFullscreen: () => void;
  handleTimeUpdate: () => void;
  handleLoadedMetadata: () => void;
  handleVideoEnded: () => void;
  onSeeked?: () => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  initAudio: () => void;
  currentTitle: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  videoFilters?: VideoFilters;
  onMediaError?: () => void;
  cursorVisible?: boolean;
  isMediaLocked?: boolean;
  isArchiveTabActive?: boolean;
  archivePin?: string;
  onUnlockAndResume?: (enteredPin: string) => boolean | Promise<boolean>;
  onSetArchivePinAndResume?: (newPin: string) => void | Promise<void>;
  onCancelLock?: () => void;
  playbackError?: { hasError: boolean; message?: string; filePath?: string } | null;
  onRetryPlayback?: () => void;
  onNextTrack?: () => void;
  onDismissError?: () => void;
  onRemoveMissingMedia?: (filePath: string) => void;
}

export function VideoScreen({
  videoScreenRef,
  videoRef,
  canvasRef,
  analyserRef,
  isAudioFile,
  isIdle,
  isBuffering,
  isCheckingMedia: _isCheckingMedia,
  mediaUrl,
  videoStyle,
  repeatMode,
  speed,
  hudVolume,
  hudMessage,
  hudSkip,
  thumbnailToShow,
  imgErrors,
  setImgErrors,
  setPlaying,
  setIsBuffering,
  togglePlay: _togglePlay,
  toggleFullscreen,
  handleTimeUpdate,
  handleLoadedMetadata,
  handleVideoEnded,
  onSeeked,
  handleDragOver,
  handleDrop,
  initAudio,
  currentTitle,
  onContextMenu,
  videoFilters,
  onMediaError,
  cursorVisible = true,
  isMediaLocked = false,
  isArchiveTabActive = false,
  archivePin = '',
  onUnlockAndResume,
  onSetArchivePinAndResume,
  onCancelLock,
  playbackError,
  onRetryPlayback,
  onNextTrack,
  onDismissError,
  onRemoveMissingMedia,
}: VideoScreenProps) {
  const [thumbLoaded, setThumbLoaded] = React.useState(false);
  const [hasStartedRendering, setHasStartedRendering] = React.useState(false);
  const [ambilightColor, setAmbilightColor] = React.useState<string>('rgba(99, 102, 241, 0.12)');

  // ─── PIN Unlock State for Locked Media Dialog ──────────────────────
  const [screenPinInput, setScreenPinInput] = React.useState('');
  const [screenConfirmPinInput, setScreenConfirmPinInput] = React.useState('');
  const [screenPinError, setScreenPinError] = React.useState('');
  const [showPin, setShowPin] = React.useState(false);
  const [showConfirmPin, setShowConfirmPin] = React.useState(false);
  const [isShaking, setIsShaking] = React.useState(false);

  useEffect(() => {
    if (!isMediaLocked) {
      setScreenPinInput('');
      setScreenConfirmPinInput('');
      setScreenPinError('');
      setShowPin(false);
      setShowConfirmPin(false);
      setIsShaking(false);
    }
  }, [isMediaLocked]);

  const handleLockedPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScreenPinError('');

    const isSettingNewPin = !archivePin;
    if (isSettingNewPin) {
      if (!screenPinInput || screenPinInput.length < 4) {
        setScreenPinError('PIN must be at least 4 digits.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 450);
        return;
      }
      if (screenPinInput !== screenConfirmPinInput) {
        setScreenPinError('PIN confirmation does not match.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 450);
        return;
      }
      await onSetArchivePinAndResume?.(screenPinInput);
      setScreenPinInput('');
      setScreenConfirmPinInput('');
    } else {
      if (!screenPinInput) {
        setScreenPinError('Please enter your security PIN.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 450);
        return;
      }
      const success = await onUnlockAndResume?.(screenPinInput);
      if (!success) {
        setScreenPinError('Incorrect PIN. Please try again.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 450);
        setScreenPinInput('');
      }
    }
  };

  const rafRef = useRef<number | null>(null);
  const hasValidThumbnail = !!thumbnailToShow && !imgErrors[thumbnailToShow];

  React.useEffect(() => {
    setThumbLoaded(false);
  }, [thumbnailToShow]);

  React.useEffect(() => {
    setHasStartedRendering(false);
    if (!mediaUrl) return;

    // Safety timeout: If after 12 seconds media has not started rendering,
    // trigger onMediaError so player falls back to transcode or shows error card instead of blank screen
    const safetyTimer = setTimeout(() => {
      const v = videoRef.current;
      if (v && v.currentTime === 0 && (v.readyState < 2 || v.videoWidth === 0)) {
        onMediaError?.();
      }
    }, 12000);
    return () => clearTimeout(safetyTimer);
  }, [mediaUrl]);

  // ─── Reactive Ambilight (Ambient Edge Glow) ─────────────────────────
  useEffect(() => {
    if (isAudioFile || isIdle || isMediaLocked) return;
    const v = videoRef.current;
    if (!v) return;

    let sampleInterval: any = null;
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const sampleEdges = () => {
      if (!v.paused && v.readyState >= 2 && ctx) {
        try {
          ctx.drawImage(v, 0, 0, 4, 4);
          const data = ctx.getImageData(0, 0, 4, 4).data;
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
          if (count > 0) {
            r = Math.min(255, Math.round(r / count * 1.15));
            g = Math.min(255, Math.round(g / count * 1.15));
            b = Math.min(255, Math.round(b / count * 1.15));
            setAmbilightColor(`rgba(${r}, ${g}, ${b}, 0.38)`);
          }
        } catch (e) {}
      }
    };

    sampleInterval = setInterval(sampleEdges, 150); // 6-7 fps is extremely light on CPU
    return () => clearInterval(sampleInterval);
  }, [isAudioFile, isIdle, videoRef]);

  // ─── Compute CSS Filter String from VideoFilters ───────────────────
  const cssVideoFilter = React.useMemo(() => {
    if (!videoFilters) return undefined;
    const parts = [
      `brightness(${videoFilters.brightness}%)`,
      `contrast(${videoFilters.contrast}%)`,
      `saturate(${videoFilters.saturate}%)`,
    ];
    if (videoFilters.nightMode) {
      parts.push('sepia(20%)', 'hue-rotate(-10deg)');
    }
    return parts.join(' ');
  }, [videoFilters]);

  // ─── Canvas visualizer ──────────────────────────────────────────────
  useEffect(() => {
    if (!isAudioFile) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resize canvas to match display size
    const resize = () => {
      if (canvas) {
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;

      const W = canvas.width;
      const H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);

      if (!analyser) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const barCount = 64; // Draw 64 bars
      const barWidth = W / barCount;
      const maxBarH = H * 0.92;
      const centerIndex = barCount / 2;

      // Stretch lower 55% of bins across the symmetric halves so visualizer spans the full screen width
      const activeRange = Math.floor(bufferLength * 0.55);

      for (let i = 0; i < barCount; i++) {
        const dist = Math.abs(i - centerIndex);
        const freqIndex = Math.min(
          activeRange - 1,
          Math.floor((dist / centerIndex) * activeRange)
        );

        const value = dataArray[freqIndex] / 255;
        const minBarH = 6; // Keep a neat active baseline stretching across the screen
        const barH = Math.max(minBarH, value * maxBarH);
        const x = i * barWidth;
        const y = H - barH;

        // Gap between adjacent bars
        const gap = Math.max(2, Math.floor(barWidth * 0.15));
        const drawWidth = barWidth - gap;

        const pos = 1 - (dist / centerIndex);

        const hue = 340 - pos * 80;
        const sat = 80 + pos * 15;
        const light = 55 + value * 15;
        const alpha = 0.85 + value * 0.15;

        ctx2d.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;

        const radius = Math.min(drawWidth * 0.45, barH * 0.45, 4);
        if (barH > 0) {
          ctx2d.beginPath();
          ctx2d.moveTo(x + radius, y);
          ctx2d.lineTo(x + drawWidth - radius, y);
          ctx2d.quadraticCurveTo(x + drawWidth, y, x + drawWidth, y + radius);
          ctx2d.lineTo(x + drawWidth, H);
          ctx2d.lineTo(x, H);
          ctx2d.lineTo(x, y + radius);
          ctx2d.quadraticCurveTo(x, y, x + radius, y);
          ctx2d.closePath();
          ctx2d.fill();
        }
      }
    };

    draw();
    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isAudioFile, analyserRef, canvasRef]);

  return (
    <div
      ref={videoScreenRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundImage: `linear-gradient(rgba(9, 9, 14, 0.72), rgba(9, 9, 14, 0.72)), url(${playerBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: 0,
        overflow: 'hidden',
        cursor: cursorVisible ? 'default' : 'none'
      }}
      onDoubleClick={isMediaLocked ? undefined : toggleFullscreen}
      onContextMenu={(e) => {
        if (isMediaLocked) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        onContextMenu?.(e);
      }}
    >
      <div 
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}
      >
        {hudVolume !== null && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 100,
            pointerEvents: 'none',
            fontFamily: "'Outfit', 'Inter', sans-serif",
            fontSize: '96px',
            fontWeight: 'bold',
            color: hudVolume > 100 ? '#ef4444' : `hsl(${270 + Math.min(1, hudVolume / 100) * 50}, 95%, 60%)`,
            textShadow: hudVolume > 100 ? '0 0 35px rgba(239, 68, 68, 0.8), 0 4px 30px rgba(0, 0, 0, 0.9)' : '0 4px 30px rgba(0, 0, 0, 0.8)',
            letterSpacing: '-3px',
            transition: 'opacity 0.15s ease-in-out'
          }}>
            {hudVolume}%
          </div>
        )}

        {hudMessage && !hudSkip && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 100,
            pointerEvents: 'none',
            fontFamily: "'Outfit', 'Inter', sans-serif",
            fontSize: '64px',
            fontWeight: 'bold',
            color: 'hsl(340, 95%, 65%)',
            textShadow: '0 4px 30px rgba(0, 0, 0, 0.8)',
            letterSpacing: '-1.5px',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.15s ease-in-out'
          }}>
            {hudMessage}
          </div>
        )}

        {hudSkip && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            pointerEvents: 'none',
          }}>
            {hudSkip.direction === 'backward' && (
              <div
                key={`skip-back-${hudSkip.amount}`}
                style={{
                  position: 'absolute',
                  right: isAudioFile ? 'calc(50% + 145px)' : 'calc(50% + 155px)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px 26px',
                  borderRadius: '16px',
                  background: 'rgba(10, 10, 22, 0.92)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1.5px solid rgba(168, 85, 247, 0.55)',
                  boxShadow: '0 0 35px rgba(168, 85, 247, 0.45)',
                  animation: 'skipBadgePop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}
              >
                <span style={{
                  fontFamily: "'Outfit', 'Inter', sans-serif",
                  fontSize: '44px',
                  fontWeight: '900',
                  color: '#d8b4fe',
                  textShadow: '0 0 25px rgba(192, 132, 252, 0.9)',
                  letterSpacing: '-1.5px',
                  lineHeight: 1
                }}>
                  ⏪ -{hudSkip.amount}s
                </span>
              </div>
            )}

            {hudSkip.direction === 'forward' && (
              <div
                key={`skip-fwd-${hudSkip.amount}`}
                style={{
                  position: 'absolute',
                  left: isAudioFile ? 'calc(50% + 145px)' : 'calc(50% + 155px)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px 26px',
                  borderRadius: '16px',
                  background: 'rgba(10, 10, 22, 0.92)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1.5px solid rgba(168, 85, 247, 0.55)',
                  boxShadow: '0 0 35px rgba(168, 85, 247, 0.45)',
                  animation: 'skipBadgePop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}
              >
                <span style={{
                  fontFamily: "'Outfit', 'Inter', sans-serif",
                  fontSize: '44px',
                  fontWeight: '900',
                  color: '#d8b4fe',
                  textShadow: '0 0 25px rgba(192, 132, 252, 0.9)',
                  letterSpacing: '-1.5px',
                  lineHeight: 1
                }}>
                  +{hudSkip.amount}s ⏩
                </span>
              </div>
            )}
          </div>
        )}

        {isIdle && (
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundImage: `url(${playerBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 5,
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(9,9,14,0.72)' }} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 40px rgba(99,102,241,0.35)'
              }}>
                <PlayCircle size={32} color="#fff" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>Panamedia Player</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                  Drag a video or audio file here to play<br />
                  or click <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Sync</strong> to browse your media library
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reactive Ambilight halo layer */}
        {!isAudioFile && !isIdle && !isMediaLocked && (
          <div
            style={{
              position: 'absolute',
              inset: '-20%',
              background: `radial-gradient(ellipse at center, ${ambilightColor} 0%, rgba(9, 9, 14, 0) 72%)`,
              filter: 'blur(70px)',
              pointerEvents: 'none',
              zIndex: 1,
              transition: 'background 0.5s ease-out',
            }}
          />
        )}

        {/* Always render the video element so videoRef is never null.
            For audio files we hide it via CSS — visibility toggled by videoStyle.display */}
        <video
          ref={videoRef}
          src={mediaUrl || undefined}
          preload={mediaUrl ? 'auto' : 'none'}
          autoPlay
          crossOrigin="anonymous"
          style={{
            ...videoStyle,
            filter: cssVideoFilter,
            position: 'relative',
            zIndex: 2,
            display: isMediaLocked ? 'none' : videoStyle.display,
          }}
          loop={repeatMode === 'one' && !mediaUrl.includes('/transcode')}
          onLoadStart={() => {
            setHasStartedRendering(false);
          }}
          onTimeUpdate={() => {
            handleTimeUpdate();
            if (videoRef.current && (videoRef.current.currentTime > 0 || videoRef.current.readyState >= 3)) {
              setHasStartedRendering(true);
              setIsBuffering(false);
              if (playbackError?.hasError) {
                onDismissError?.();
              }
            }
          }}
          onLoadedMetadata={() => {
            handleLoadedMetadata();
            if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.readyState >= 3) {
              setHasStartedRendering(true);
              setIsBuffering(false);
            }
          }}
          onLoadedData={() => {
            if (videoRef.current && (videoRef.current.videoWidth > 0 || isAudioFile)) {
              setIsBuffering(false);
              setHasStartedRendering(true);
              if (playbackError?.hasError && videoRef.current && videoRef.current.readyState >= 2) {
                onDismissError?.();
              }
            }
          }}
          onCanPlay={() => {
            if (videoRef.current && (videoRef.current.videoWidth > 0 || isAudioFile)) {
              setIsBuffering(false);
              setHasStartedRendering(true);
              if (playbackError?.hasError) {
                onDismissError?.();
              }
            }
          }}
          onEnded={handleVideoEnded}
          onSeeked={() => {
            onSeeked?.();
            setIsBuffering(false);
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setHasStartedRendering(true);
            if (playbackError?.hasError) {
              onDismissError?.();
            }
          }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onPlay={() => {
            setPlaying(true);
            setIsBuffering(false);
            if (playbackError?.hasError) {
              onDismissError?.();
            }
            initAudio();
            if ((window as any).__panaAudioContext && (window as any).__panaAudioContext.state === 'suspended') {
              (window as any).__panaAudioContext.resume();
            }
            if (videoRef.current) {
              videoRef.current.playbackRate = speed;
            }
          }}
          onPause={() => setPlaying(false)}
          onError={() => {
            const err = videoRef.current?.error;
            // 1. Ignore MEDIA_ERR_ABORTED (code 1) when switching files/streams
            if (err && err.code === 1) {
              return;
            }
            // 2. Ignore error if media has already begun playback
            if (videoRef.current && (videoRef.current.currentTime > 0.3 || videoRef.current.readyState >= 3) && !videoRef.current.paused) {
              return;
            }
            setIsBuffering(false);
            onMediaError?.();
          }}
          onStalled={() => {
            // For transcode streams, stalled means FFmpeg hasn't sent data yet
          }}
        />

        {/* Initial loading card overlay before video starts playing (video files only) */}
        {!hasStartedRendering && !isIdle && !isAudioFile && !isMediaLocked && !playbackError?.hasError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(7, 7, 12, 0.65)',
            backdropFilter: 'blur(8px)',
            zIndex: 6,
            pointerEvents: 'none'
          }}>
            <div style={{
              background: 'rgba(15, 15, 27, 0.65)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '24px',
              padding: '36px 48px',
              boxShadow: '0 30px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              maxWidth: '80%',
              textAlign: 'center'
            }}>
              <div style={{ position: 'relative', width: '64px', height: '64px' }}>
                {/* Outer spinning gradient ring */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  border: '3px solid rgba(255,255,255,0.03)',
                  borderTop: '3px solid #6366f1',
                  borderRight: '3px solid #a855f7',
                  borderRadius: '50%',
                  animation: 'spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                  filter: 'drop-shadow(0 0 12px rgba(168, 85, 247, 0.45))'
                }} />
                {/* Inner pulsing glow circle */}
                <div style={{
                  position: 'absolute',
                  inset: '4px',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
                  borderRadius: '50%',
                  animation: 'pulse 2s ease-in-out infinite',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}>
                  <img 
                    src="player.ico" 
                    style={{ 
                      width: '75%', 
                      height: '75%', 
                      objectFit: 'contain',
                      opacity: 0.85
                    }} 
                    alt="" 
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  />
                </div>
              </div>
              <div>
                <div style={{
                  fontFamily: "'Outfit', 'Inter', sans-serif",
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#ffffff',
                  lineHeight: 1.4,
                  maxWidth: '380px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}>
                  {currentTitle}
                </div>
                <div style={{
                  fontFamily: "'Outfit', 'Inter', sans-serif",
                  fontSize: '10px',
                  fontWeight: '700',
                  color: '#a855f7',
                  textTransform: 'uppercase',
                  letterSpacing: '2.5px',
                  marginTop: '8px',
                  opacity: 0.85,
                  animation: 'pulse 1.5s ease-in-out infinite'
                }}>
                  Loading Media...
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Playback Error Overlay — shown when media fails to play instead of a blank screen */}
        {playbackError?.hasError && !isIdle && !(videoRef.current && videoRef.current.currentTime > 0.4 && !videoRef.current.paused) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(7, 7, 12, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 8,
          }}>
            <div style={{
              position: 'relative',
              background: 'linear-gradient(135deg, rgba(24, 18, 32, 0.88) 0%, rgba(15, 15, 27, 0.94) 100%)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              borderRadius: '24px',
              padding: '36px 44px',
              boxShadow: '0 30px 70px rgba(0,0,0,0.65), 0 0 35px rgba(244, 63, 94, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
              maxWidth: '460px',
              width: '90%',
              textAlign: 'center',
              animation: 'fadeIn 0.3s ease-out'
            }}>
              {/* Close / Dismiss Button */}
              {onDismissError && (
                <button
                  onClick={onDismissError}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(244, 63, 94, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.4)';
                    e.currentTarget.style.color = '#f43f5e';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                  }}
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
              )}
              {/* Glowing Error Badge */}
              <div style={{
                position: 'relative',
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.2) 0%, rgba(225, 29, 72, 0.1) 100%)',
                border: '1.5px solid rgba(244, 63, 94, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 25px rgba(244, 63, 94, 0.35)',
              }}>
                <AlertCircle size={32} color="#f43f5e" />
              </div>

              {/* Title & Info */}
              <div>
                <div style={{
                  fontFamily: "'Outfit', 'Inter', sans-serif",
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#ffffff',
                  marginBottom: '8px',
                  letterSpacing: '-0.3px',
                }}>
                  Unable to Play Media
                </div>
                <div style={{
                  fontFamily: "'Outfit', 'Inter', sans-serif",
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#e2e8f0',
                  marginBottom: '10px',
                  maxWidth: '380px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {currentTitle}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.55)',
                  lineHeight: 1.5,
                  maxWidth: '380px',
                }}>
                  {playbackError.message || 'This media file could not be decoded. The file may be corrupted, missing, or in an unsupported format.'}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: '6px',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}>
                {onRetryPlayback && (
                  <button
                    onClick={onRetryPlayback}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 18px',
                      background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    <RefreshCw size={15} />
                    Retry
                  </button>
                )}

                {onNextTrack && (
                  <button
                    onClick={onNextTrack}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 18px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '12px',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <SkipForward size={15} />
                    Next Track
                  </button>
                )}

                {playbackError.filePath && onRemoveMissingMedia && (
                  <button
                    onClick={() => {
                      if (playbackError.filePath && onRemoveMissingMedia) {
                        onRemoveMissingMedia(playbackError.filePath);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      background: 'rgba(244, 63, 94, 0.15)',
                      border: '1px solid rgba(244, 63, 94, 0.35)',
                      borderRadius: '12px',
                      color: '#fb7185',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(244, 63, 94, 0.25)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    title="Remove this missing media from playlist and skip to next track"
                  >
                    <Trash2 size={15} />
                    Delete from Playlist
                  </button>
                )}

                {playbackError.filePath && (
                  <button
                    onClick={() => {
                      if (electron && playbackError.filePath) {
                        electron.ipcRenderer.invoke('show-item-in-folder', playbackError.filePath);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    title="Show in file explorer"
                  >
                    <FolderOpen size={14} />
                    Locate
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mid-stream subtle buffering spinner with transparent player icon (video only — audio has its own spinner in the album art box) */}
        {hasStartedRendering && isBuffering && !isIdle && !isAudioFile && !playbackError?.hasError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 6,
            pointerEvents: 'none'
          }}>
            <div style={{
              position: 'relative',
              width: '56px',
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'rgba(15, 15, 27, 0.7)',
                backdropFilter: 'blur(8px)',
                border: '2px solid rgba(255, 255, 255, 0.08)',
                borderTopColor: '#a855f7',
                borderRightColor: '#6366f1',
                animation: 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
              }} />
              <img
                src="player.ico"
                alt=""
                style={{
                  width: '26px',
                  height: '26px',
                  objectFit: 'contain',
                  opacity: 0.8,
                  position: 'relative',
                  zIndex: 2
                }}
                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
              />
            </div>
          </div>
        )}

        {isAudioFile && !isMediaLocked && (
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              backgroundImage: `linear-gradient(rgba(9, 9, 14, 0.8), rgba(9, 9, 14, 0.8)), url(${playerBg})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center center',
              backgroundSize: 'cover',
              overflow: 'hidden'
            }}
          >
            {hasValidThumbnail && thumbLoaded && (
              <img src={thumbnailToShow} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(50px) brightness(0.2) saturate(1.5)', opacity: 0.4 }} alt="background" />
            )}

            {/* Frequency visualizer canvas — sits at the bottom of the audio screen */}
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '42%',
                display: 'block',
                zIndex: 3,
                pointerEvents: 'none',
              }}
            />

            <div style={{
              position: 'relative',
              zIndex: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ position: 'relative', width: '240px', height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  position: 'absolute',
                  inset: '-8px',
                  borderRadius: '16px',
                  border: '1px solid rgba(99,102,241,0.3)',
                  boxShadow: '0 0 30px rgba(99,102,241,0.2)',
                }} />
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  style={{
                    width: '240px',
                    height: '240px',
                    borderRadius: '12px',
                    border: '2px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
                    overflow: 'hidden',
                    background: '#12121a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    opacity: (hasValidThumbnail && thumbLoaded) ? 0.95 : 0.85
                  }}
                >
                    {/* Base Player Icon: shown in the box background instead of black */}
                    {(!hasValidThumbnail || !thumbLoaded) && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'radial-gradient(circle at center, rgba(30, 27, 55, 0.7) 0%, rgba(12, 12, 20, 0.95) 100%)',
                        zIndex: 1
                      }}>
                        <img
                          src="player.ico"
                          style={{
                            width: '110px',
                            height: '110px',
                            objectFit: 'contain',
                            opacity: 0.85,
                            filter: 'drop-shadow(0 0 20px rgba(99, 102, 241, 0.35))'
                          }}
                          alt="Panamedia"
                        />
                      </div>
                    )}

                    {/* Thumbnail image: smoothly fades in on top when fully loaded */}
                    {hasValidThumbnail && (
                      <img
                        src={thumbnailToShow}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          zIndex: 2,
                          opacity: thumbLoaded ? 1 : 0,
                          transition: 'opacity 0.35s ease-in-out'
                        }}
                        alt="cover"
                        onLoad={() => setThumbLoaded(true)}
                        onError={(e) => {
                          const src = (e.currentTarget as HTMLImageElement).src;
                          setImgErrors(prev => ({ ...prev, [src]: true }));
                          setThumbLoaded(false);
                        }}
                      />
                    )}

                    {/* Loading / Buffering Spinner Overlay: clean spinner with player icon, no center text */}
                    {(isBuffering || !hasStartedRendering) && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(9, 9, 16, 0.45)',
                        backdropFilter: 'blur(5px)',
                        WebkitBackdropFilter: 'blur(5px)',
                        borderRadius: '12px'
                      }}>
                        <div style={{
                          position: 'relative',
                          width: '56px',
                          height: '56px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {/* Spinning ring */}
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '50%',
                            border: '3px solid rgba(168, 85, 247, 0.25)',
                            borderTopColor: '#c084fc',
                            borderRightColor: '#818cf8',
                            animation: 'spin 0.8s linear infinite',
                            filter: 'drop-shadow(0 0 10px rgba(192, 132, 252, 0.6))'
                          }} />
                          {/* Player icon centered inside spinner */}
                          <img
                            src="player.ico"
                            alt=""
                            style={{
                              width: '28px',
                              height: '28px',
                              objectFit: 'contain',
                              opacity: 0.9,
                              filter: 'drop-shadow(0 0 6px rgba(129, 140, 248, 0.6))'
                            }}
                            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                          />
                        </div>
                      </div>
                    )}
                </div>
              </div>
              <div style={{ textAlign: 'center', maxWidth: '280px', zIndex: 3 }}>
                <div 
                  style={{ 
                    fontSize: '11px', 
                    color: 'rgba(255,255,255,0.6)', 
                    letterSpacing: '0.5px', 
                    textOverflow: 'ellipsis', 
                    overflow: 'hidden', 
                    whiteSpace: 'nowrap',
                    fontWeight: '500'
                  }}
                  title={currentTitle}
                >
                  {currentTitle} playing..
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Locked Media Screen: transparent blurry playerbg + spinner loading dialog popup with app colors */}
        {isMediaLocked && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              zIndex: 70,
              padding: '24px',
            }}
          >
            {/* Blurry playerbg background image */}
            <div
              style={{
                position: 'absolute',
                inset: -24,
                backgroundImage: `url(${playerBg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(20px) brightness(0.65)',
                transform: 'scale(1.1)',
              }}
            />

            {/* Subtle translucent dark glass tint */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at center, rgba(15, 15, 26, 0.4) 0%, rgba(8, 8, 14, 0.68) 100%)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            />

            {/* Centered Locked Dialog Popup Card with App Colors */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '400px',
                background: 'rgba(18, 18, 30, 0.82)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 45px rgba(99, 102, 241, 0.22)',
                borderRadius: '24px',
                padding: '32px 28px 28px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                animation: isShaking ? 'lockShake 0.4s ease-in-out' : 'panamediaMenuPop 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                color: '#fff',
                zIndex: 2,
              }}
            >
              {/* Spinner loading badge with glowing lock at center in App Colors */}
              <div
                style={{
                  position: 'relative',
                  width: '76px',
                  height: '76px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '18px',
                }}
              >
                {/* Rotating Spinner Ring in App Indigo/Purple */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    border: '3px solid rgba(99, 102, 241, 0.18)',
                    borderTop: '3px solid #818cf8',
                    borderRight: '3px solid #a855f7',
                    animation: 'spin 1.4s linear infinite',
                  }}
                />

                {/* Glowing Center Badge */}
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.32) 0%, rgba(168, 85, 247, 0.12) 100%)',
                    border: '1px solid rgba(99, 102, 241, 0.5)',
                    boxShadow: '0 0 25px rgba(99, 102, 241, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#c084fc',
                  }}
                >
                  {!archivePin ? <ShieldCheck size={26} /> : <Lock size={26} />}
                </div>
              </div>

              {/* Title */}
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.2px', color: '#fff' }}>
                {!archivePin ? 'Set Archive Security PIN' : 'Secured Media Locked'}
              </h3>

              {currentTitle && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    maxWidth: '88%',
                    padding: '5px 14px',
                    background: 'rgba(99, 102, 241, 0.12)',
                    borderRadius: '20px',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    fontSize: '11px',
                    color: 'rgba(255, 255, 255, 0.9)',
                    marginBottom: '12px',
                  }}
                >
                  {isAudioFile ? <Music size={12} color="#a5b4fc" /> : <Film size={12} color="#a5b4fc" />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentTitle}
                  </span>
                </div>
              )}

              <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: '0 0 20px', lineHeight: 1.5, maxWidth: '290px' }}>
                {isArchiveTabActive
                  ? 'Enter your security PIN in the Archive playlist panel on the right to continue playing.'
                  : !archivePin
                  ? 'Set a 4-digit PIN to securely protect this media and begin playback.'
                  : 'Enter your 4-digit security PIN to continue playing.'}
              </p>

              {/* When Archive tab is active on the right, only show spinner with text info; PIN is entered in right panel */}
              {isArchiveTabActive ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    background: 'rgba(99, 102, 241, 0.14)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: '12px',
                    color: '#c084fc',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  <KeyRound size={14} />
                  <span>Enter PIN in Archive panel &rarr;</span>
                </div>
              ) : (
                /* Otherwise, when Archive tab is not active, PIN input and Continue Playing button appear directly here */
                <form onSubmit={handleLockedPinSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <KeyRound size={15} style={{ position: 'absolute', left: '14px', color: 'rgba(255, 255, 255, 0.45)', pointerEvents: 'none' }} />
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={8}
                      placeholder={!archivePin ? 'Choose 4-digit PIN' : 'Enter Security PIN'}
                      value={screenPinInput}
                      onChange={(e) => {
                        setScreenPinInput(e.target.value.replace(/\D/g, ''));
                        setScreenPinError('');
                      }}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '11px 42px 11px 38px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1.5px solid ' + (screenPinError ? '#ef4444' : 'rgba(99, 102, 241, 0.35)'),
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '15px',
                        fontWeight: 600,
                        letterSpacing: showPin ? '4px' : '6px',
                        textAlign: 'center',
                        outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        boxShadow: screenPinError ? '0 0 12px rgba(239, 68, 68, 0.3)' : 'inset 0 2px 4px rgba(0,0,0,0.3)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(prev => !prev)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        color: showPin ? '#c084fc' : 'rgba(255, 255, 255, 0.4)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px',
                      }}
                      title={showPin ? 'Hide PIN' : 'Show PIN'}
                    >
                      {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {!archivePin && (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                      <KeyRound size={15} style={{ position: 'absolute', left: '14px', color: 'rgba(255, 255, 255, 0.45)', pointerEvents: 'none' }} />
                      <input
                        type={showConfirmPin ? 'text' : 'password'}
                        maxLength={8}
                        placeholder="Confirm PIN"
                        value={screenConfirmPinInput}
                        onChange={(e) => {
                          setScreenConfirmPinInput(e.target.value.replace(/\D/g, ''));
                          setScreenPinError('');
                        }}
                        style={{
                          width: '100%',
                          padding: '11px 42px 11px 38px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1.5px solid ' + (screenPinError ? '#ef4444' : 'rgba(99, 102, 241, 0.35)'),
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '15px',
                          fontWeight: 600,
                          letterSpacing: showConfirmPin ? '4px' : '6px',
                          textAlign: 'center',
                          outline: 'none',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPin(prev => !prev)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          background: 'none',
                          border: 'none',
                          color: showConfirmPin ? '#c084fc' : 'rgba(255, 255, 255, 0.4)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px',
                        }}
                      >
                        {showConfirmPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  )}

                  {screenPinError && (
                    <div style={{ fontSize: '12px', color: '#f87171', fontWeight: 500, margin: '2px 0' }}>
                      {screenPinError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                    {onCancelLock && (
                      <button
                        type="button"
                        onClick={onCancelLock}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '12px',
                          color: 'rgba(255, 255, 255, 0.75)',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.75)';
                        }}
                      >
                        Dismiss
                      </button>
                    )}

                    <button
                      type="submit"
                      style={{
                        flex: 2,
                        padding: '12px 18px',
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 700,
                        letterSpacing: '0.3px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 18px rgba(99, 102, 241, 0.4)',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 22px rgba(168, 85, 247, 0.55)';
                        e.currentTarget.style.filter = 'brightness(1.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 4px 18px rgba(99, 102, 241, 0.4)';
                        e.currentTarget.style.filter = 'none';
                      }}
                    >
                      <PlayCircle size={16} fill="rgba(255, 255, 255, 0.25)" color="#fff" />
                      <span>Continue Playing</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
