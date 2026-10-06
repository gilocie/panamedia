import { useState, useCallback, useEffect, useRef } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

const AUTO_VALIDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes

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

  // Keep a stable ref to libraryFiles for the auto-validate interval
  const libraryFilesRef = useRef<any[]>([]);
  useEffect(() => { libraryFilesRef.current = libraryFiles; }, [libraryFiles]);

  /**
   * Validate all currently-known library files against disk.
   * Removes paths that no longer exist, updates state immediately.
   * This is called automatically every 30 minutes and on every sync.
   */
  const validateAndPruneMissing = useCallback(async (files: any[]) => {
    if (!electron || files.length === 0) return files;
    try {
      const allPaths: string[] = files.map((f: any) => f.path).filter(Boolean);
      const result = await electron.ipcRenderer.invoke('validate-library-files', allPaths);
      if (!result || result.removed.length === 0) return files;

      console.info(`[Library] Auto-removed ${result.removed.length} missing file(s) from library`);
      const removedSet = new Set(result.removed.map((p: string) => p.toLowerCase().replace(/[\\/]/g, '/')));
      return files.filter((f: any) => !removedSet.has((f.path || '').toLowerCase().replace(/[\\/]/g, '/')));
    } catch (e) {
      console.warn('[Library] validateAndPruneMissing failed:', e);
      return files;
    }
  }, []);

  const syncLibrary = useCallback(async () => {
    if (!electron) return;
    setSyncingLibrary(true);
    try {
      // IPC now returns { files, duplicates } — all iteration done in main process
      const result = await electron.ipcRenderer.invoke('sync-media-library');

      // Support both old plain-array response and new { files, duplicates } shape
      let files: any[] = Array.isArray(result) ? result : (result?.files ?? []);
      const duplicates: { name: string; list: any[] }[] = Array.isArray(result) ? [] : (result?.duplicates ?? []);

      // Validate all files from the scan — remove any that don't exist on disk
      files = await validateAndPruneMissing(files);

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
  }, [validateAndPruneMissing]);

  // ── 30-minute auto-validation ──────────────────────────────────────────────
  // Every 30 minutes, validate existing library files against the filesystem
  // and silently remove any that are no longer accessible.
  useEffect(() => {
    if (!electron) return;
    const timer = setInterval(async () => {
      const current = libraryFilesRef.current;
      if (current.length === 0) return;
      console.info(`[Library] Running 30-minute auto-validation for ${current.length} files...`);
      const pruned = await validateAndPruneMissing(current);
      if (pruned.length !== current.length) {
        setLibraryFiles(pruned);
        // Notify player windows too
        electron.ipcRenderer.send('library-synced', pruned);
      }
    }, AUTO_VALIDATE_INTERVAL);
    return () => clearInterval(timer);
  }, [validateAndPruneMissing]);

  // ── Listen for media-path-removed from main process ───────────────────────
  // When any window removes a path (e.g., player auto-removes a missing file),
  // the main app library also updates immediately.
  useEffect(() => {
    if (!electron) return;
    const handleRemoved = (_evt: any, { filePath }: { filePath: string }) => {
      if (!filePath) return;
      const norm = filePath.toLowerCase().replace(/[\\/]/g, '/');
      setLibraryFiles(prev => prev.filter(f => (f.path || '').toLowerCase().replace(/[\\/]/g, '/') !== norm));
    };
    electron.ipcRenderer.on('media-path-removed', handleRemoved);
    return () => electron.ipcRenderer.removeListener('media-path-removed', handleRemoved);
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
