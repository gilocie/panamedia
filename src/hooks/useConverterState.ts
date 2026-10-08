import { useState, useEffect } from 'react';
import { getQueue, subscribeQueue } from '../components/panamedia/converterQueue';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export interface ConverterState {
  isActive?: boolean;
  isPaused?: boolean;
  progress?: number;
  currentFile?: string;
  [key: string]: any;
}

export function useConverterState() {
  const [converterQueueCount, setConverterQueueCount] = useState<number>(() => {
    try {
      return getQueue().length;
    } catch {
      return 0;
    }
  });
  const [converterState, setConverterState] = useState<ConverterState | null>(null);

  useEffect(() => {
    if (!electron) return;
    const openConverter = () => {
      electron.ipcRenderer.invoke('open-converter-window').catch((error: unknown) => {
        console.error('Failed to open Converter Pro:', error);
      });
    };
    electron.ipcRenderer.on('converter-open-request', openConverter);
    return () => electron.ipcRenderer.removeListener('converter-open-request', openConverter);
  }, []);

  useEffect(() => {
    return subscribeQueue((items) => setConverterQueueCount(items.length));
  }, []);

  useEffect(() => {
    if (!electron) return;
    const bridge = electron;
    const handler = (_event: any, state: any) => setConverterState(state);
    bridge.ipcRenderer.on('converter-state-changed', handler);
    bridge.ipcRenderer.invoke('get-converter-minimize-state').then((state: any) => {
      if (state) setConverterState(state);
    }).catch(() => {});
    return () => { bridge.ipcRenderer.removeListener('converter-state-changed', handler); };
  }, []);

  return { converterQueueCount, converterState };
}
