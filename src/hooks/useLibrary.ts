import { useState, useCallback, useEffect } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export function useLibrary() {
  const [rightPanelTab, setRightPanelTab] = useState<'details' | 'library'>('library');
  const [libraryFiles, setLibraryFiles] = useState<any[]>([]);
  const [libraryDuplicates, setLibraryDuplicates] = useState<{ name: string; list: any[] }[]>([]);
  const [libraryCategory, setLibraryCategory] = useState<'recent' | 'videos' | 'audios' | 'docx' | 'files' | 'duplicates'>('recent');
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySortBy, setLibrarySortBy] = useState<'name' | 'date' | 'size'>('date');
  const [librarySortOrder, setLibrarySortOrder] = useState<'asc' | 'desc'>('desc');
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [selectedLibraryPath, setSelectedLibraryPath] = useState<string | null>(null);
  const [libraryViewMode, setLibraryViewMode] = useState<'files' | 'folders'>('files');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [duplicateDeletePaths, setDuplicateDeletePaths] = useState<string[]>([]);
  const [expandedDupGroups, setExpandedDupGroups] = useState<Record<string, boolean>>({});

  const syncLibrary = useCallback(async () => {
    if (!electron) return;
    setSyncingLibrary(true);
    try {
      // IPC now returns { files, duplicates } — all iteration done in main process
      const result = await electron.ipcRenderer.invoke('sync-media-library');

      // Support both old plain-array response and new { files, duplicates } shape
      const files: any[] = Array.isArray(result) ? result : (result?.files ?? []);
      const duplicates: { name: string; list: any[] }[] = Array.isArray(result) ? [] : (result?.duplicates ?? []);

      setLibraryFiles(files);
      setLibraryDuplicates(duplicates);

      if (electron) {
        electron.ipcRenderer.send('library-synced', files);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingLibrary(false);
    }
  }, []);

  const toggleDuplicateDelete = useCallback((path: string) => {
    setDuplicateDeletePaths(prev => {
      if (prev.includes(path)) {
        return prev.filter(p => p !== path);
      } else {
        return [...prev, path];
      }
    });
  }, []);

  // Auto-mark oldest duplicate in each group for deletion.
  // Uses libraryDuplicates (pre-computed server-side) — no re-iteration of full libraryFiles needed.
  useEffect(() => {
    if (libraryDuplicates.length === 0) {
      setDuplicateDeletePaths([]);
      return;
    }
    const initialDeletePaths: string[] = [];
    for (const group of libraryDuplicates) {
      if (group.list.length > 1) {
        const sorted = [...group.list].sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
        initialDeletePaths.push(sorted[0].path);
      }
    }
    setDuplicateDeletePaths(initialDeletePaths);
  }, [libraryDuplicates]);

  return {
    rightPanelTab, setRightPanelTab,
    libraryFiles, setLibraryFiles,
    libraryDuplicates, setLibraryDuplicates,
    libraryCategory, setLibraryCategory,
    librarySearch, setLibrarySearch,
    librarySortBy, setLibrarySortBy,
    librarySortOrder, setLibrarySortOrder,
    syncingLibrary, setSyncingLibrary,
    selectedLibraryPath, setSelectedLibraryPath,
    libraryViewMode, setLibraryViewMode,
    expandedFolders, setExpandedFolders,
    imgErrors, setImgErrors,
    duplicateDeletePaths, setDuplicateDeletePaths,
    expandedDupGroups, setExpandedDupGroups,
    syncLibrary,
    toggleDuplicateDelete,
  };
}
