import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Music, Volume2, Volume1, VolumeX,
  SkipBack, SkipForward, Sparkles 
} from 'lucide-react';
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
  streamingPort?: number;
  appPlayerState: AppPlayerState | null;
  onPrevFile: () => void;
  onNextFile: () => void;
  isMinimized?: boolean;
}

export const PreviewMonitor: React.FC<PreviewMonitorProps> = ({
  currentFile,
  streamingPort = 52321,
  appPlayerState,
  onPrevFile,
  onNextFile,
  isMinimized
}) => {
  const currentBaseName = currentFile.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || 'Media';
  const isVideo = isVideoFile(currentFile);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false); // PAUSED BY DEFAULT
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

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

  // Close volume popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (volumeContainerRef.current && !volumeContainerRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false);
      }
    };
    if (showVolumeSlider) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showVolumeSlider]);

  // Bring original volume from player when appPlayerState updates
  useEffect(() => {
    if (appPlayerState?.volume !== undefined && typeof appPlayerState.volume === 'number') {
      const normVol = appPlayerState.volume > 1 ? appPlayerState.volume / 100 : appPlayerState.volume;
      setVolume(normVol);
      if (videoRef.current) {
        videoRef.current.volume = normVol;
      }
    }
  }, [appPlayerState?.volume]);

  // Reset playback and stay paused by default when selecting another file
  useEffect(() => {
    hasInitializedTime.current = false;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }

    // Always ensure background player is paused when converter is active
    if (electron) {
      electron.ipcRenderer.send('player-remote-command', 'pause');
    }
  }, [currentFile]);

  // Keep video element volume in sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Handle minimization: if preview video was playing, pause it and instruct the main player to continue playing media
  useEffect(() => {
    if (isMinimized) {
      const video = videoRef.current;
      const wasVideoPlaying = isPlaying || (video && !video.paused);
      if (video && !video.paused) {
        video.pause();
      }
      setIsPlaying(false);

      if (wasVideoPlaying && electron) {
        // If previewer was playing the same file as the player, seek main player to exact position
        if (appPlayerState && appPlayerState.filePath === currentFile && video && video.currentTime > 0) {
          electron.ipcRenderer.send('player-remote-command', 'seek-to', video.currentTime);
        }
        electron.ipcRenderer.send('player-remote-command', 'play');
      }
    }
  }, [isMinimized, isPlaying, currentFile, appPlayerState]);

  // Sync initial playback position once when metadata loads or appPlayerState is available
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    video.volume = volume;
    video.muted = isMuted;

    // If matching active player file, resume from where player left off, but paused
    if (!hasInitializedTime.current && appPlayerState && appPlayerState.filePath === currentFile && appPlayerState.currentTime > 0) {
      video.currentTime = appPlayerState.currentTime;
      setCurrentTime(appPlayerState.currentTime);
      hasInitializedTime.current = true;
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Play / Pause toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      // Always stop/pause background player when converter preview plays
      if (electron) {
        electron.ipcRenderer.send('player-remote-command', 'pause');
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };


  // Scrubber click seek
  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const effectiveDuration = duration || appPlayerState?.duration || 0;
    if (!effectiveDuration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * effectiveDuration;

    if (video) {
      video.currentTime = targetSec;
      setCurrentTime(targetSec);
    }
  };

  // Mute toggle
  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
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
    const video = videoRef.current;
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

  const displayDuration = duration || (appPlayerState && appPlayerState.filePath === currentFile ? appPlayerState.duration : 0);
  const displayTime = currentTime || (appPlayerState && appPlayerState.filePath === currentFile && !hasInitializedTime.current ? appPlayerState.currentTime : 0);

  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
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

      {/* 1. Preview Display Frame (Upper Green Box) */}
      <div style={{
        width: '100%',
        height: '142px',
        background: '#07080f',
        borderRadius: '8px 8px 0 0',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderBottom: 'none',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {isVideo ? (
          <video
            ref={videoRef}
            src={`http://localhost:${streamingPort}/stream?path=${encodeURIComponent(currentFile)}`}
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
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: '#fff'
          }}>
            <audio
              ref={videoRef as any}
              src={`http://localhost:${streamingPort}/stream?path=${encodeURIComponent(currentFile)}`}
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              muted={isMuted}
            />
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, #3b0764 0%, #09090b 100%)',
              border: '2px solid rgba(236, 72, 153, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(236, 72, 153, 0.3)',
              animation: isPlaying ? 'spin 4s linear infinite' : 'none'
            }}>
              <Music size={18} style={{ color: '#f472b6' }} />
            </div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, maxWidth: '85%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentBaseName}
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
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1
          }} title={currentBaseName}>
            {currentBaseName}
          </span>

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
          {/* Previous Media in Queue */}
          <button
            type="button"
            onClick={onPrevFile}
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'all 0.15s ease' }}
            title="Previous Media in Queue"
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

          {/* Next Media in Queue */}
          <button
            type="button"
            onClick={onNextFile}
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'all 0.15s ease' }}
            title="Next Media in Queue"
          >
            <SkipForward size={13} />
          </button>

          {/* Interactive Speaker with Volume Adjustment Popover */}
          <div
            ref={volumeContainerRef}
            style={{ position: 'relative', width: '100%', height: '26px' }}
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
            onWheel={(e) => {
              e.stopPropagation();
              const delta = e.deltaY < 0 ? 5 : -5;
              const currentVal = isMuted ? 0 : Math.round(volume * 100);
              handleVolumeChange(Math.max(0, Math.min(100, currentVal + delta)));
            }}
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
              onClick={(e) => {
                e.stopPropagation();
                setShowVolumeSlider(prev => !prev);
              }}
              style={{
                width: '100%',
                height: '100%',
                background: showVolumeSlider ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.05)',
                border: showVolumeSlider ? '1px solid rgba(6, 182, 212, 0.4)' : 'none',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: isMuted ? '#f87171' : '#fff',
                transition: 'all 0.15s ease'
              }}
              title={`Volume: ${isMuted ? '0% (Muted)' : `${Math.round(volume * 100)}%`} • Click or Hover to adjust • Scroll wheel to change`}
            >
              {isMuted || volume === 0 ? <VolumeX size={12} /> : volume < 0.5 ? <Volume1 size={12} /> : <Volume2 size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
