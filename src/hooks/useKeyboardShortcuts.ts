import { useEffect } from 'react';

interface KeyboardShortcutsOptions {
  selectedLibraryPath: string | null;
  selectedTaskId: string | null;
  downloads: any[];
  setFlashDriveTarget: (path: string) => void;
  setContextMenu: (fn: (prev: any) => any) => void;
}

export function useKeyboardShortcuts({
  selectedLibraryPath,
  selectedTaskId,
  downloads,
  setFlashDriveTarget,
  setContextMenu,
}: KeyboardShortcutsOptions) {
  // Close context menu on any click
  useEffect(() => {
    const handleCloseCtx = () => {
      setContextMenu((prev: any) => prev.visible ? { ...prev, visible: false } : prev);
    };
    window.addEventListener('click', handleCloseCtx);
    return () => window.removeEventListener('click', handleCloseCtx);
  }, [setContextMenu]);

  // 'S' key → send selected file to flash drive
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true')
      ) return;

      if (e.key.toLowerCase() === 's') {
        if (selectedLibraryPath) {
          e.preventDefault();
          setFlashDriveTarget(selectedLibraryPath);
        } else if (selectedTaskId) {
          const task = downloads.find((t: any) => t.id === selectedTaskId);
          if (task && task.status === 'completed') {
            e.preventDefault();
            setFlashDriveTarget(task.saveDir + '\\' + task.filename);
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [selectedLibraryPath, selectedTaskId, downloads, setFlashDriveTarget]);
}
