import { useState, useEffect } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export function useBinaryInstaller() {
  const [binariesInstalled, setBinariesInstalled] = useState<boolean>(true);
  const [installingBinaries, setInstallingBinaries] = useState<boolean>(false);
  const [installProgress, setInstallProgress] = useState<{
    status: string;
    progress: number;
    isPaused?: boolean;
    error?: string;
  }>({ status: 'idle', progress: 0 });

  useEffect(() => {
    if (!electron) return;
    // Check binary availability on startup
    electron.ipcRenderer.invoke('check-binaries').then((installed: boolean) => {
      setBinariesInstalled(installed);
    }).catch(() => setBinariesInstalled(true));

    const handleProgress = (_event: any, progressData: any) => {
      setInstallProgress(progressData);
      if (progressData?.status === 'complete') {
        setBinariesInstalled(true);
        setInstallingBinaries(false);
      }
    };
    electron.ipcRenderer.on('binary-install-progress', handleProgress);
    return () => {
      electron.ipcRenderer.removeListener('binary-install-progress', handleProgress);
    };
  }, []);

  const startInstall = async () => {
    if (!electron) return;
    setInstallingBinaries(true);
    setInstallProgress({ status: 'starting', progress: 0 });
    try {
      await electron.ipcRenderer.invoke('install-binaries');
    } catch (err: any) {
      setInstallProgress({ status: 'error', progress: 0, error: err?.message || 'Install failed' });
      setInstallingBinaries(false);
    }
  };

  const pauseInstall = async () => {
    if (!electron) return;
    await electron.ipcRenderer.invoke('pause-binary-install');
  };

  const resumeInstall = async () => {
    if (!electron) return;
    setInstallProgress(prev => ({ ...prev, status: prev.status === 'error' ? 'Resuming...' : prev.status, isPaused: false }));
    await electron.ipcRenderer.invoke('resume-binary-install');
  };

  const cancelInstall = () => {
    setInstallingBinaries(false);
    setInstallProgress({ status: 'idle', progress: 0 });
  };

  return {
    binariesInstalled,
    installingBinaries, setInstallingBinaries,
    installProgress,
    startInstall,
    pauseInstall,
    resumeInstall,
    cancelInstall,
  };
}
