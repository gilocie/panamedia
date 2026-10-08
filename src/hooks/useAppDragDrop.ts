import React from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

const MEDIA_EXTENSIONS = [
  '.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv',
  '.mpg', '.mpeg', '.3gp', '.wmv', '.vob', '.mp3', '.m4a', '.wav',
  '.aac', '.flac', '.ogg', '.opus', '.wma'
];

export function useAppDragDrop() {
  const handleAppDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleAppDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const file = e.dataTransfer.files[0];

    let filePath = '';
    try {
      if ((window as any).electronWebUtils?.getPathForFile) {
        filePath = (window as any).electronWebUtils.getPathForFile(file);
      }
    } catch (err) {}
    if (!filePath) {
      try {
        if (electron?.webUtils?.getPathForFile) {
          filePath = electron.webUtils.getPathForFile(file);
        }
      } catch (err) {}
    }
    if (!filePath) {
      filePath = (file as any).path || '';
    }
    if (!filePath) return;

    const ext = '.' + (filePath.split('.').pop()?.toLowerCase() || '');
    if (MEDIA_EXTENSIONS.includes(ext)) {
      electron?.ipcRenderer.invoke('open-player-window', { filePath, filename: file.name });
    }
  };

  return { handleAppDragOver, handleAppDrop };
}
