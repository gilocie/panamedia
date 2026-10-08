import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, PlayCircle, Volume2, Volume1, VolumeX,
  SkipBack, SkipForward, Sparkles 
} from 'lucide-react';
import playerBg from '../../assets/playerbg.jpg';
import { electron } from '../panamedia/types';
import { formatSeconds, isVideoFile } from './types';

interface AppPlayerState {
  filePath: string;
  filename: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  minimized: boolean;
}

interface PreviewMonitorProps {
  currentFile: string;
  trimRange?: { startSec: number; endSec: number; strategy: 'keep' | 'delete' };
  thumbnailPath?: string;
  playbackRequest?: { id: number; path: string; action: 'play' | 'pause' };
  streamingPort?: number;
  appPlayerState: AppPlayerState | null;
  onPlaybackStateChange?: (path: string, playing: boolean) => void;
  isMinimized?: boolean;
  hotkeysEnabled?: boolean;
}

export const PreviewMonitor: React.FC<PreviewMonitorProps> = ({
  currentFile,
  trimRange,
  thumbnailPath,
  playbackRequest,
  streamingPort = 52322,
  appPlayerState,
  onPlaybackStateChange,
  isMinimized,
  hotkeysEnabled = true
}) => {
  const isVideo = isVideoFile(currentFile);
  const hasCurrentFile = Boolean(currentFile);

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [activePort, setActivePort] = useState<number>(streamingPort || 52322);
  const [audioThumbnailFailed, setAudioThumbnailFailed] = useState(false);

  useEffect(() => {
    if (electron) {
      electron.ipcRenderer.invoke('get-streaming-port').then((p: number) => {
        if (p) setActivePort(p);
      }).catch(() => {});
    }
  }, [streamingPort]);

  const [isPlaying, setIsPlaying] = useState<boolean>(false); // PAUSED BY DEFAULT
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const lastPlayRequestRef = useRef(0);
  const keepsRange = trimRange?.strategy === 'keep';
  const trimStart = keepsRange ? Math.max(0, trimRange?.startSec || 0) : 0;
  const trimEnd = keepsRange && Number.isFinite(trimRange?.endSec)
    ? Math.max(trimStart, trimRange!.endSec)
    : 0;

  // Volume state brought from original player
  const [volume, setVolume] = useState<number>(() => {
    if (appPlayerState?.volume !== undefined && typeof appPlayerState.volume === 'number') {
      return appPlayerState.volume > 1 ? appPlayerState.volume / 100 : appPlayerState.volume;
    }
    try {
      const saved = localStorage.getItem('player_volume');
      if (saved !== null && !isNaN(Number(saved))) {
        const v = Number(saved);
        return v > 1 ? v / 100 : v;
      }
    } catch (e) {}
    return 1;
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState<boolean>(false);
  const hasInitializedTime = useRef<boolean>(false);
  const volumeContainerRef = useRef<HTMLDivElement | null>(null);
  const audioThumbnailUrl = `http://127.0.0.1:${activePort}/thumbnail?path=${encodeURIComponent(thumbnailPath || currentFile)}`;
  const volumePercent = isMuted ? 0 : Math.round(volume * 100);
  const volumeRingColor = volumePercent >= 100 ? '#a78bfa' : '#38bdf8';

  useEffect(() => {
    setAudioThumbnailFailed(false);
  }, [currentFile, thumbnailPath, activePort]);

  // Bring original volume from player when appPlayerState updates
  useEffect(() => {
    if (appPlayerState?.volume !== undefined && typeof appPlayerState.volume === 'number') {
      const normVol = appPlayerState.volume > 1 ? appPlayerState.volume / 100 : appPlayerState.volume;
      setVolume(normVol);
      if (mediaRef.current) {
        mediaRef.current.volume = normVol;
      }
    }
  }, [appPlayerState?.volume]);

  // Reset playback and stay paused by default when selecting another file
  useEffect(() => {
    hasInitializedTime.current = false;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    if (mediaRef.current) {
      mediaRef.current.pause();
      mediaRef.current.currentTime = 0;
      mediaRef.current.volume = volume;
      mediaRef.current.muted = isMuted;
    }

    // Always ensure background player is paused when converter is active
    if (electron) {
      electron.ipcRenderer.send('player-remote-command', 'pause');
    }
  }, [currentFile]);

  // Applying Keep Range turns the selected queue item into a preview of the
  // exported clip straight away. The source remains untouched until Start,
  // but the monitor always begins at the in point and cannot run past out.
  useEffect(() => {
    if (!keepsRange || trimEnd <= trimStart) return;
    const media = mediaRef.current;
    if (!media) return;
    media.pause();
    media.currentTime = trimStart;
    setCurrentTime(trimStart);
    setIsPlaying(false);
    hasInitializedTime.current = true;
  }, [currentFile, keepsRange, trimStart, trimEnd]);

  useEffect(() => {
    if (!playbackRequest || playbackRequest.id === lastPlayRequestRef.current || playbackRequest.path !== currentFile) return;
    lastPlayRequestRef.current = playbackRequest.id;
    const media = mediaRef.current;
    if (!media) return;
    if (playbackRequest.action === 'pause') {
      media.pause();
      setIsPlaying(false);
      return;
    }
    if (electron) electron.ipcRenderer.send('player-remote-command', 'pause');
    media.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [currentFile, playbackRequest]);

  useEffect(() => {
    onPlaybackStateChange?.(currentFile, isPlaying);
  }, [currentFile, isPlaying, onPlaybackStateChange]);

  // Keep video element volume in sync
  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = volume;
      mediaRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Handle minimization: if preview video was playing, pause it and instruct the main player to continue playing media
  useEffect(() => {
    if (isMinimized) {
      const video = mediaRef.current;
      const wasVideoPlaying = isPlaying || (video && !video.paused);
      if (video && !video.paused) {
        video.pause();
      }
      setIsPlaying(false);

      if (wasVideoPlaying && electron && appPlayerState?.filePath === currentFile) {
        // If previewer was playing the same file as the player, seek main player to exact position
        if (video && video.currentTime > 0) {
          electron.ipcRenderer.send('player-remote-command', 'seek-to', video.currentTime);
        }
        electron.ipcRenderer.send('player-remote-command', 'play');
      }
    }
  }, [isMinimized, isPlaying, currentFile, appPlayerState]);

  // Sync initial playback position once when metadata loads or appPlayerState is available
  const handleLoadedMetadata = () => {
    const video = mediaRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    video.volume = volume;
    video.muted = isMuted;

    if (keepsRange && trimEnd > trimStart) {
      video.currentTime = trimStart;
      setCurrentTime(trimStart);
      hasInitializedTime.current = true;
    // If matching active player file, resume from where player left off, but paused
    } else if (!hasInitializedTime.current && appPlayerState && appPlayerState.filePath === currentFile && appPlayerState.currentTime > 0) {
      video.currentTime = appPlayerState.currentTime;
      setCurrentTime(appPlayerState.currentTime);
      hasInitializedTime.current = true;
    }
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      const media = mediaRef.current;
      if (keepsRange && trimEnd > trimStart && media.currentTime >= trimEnd) {
        media.currentTime = trimEnd;
        media.pause();
        setCurrentTime(trimEnd);
        setIsPlaying(false);
        return;
      }
      setCurrentTime(media.currentTime);
    }
  };

  // Play / Pause toggle
  const togglePlay = () => {
    const video = mediaRef.current;
    if (!video) return;

    if (video.paused) {
      // Always stop/pause background player when converter preview plays
      if (electron) {
        electron.ipcRenderer.send('player-remote-command', 'pause');
      }
      if (keepsRange && trimEnd > trimStart && (video.currentTime < trimStart || video.currentTime >= trimEnd)) {
        video.currentTime = trimStart;
        setCurrentTime(trimStart);
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    if (!hotkeysEnabled || !hasCurrentFile) return;
    const onPlaybackKey = (event: KeyboardEvent) => {
      // Space and Backspace operate the converter's selected preview, never
      // the background Panamedia player or the library's delete shortcut.
      if ((event.code !== 'Space' && event.code !== 'Backspace') || event.repeat) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      togglePlay();
    };
    window.addEventListener('keydown', onPlaybackKey, true);
    return () => window.removeEventListener('keydown', onPlaybackKey, true);
  }, [hotkeysEnabled, hasCurrentFile, togglePlay]);


  // Scrubber click seek
  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = mediaRef.current;
    const effectiveDuration = keepsRange && trimEnd > trimStart
      ? trimEnd - trimStart
      : duration || appPlayerState?.duration || 0;
    if (!effectiveDuration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = (keepsRange ? trimStart : 0) + ratio * effectiveDuration;

    if (video) {
      video.currentTime = targetSec;
      setCurrentTime(targetSec);
    }
  };

  const seekBy = (seconds: number) => {
    const media = mediaRef.current;
    const sourceDuration = duration || appPlayerState?.duration || 0;
    const lowerBound = keepsRange ? trimStart : 0;
    const upperBound = keepsRange && trimEnd > trimStart ? trimEnd : sourceDuration;
    const base = media?.currentTime ?? currentTime;
    const target = Math.max(lowerBound, Math.min(upperBound || Number.MAX_SAFE_INTEGER, base + seconds));
    if (media) media.currentTime = target;
    setCurrentTime(target);
  };

  // Mute toggle
  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = mediaRef.current;
    if (!video) return;

    if (isMuted) {
      const restoreVol = volume === 0 ? 0.8 : volume;
      video.muted = false;
      video.volume = restoreVol;
      setIsMuted(false);
      setVolume(restoreVol);
      try {
        localStorage.setItem('player_volume', String(Math.round(restoreVol * 100)));
      } catch (err) {}
      if (electron) {
        electron.ipcRenderer.send('player-remote-command', 'volume', Math.round(restoreVol * 100));
      }
    } else {
      video.muted = true;
      setIsMuted(true);
      if (electron) {
        electron.ipcRenderer.send('player-remote-command', 'volume', 0);
      }
    }
  };

  // Direct Volume Change
  const handleVolumeChange = (newValPercent: number) => {
    const video = mediaRef.current;
    const newVol = Math.max(0, Math.min(1, newValPercent / 100));
    setVolume(newVol);
    const muted = newVol === 0;
    setIsMuted(muted);
    if (video) {
      video.volume = newVol;
      video.muted = muted;
    }
    try {
      localStorage.setItem('player_volume', String(Math.round(newVol * 100)));
    } catch (err) {}
    if (electron) {
      electron.ipcRenderer.send('player-remote-command', 'volume', Math.round(newVol * 100));
    }
  };

  const adjustVolumeWithWheel = (event: React.WheelEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const current = isMuted ? 0 : Math.round(volume * 100);
    handleVolumeChange(Math.max(0, Math.min(100, current + (event.deltaY < 0 ? 5 : -5))));
  };

  const displayDuration = keepsRange && trimEnd > trimStart
    ? trimEnd - trimStart
    : duration || (appPlayerState && appPlayerState.filePath === currentFile ? appPlayerState.duration : 0);
  const sourceTime = currentTime || (appPlayerState && appPlayerState.filePath === currentFile && !hasInitializedTime.current ? appPlayerState.currentTime : 0);
  const displayTime = keepsRange ? Math.max(0, Math.min(displayDuration, sourceTime - trimStart)) : sourceTime;

  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      overscrollBehavior: 'contain'
    }} onWheel={adjustVolumeWithWheel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={12} style={{ color: '#06b6d4' }} />
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Preview Monitor
          </span>
        </div>

        <span style={{
          fontSize: '9.5px',
          fontWeight: 700,
          background: isPlaying ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 255, 255, 0.06)',
          border: isPlaying ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
          color: isPlaying ? '#86efac' : 'rgba(255, 255, 255, 0.5)',
          padding: '1px 6px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isPlaying ? '#4ade80' : 'rgba(255, 255, 255, 0.4)',
            boxShadow: isPlaying ? '0 0 8px #4ade80' : 'none'
          }} />
          {isPlaying ? 'Playing' : 'Paused'}
        </span>
      </div>

      {/* 1. Preview Display Frame */}
      <div style={{
        width: '100%',
        aspectRatio: '16/9',
        minHeight: '120px',
        backgroundImage: `linear-gradient(rgba(9, 9, 14, 0.72), rgba(9, 9, 14, 0.72)), url(${playerBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        borderRadius: '8px 8px 0 0',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderBottom: 'none',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {!hasCurrentFile ? (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundImage: `linear-gradient(rgba(7, 7, 10, 0.48), rgba(7, 7, 10, 0.48)), url(${playerBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}>
            <PlayCircle size={38} style={{ color: 'rgba(255,255,255,0.72)', filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.8))' }} />
          </div>
        ) : isVideo ? (
          <video
            ref={(element) => { mediaRef.current = element; }}
            src={`http://127.0.0.1:${activePort}/stream?path=${encodeURIComponent(currentFile)}`}
            crossOrigin="anonymous"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            muted={isMuted}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0 }}>
            <audio
              ref={(element) => { mediaRef.current = element; }}
              src={`http://127.0.0.1:${activePort}/stream?path=${encodeURIComponent(currentFile)}`}
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              muted={isMuted}
            />
            <div style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)'
            }}>
              <img
                src={audioThumbnailFailed ? playerBg : audioThumbnailUrl}
                alt=""
                onError={() => setAudioThumbnailFailed(true)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'brightness(0.42) saturate(1.1)'
                }}
              />
              <div
                className={isPlaying ? 'spinning' : 'spinning spinning-paused'}
                style={{
                  position: 'relative',
                  width: '88px',
                  height: '88px',
                  borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.12)',
                  background: audioThumbnailFailed
                    ? `url("/player.ico") center/cover no-repeat`
                    : `url("${audioThumbnailUrl}") center/cover no-repeat`,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.7), 0 0 16px rgba(168, 85, 247, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2
                }}
              >
                {!audioThumbnailFailed && (
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'rgba(9, 9, 14, 0.92)',
                    border: '2px solid rgba(255,255,255,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Sleek Compact Preview Controllers (Lower Small Green Box) */}
      <div style={{
        width: '100%',
        background: 'rgba(15, 16, 26, 0.85)',
        borderRadius: '0 0 8px 8px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Title & Duration Readout in One Line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '9.5px', color: 'rgba(255, 255, 255, 0.45)', fontFamily: 'monospace', flexShrink: 0 }}>
            {`${formatSeconds(displayTime)} / ${displayDuration > 0 ? formatSeconds(displayDuration) : '--:--'}`}
          </span>
        </div>

        {/* Progress Scrubber */}
        {displayDuration > 0 && (
          <div
            onClick={handleScrubberClick}
            style={{
              width: '100%',
              height: '3px',
              borderRadius: '2px',
              background: 'rgba(255, 255, 255, 0.12)',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <div style={{
              width: `${Math.min(100, (displayTime / displayDuration) * 100)}%`,
              height: '100%',
              borderRadius: '2px',
              background: 'linear-gradient(90deg, #06b6d4, #6366f1)'
            }} />
          </div>
        )}

        {/* 4-Button Compact Remote Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          paddingTop: '2px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Seek backward */}
          <button
            type="button"
            onClick={() => seekBy(-10)}
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'all 0.15s ease' }}
            title="Seek back 10 seconds"
          >
            <SkipBack size={13} />
          </button>

          {/* Play / Pause Toggle */}
          <button
            type="button"
            onClick={togglePlay}
            style={{
              background: isPlaying ? 'rgba(6, 182, 212, 0.3)' : 'rgba(99, 102, 241, 0.3)',
              border: isPlaying ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(99, 102, 241, 0.5)',
              borderRadius: '4px',
              height: '26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
              transition: 'all 0.15s ease'
            }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={13} fill="#fff" /> : <Play size={13} fill="#fff" />}
          </button>

          {/* Seek forward */}
          <button
            type="button"
            onClick={() => seekBy(10)}
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'all 0.15s ease' }}
            title="Seek forward 10 seconds"
          >
            <SkipForward size={13} />
          </button>

          {/* Circular volume progress, matching Cut / Trim. */}
          <div
            ref={volumeContainerRef}
            className="pw-volume-control"
            style={{ position: 'relative', width: '100%', height: '26px', display: 'grid', placeItems: 'center' }}
            onWheel={adjustVolumeWithWheel}
          >
            {showVolumeSlider && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: '0',
                  marginBottom: '6px',
                  background: 'rgba(15, 16, 26, 0.98)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.9), 0 0 16px rgba(6, 182, 212, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  zIndex: 80,
                  backdropFilter: 'blur(12px)',
                  animation: 'panamediaMenuPop 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                  whiteSpace: 'nowrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={(e) => toggleMute(e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isMuted ? '#f87171' : '#67e8f9',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? <VolumeX size={15} /> : volume < 0.5 ? <Volume1 size={15} /> : <Volume2 size={15} />}
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={isMuted ? 0 : Math.round(volume * 100)}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    style={{
                      width: '84px',
                      accentColor: '#06b6d4',
                      cursor: 'pointer'
                    }}
                  />

                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff', fontFamily: 'monospace', minWidth: '32px' }}>
                    {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              className="pw-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowVolumeSlider(prev => !prev);
              }}
              style={{
                width: '26px',
                height: '26px',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                overflow: 'visible',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: isMuted ? '#f87171' : '#fff',
                transition: 'all 0.15s ease'
              }}
              title={`Volume: ${isMuted ? '0% (Muted)' : `${Math.round(volume * 100)}%`} • Click or Hover to adjust • Scroll wheel to change`}
            >
              <span
                className="pw-volume-ring"
                style={{ '--volume-progress': `${volumePercent}%`, '--volume-ring-color': volumeRingColor } as React.CSSProperties}
                aria-hidden="true"
              >
                {isMuted || volume === 0 ? <VolumeX size={12} /> : volume < 0.5 ? <Volume1 size={12} /> : <Volume2 size={12} />}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
