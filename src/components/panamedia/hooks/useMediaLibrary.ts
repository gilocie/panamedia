import { useState, useEffect, useRef, useCallback } from 'react';
import { type MediaItem, electron, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS } from '../types';

const SYNC_COOLDOWN = 60000; // 1 minute
const MAX_LOCAL_ITEMS = 500;
const CLEANUP_INTERVAL = 120000; // 2 minutes
const AUTO_VALIDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes

function readFromStorage(key: string): any[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function writeToStorage(key: string, value: any[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value.slice(0, MAX_LOCAL_ITEMS)));
  } catch {}
}

function getParentDirectory(filePath: string): string {
  const winIndex = filePath.lastIndexOf('\\');
  const posixIndex = filePath.lastIndexOf('/');
  const maxIndex = Math.max(winIndex, posixIndex);
  return maxIndex === -1 ? '' : filePath.substring(0, maxIndex);
}

function categorizeMediaItems(items: MediaItem[]) {
  const videos: MediaItem[] = [];
  const audios: MediaItem[] = [];
  for (const item of items) {
    const cat = (item as any).category;
    if (cat === 'videos') {
      videos.push(item);
      continue;
    } else if (cat === 'audios') {
      audios.push(item);
      continue;
    } else if (cat === 'files' || cat === 'docx') {
      continue;
    }

    const ext = '.' + (item.ext || '').toLowerCase().replace(/^\./, '');
    if (ext === '.ts') {
      const name = (item.name || '').toLowerCase();
      if (name.endsWith('.d.ts') || name.endsWith('.spec.ts') || name.endsWith('.test.ts') || name.endsWith('.config.ts')) {
        continue;
      }
      videos.push(item);
    } else if (VIDEO_EXTENSIONS.includes(ext)) {
      videos.push(item);
    } else if (AUDIO_EXTENSIONS.includes(ext)) {
      audios.push(item);
    }
  }
  return { videos, audios };
}

interface UseMediaLibraryProps {
  currentPath: string;
  downloadDir: string;
  setDownloadDir: (dir: string) => void;
  setCurrentPath: (path: string) => void;
  setCurrentTitle: (title: string) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setForceTranscode: (force: boolean) => void;
  setSidebarTab: (tab: 'videos' | 'audios' | 'primary' | 'effects' | 'sendtray') => void;
  sidebarTab?: 'videos' | 'audios' | 'primary' | 'effects' | 'sendtray';
  sendTrayItems?: string[];
  setPrimarySubTab?: React.Dispatch<React.SetStateAction<'videos' | 'audios'>>;
  setPlayerExpandedFolders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenFile?: (filePath: string, filename?: string) => void;
  mediaSubTab?: 'all' | 'favourites' | 'archive';
  isItemArchived?: (path: string) => boolean;
}

