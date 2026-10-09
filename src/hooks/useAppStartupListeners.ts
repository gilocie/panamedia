import { useCallback, useEffect, useRef } from 'react';
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

  // The main process broadcasts `downloads-updated` on a ~300 ms throttle
  // while a download runs. Syncing the library on each of those was a full
  // directory walk + stat pass over every library file + serialization of
  // the whole file list to both windows + two full App re-renders — roughly
  // 3×/sec for the entire duration of any download. Sync instead when a
  // download actually finishes, debounced so a burst of completions costs
  // a single scan.
  const syncLibraryRef = useRef(syncLibrary);
  syncLibraryRef.current = syncLibrary;
  const syncTimerRef = useRef<number | null>(null);
  const scheduleLibrarySync = useCallback(() => {
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      syncLibraryRef.current?.();
    }, 1500);
  }, []);

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
      // Progress-only tick: update the list, never rescan the library here.
      setDownloads(list);
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
      // A finished download puts a new file on disk — sync then.
      scheduleLibrarySync();
    };
    electron.ipcRenderer.on('download-completed-toast', handleDownloadCompletedToast);

    const handleSettingsChanged = (_event: any, newSettings: AppSettings) => {
      setAppSettings(newSettings);
      setAddSaveDir(newSettings.downloadDir);
      syncLibrary();
    };
    electron.ipcRenderer.on('settings-changed', handleSettingsChanged);

    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      electron.ipcRenderer.removeListener('downloads-updated', handleDownloadsUpdated);
      electron.ipcRenderer.removeListener('native-download-received', handleNativeDownloadReceived);
      electron.ipcRenderer.removeListener('download-completed-toast', handleDownloadCompletedToast);
      electron.ipcRenderer.removeListener('settings-changed', handleSettingsChanged);
    };
  }, []);

  return { loadedSettingsRef };
}
