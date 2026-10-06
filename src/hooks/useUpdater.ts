import { useState, useEffect, useCallback } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

const APP_VERSION = '1.0.1';

export type UpdateStatus =
  | 'idle' | 'checking' | 'up-to-date' | 'update-available'
  | 'no-internet' | 'downloading' | 'download-complete' | 'installing' | 'error';

export interface UpdaterState {
  showReleaseDialog: boolean;
  setShowReleaseDialog: (v: boolean) => void;
  releaseCheckStatus: UpdateStatus;
  latestReleaseVersion: string;
  releaseDownloadUrl: string;
  updateDownloadProgress: number;
  updateDownloadedBytes: number;
  updateTotalBytes: number;
  updateInstallerPath: string;
  updateError: string;
  releaseNotes: string;
  checkReleaseUpdate: (isManual?: boolean) => Promise<void>;
  startUpdateDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  setReleaseCheckStatus: (status: UpdateStatus) => void;
  compareVersions: (v1: string, v2: string) => number;
}

function compareVersions(v1: string, v2: string): number {
  const clean1 = (v1 || '').replace(/^[vV]/, '').trim();
  const clean2 = (v2 || '').replace(/^[vV]/, '').trim();
  const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export function useUpdater(): UpdaterState {
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [releaseCheckStatus, setReleaseCheckStatus] = useState<UpdateStatus>('idle');
  const [latestReleaseVersion, setLatestReleaseVersion] = useState(APP_VERSION);
  const [releaseDownloadUrl, setReleaseDownloadUrl] = useState('https://panamedia.lovable.app/api/public/download/windows');
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0);
  const [updateDownloadedBytes, setUpdateDownloadedBytes] = useState(0);
  const [updateTotalBytes, setUpdateTotalBytes] = useState(0);
  const [updateInstallerPath, setUpdateInstallerPath] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');

  // Listen for download progress from main process
  useEffect(() => {
    if (!electron) return;
    const handler = (_event: any, data: { downloadedBytes: number; totalBytes: number; progress: number }) => {
      setUpdateDownloadedBytes(data.downloadedBytes);
      setUpdateTotalBytes(data.totalBytes);
      if (data.progress >= 0) setUpdateDownloadProgress(data.progress);
    };
    electron.ipcRenderer.on('update-download-progress', handler);
    return () => { electron.ipcRenderer.removeListener('update-download-progress', handler); };
  }, []);

  const checkReleaseUpdate = useCallback(async (isManual = false) => {
    if (isManual) setShowReleaseDialog(true);
    setReleaseCheckStatus('checking');
    setUpdateError('');

    try {
      let isOnline = navigator.onLine;
      if (electron) {
        try {
          const netCheck = await electron.ipcRenderer.invoke('check-internet');
          isOnline = !!netCheck?.online;
        } catch { isOnline = navigator.onLine; }
      }

      if (!isOnline) {
        setReleaseCheckStatus('no-internet');
        setShowReleaseDialog(isManual);
        return;
      }

      const startTime = Date.now();
      let foundVersion = APP_VERSION;
      let dlUrl = 'https://panamedia.lovable.app/api/public/download/windows';
      let notes = '';

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      let apiRes: Response;
      try {
        apiRes = await fetch('https://panamedia.lovable.app/api/public/latest/windows', { signal: ctrl.signal });
      } finally {
        clearTimeout(tid);
      }
      if (!apiRes.ok) {
        throw new Error(`Panamedia update server returned status ${apiRes.status}.`);
      }

      const apiData = await apiRes.json();
      const parsedVersion = (apiData?.version || '').replace(/^[vV]/, '').trim();
      if (!parsedVersion) {
        throw new Error('Panamedia update server returned an invalid release version.');
      }
      if (compareVersions(parsedVersion, APP_VERSION) < 0) {
        throw new Error(
          `Panamedia update server reports version ${parsedVersion}, older than this app (${APP_VERSION}).`
        );
      }
      foundVersion = parsedVersion;
      dlUrl = apiData.download_url || apiData.url || dlUrl;
      notes = apiData.release_notes || apiData.notes || '';

      // Ensure minimum visible "checking" time
      const elapsed = Date.now() - startTime;
      if (elapsed < 1800) await new Promise(r => setTimeout(r, 1800 - elapsed));

      setLatestReleaseVersion(foundVersion);
      setReleaseDownloadUrl(dlUrl);
      setReleaseNotes(notes);

      if (compareVersions(foundVersion, APP_VERSION) > 0) {
        setReleaseCheckStatus('update-available');
        setShowReleaseDialog(true);
      } else {
        setReleaseCheckStatus('up-to-date');
        if (!isManual) setShowReleaseDialog(false);
      }
    } catch (err) {
      console.warn('Release check error:', err);
      setUpdateError(err instanceof Error ? err.message : 'Unable to check for updates from the Panamedia website.');
      setReleaseCheckStatus('error');
      setShowReleaseDialog(isManual);
    }
  }, []);

  // Auto-check: on startup + every 5 min + on reconnect
  useEffect(() => {
    const hasInternet = async (): Promise<boolean> => {
      if (!navigator.onLine) return false;
      if (electron) {
        try {
          const r = await electron.ipcRenderer.invoke('check-internet');
          if (r && typeof r.online === 'boolean') return r.online;
        } catch { /**/ }
      }
      return navigator.onLine;
    };

    const startupTimer = setTimeout(async () => {
      if (await hasInternet()) checkReleaseUpdate(false);
    }, 3500);

    const intervalTimer = setInterval(async () => {
      if (await hasInternet()) checkReleaseUpdate(false);
    }, 5 * 60 * 1000);

    const handleOnline = async () => {
      if (await hasInternet()) checkReleaseUpdate(false);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(startupTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('online', handleOnline);
    };
  }, [checkReleaseUpdate]);

  const startUpdateDownload = useCallback(async () => {
    if (!electron) return;
    setReleaseCheckStatus('downloading');
    setUpdateDownloadProgress(0);
    setUpdateDownloadedBytes(0);
    setUpdateTotalBytes(0);
    setUpdateInstallerPath('');
    setUpdateError('');
    try {
      const result = await electron.ipcRenderer.invoke('download-app-update', {
        fileName: 'PanamediaSetup.exe'
      });
      if (result.success && result.installerPath) {
        setUpdateInstallerPath(result.installerPath);
        setUpdateDownloadProgress(100);
        setReleaseCheckStatus('download-complete');
      } else {
        setUpdateError(result.error || 'Download failed.');
        setReleaseCheckStatus('error');
      }
    } catch (err: any) {
      setUpdateError(err.message || 'Download failed.');
      setReleaseCheckStatus('error');
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!electron || !updateInstallerPath) return;
    setReleaseCheckStatus('installing');
    try {
      await electron.ipcRenderer.invoke('install-app-update');
    } catch (err: any) {
      setUpdateError(err.message || 'Failed to launch installer.');
      setReleaseCheckStatus('error');
    }
  }, [updateInstallerPath]);

  return {
    showReleaseDialog, setShowReleaseDialog,
    releaseCheckStatus, setReleaseCheckStatus,
    latestReleaseVersion,
    releaseDownloadUrl,
    updateDownloadProgress,
    updateDownloadedBytes,
    updateTotalBytes,
    updateInstallerPath,
    updateError,
    releaseNotes,
    checkReleaseUpdate,
    startUpdateDownload,
    installUpdate,
    compareVersions,
  };
}
