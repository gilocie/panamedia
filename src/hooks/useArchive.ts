import { useState, useEffect, useCallback } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export function useArchive() {
  const [archivePaths, setArchivePaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('player_archive');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [settingsArchivePin, setSettingsArchivePin] = useState<string>(
    () => localStorage.getItem('player_archive_pin') || ''
  );
  const [newSettingsPin, setNewSettingsPin] = useState('');
  const [confirmSettingsPin, setConfirmSettingsPin] = useState('');
  const [pinFeedbackMsg, setPinFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [newPinFocused, setNewPinFocused] = useState(false);
  const [confirmPinFocused, setConfirmPinFocused] = useState(false);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'player_archive' && e.newValue) {
        try { setArchivePaths(JSON.parse(e.newValue)); } catch {}
      }
      if (e.key === 'player_archive_pin') {
        setSettingsArchivePin(e.newValue || '');
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleArchiveUpdated = (_event: any, paths: string[]) => {
      if (Array.isArray(paths)) setArchivePaths(paths);
    };

    const handlePinUpdated = (_event: any, pin: string) => {
      const pinStr = typeof pin === 'string' ? pin : '';
      setSettingsArchivePin(pinStr);
      if (!pinStr) localStorage.removeItem('player_archive_pin');
      else localStorage.setItem('player_archive_pin', pinStr);
    };

    if (electron) {
      electron.ipcRenderer.on('archive-updated', handleArchiveUpdated);
      electron.ipcRenderer.on('archive-pin-updated', handlePinUpdated);
      electron.ipcRenderer.invoke('load-archive-data').then((fileData: any) => {
        if (fileData?.archivePaths && Array.isArray(fileData.archivePaths)) {
          setArchivePaths(prev => {
            const set = new Set(prev.map((p: string) => p.replace(/[\\/]/g, '/').toLowerCase()));
            for (const fp of fileData.archivePaths) set.add(fp.replace(/[\\/]/g, '/').toLowerCase());
            return Array.from(set) as string[];
          });
          localStorage.setItem('player_archive', JSON.stringify(fileData.archivePaths));
        }
        if (fileData && typeof fileData.archivePin === 'string') {
          setSettingsArchivePin(fileData.archivePin);
          if (fileData.archivePin) localStorage.setItem('player_archive_pin', fileData.archivePin);
          else localStorage.removeItem('player_archive_pin');
        }
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (electron) {
        electron.ipcRenderer.removeListener('archive-updated', handleArchiveUpdated);
        electron.ipcRenderer.removeListener('archive-pin-updated', handlePinUpdated);
      }
    };
  }, []);

  const isItemArchived = useCallback((filePath?: string) => {
    if (!filePath) return false;
    const target = filePath.replace(/[\\/]/g, '/').toLowerCase();
    return archivePaths.some(p => {
      const arch = p.replace(/[\\/]/g, '/').toLowerCase();
      return target === arch || target.startsWith(arch + '/');
    });
  }, [archivePaths]);

  return {
    archivePaths, setArchivePaths,
    settingsArchivePin, setSettingsArchivePin,
    newSettingsPin, setNewSettingsPin,
    confirmSettingsPin, setConfirmSettingsPin,
    pinFeedbackMsg, setPinFeedbackMsg,
    showResetPinModal, setShowResetPinModal,
    showNewPin, setShowNewPin,
    showConfirmPin, setShowConfirmPin,
    newPinFocused, setNewPinFocused,
    confirmPinFocused, setConfirmPinFocused,
    isItemArchived,
  };
}
