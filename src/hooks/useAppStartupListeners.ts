import { useEffect, useRef } from 'react';
import { isExtractorUrl } from '../utils/urlUtils';
import type { AppTask, AppSettings } from '../types/appTypes';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

interface UseAppStartupListenersParams {
  setDownloads: (downloads: AppTask[]) => void;
  setAppSettings: (settings: AppSettings) => void;
  setAddSaveDir: (dir: string) => void;
  syncLibrary: () => void;
  setAddUrl: (url: string) => void;
  setAddFilename: (name: string) => void;
  setIsYoutubeCheck: (check: boolean) => void;
  setInterceptedHeaders: (headers: Record<string, string>) => void;
  setShowAddModal: (show: boolean) => void;
  addToast: (msg: string) => void;
}

export function useAppStartupListeners({
  setDownloads,
  setAppSettings,
  setAddSaveDir,
  syncLibrary,
  setAddUrl,
  setAddFilename,
  setIsYoutubeCheck,
  setInterceptedHeaders,
  setShowAddModal,
  addToast,
}: UseAppStartupListenersParams) {
  const loadedSettingsRef = useRef(false);

  useEffect(() => {
    if (!electron) return;

    electron.ipcRenderer.invoke('get-downloads').then((list: AppTask[]) => {
      setDownloads(list);
    });

    electron.ipcRenderer.invoke('get-settings').then((s: AppSettings) => {
      setAppSettings(s);
      setAddSaveDir(s.downloadDir);
      loadedSettingsRef.current = true;
    });

    const handleDownloadsUpdated = (_event: any, list: AppTask[]) => {
      setDownloads(list);
      syncLibrary();
    };
    electron.ipcRenderer.on('downloads-updated', handleDownloadsUpdated);

    const handleNativeDownloadReceived = (_event: any, data: any) => {
      setAddUrl(data.url);
      setAddFilename(data.filename || '');
      setIsYoutubeCheck(data.isYoutube || isExtractorUrl(data.url));
      setInterceptedHeaders(data.headers || {});
      setShowAddModal(true);
    };
    electron.ipcRenderer.on('native-download-received', handleNativeDownloadReceived);

    const handleDownloadCompletedToast = (_event: any, filename: string) => {
      addToast(`Completed: ${filename}`);
    };
    electron.ipcRenderer.on('download-completed-toast', handleDownloadCompletedToast);

    const handleSettingsChanged = (_event: any, newSettings: AppSettings) => {
      setAppSettings(newSettings);
      setAddSaveDir(newSettings.downloadDir);
      syncLibrary();
    };
    electron.ipcRenderer.on('settings-changed', handleSettingsChanged);

    return () => {
      electron.ipcRenderer.removeListener('downloads-updated', handleDownloadsUpdated);
      electron.ipcRenderer.removeListener('native-download-received', handleNativeDownloadReceived);
      electron.ipcRenderer.removeListener('download-completed-toast', handleDownloadCompletedToast);
      electron.ipcRenderer.removeListener('settings-changed', handleSettingsChanged);
    };
  }, []);

  return { loadedSettingsRef };
}
