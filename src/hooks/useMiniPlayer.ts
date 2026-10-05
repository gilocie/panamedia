import { useState, useEffect, useRef } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export interface MiniPlayerState {
  filePath: string;
  filename: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  minimized: boolean;
}

export function useMiniPlayer() {
  const [miniPlayerState, setMiniPlayerState] = useState<MiniPlayerState | null>(null);
  const [miniPlayerHovered, setMiniPlayerHovered] = useState(false);
  const [miniThumbError, setMiniThumbError] = useState(false);
  const miniVideoRef = useRef<HTMLVideoElement>(null);

  // Reset thumb error when file changes
  useEffect(() => {
    setMiniThumbError(false);
  }, [miniPlayerState?.filePath]);

  // Sync mini-player video element with player state
  useEffect(() => {
    const video = miniVideoRef.current;
    if (!video || !miniPlayerState || !miniPlayerState.minimized) return;
    if (miniPlayerState.playing) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    if (Math.abs(video.currentTime - miniPlayerState.currentTime) > 1.2) {
      video.currentTime = miniPlayerState.currentTime;
    }
  }, [miniPlayerState?.playing, miniPlayerState?.currentTime, miniPlayerState?.minimized]);

  // IPC: listen for player state changes + load initial state
  useEffect(() => {
    if (!electron) return;
    const handlePlayerStateChanged = (_event: any, state: any) => {
      setMiniPlayerState(state);
    };
    electron.ipcRenderer.on('player-state-changed', handlePlayerStateChanged);
    electron.ipcRenderer.invoke('get-player-state').then((state: any) => {
      if (state) setMiniPlayerState(state);
    }).catch(() => {});
    return () => {
      electron.ipcRenderer.removeListener('player-state-changed', handlePlayerStateChanged);
    };
  }, []);

  return {
    miniPlayerState, setMiniPlayerState,
    miniPlayerHovered, setMiniPlayerHovered,
    miniThumbError, setMiniThumbError,
    miniVideoRef,
  };
}
