import { useEffect, useRef } from 'react';
import { electron } from '../types';

interface UsePlayerShortcutsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoScreenRef: React.RefObject<HTMLDivElement | null>;
  volume: number;
  currentTime: number;
  seekTo: (time: number) => void;
  currentPath: string;
  sidebarTab: 'videos' | 'audios' | 'primary' | 'effects' | 'sendtray';
  repeatMode: 'off' | 'one' | 'folder' | 'all';
  flashDriveTarget: string | null;
  togglePlay: () => void;
  adjustVolume: (vol: number) => void;
  toggleMute: () => void;
  showVolumeHUD: (vol: number) => void;
  showMessageHUD: (msg: string) => void;
  showSkipHUD?: (amount: number, direction: 'forward' | 'backward') => void;
  toggleFullscreen: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  setRepeatMode: React.Dispatch<React.SetStateAction<'off' | 'one' | 'folder' | 'all'>>;
  setFlashDriveTarget: (path: string | null) => void;
  setSidebarTab: React.Dispatch<React.SetStateAction<'videos' | 'audios' | 'primary' | 'effects' | 'sendtray'>>;
  showPlaylist?: boolean;
  setShowPlaylist?: React.Dispatch<React.SetStateAction<boolean>>;
  invertScroll?: boolean;
  isMediaLocked?: boolean;
  wakeControls?: () => void;
}

interface ShortcutsCallbackState {
  togglePlay: () => void;
  handlePrev: () => void;
  handleNext: () => void;
  adjustVolume: (vol: number) => void;
  toggleMute: () => void;
  showVolumeHUD: (vol: number) => void;
  showMessageHUD: (msg: string) => void;
  showSkipHUD?: (amount: number, direction: 'forward' | 'backward') => void;
  toggleFullscreen: () => void;
  setRepeatMode: React.Dispatch<React.SetStateAction<'off' | 'one' | 'folder' | 'all'>>;
  setFlashDriveTarget: (path: string | null) => void;
  setSidebarTab: React.Dispatch<React.SetStateAction<'videos' | 'audios' | 'primary' | 'effects' | 'sendtray'>>;
  sidebarTab: 'videos' | 'audios' | 'primary' | 'effects' | 'sendtray';
  showPlaylist?: boolean;
  setShowPlaylist?: React.Dispatch<React.SetStateAction<boolean>>;
  volume: number;
  currentTime: number;
  seekTo: (time: number) => void;
  repeatMode: 'off' | 'one' | 'folder' | 'all';
  flashDriveTarget: string | null;
  currentPath: string;
  isMediaLocked?: boolean;
  wakeControls?: () => void;
}