export function useMediaLibrary({
  currentPath,
  downloadDir,
  setDownloadDir,
  setCurrentPath,
  setCurrentTitle,
  setCurrentTime,
  setDuration,
  setForceTranscode,
  setSidebarTab,
  sidebarTab,
  sendTrayItems,
  setPrimarySubTab,
  setPlayerExpandedFolders,
  onOpenFile,
  mediaSubTab,
  isItemArchived,
}: UseMediaLibraryProps) {
  const [syncedVideos, setSyncedVideos] = useState<MediaItem[]>(() => readFromStorage('player_syncedVideos'));
  const [syncedAudios, setSyncedAudios] = useState<MediaItem[]>(() => readFromStorage('player_syncedAudios'));
  const [currentDirVideos, setCurrentDirVideos] = useState<MediaItem[]>([]);
  const [currentDirAudios, setCurrentDirAudios] = useState<MediaItem[]>([]);
  const [folderEffects, setFolderEffects] = useState<MediaItem[]>([]);
  const [playerSyncing, setPlayerSyncing] = useState(false);
  const [playerSyncedDirs, setPlayerSyncedDirs] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);

  const scannedDirsRef = useRef<Record<string, number>>({});
  const syncingDirsSetRef = useRef<Set<string>>(new Set());
  const syncQueueRef = useRef<string[]>([]);
  const isSyncingQueueRef = useRef(false);
  const prevCurrentPathRef = useRef<string | null>(null);

  // Stable refs for auto-validate interval (avoids stale closures)
  const syncedVideosRef = useRef<MediaItem[]>([]);
  const syncedAudiosRef = useRef<MediaItem[]>([]);
  useEffect(() => { syncedVideosRef.current = syncedVideos; }, [syncedVideos]);
  useEffect(() => { syncedAudiosRef.current = syncedAudios; }, [syncedAudios]);

  useEffect(() => {
    writeToStorage('player_syncedVideos', syncedVideos);
  }, [syncedVideos]);

  useEffect(() => {
    writeToStorage('player_syncedAudios', syncedAudios);
  }, [syncedAudios]);

  const mergeUniqueItems = useCallback((setter: React.Dispatch<React.SetStateAction<MediaItem[]>>, newItems: MediaItem[]) => {
    setter(prev => {
      const map = new Map<string, MediaItem>(prev.map(item => [item.path, item]));
      for (const item of newItems) {
        map.set(item.path, item);
      }
      const merged = Array.from(map.values());
      return merged.length > MAX_LOCAL_ITEMS ? merged.slice(merged.length - MAX_LOCAL_ITEMS) : merged;
    });
  }, []);

  const queueSyncDirectory = useCallback((dirPath: string, force = false) => {
    if (!electron || !dirPath) return;
    const now = Date.now();
    const lastSyncTime = scannedDirsRef.current[dirPath] ?? 0;

    if (!force && syncingDirsSetRef.current.has(dirPath)) return;
    if (!force && now - lastSyncTime < SYNC_COOLDOWN) return;

    if (!syncQueueRef.current.includes(dirPath)) {
      if (force) {
        syncQueueRef.current.unshift(dirPath);
      } else {
        syncQueueRef.current.push(dirPath);
      }
    }
    processSyncQueue();
  }, []);

  function processSyncQueue() {
    if (isSyncingQueueRef.current || syncQueueRef.current.length === 0) return;

    const dirPath = syncQueueRef.current.shift()!;
    if (syncingDirsSetRef.current.has(dirPath)) {
      processSyncQueue();
      return;
    }

    isSyncingQueueRef.current = true;
    syncingDirsSetRef.current.add(dirPath);
    setPlayerSyncing(true);

    if (!electron) return;
    electron.ipcRenderer.invoke('sync-media-library', dirPath)
      .then((items: MediaItem[]) => {
        scannedDirsRef.current[dirPath] = Date.now();
        syncingDirsSetRef.current.delete(dirPath);

        const list = items || [];
        const normDir = dirPath.replace(/[\\/]/g, '/').toLowerCase();
        
        // Filter items directly in the current directory AND any nested subfolders/subfiles under dirPath
        const dirItems = list.filter(item => {
          const itemNorm = item.path.replace(/[\\/]/g, '/').toLowerCase();
          return itemNorm === normDir || itemNorm.startsWith(normDir + '/');
        });
        const { videos, audios } = categorizeMediaItems(dirItems);
        const wavOggAac = dirItems.filter(item => ['.wav', '.ogg', '.aac'].includes('.' + (item.ext || '').toLowerCase().replace(/^\./, '')));

        setCurrentDirVideos(videos);
        setCurrentDirAudios(audios);
        setFolderEffects(wavOggAac);

        const allCategorized = categorizeMediaItems(list);
        mergeUniqueItems(setSyncedVideos, allCategorized.videos);
        mergeUniqueItems(setSyncedAudios, allCategorized.audios);
      })
      .catch((err: any) => {
        console.warn('[useMediaLibrary] syncDir failed:', dirPath, err);
        syncingDirsSetRef.current.delete(dirPath);
      })
      .finally(() => {
        isSyncingQueueRef.current = false;
        setPlayerSyncing(syncQueueRef.current.length > 0 || syncingDirsSetRef.current.size > 0);
        setTimeout(processSyncQueue, 50);
      });
  }

  const pruneItemsForAllowedDirs = useCallback((allowedDirs: string[], primaryDir: string) => {
    const validBases = [primaryDir, ...allowedDirs]
      .filter(Boolean)
      .map((d: string) => d.replace(/[\\/]/g, '/').toLowerCase());
    
    if (validBases.length === 0) {
      setSyncedVideos([]);
      setSyncedAudios([]);
      setCurrentDirVideos([]);
      setCurrentDirAudios([]);
      return;
    }

    const isPathValid = (p: string) => {
      if (!p) return false;
      const normP = p.replace(/[\\/]/g, '/').toLowerCase();
      return validBases.some((b: string) => {
        const normB = b.endsWith('/') ? b.slice(0, -1) : b;
        return normP === normB || normP.startsWith(normB + '/');
      });
    };

    setSyncedVideos(prev => prev.filter(item => isPathValid(item.path)));
    setSyncedAudios(prev => prev.filter(item => isPathValid(item.path)));
    setCurrentDirVideos(prev => prev.filter(item => isPathValid(item.path)));
    setCurrentDirAudios(prev => prev.filter(item => isPathValid(item.path)));
  }, []);

  /**
   * Validate MediaItems against the filesystem. Returns only items whose
   * files still exist on disk, using the main-process validate-library-files handler.
   */
  const validateAndPruneItems = useCallback(async (items: MediaItem[]): Promise<MediaItem[]> => {
    if (!electron || items.length === 0) return items;
    try {
      const allPaths = items.map(i => i.path).filter(Boolean);
      const result = await electron.ipcRenderer.invoke('validate-library-files', allPaths);
      if (!result || result.removed.length === 0) return items;
      console.info(`[Player Library] Auto-removed ${result.removed.length} missing file(s)`);
      const removedSet = new Set<string>(result.removed.map((p: string) => p.toLowerCase().replace(/[\/]/g, '/')));
      return items.filter(item => !removedSet.has(item.path.toLowerCase().replace(/[\/]/g, '/')));
    } catch (e) {
      return items;
    }
  }, []);

  const syncAllFolders = useCallback(async (activeDirs?: string[], activeDownloadDir?: string) => {
    if (!electron) return;
    setPlayerSyncing(true);
    try {
      const items: MediaItem[] = await electron.ipcRenderer.invoke('sync-media-library') || [];
      const dirs = activeDirs !== undefined ? activeDirs : playerSyncedDirs;
      const dl = activeDownloadDir !== undefined ? activeDownloadDir : downloadDir;
      const validBases = [dl, ...dirs]
        .filter(Boolean)
        .map((d: string) => d.replace(/[\\/]/g, '/').toLowerCase());

      const filteredItems = validBases.length > 0
        ? items.filter(item => {
            const normP = item.path.replace(/[\\/]/g, '/').toLowerCase();
            return validBases.some(b => {
              const normB = b.endsWith('/') ? b.slice(0, -1) : b;
              return normP === normB || normP.startsWith(normB + '/');
            });
          })
        : items;

      // Prune missing files from the scan results during sync
      const prunedItems = await validateAndPruneItems(filteredItems);

      const { videos, audios } = categorizeMediaItems(prunedItems);
      // Cleanly replace items from active folders so removed ones disappear
      setSyncedVideos(videos);
      setSyncedAudios(audios);

      for (const item of prunedItems) {
        const dir = getParentDirectory(item.path);
        if (dir) {
          scannedDirsRef.current[dir] = Date.now();
        }
      }
    } catch (err) {
      console.error('[useMediaLibrary] syncAllFolders failed:', err);
    } finally {
      setPlayerSyncing(false);
    }
  }, [playerSyncedDirs, downloadDir, validateAndPruneItems]);

  // Periodic cleanup of scannedDirsRef cache
  useEffect(() => {
    const timer = setInterval(() => {
      const expiration = Date.now() - SYNC_COOLDOWN * 5;
      for (const path of Object.keys(scannedDirsRef.current)) {
        if (scannedDirsRef.current[path] < expiration) {
          delete scannedDirsRef.current[path];
        }
      }
    }, CLEANUP_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // ── 30-minute auto-validation for player playlist ─────────────────────────
  // Every 30 minutes, validate all in-memory playlist items against the filesystem.
  // Silently removes files that no longer exist on disk, keeping the playlist clean.
  useEffect(() => {
    const bridge = electron;
    if (!bridge) return;
    const timer = setInterval(async () => {
      const vids = syncedVideosRef.current;
      const auds = syncedAudiosRef.current;
      const allItems = [...vids, ...auds];
      if (allItems.length === 0) return;
      console.info(`[Player Library] Running 30-min auto-validation for ${allItems.length} items...`);
      const allPaths = allItems.map(i => i.path).filter(Boolean);
      try {
        const result = await bridge.ipcRenderer.invoke('validate-library-files', allPaths);
        if (!result || result.removed.length === 0) return;
        const removedSet = new Set<string>(result.removed.map((p: string) => p.toLowerCase().replace(/[\/]/g, '/')));
        const isGone = (item: MediaItem) => removedSet.has(item.path.toLowerCase().replace(/[\/]/g, '/'));
        setSyncedVideos(prev => prev.filter(i => !isGone(i)));
        setSyncedAudios(prev => prev.filter(i => !isGone(i)));
        setCurrentDirVideos(prev => prev.filter(i => !isGone(i)));
        setCurrentDirAudios(prev => prev.filter(i => !isGone(i)));
        console.info(`[Player Library] Auto-removed ${result.removed.length} missing item(s) from playlist`);
      } catch (e) {
        console.warn('[Player Library] 30-min validation failed:', e);
      }
    }, AUTO_VALIDATE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // IPC Event Listeners
  useEffect(() => {
    if (!electron) return;

    electron.ipcRenderer.invoke('get-downloads').then((list: any[]) => setDownloads(list));

    const handleDownloadsUpdated = (_event: any, list: any[]) => setDownloads(list);
    electron.ipcRenderer.on('downloads-updated', handleDownloadsUpdated);

    const handlePlayerOpenFile = (_event: any, { filePath, filename }: { filePath: string, filename?: string }) => {
      if (!filePath) return;
      const baseName = filename || filePath.split(/[\\/]/).pop() || filePath;
      const dir = getParentDirectory(filePath);
      delete scannedDirsRef.current[dir];
      setCurrentPath(filePath);
      setCurrentTitle(baseName);
      setCurrentTime(0);
      setDuration(0);
      setForceTranscode(false);
      onOpenFile?.(filePath, baseName);
    };
    electron.ipcRenderer.on('player-open-file', handlePlayerOpenFile);

    const handleSettingsChanged = (_event: any, newSettings: any) => {
      const curDownload = newSettings?.downloadDir || downloadDir;
      if (newSettings?.downloadDir) {
        setDownloadDir(newSettings.downloadDir);
        localStorage.setItem('player_downloadDir', newSettings.downloadDir);
      }
      const allowedDirs = Array.isArray(newSettings?.syncedFolders) ? newSettings.syncedFolders : [];
      setPlayerSyncedDirs(allowedDirs);
      
      // Prune items from removed folders immediately
      pruneItemsForAllowedDirs(allowedDirs, curDownload);
      scannedDirsRef.current = {};
      syncAllFolders(allowedDirs, curDownload);
    };

    const handleSyncedFoldersUpdated = (_event: any, folders: string[]) => {
      const allowedDirs = Array.isArray(folders) ? folders : [];
      setPlayerSyncedDirs(allowedDirs);
      pruneItemsForAllowedDirs(allowedDirs, downloadDir);
      scannedDirsRef.current = {};
      syncAllFolders(allowedDirs, downloadDir);
    };

    electron.ipcRenderer.on('settings-changed', handleSettingsChanged);
    electron.ipcRenderer.on('synced-folders-updated', handleSyncedFoldersUpdated);

    const handleLibrarySynced = (_event: any, items: MediaItem[]) => {
      if (Array.isArray(items)) {
        const validBases = [downloadDir, ...playerSyncedDirs]
          .filter(Boolean)
          .map((d: string) => d.replace(/[\\/]/g, '/').toLowerCase());
        const filteredItems = validBases.length > 0
          ? items.filter(item => {
              const normP = item.path.replace(/[\\/]/g, '/').toLowerCase();
              return validBases.some(b => {
                const normB = b.endsWith('/') ? b.slice(0, -1) : b;
                return normP === normB || normP.startsWith(normB + '/');
              });
            })
          : items;
        const categorized = categorizeMediaItems(filteredItems);
        setSyncedVideos(categorized.videos);
        setSyncedAudios(categorized.audios);
      }
    };
    electron.ipcRenderer.on('library-synced', handleLibrarySynced);

    // Auto-remove: when main process confirms a path was removed (manual or auto),
    // immediately purge it from React state so the playlist reflects reality.
    const handleMediaPathRemoved = (_event: any, { filePath }: { filePath: string; fileExists: boolean }) => {
      if (!filePath) return;
      const norm = filePath.toLowerCase().replace(/[\\/]/g, '/');
      setSyncedVideos(prev => prev.filter(item => item.path.toLowerCase().replace(/[\\/]/g, '/') !== norm));
      setSyncedAudios(prev => prev.filter(item => item.path.toLowerCase().replace(/[\\/]/g, '/') !== norm));
      setCurrentDirVideos(prev => prev.filter(item => item.path.toLowerCase().replace(/[\\/]/g, '/') !== norm));
      setCurrentDirAudios(prev => prev.filter(item => item.path.toLowerCase().replace(/[\\/]/g, '/') !== norm));
    };
    electron.ipcRenderer.on('media-path-removed', handleMediaPathRemoved);

    return () => {
      electron?.ipcRenderer.removeListener('downloads-updated', handleDownloadsUpdated);
      electron?.ipcRenderer.removeListener('player-open-file', handlePlayerOpenFile);
      electron?.ipcRenderer.removeListener('settings-changed', handleSettingsChanged);
      electron?.ipcRenderer.removeListener('synced-folders-updated', handleSyncedFoldersUpdated);
      electron?.ipcRenderer.removeListener('library-synced', handleLibrarySynced);
      electron?.ipcRenderer.removeListener('media-path-removed', handleMediaPathRemoved);
    };
  }, [setCurrentPath, setCurrentTitle, setCurrentTime, setDuration, setForceTranscode, setDownloadDir, syncAllFolders, onOpenFile, downloadDir, pruneItemsForAllowedDirs, playerSyncedDirs]);

  // Initial load of settings
  useEffect(() => {
    if (electron) {
      electron.ipcRenderer.invoke('get-settings').then(async (newSettings: any) => {
        const curDownload = newSettings?.downloadDir || downloadDir || localStorage.getItem('player_downloadDir') || '';
        if (newSettings?.downloadDir) {
          setDownloadDir(newSettings.downloadDir);
          localStorage.setItem('player_downloadDir', newSettings.downloadDir);
        }
        const allowedDirs = Array.isArray(newSettings?.syncedFolders) ? newSettings.syncedFolders : [];
        setPlayerSyncedDirs(allowedDirs);
        pruneItemsForAllowedDirs(allowedDirs, curDownload);
        setTimeout(() => syncAllFolders(allowedDirs, curDownload), 500);
      });
    }
  }, [setDownloadDir, syncAllFolders, downloadDir, pruneItemsForAllowedDirs]);

  // Synchronize folder expansion and tab classification based on current path
  useEffect(() => {
    if (!currentPath) return;
    const pathChanged = prevCurrentPathRef.current !== currentPath;
    prevCurrentPathRef.current = currentPath;

    const dir = getParentDirectory(currentPath);
    if (dir) {
      setPlayerExpandedFolders(prev => ({ ...prev, [dir]: true }));
    }

    const normDir = dir.replace(/[\\/]/g, '/').toLowerCase();
    const normDownloadDir = downloadDir ? downloadDir.replace(/[\\/]/g, '/').toLowerCase() : '';
    const isUnderDownloads = !!normDownloadDir && normDir === normDownloadDir;

    const fileExt = currentPath.split('.').pop()?.toLowerCase() || '';
    const isAudio = AUDIO_EXTENSIONS.includes('.' + fileExt);

    // When in Archive or Favourites (or playing an archived private item), do NOT redirect tabs!
    // The archive and favourites tabs act as dedicated filtered playlists.
    if (mediaSubTab === 'archive' || mediaSubTab === 'favourites' || (isItemArchived && isItemArchived(currentPath))) {
      if (dir) {
        queueSyncDirectory(dir, false);
      }
      return;
    }

    // When playing from Sendtray, do NOT redirect tabs — let user browse freely
    // while sendtray remains the active playlist. Check both the current tab AND
    // whether the playing file belongs to the sendtray.
    const normCur = currentPath.replace(/[\\/]/g, '/').toLowerCase();
    const isPlayingFromSendtray = sendTrayItems && sendTrayItems.length > 0 &&
      sendTrayItems.some(p => p.replace(/[\\/]/g, '/').toLowerCase() === normCur);
    if (sidebarTab === 'sendtray' || isPlayingFromSendtray) {
      if (dir) {
        queueSyncDirectory(dir, false);
      }
      return;
    }

    // Only switch the sidebarTab automatically when a new file was actually opened
    if (pathChanged) {
      if (isUnderDownloads) {
        setSidebarTab('primary');
        if (setPrimarySubTab) {
          setPrimarySubTab(isAudio ? 'audios' : 'videos');
        }
      } else {
        setSidebarTab(isAudio ? 'audios' : 'videos');
      }
    }

    if (dir) {
      queueSyncDirectory(dir, false);
    }
  }, [currentPath, downloadDir, setPlayerExpandedFolders, setSidebarTab, sidebarTab, sendTrayItems, setPrimarySubTab, queueSyncDirectory, mediaSubTab, isItemArchived]);

  const handleSyncClick = useCallback(async () => {
    if (playerSyncing) return;
    if (playerSyncedDirs.length === 0) {
      if (!electron) return;
      const selected = await electron.ipcRenderer.invoke('select-directory');
      if (!selected) return;
      const newDirs: string[] = [selected];
      setPlayerSyncedDirs(newDirs);
      await electron.ipcRenderer.invoke('save-settings', { syncedFolders: newDirs });
      queueSyncDirectory(selected, true);
    } else {
      await syncAllFolders();
    }
  }, [playerSyncing, playerSyncedDirs, queueSyncDirectory, syncAllFolders]);

  const syncDirectoryOnce = useCallback((dirPath: string) => {
    queueSyncDirectory(dirPath, false);
  }, [queueSyncDirectory]);

  /**
   * Remove a media item by file path from ALL in-memory state and localStorage.
   * This is the correct way to delete from playlist — updating React state so
   * the UI re-renders immediately without the removed item.
   */
  const removeMediaItem = useCallback((targetPath: string) => {
    if (!targetPath) return;
    const norm = targetPath.toLowerCase().replace(/[\\/]/g, '/');

    // Update syncedVideos state (and localStorage is updated via useEffect)
    setSyncedVideos(prev => prev.filter(item => item.path.toLowerCase().replace(/[\\/]/g, '/') !== norm));

    // Update syncedAudios state (and localStorage is updated via useEffect)
    setSyncedAudios(prev => prev.filter(item => item.path.toLowerCase().replace(/[\\/]/g, '/') !== norm));

    // Also update currentDirVideos and currentDirAudios for folder-mode playlists
    setCurrentDirVideos(prev => prev.filter(item => item.path.toLowerCase().replace(/[\\/]/g, '/') !== norm));
    setCurrentDirAudios(prev => prev.filter(item => item.path.toLowerCase().replace(/[\\/]/g, '/') !== norm));
  }, []);

  return {
    syncedVideos,
    syncedAudios,
    currentDirVideos,
    currentDirAudios,
    folderEffects,
    playerSyncing,
    playerSyncedDirs,
    downloads,
    scannedDirsRef,
    syncAllFolders,
    handleSyncClick,
    syncDirectoryOnce,
    removeMediaItem,
  };
}