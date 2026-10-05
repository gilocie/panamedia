import { useState, useCallback, useEffect, useRef } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export interface AppSettings {
  connections: number;
  downloadDir: string;
  autoCompress: boolean;
  compressionCRF: number;
  maxConcurrent: number;
  syncedFolders: string[];
}

const defaultSettings: AppSettings = {
  connections: 8,
  downloadDir: '',
  autoCompress: false,
  compressionCRF: 23,
  maxConcurrent: 2,
  syncedFolders: []
};

export function useSettings() {
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings);
  const [settingsSubTab, setSettingsSubTab] = useState<'general' | 'folders' | 'security'>('general');
  const loadedSettingsRef = useRef(false);

  // Load settings on mount
  useEffect(() => {
    if (!electron) return;
    electron.ipcRenderer.invoke('get-settings').then((s: AppSettings) => {
      setAppSettings(s);
      loadedSettingsRef.current = true;
    });

    const handleSettingsChanged = (_event: any, newSettings: AppSettings) => {
      setAppSettings(newSettings);
    };
    electron.ipcRenderer.on('settings-changed', handleSettingsChanged);

    return () => {
      electron.ipcRenderer.removeListener('settings-changed', handleSettingsChanged);
    };
  }, []);

  const updateSetting = useCallback(async (key: keyof AppSettings, value: any) => {
    const nextSettings = { ...appSettings, [key]: value };
    setAppSettings(nextSettings);
    if (electron) {
      await electron.ipcRenderer.invoke('save-settings', nextSettings);
    }
  }, [appSettings]);

  const saveSettings = useCallback(async (nextSettings: AppSettings) => {
    setAppSettings(nextSettings);
    if (electron) {
      await electron.ipcRenderer.invoke('save-settings', nextSettings);
    }
  }, []);

  return {
    appSettings,
    setAppSettings,
    settingsSubTab,
    setSettingsSubTab,
    updateSetting,
    saveSettings,
    loadedSettingsRef,
  };
}
