import { useState, useCallback, useEffect } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export interface Task {
  id: string;
  url: string;
  filename: string;
  saveDir: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number;
  status: 'queued' | 'preparing' | 'downloading' | 'paused' | 'merging' | 'compressing' | 'completed' | 'failed';
  connections: number;
  headers: Record<string, string>;
  addedAt: number;
  isYoutube: boolean;
  error?: string;
  thumbnail?: string;
  duration?: number;
  displayProgress?: number;
  displaySpeed?: string;
  displayEta?: string;
  displaySize?: string;
  segments?: Array<{
    index: number;
    start: number;
    end: number;
    downloaded: number;
    status: 'pending' | 'downloading' | 'completed' | 'failed';
  }>;
}

export function useDownloads() {
  const [downloads, setDownloads] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<string[]>([]);
  const [extractProgress, setExtractProgress] = useState(0);

  // Load downloads on mount
  useEffect(() => {
    if (!electron) return;
    electron.ipcRenderer.invoke('get-downloads').then((list: Task[]) => {
      setDownloads(list);
    });

    const handleDownloadsUpdated = (_event: any, list: Task[]) => {
      setDownloads(list);
    };
    electron.ipcRenderer.on('downloads-updated', handleDownloadsUpdated);

    return () => {
      electron.ipcRenderer.removeListener('downloads-updated', handleDownloadsUpdated);
    };
  }, []);

  const pauseDownload = useCallback((id: string) => {
    if (electron) electron.ipcRenderer.invoke('pause-download', id);
  }, []);

  const resumeDownload = useCallback((id: string) => {
    if (electron) electron.ipcRenderer.invoke('resume-download', id);
  }, []);

  const deleteDownload = useCallback((id: string, deleteFile = false) => {
    if (electron) {
      electron.ipcRenderer.invoke('delete-download', { taskId: id, deleteFile });
    }
  }, []);

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedDownloadIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  }, []);

  const toggleSelectAll = useCallback((filteredList: Task[]) => {
    if (selectedDownloadIds.length === filteredList.length) {
      setSelectedDownloadIds([]);
    } else {
      setSelectedDownloadIds(filteredList.map(t => t.id));
    }
  }, [selectedDownloadIds]);

  const bulkPause = useCallback(async () => {
    if (!electron) return;
    for (const id of selectedDownloadIds) {
      await electron.ipcRenderer.invoke('pause-download', id);
    }
    setSelectedDownloadIds([]);
  }, [selectedDownloadIds]);

  const bulkResume = useCallback(async () => {
    if (!electron) return;
    for (const id of selectedDownloadIds) {
      await electron.ipcRenderer.invoke('resume-download', id);
    }
    setSelectedDownloadIds([]);
  }, [selectedDownloadIds]);

  const bulkDelete = useCallback(async (deleteFilesOption: boolean) => {
    if (!electron) return;
    for (const id of selectedDownloadIds) {
      await electron.ipcRenderer.invoke('delete-download', { taskId: id, deleteFile: deleteFilesOption });
    }
    const list = await electron.ipcRenderer.invoke('get-downloads');
    setDownloads(list);
    setSelectedDownloadIds([]);
    setSelectedTaskId(null);
  }, [selectedDownloadIds]);

  const clearHistory = useCallback(async (filterType: string) => {
    if (!electron) return;
    const res = await electron.ipcRenderer.invoke('clear-downloads', { filterType });
    setDownloads(res);
  }, []);

  return {
    downloads,
    setDownloads,
    selectedTaskId,
    setSelectedTaskId,
    searchQuery,
    setSearchQuery,
    selectedDownloadIds,
    setSelectedDownloadIds,
    extractProgress,
    setExtractProgress,
    pauseDownload,
    resumeDownload,
    deleteDownload,
    toggleSelect,
    toggleSelectAll,
    bulkPause,
    bulkResume,
    bulkDelete,
    clearHistory,
  };
}
