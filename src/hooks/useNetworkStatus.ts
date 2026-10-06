import { useState, useEffect } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export function useNetworkStatus() {
  const [netSpeed, setNetSpeed] = useState<number>(0);
  const [streamingPort, setStreamingPort] = useState<number>(52322);

  useEffect(() => {
    if (!electron) return;

    // Get streaming port from main process
    electron.ipcRenderer.invoke('get-streaming-port').then((port: number) => {
      if (port) setStreamingPort(port);
    }).catch(() => {});

    // Get initial cached network speed
    electron.ipcRenderer.invoke('get-network-speed').then((speed: number) => {
      if (speed > 0) setNetSpeed(speed);
    }).catch(() => {});

    // Listen for real-time speed updates
    const handleSpeed = (_event: any, speed: number) => setNetSpeed(speed);
    electron.ipcRenderer.on('network-speed-update', handleSpeed);

    return () => {
      electron.ipcRenderer.removeListener('network-speed-update', handleSpeed);
    };
  }, []);

  return { netSpeed, streamingPort };
}
