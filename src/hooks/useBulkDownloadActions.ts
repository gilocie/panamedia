import type { AppTask } from '../types/appTypes';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

interface UseBulkDownloadActionsParams {
  downloads: AppTask[];
  selectedDownloadIds: string[];
  setSelectedDownloadIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedTaskId: (id: string | null) => void;
  setDeleteConfirmTarget: (target: any) => void;
  setDownloads: (downloads: AppTask[]) => void;
  setShowClearHistoryModal: (show: boolean) => void;
  syncLibrary: () => void;
}

export function useBulkDownloadActions({
  downloads,
  selectedDownloadIds,
  setSelectedDownloadIds,
  setSelectedTaskId,
  setDeleteConfirmTarget,
  setDownloads,
  setShowClearHistoryModal,
  syncLibrary,
}: UseBulkDownloadActionsParams) {
  const handleToggleSelect = (taskId: string) => {
    setSelectedDownloadIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleToggleSelectAll = (filteredDownloadsList: AppTask[]) => {
    if (selectedDownloadIds.length === filteredDownloadsList.length) {
      setSelectedDownloadIds([]);
    } else {
      setSelectedDownloadIds(filteredDownloadsList.map(t => t.id));
    }
  };

  const handleBulkPause = async () => {
    if (!electron) return;
    for (const id of selectedDownloadIds) {
      await electron.ipcRenderer.invoke('pause-download', id);
    }
    setSelectedDownloadIds([]);
  };

  const handleBulkResume = async () => {
    if (!electron) return;
    for (const id of selectedDownloadIds) {
      await electron.ipcRenderer.invoke('resume-download', id);
    }
    setSelectedDownloadIds([]);
  };

  const handleBulkDelete = () => {
    if (selectedDownloadIds.length === 0) return;
    const hasCompleted = downloads.some(t => selectedDownloadIds.includes(t.id) && t.status === 'completed');
    setDeleteConfirmTarget({
      type: 'bulk-tasks',
      title: 'Remove Selected Downloads',
      message: `Are you sure you want to remove the ${selectedDownloadIds.length} selected tasks?`,
      taskIds: selectedDownloadIds,
      showDeleteFileOption: hasCompleted,
      onConfirm: async (deleteFilesOption: boolean) => {
        if (!electron) return;
        for (const id of selectedDownloadIds) {
          await electron.ipcRenderer.invoke('delete-download', { taskId: id, deleteFile: deleteFilesOption });
        }
        const list = await electron.ipcRenderer.invoke('get-downloads');
        setDownloads(list);
        setSelectedDownloadIds([]);
        setSelectedTaskId(null);
        syncLibrary();
      }
    });
  };

  const handleClearHistory = async (filterType: string) => {
    if (!electron) return;
    const res = await electron.ipcRenderer.invoke('clear-downloads', { filterType });
    setDownloads(res);
    setShowClearHistoryModal(false);
  };

  return {
    handleToggleSelect,
    handleToggleSelectAll,
    handleBulkPause,
    handleBulkResume,
    handleBulkDelete,
    handleClearHistory,
  };
}
