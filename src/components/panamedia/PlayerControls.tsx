import React, { useState, useRef, useEffect } from 'react';
import {
  Pause, Play, SkipForward, SkipBack, Volume2, VolumeX,
  Maximize2, Minimize2, Repeat, Settings, Inbox, List, Sliders, Sun, Moon,
  MoreHorizontal
} from 'lucide-react';
import { formatTime, type VideoFilters, DEFAULT_VIDEO_FILTERS } from './types';

interface PlayerControlsProps {
  isFullscreen: boolean;
  controlsVisible: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  speed: number;
  aspectRatio: 'fit' | 'fill' | 'contain' | '16-9' | '4-3';
  repeatMode: 'off' | 'one' | 'folder' | 'all';
  forceTranscode: boolean;
  playbackQuality: 'original' | '1080p' | '720p';
  showSettingsPopover: boolean;
  showPlaylist: boolean;
  sidebarTab: string;
  sendTrayItems: string[];
  currentPath: string;
  streamingPort: number;
  videoFilters: VideoFilters;
  setVideoFilters: React.Dispatch<React.SetStateAction<VideoFilters>>;
  setShowSettingsPopover: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPlaylist: React.Dispatch<React.SetStateAction<boolean>>;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  setAspectRatio: React.Dispatch<React.SetStateAction<'fit' | 'fill' | 'contain' | '16-9' | '4-3'>>;
  setForceTranscode: React.Dispatch<React.SetStateAction<boolean>>;
  setPlaybackQuality: (val: 'original' | '1080p' | '720p') => void;
  setRepeatMode: React.Dispatch<React.SetStateAction<'off' | 'one' | 'folder' | 'all'>>;
  setSidebarTab: React.Dispatch<React.SetStateAction<'videos' | 'audios' | 'primary' | 'effects' | 'sendtray'>>;
  invertScroll: boolean;
  setInvertScroll: (val: boolean) => void;
  togglePlay: () => void;
  handlePrev: () => void;
  handleNext: () => void;
  handleStop: () => void;
  handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  adjustVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isAudioFile?: boolean;
  thumbnailToShow?: string | null;
  isMediaLocked?: boolean;
}

