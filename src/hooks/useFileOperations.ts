import type { AppTask } from '../types/appTypes';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

interface UseFileOperationsParams {
  downloads: AppTask[];
  setDownloads: (downloads: AppTask[]) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  selectedLibraryPath: string | null;
  setSelectedLibraryPath: (path: string | null) => void;
  duplicateDeletePaths: string[];
  setDuplicateDeletePaths: (paths: string[]) => void;
  setDeleteConfirmTarget: (target: any) => void;
  syncLibrary: () => void;
}

export function useFileOperations({
  downloads,
  setDownloads,
  selectedTaskId,
  setSelectedTaskId,
  selectedLibraryPath,
  setSelectedLibraryPath,
  duplicateDeletePaths,
  setDuplicateDeletePaths,
  setDeleteConfirmTarget,
  syncLibrary,
}: UseFileOperationsParams) {
  const performDeleteFile = async (filePath: string) => {
    if (!electron) return { success: false, error: 'Electron not available' };

    const matchingTask = downloads.find(t => {
      const taskPath = t.saveDir + '\\' + t.filename;
      const taskPathAlt = t.saveDir + '/' + t.filename;
      return taskPath === filePath || taskPathAlt === filePath || t.filename === filePath.split(/[\\/]/).pop();
    });

    let res;
    if (matchingTask) {
      const list = await electron.ipcRenderer.invoke('delete-download', { taskId: matchingTask.id, deleteFile: true });
      setDownloads(list);
      if (selectedTaskId === matchingTask.id) setSelectedTaskId(null);
      res = { success: true };
    } else {
      res = await electron.ipcRenderer.invoke('delete-file', filePath);
    }

    if (selectedLibraryPath === filePath) {
      setSelectedLibraryPath(null);
    }

    syncLibrary();
    return res;
  };

  const handleResolveDuplicates = async () => {
    for (const path of duplicateDeletePaths) {
      await performDeleteFile(path);
    }
    setDuplicateDeletePaths([]);
    syncLibrary();
  };

  const deleteDownload = (id: string, deleteFile = false) => {
    const task = downloads.find(t => t.id === id);
    const filename = task ? task.filename : 'this download';
    setDeleteConfirmTarget({
      type: 'download',
      title: 'Remove Download History',
      message: `Are you sure you want to remove "${filename}" from download history?`,
      taskId: id,
      showDeleteFileOption: deleteFile || (task && task.status === 'completed'),
      onConfirm: async (deleteFileFromDisk: boolean) => {
        if (electron) {
          const list = await electron.ipcRenderer.invoke('delete-download', { taskId: id, deleteFile: deleteFileFromDisk });
          setDownloads(list);
          if (selectedTaskId === id) setSelectedTaskId(null);
          syncLibrary();
        }
      }
    });
  };

  const openFile = (task: AppTask) => {
    if (electron) electron.ipcRenderer.invoke('open-file', { saveDir: task.saveDir, filename: task.filename });
  };

  const openFolder = (task: AppTask) => {
    if (electron) electron.ipcRenderer.invoke('open-folder', task.saveDir);
  };

  return {
    performDeleteFile,
    handleResolveDuplicates,
    deleteDownload,
    openFile,
    openFolder,
  };
}