export function usePlayerShortcuts({
  videoRef,
  videoScreenRef,
  volume,
  currentTime,
  seekTo,
  currentPath,
  sidebarTab,
  repeatMode,
  flashDriveTarget,
  togglePlay,
  adjustVolume,
  toggleMute,
  showVolumeHUD,
  showMessageHUD,
  showSkipHUD,
  toggleFullscreen,
  handleNext,
  handlePrev,
  setRepeatMode,
  setFlashDriveTarget,
  setSidebarTab,
  showPlaylist = true,
  setShowPlaylist,
  invertScroll,
  isMediaLocked = false,
  wakeControls,
}: UsePlayerShortcutsProps) {
  const activeSeekTargetRef = useRef<number | null>(null);
  const seekAccumulatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedSkipAmountRef = useRef<number>(0);
  const accumulatedDirectionRef = useRef<'forward' | 'backward' | null>(null);

  const callbackRef = useRef<ShortcutsCallbackState>({
    togglePlay,
    handlePrev,
    handleNext,
    adjustVolume,
    toggleMute,
    showVolumeHUD,
    showMessageHUD,
    showSkipHUD,
    toggleFullscreen,
    setRepeatMode,
    setFlashDriveTarget,
    setSidebarTab,
    sidebarTab,
    showPlaylist,
    setShowPlaylist,
    volume,
    currentTime,
    seekTo,
    repeatMode,
    flashDriveTarget,
    currentPath,
    isMediaLocked,
    wakeControls
  });

  useEffect(() => {
    callbackRef.current = {
      togglePlay,
      handlePrev,
      handleNext,
      adjustVolume,
      toggleMute,
      showVolumeHUD,
      showMessageHUD,
      showSkipHUD,
      toggleFullscreen,
      setRepeatMode,
      setFlashDriveTarget,
      setSidebarTab,
      sidebarTab,
      showPlaylist,
      setShowPlaylist,
      volume,
      currentTime,
      seekTo,
      repeatMode,
      flashDriveTarget,
      currentPath,
      isMediaLocked,
      wakeControls
    };
  });

  useEffect(() => {
    if (!electron) return;

    const handleRemoteCommand = (_event: any, command: string, arg?: any) => {
      if (callbackRef.current.isMediaLocked) return;
      const { togglePlay, handlePrev, handleNext, toggleMute, seekTo, currentTime } = callbackRef.current;
      const video = videoRef.current;
      if (command === 'toggle-play') {
        togglePlay();
      } else if (command === 'pause') {
        if (video && !video.paused) {
          togglePlay();
        }
      } else if (command === 'play') {
        if (video && video.paused) {
          togglePlay();
        }
      } else if (command === 'prev') {
        handlePrev();
      } else if (command === 'next') {
        handleNext();
      } else if (command === 'mute' || command === 'toggle-mute') {
        toggleMute();
      } else if ((command === 'volume' || command === 'set-volume') && typeof arg === 'number') {
        const { adjustVolume } = callbackRef.current;
        if (adjustVolume) adjustVolume(arg);
      } else if (command === 'seek' && typeof arg === 'number') {
        if (seekTo) seekTo(currentTime + arg);
        else if (video) video.currentTime = Math.max(0, video.currentTime + arg);
      } else if (command === 'seek-to' && typeof arg === 'number') {
        if (seekTo) seekTo(arg);
        else if (video) video.currentTime = Math.max(0, arg);
      }
    };

    const handlePlayPause = () => {
      callbackRef.current.togglePlay();
    };

    const handleMute = () => {
      callbackRef.current.toggleMute();
    };

    if (!electron) return;
    electron.ipcRenderer.on('player-remote-command', handleRemoteCommand);
    electron.ipcRenderer.on('player-control-play-pause', handlePlayPause);
    electron.ipcRenderer.on('player-control-mute', handleMute);

    return () => {
      electron?.ipcRenderer.removeListener('player-remote-command', handleRemoteCommand);
      electron?.ipcRenderer.removeListener('player-control-play-pause', handlePlayPause);
      electron?.ipcRenderer.removeListener('player-control-mute', handleMute);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) {
        return;
      }

      // If a button has DOM focus (e.g., user clicked Next, Prev, or Play), blur it
      // so the browser never accidentally re-executes that button on Enter, Space, or Arrow keys
      if (activeEl && activeEl.tagName === 'BUTTON') {
        (activeEl as HTMLElement).blur();
      }

      // Check if send dialog is active or if any modal backdrop is displayed and visible
      const modal = document.querySelector('.send-to-flash-modal, [data-modal="send"], .modal-backdrop') as HTMLElement | null;
      const isModalVisible = modal ? (modal.style.display !== 'none' && modal.offsetParent !== null) : false;
      const currentTarget = callbackRef.current.flashDriveTarget;
      const isSendActive = (Boolean(currentTarget) && isModalVisible) || isModalVisible;
      if (isSendActive) {
        return;
      }

      // Enter key in player mode must NOT repeat previous buttons
      if (e.key === 'Enter') {
        e.preventDefault();
        return;
      }

      const key = e.key.toLowerCase();
      if (callbackRef.current.isMediaLocked) {
        if (key !== 'escape') {
          return;
        }
      }
      const { 
        showMessageHUD, 
        showSkipHUD, 
        repeatMode: currentRepeatMode, 
        seekTo: doSeek, 
        togglePlay: doTogglePlay,
        toggleFullscreen: doToggleFullscreen,
        adjustVolume: doAdjustVolume,
        showVolumeHUD: doShowVolumeHUD,
        handleNext: doHandleNext,
        handlePrev: doHandlePrev,
        setRepeatMode: doSetRepeatMode,
        setFlashDriveTarget: doSetFlashDriveTarget,
        setSidebarTab: doSetSidebarTab,
        sidebarTab: currentSidebarTab,
        showPlaylist: isPlaylistShown,
        setShowPlaylist: doSetShowPlaylist,
        volume: currentVol,
        currentPath: curPath
      } = callbackRef.current;

      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        callbackRef.current.wakeControls?.();
        doTogglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        callbackRef.current.wakeControls?.();
        // Support 30s (Ctrl+ArrowRight), 60s (Shift+ArrowRight), and 5s (ArrowRight)
        const step = e.ctrlKey ? 30 : (e.shiftKey ? 60 : 5);
        const direction = 'forward';

        if (accumulatedDirectionRef.current === direction) {
          accumulatedSkipAmountRef.current += step;
        } else {
          accumulatedDirectionRef.current = direction;
          accumulatedSkipAmountRef.current = step;
        }

        const totalDur = videoRef.current?.duration || 0;
        const maxDur = (totalDur > 0 && !isNaN(totalDur) && isFinite(totalDur)) ? totalDur : 999999;
        const baseTime = activeSeekTargetRef.current !== null
          ? activeSeekTargetRef.current
          : (videoRef.current ? videoRef.current.currentTime : callbackRef.current.currentTime);
        const nextTime = Math.max(0, Math.min(maxDur, baseTime + step));
        activeSeekTargetRef.current = nextTime;

        doSeek(nextTime);

        if (showSkipHUD) {
          showSkipHUD(accumulatedSkipAmountRef.current, 'forward');
        } else {
          showMessageHUD(`+${accumulatedSkipAmountRef.current}s ⏩`);
        }

        if (seekAccumulatorTimerRef.current) clearTimeout(seekAccumulatorTimerRef.current);
        seekAccumulatorTimerRef.current = setTimeout(() => {
          activeSeekTargetRef.current = null;
          accumulatedSkipAmountRef.current = 0;
          accumulatedDirectionRef.current = null;
        }, 900);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        callbackRef.current.wakeControls?.();
        // Support 30s (Ctrl+ArrowLeft), 60s (Shift+ArrowLeft), and 5s (ArrowLeft)
        const step = e.ctrlKey ? 30 : (e.shiftKey ? 60 : 5);
        const direction = 'backward';

        if (accumulatedDirectionRef.current === direction) {
          accumulatedSkipAmountRef.current += step;
        } else {
          accumulatedDirectionRef.current = direction;
          accumulatedSkipAmountRef.current = step;
        }

        const baseTime = activeSeekTargetRef.current !== null
          ? activeSeekTargetRef.current
          : (videoRef.current ? videoRef.current.currentTime : callbackRef.current.currentTime);
        const nextTime = Math.max(0, baseTime - step);
        activeSeekTargetRef.current = nextTime;

        doSeek(nextTime);

        if (showSkipHUD) {
          showSkipHUD(accumulatedSkipAmountRef.current, 'backward');
        } else {
          showMessageHUD(`-${accumulatedSkipAmountRef.current}s ⏪`);
        }

        if (seekAccumulatorTimerRef.current) clearTimeout(seekAccumulatorTimerRef.current);
        seekAccumulatorTimerRef.current = setTimeout(() => {
          activeSeekTargetRef.current = null;
          accumulatedSkipAmountRef.current = 0;
          accumulatedDirectionRef.current = null;
        }, 900);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        callbackRef.current.wakeControls?.();
        const newVol = Math.min(200, currentVol + 5);
        doAdjustVolume(newVol);
        doShowVolumeHUD(newVol);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        callbackRef.current.wakeControls?.();
        const newVol = Math.max(0, currentVol - 5);
        doAdjustVolume(newVol);
        doShowVolumeHUD(newVol);
      } else if (key === 'f') {
        e.preventDefault();
        doToggleFullscreen();
      } else if (key === 'q') {
        e.preventDefault();
        const isEqOpen = isPlaylistShown && currentSidebarTab === 'effects';
        if (isEqOpen) {
          doSetShowPlaylist?.(false);
          showMessageHUD("Equalizer: Closed");
        } else {
          doSetShowPlaylist?.(true);
          doSetSidebarTab('effects');
          showMessageHUD("Equalizer: Opened");
        }
      } else if (e.key === 'Escape') {
        if (currentTarget !== null) {
          e.preventDefault();
          doSetFlashDriveTarget(null);
        }
      } else if (key === 'n') {
        e.preventDefault();
        callbackRef.current.wakeControls?.();
        doHandleNext();
        showMessageHUD("Next");
      } else if (key === 'p') {
        e.preventDefault();
        callbackRef.current.wakeControls?.();
        doHandlePrev();
        showMessageHUD("Previous");
      } else if (key === 'l' || key === 'r' || (key === 'r' && e.ctrlKey)) {
        callbackRef.current.wakeControls?.();
        e.preventDefault();
        const newMode = currentRepeatMode === 'off' ? 'one' : currentRepeatMode === 'one' ? 'folder' : currentRepeatMode === 'folder' ? 'all' : 'off';
        doSetRepeatMode(newMode);
        const labels: Record<string, string> = { 'off': 'Loop: Off', 'one': 'Loop: Single', 'folder': 'Loop: Folder', 'all': 'Loop: All' };
        showMessageHUD(labels[newMode]);
      } else if (key === 'm') {
        e.preventDefault();
        const { toggleMute } = callbackRef.current;
        toggleMute();
        const isMuted = currentVol === 0 || video.muted;
        showMessageHUD(isMuted ? "Unmuted" : "Muted");
      } else if (key === 's') {
        e.preventDefault();
        if (curPath) doSetFlashDriveTarget(curPath);
      } else if (e.key >= '0' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        callbackRef.current.wakeControls?.();
        const v = videoRef.current;
        const totalDuration = v?.duration || 0;
        if (totalDuration > 0) {
          const pct = parseInt(e.key, 10) / 10;
          const targetTime = totalDuration * pct;
          activeSeekTargetRef.current = targetTime;
          doSeek(targetTime);
          showMessageHUD(`${pct * 100}%`);
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (callbackRef.current.isMediaLocked) return;
      const video = videoRef.current;
      if (!video) return;

      const currentTarget = callbackRef.current.flashDriveTarget;
      const isSendActive = Boolean(currentTarget) || Boolean(document.querySelector('.send-to-flash-modal, [data-modal="send"], .modal-backdrop'));
      if (isSendActive) return;

      const screenArea = videoScreenRef.current;
      if (screenArea && screenArea.contains(e.target as Node)) {
        e.preventDefault();
        const delta = invertScroll ? -e.deltaY : e.deltaY;
        const volStep = 5;
        const curVol = callbackRef.current.volume;
        let newVolume = curVol;
        if (delta < 0) {
          newVolume = Math.min(200, curVol + volStep);
        } else {
          newVolume = Math.max(0, curVol - volStep);
        }
        callbackRef.current.adjustVolume(newVolume);
        callbackRef.current.showVolumeHUD(newVolume);
      }
    };

    const handleMouseUp = () => {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        (document.activeElement as HTMLElement).blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('wheel', handleWheel);
      document.removeEventListener('mouseup', handleMouseUp);
      if (seekAccumulatorTimerRef.current) {
        clearTimeout(seekAccumulatorTimerRef.current);
      }
    };
  }, [invertScroll, videoRef, videoScreenRef]);
}