export function PlayerControls({
  isFullscreen,
  controlsVisible,
  playing,
  currentTime,
  duration,
  volume,
  speed,
  aspectRatio,
  repeatMode,
  forceTranscode,
  playbackQuality,
  showSettingsPopover,
  showPlaylist,
  sidebarTab,
  sendTrayItems,
  currentPath,
  streamingPort,
  thumbnailToShow,
  videoFilters,
  setVideoFilters,
  setShowSettingsPopover,
  setShowPlaylist,
  setSpeed,
  setAspectRatio,
  setForceTranscode,
  setPlaybackQuality,
  setRepeatMode,
  setSidebarTab,
  invertScroll,
  setInvertScroll,
  togglePlay,
  handlePrev,
  handleNext,
  handleStop,
  handleSeek,
  adjustVolume,
  toggleMute,
  toggleFullscreen,
  onMouseEnter,
  onMouseLeave,
  isAudioFile,
  isMediaLocked = false,
}: PlayerControlsProps) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sliderRef = useRef<HTMLInputElement | null>(null);
  const [dynamicThumbnailUrl, setDynamicThumbnailUrl] = useState<string | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const [audioThumbFailed, setAudioThumbFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [showMoreTools, setShowMoreTools] = useState<boolean>(false);
  const moreToolsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Close more tools dropdown if user clicks outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreToolsRef.current && !moreToolsRef.current.contains(e.target as Node)) {
        setShowMoreTools(false);
      }
    };
    if (showMoreTools) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreTools]);

  useEffect(() => {
    setAudioThumbFailed(false);
    setDynamicThumbnailUrl(null);
    previewCacheRef.current.clear();
  }, [currentPath]);

  useEffect(() => {
    if (isMediaLocked) {
      setHoverTime(null);
      setHoverPos(null);
      setDynamicThumbnailUrl(null);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    }
  }, [isMediaLocked]);

  const effectiveIsAudio = isAudioFile || (currentPath ? ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].some(ext => currentPath.toLowerCase().endsWith(ext)) : false);
  const showSendtray = containerWidth >= 780;
  const showStop = containerWidth >= 680;
  const showRepeat = containerWidth >= 620;
  const showSettings = containerWidth >= 540;
  const hasOverflowTools = !showSendtray || !showRepeat || !showStop || !showSettings;

  const volumeSliderWidth = containerWidth < 440 ? 36 : containerWidth < 560 ? 48 : containerWidth < 720 ? 62 : 80;
  const controlGap = containerWidth < 500 ? '4px' : containerWidth < 680 ? '6px' : '10px';
  const rightControlGap = containerWidth < 520 ? '5px' : containerWidth < 700 ? '8px' : '12px';

  const handleSliderMouseMove = (e: React.MouseEvent<HTMLInputElement>) => {
    if (isMediaLocked || !sliderRef.current || duration <= 0) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const rawTime = ratio * duration;
    setHoverTime(rawTime);
    setHoverPos({ x: e.clientX - rect.left });

    const rounded = Math.max(0, Math.floor(rawTime));

    // Fetch realtime /preview frame via ffmpeg with client-side memory cache
    if (!effectiveIsAudio && currentPath) {
      const cacheKey = `${currentPath}:${rounded}`;
      if (previewCacheRef.current.has(cacheKey)) {
        setDynamicThumbnailUrl(previewCacheRef.current.get(cacheKey)!);
      } else {
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(() => {
          const img = new Image();
          let active = true;
          img.onload = () => {
            if (!active) return;
            previewCacheRef.current.set(cacheKey, img.src);
            setDynamicThumbnailUrl(img.src);
          };
          img.onerror = () => {
            if (streamingPort !== 52321) {
              const fallbackImg = new Image();
              fallbackImg.onload = () => {
                if (!active) return;
                previewCacheRef.current.set(cacheKey, fallbackImg.src);
                setDynamicThumbnailUrl(fallbackImg.src);
              };
              fallbackImg.onerror = () => { active = false; };
              fallbackImg.src = `http://localhost:52321/preview?path=${encodeURIComponent(currentPath)}&time=${rounded}`;
            } else {
              active = false;
            }
          };
          img.src = `http://localhost:${streamingPort}/preview?path=${encodeURIComponent(currentPath)}&time=${rounded}`;
        }, 80);
      }
    }
  };
  return (
    <div
      ref={containerRef}
      className="glass-panel"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        margin: isFullscreen ? (containerWidth < 500 ? '8px' : '16px') : (containerWidth < 500 ? '4px' : '8px'),
        padding: containerWidth < 480 ? '8px 10px' : containerWidth < 680 ? '10px 12px' : '12px 16px',
        background: 'rgba(15,15,22,0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        flexShrink: 0,
        ...(isFullscreen ? {
          position: 'absolute' as const,
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 3000,
          transform: controlsVisible ? 'translateY(0)' : 'translateY(calc(100% + 20px))',
          opacity: controlsVisible ? 1 : 0,
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
          pointerEvents: controlsVisible ? 'auto' as const : 'none' as const,
        } : {
          position: 'relative' as const,
          opacity: 1,
          pointerEvents: 'auto' as const,
          zIndex: 3000,
        })
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Seek bar with Hover Preview Card */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{formatTime(currentTime)}</span>
        
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          {/* Floating Hover Video / Audio Thumbnail Preview Card */}
          {!isMediaLocked && hoverTime !== null && hoverPos !== null && currentPath && duration > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 14px)',
                left: `${Math.max(effectiveIsAudio ? 50 : 75, Math.min(hoverPos.x, (sliderRef.current?.offsetWidth || 300) - (effectiveIsAudio ? 50 : 75)))}px`,
                transform: 'translateX(-50%)',
                background: 'rgba(12, 12, 22, 0.96)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: '8px',
                padding: '5px',
                boxShadow: '0 14px 35px rgba(0, 0, 0, 0.85)',
                pointerEvents: 'none',
                zIndex: 4000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <div style={{
                width: effectiveIsAudio ? '90px' : '160px',
                height: effectiveIsAudio ? '90px' : '90px',
                borderRadius: '6px',
                overflow: 'hidden',
                background: '#07070b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                {!effectiveIsAudio ? (
                  <>
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'radial-gradient(ellipse at center, rgba(30, 30, 45, 0.9) 0%, rgba(10, 10, 16, 0.95) 100%)'
                    }} />
                    {dynamicThumbnailUrl ? (
                      <img
                        src={dynamicThumbnailUrl}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          zIndex: 1
                        }}
                        alt=""
                      />
                    ) : (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(15, 15, 25, 0.85)',
                        zIndex: 1
                      }}>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#a5b4fc', fontWeight: 'bold' }}>
                          {formatTime(hoverTime)}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  audioThumbFailed ? (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))'
                    }}>
                      <img
                        src="player.ico"
                        alt=""
                        style={{ width: '40px', height: '40px', objectFit: 'contain', opacity: 0.85 }}
                      />
                    </div>
                  ) : (
                    <>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(ellipse at center, rgba(30, 30, 45, 0.9) 0%, rgba(10, 10, 16, 0.95) 100%)'
                      }} />
                      <img
                        src={thumbnailToShow || `http://localhost:${streamingPort}/thumbnail?path=${encodeURIComponent(currentPath)}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          position: 'relative',
                          zIndex: 1,
                          display: 'block'
                        }}
                        alt=""
                        onLoad={() => setAudioThumbFailed(false)}
                        onError={() => setAudioThumbFailed(true)}
                      />
                    </>
                  )
                )}
              </div>

              <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#a5b4fc', letterSpacing: '0.5px' }}>
                {formatTime(hoverTime)}
              </span>
            </div>
          )}

          <input
            ref={sliderRef}
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={isMediaLocked ? undefined : handleSeek}
            onMouseMove={isMediaLocked ? undefined : handleSliderMouseMove}
            onMouseLeave={() => {
              setHoverTime(null);
              setHoverPos(null);
              if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
            }}
            disabled={isMediaLocked}
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '2px',
              background: 'rgba(255,255,255,0.1)',
              accentColor: 'var(--primary)',
              cursor: isMediaLocked ? 'not-allowed' : 'pointer',
              opacity: isMediaLocked ? 0.35 : 1
            }}
          />
        </div>

        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{formatTime(duration)}</span>
      </div>

      {/* Transport controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', minWidth: 0, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: controlGap, minWidth: 0, flexShrink: 0 }}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { (e.currentTarget as HTMLElement).blur(); handlePrev(); }}
            className="btn-secondary"
            style={{ padding: containerWidth < 500 ? '5px' : '6px', borderRadius: '50%' }}
            title="Previous File"
          >
            <SkipBack size={containerWidth < 500 ? 12 : 14} />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              (e.currentTarget as HTMLElement).blur();
              if (isMediaLocked) return;
              togglePlay();
            }}
            className="btn-primary"
            style={{
              padding: containerWidth < 500 ? '6px' : '8px',
              borderRadius: '50%',
              background: isMediaLocked
                ? 'rgba(255, 255, 255, 0.12)'
                : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              cursor: isMediaLocked ? 'not-allowed' : 'pointer',
              opacity: isMediaLocked ? 0.55 : 1
            }}
            title={isMediaLocked ? 'Secured Media Locked (enter PIN to play)' : (playing ? 'Pause' : 'Play')}
          >
            {playing && !isMediaLocked ? <Pause size={containerWidth < 500 ? 14 : 16} /> : <Play size={containerWidth < 500 ? 14 : 16} />}
          </button>
          {showStop && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { (e.currentTarget as HTMLElement).blur(); handleStop(); }}
              className="btn-secondary"
              style={{ padding: containerWidth < 500 ? '5px' : '6px', borderRadius: '50%' }}
              title="Stop"
            >
              <div style={{ width: '11px', height: '11px', background: '#fff', borderRadius: '2px' }}></div>
            </button>
          )}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { (e.currentTarget as HTMLElement).blur(); handleNext(); }}
            className="btn-secondary"
            style={{ padding: containerWidth < 500 ? '5px' : '6px', borderRadius: '50%' }}
            title="Next File"
          >
            <SkipForward size={containerWidth < 500 ? 12 : 14} />
          </button>

          {showRepeat && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                (e.currentTarget as HTMLElement).blur();
                setRepeatMode(m => m === 'off' ? 'one' : m === 'one' ? 'folder' : m === 'folder' ? 'all' : 'off');
              }}
              className={`btn-secondary ${repeatMode !== 'off' ? 'active' : ''}`}
              style={{
                padding: containerWidth < 500 ? '5px' : '6px',
                borderRadius: '50%',
                position: 'relative',
                background: repeatMode !== 'off' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                borderColor: repeatMode !== 'off' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                color: repeatMode !== 'off' ? 'var(--primary)' : 'var(--text-muted)'
              }}
              title={repeatMode === 'off' ? 'Repeat: Off (click to enable Repeat One)' : repeatMode === 'one' ? 'Repeat One (click for Repeat Folder)' : repeatMode === 'folder' ? 'Repeat Folder (click for Repeat All Folders)' : 'Repeat All Folders (click to turn off)'}
            >
              <Repeat size={14} />
              {repeatMode !== 'off' && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  fontSize: '7px',
                  fontWeight: 'bold',
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '0px 3px',
                  lineHeight: '12px',
                  pointerEvents: 'none'
                }}>
                  {repeatMode === 'one' ? '1' : repeatMode === 'folder' ? 'F' : '∞'}
                </span>
              )}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: rightControlGap, minWidth: 0, flexShrink: 0 }}>
          {/* Settings popover - full view */}
          {showSettings && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSettingsPopover(!showSettingsPopover)}
                className={`btn-secondary ${showSettingsPopover ? 'active' : ''}`}
              style={{
                padding: '6px',
                borderRadius: '50%',
                background: showSettingsPopover ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                borderColor: showSettingsPopover ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Playback & Visual Settings"
            >
              <Settings size={14} />
            </button>

            {showSettingsPopover && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: '12px',
                  width: '240px',
                  maxHeight: '380px',
                  overflowY: 'auto',
                  padding: '14px',
                  background: 'rgba(7, 7, 14, 0.98)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  zIndex: 4000,
                  boxShadow: '0 16px 45px rgba(0,0,0,0.92)'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px', color: '#fff', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sliders size={13} color="#a855f7" /> Playback & Video Tuning
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Speed:</span>
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    style={{ background: '#09090e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="0.25" style={{ background: '#0f0f16', color: '#fff' }}>0.25x (Very Slow)</option>
                    <option value="0.5"  style={{ background: '#0f0f16', color: '#fff' }}>0.5x (Slow)</option>
                    <option value="0.75" style={{ background: '#0f0f16', color: '#fff' }}>0.75x</option>
                    <option value="1"    style={{ background: '#0f0f16', color: '#fff' }}>1.0x (Normal)</option>
                    <option value="1.25" style={{ background: '#0f0f16', color: '#fff' }}>1.25x</option>
                    <option value="1.5"  style={{ background: '#0f0f16', color: '#fff' }}>1.5x</option>
                    <option value="2"    style={{ background: '#0f0f16', color: '#fff' }}>2.0x (Fast)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Aspect Ratio:</span>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    style={{ background: '#09090e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="fit" style={{ background: '#0f0f16', color: '#fff' }}>Fit (Cover)</option>
                    <option value="contain" style={{ background: '#0f0f16', color: '#fff' }}>Show All (Contain)</option>
                    <option value="fill" style={{ background: '#0f0f16', color: '#fff' }}>Fill (Stretch)</option>
                    <option value="16-9" style={{ background: '#0f0f16', color: '#fff' }}>16:9</option>
                    <option value="4-3" style={{ background: '#0f0f16', color: '#fff' }}>4:3</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Max Quality:</span>
                  <select
                    value={playbackQuality}
                    onChange={(e) => setPlaybackQuality(e.target.value as any)}
                    style={{ background: '#09090e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="original" style={{ background: '#0f0f16', color: '#fff' }}>Original Quality</option>
                    <option value="1080p" style={{ background: '#0f0f16', color: '#fff' }}>1080p Maximum</option>
                    <option value="720p" style={{ background: '#0f0f16', color: '#fff' }}>720p (Low end PC)</option>
                  </select>
                </div>

                {/* Video Filters Section */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#a855f7', fontWeight: 'bold' }}>
                    Video Shaders
                  </div>

                  {/* Brightness */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Brightness</span>
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={videoFilters.brightness}
                      onChange={(e) => setVideoFilters(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                      style={{ width: '85px', height: '3px', accentColor: 'var(--primary)' }}
                    />
                    <span style={{ fontSize: '9px', fontFamily: 'monospace', width: '28px', textAlign: 'right' }}>{videoFilters.brightness}%</span>
                  </div>

                  {/* Contrast */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Contrast</span>
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={videoFilters.contrast}
                      onChange={(e) => setVideoFilters(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                      style={{ width: '85px', height: '3px', accentColor: 'var(--primary)' }}
                    />
                    <span style={{ fontSize: '9px', fontFamily: 'monospace', width: '28px', textAlign: 'right' }}>{videoFilters.contrast}%</span>
                  </div>

                  {/* Saturation */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Color Sat</span>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={videoFilters.saturate}
                      onChange={(e) => setVideoFilters(prev => ({ ...prev, saturate: parseInt(e.target.value) }))}
                      style={{ width: '85px', height: '3px', accentColor: 'var(--primary)' }}
                    />
                    <span style={{ fontSize: '9px', fontFamily: 'monospace', width: '28px', textAlign: 'right' }}>{videoFilters.saturate}%</span>
                  </div>

                  {/* Night Mode & Reset */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                    <button
                      onClick={() => setVideoFilters(prev => ({ ...prev, nightMode: !prev.nightMode }))}
                      className="btn-secondary"
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        borderRadius: '6px',
                        background: videoFilters.nightMode ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                        borderColor: videoFilters.nightMode ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                        color: videoFilters.nightMode ? '#fbbf24' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {videoFilters.nightMode ? <Moon size={11} /> : <Sun size={11} />} Night Mode
                    </button>
                    <button
                      onClick={() => setVideoFilters(DEFAULT_VIDEO_FILTERS)}
                      className="btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  <button
                    onClick={() => setForceTranscode(!forceTranscode)}
                    className="btn-secondary"
                    style={{
                      width: '100%',
                      padding: '6px',
                      fontSize: '10px',
                      background: forceTranscode ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                      borderColor: forceTranscode ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                      color: forceTranscode ? '#fbbf24' : 'var(--text-muted)',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    title="Force transcoding to fix unsupported format codec errors"
                  >
                    🛠️ {forceTranscode ? 'Transcoding Active' : 'Repair (Transcode)'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Invert Volume Scroll:</span>
                  <input
                    type="checkbox"
                    checked={invertScroll}
                    onChange={(e) => setInvertScroll(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
              </div>
            )}
          </div>
          )}

          {/* Volume control with horizontal triangle UI (turns red past 100%) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: containerWidth < 500 ? '3px' : '6px', minWidth: 0, flexShrink: 0 }}>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { (e.currentTarget as HTMLElement).blur(); toggleMute(); }}
              className="btn-secondary"
              style={{ border: 'none', padding: '3px' }}
              title={volume === 0 ? "Unmute" : "Mute"}
            >
              {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} color={volume > 100 ? '#ef4444' : undefined} />}
            </button>

            {/* Single unified horizontal triangle volume bar */}
            <div
              style={{
                position: 'relative',
                width: `${volumeSliderWidth}px`,
                height: '16px',
                clipPath: 'polygon(0% 85%, 100% 0%, 100% 100%, 0% 100%)',
                background: 'rgba(255, 255, 255, 0.12)',
                borderRadius: '2px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
              title={`Volume: ${volume}% (Max 200%)`}
            >
              {/* 100% Volume benchmark notch (at 50% width since max is 200%) */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  background: 'rgba(255, 255, 255, 0.45)',
                  zIndex: 2,
                  pointerEvents: 'none'
                }}
              />

              {/* Dynamic filled level (Smooth linear width directly matching volume percentage) */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${Math.min(100, (volume / 200) * 100)}%`,
                  background: volume > 100
                    ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)'
                    : 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                  backgroundSize: '200% 100%',
                  animation: volume > 100 ? 'volumeFlowRed 1.5s ease infinite' : (playing ? 'volumeFlowNormal 2s ease infinite' : 'none'),
                  boxShadow: volume > 100 ? '0 0 14px rgba(239, 68, 68, 0.9)' : '0 0 10px rgba(168, 85, 247, 0.6)',
                  transition: 'width 0.05s ease-out',
                  zIndex: 1,
                  pointerEvents: 'none'
                }}
              />

              {/* Native transparent range input over triangle for smooth scrubbing & full accessibility */}
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={volume}
                onChange={(e) => adjustVolume(parseInt(e.target.value))}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                  zIndex: 3,
                  margin: 0
                }}
              />
            </div>

            <span style={{
              fontSize: '9.5px',
              fontFamily: 'monospace',
              width: containerWidth < 500 ? '28px' : '34px',
              textAlign: 'right',
              fontWeight: volume > 100 ? 'bold' : 'normal',
              color: volume > 100 ? '#ef4444' : '#fff',
              textShadow: volume > 100 ? '0 0 8px rgba(239, 68, 68, 0.65)' : 'none',
              transition: 'color 0.15s ease'
            }}>
              {volume}%
            </span>
          </div>

          {/* Sendtray button - wide mode only */}
          {showSendtray && (
            <button
              onClick={() => {
                setSidebarTab('sendtray');
                setShowPlaylist(true);
              }}
              className={`btn-secondary ${sidebarTab === 'sendtray' && showPlaylist ? 'active' : ''}`}
              style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', position: 'relative', flexShrink: 0 }}
              title="Sendtray — files queued for sending"
            >
              <Inbox size={12} /> Sendtray
              {sendTrayItems.length > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', borderRadius: '50%',
                  width: '14px', height: '14px', fontSize: '9px', fontWeight: 'bold',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  boxShadow: '0 2px 6px rgba(99, 102, 241, 0.4)'
                }}>{sendTrayItems.length}</span>
              )}
            </button>
          )}

          {/* Fullscreen playlist toggle (only in fullscreen & wide) */}
          {isFullscreen && showSendtray && (
            <button
              onClick={() => setShowPlaylist(!showPlaylist)}
              className={`btn-secondary ${showPlaylist ? 'active' : ''}`}
              style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', flexShrink: 0 }}
            >
              <List size={12} /> Playlist
            </button>
          )}

          {/* More Tools Overflow Button (When tools are collapsed, renders icon cleanly) */}
          {hasOverflowTools && (
            <div ref={moreToolsRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setShowMoreTools(!showMoreTools)}
                className={`btn-secondary ${showMoreTools ? 'active' : ''}`}
                style={{
                  padding: '6px',
                  borderRadius: '50%',
                  background: showMoreTools ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.06)',
                  borderColor: showMoreTools ? 'var(--primary)' : 'rgba(255,255,255,0.12)',
                  color: showMoreTools ? '#a5b4fc' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                title="More Tools & Options"
              >
                <MoreHorizontal size={15} />
                {(repeatMode !== 'off' || sendTrayItems.length > 0 || forceTranscode) && (
                  <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#6366f1',
                    boxShadow: '0 0 6px #6366f1'
                  }} />
                )}
              </button>

              {showMoreTools && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    marginBottom: '12px',
                    width: '260px',
                    maxHeight: '420px',
                    overflowY: 'auto',
                    padding: '14px',
                    background: 'rgba(9, 9, 16, 0.98)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    zIndex: 4500,
                    boxShadow: '0 16px 45px rgba(0,0,0,0.95)'
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sliders size={13} color="#a855f7" /> Hidden Tools & Options
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Compact View</span>
                  </div>

                  {/* Playback Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={handleStop}
                      className="btn-secondary"
                      style={{ flex: 1, padding: '6px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      title="Stop Playback"
                    >
                      <div style={{ width: '10px', height: '10px', background: '#fff', borderRadius: '2px' }} /> Stop
                    </button>

                    <button
                      onClick={() => setRepeatMode(m => m === 'off' ? 'one' : m === 'one' ? 'folder' : m === 'folder' ? 'all' : 'off')}
                      className={`btn-secondary ${repeatMode !== 'off' ? 'active' : ''}`}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: repeatMode !== 'off' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        borderColor: repeatMode !== 'off' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                        color: repeatMode !== 'off' ? 'var(--primary)' : 'var(--text-muted)'
                      }}
                    >
                      <Repeat size={12} />
                      {repeatMode === 'off' ? 'Repeat: Off' : repeatMode === 'one' ? 'Repeat: 1' : repeatMode === 'folder' ? 'Repeat: Dir' : 'Repeat: All'}
                    </button>
                  </div>

                  {/* Sendtray & Playlist options */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setSidebarTab('sendtray');
                        setShowPlaylist(true);
                        setShowMoreTools(false);
                      }}
                      className={`btn-secondary ${sidebarTab === 'sendtray' && showPlaylist ? 'active' : ''}`}
                      style={{ flex: 1, padding: '6px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', position: 'relative' }}
                    >
                      <Inbox size={12} /> Sendtray
                      {sendTrayItems.length > 0 && (
                        <span style={{
                          background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', borderRadius: '50%',
                          width: '14px', height: '14px', fontSize: '9px', fontWeight: 'bold',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                          boxShadow: '0 2px 6px rgba(99, 102, 241, 0.4)'
                        }}>{sendTrayItems.length}</span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setShowPlaylist(!showPlaylist);
                        setShowMoreTools(false);
                      }}
                      className={`btn-secondary ${showPlaylist ? 'active' : ''}`}
                      style={{ flex: 1, padding: '6px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <List size={12} /> {showPlaylist ? 'Hide List' : 'Show List'}
                    </button>
                  </div>

                  {/* Settings section in More Tools */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Speed:</span>
                      <select
                        value={speed}
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        style={{ background: '#09090e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '3px 6px', fontSize: '11px', color: '#fff', outline: 'none' }}
                      >
                        <option value="0.5">0.5x</option>
                        <option value="1">1.0x (Normal)</option>
                        <option value="1.25">1.25x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2">2.0x</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Aspect Ratio:</span>
                      <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as any)}
                        style={{ background: '#09090e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '3px 6px', fontSize: '11px', color: '#fff', outline: 'none' }}
                      >
                        <option value="fit">Original (Fit)</option>
                        <option value="16-9">16:9 Widescreen</option>
                        <option value="4-3">4:3 Standard</option>
                        <option value="fill">Fill (Crop)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Max Quality:</span>
                      <select
                        value={playbackQuality}
                        onChange={(e) => setPlaybackQuality(e.target.value as any)}
                        style={{ background: '#09090e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '3px 6px', fontSize: '11px', color: '#fff', outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="original">Original Quality</option>
                        <option value="1080p">1080p Maximum</option>
                        <option value="720p">720p (Low end PC)</option>
                      </select>
                    </div>

                    {/* Night Mode & Reset */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                      <button
                        onClick={() => setVideoFilters(prev => ({ ...prev, nightMode: !prev.nightMode }))}
                        className="btn-secondary"
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          borderRadius: '6px',
                          background: videoFilters.nightMode ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                          borderColor: videoFilters.nightMode ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                          color: videoFilters.nightMode ? '#fbbf24' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {videoFilters.nightMode ? <Moon size={11} /> : <Sun size={11} />} Night Mode
                      </button>
                      <button
                        onClick={() => setVideoFilters(DEFAULT_VIDEO_FILTERS)}
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                      >
                        Reset
                      </button>
                    </div>

                    <button
                      onClick={() => setForceTranscode(!forceTranscode)}
                      className="btn-secondary"
                      style={{
                        width: '100%',
                        padding: '5px',
                        fontSize: '10px',
                        background: forceTranscode ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                        borderColor: forceTranscode ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                        color: forceTranscode ? '#fbbf24' : 'var(--text-muted)',
                        justifyContent: 'center'
                      }}
                    >
                      🛠️ {forceTranscode ? 'Transcoding Active' : 'Repair (Transcode)'}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Invert Volume Scroll:</span>
                      <input
                        type="checkbox"
                        checked={invertScroll}
                        onChange={(e) => setInvertScroll(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fullscreen toggle */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { (e.currentTarget as HTMLElement).blur(); toggleFullscreen(); }}
            className={`btn-secondary ${isFullscreen ? 'active' : ''}`}
            style={{ padding: '6px' }}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
