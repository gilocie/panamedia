import { useEffect, useState, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import {
  Download, Pause, Play, Trash2, Plus, Settings, Folder,
  ExternalLink, Globe, CheckCircle2,
  AlertCircle, Loader2, Activity, PlayCircle,
  Search, Volume2, VolumeX, SkipForward, SkipBack,
  ChevronLeft, ChevronRight, FileText, Music, Film, Copy,
  List, RefreshCw, Maximize2, Minimize2, Info, Send, Tv,
  HelpCircle, CloudDownload, LayoutDashboard,
  Sparkles, ShieldCheck,
  Eye, EyeOff, KeyRound, Lock, Unlock, ShieldAlert, Check, X
} from 'lucide-react';
import playerBg from './assets/playerbg.jpg';
import { SpeedGraph } from './components/SpeedGraph';
import { SegmentVisualizer } from './components/SegmentVisualizer';
import { PlaylistSelector } from './components/PlaylistSelector';
import { SendToFlashModal } from './components/SendToFlashModal';
import { PanamediaPlayer } from './components/panamediaPlayer';
const DuplicatesPanel = lazy(() => import('./components/DuplicatesPanel').then(m => ({ default: m.DuplicatesPanel })));
import { AddStreamSiteModal, type NewStreamSiteData } from './components/AddStreamSiteModal';
import { hashPin, verifyPin } from './components/panamedia/utils/pinSecurity';
import { useDownloads } from './hooks/useDownloads';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSettings } from './hooks/useSettings';
import { useModals } from './hooks/useModals';
import { useLibrary } from './hooks/useLibrary';
import { useBrowser } from './hooks/useBrowser';
import { useArchive } from './hooks/useArchive';
import { useUpdater } from './hooks/useUpdater';
import { useMiniPlayer } from './hooks/useMiniPlayer';
import { useBinaryInstaller } from './hooks/useBinaryInstaller';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFormatPicker } from './hooks/useFormatPicker';
import { useToasts } from './hooks/useToasts';
import { HelpTab } from './features/HelpTab';
import { FormatPickerContent } from './components/FormatPickerContent';
import { PlayerErrorBoundary } from './components/PlayerErrorBoundary';
import { BinarySetupScreen } from './components/BinarySetupScreen';
import { isSocialOrPlatformUrl, getParentFolderName, getNormalizedName } from './utils/urlUtils';
import { extractWebviewStreamScript } from './utils/extractWebviewStreamScript';
import { useConverterState } from './hooks/useConverterState';
import { useDownloadFormatting } from './hooks/useDownloadFormatting';
import { useBulkDownloadActions } from './hooks/useBulkDownloadActions';
import { useAppDragDrop } from './hooks/useAppDragDrop';
import { useAddDownloadHandler } from './hooks/useAddDownloadHandler';
import { useFileOperations } from './hooks/useFileOperations';
import { useAppStartupListeners } from './hooks/useAppStartupListeners';
import { cleanStreamUrl, DEFAULT_STREAM_SITES, getSiteIcon } from './hooks/useStreamSites';

// Gain access to Electron IPC Renderer safely
const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export default function App() {
  const { mode, pathParam, titleParam } = (() => {
    let search = window.location.search;
    if (!search && window.location.hash.includes('?')) {
      search = '?' + window.location.hash.split('?')[1];
    }
    const params = new URLSearchParams(search);
    let m = params.get('mode');
    let p = params.get('path') || '';
    let t = params.get('title') || '';

    // If query string was not separated by ? in file URL, inspect href
    if (!m && window.location.href.includes('mode=player')) {
      try {
        const rawHref = window.location.href.replace(/\\/g, '/');
        const qIndex = rawHref.indexOf('?');
        if (qIndex !== -1) {
          const fallbackParams = new URLSearchParams(rawHref.slice(qIndex));
          m = fallbackParams.get('mode') || 'player';
          p = fallbackParams.get('path') || p;
          t = fallbackParams.get('title') || t;
        } else {
          m = 'player';
        }
      } catch (e) {
        m = 'player';
      }
    }
    return { mode: m, pathParam: p, titleParam: t };
  })();

  const { netSpeed, streamingPort } = useNetworkStatus();

  if (mode === 'player') {
    return (
      <PlayerErrorBoundary componentName="PanamediaPlayer">
        <PanamediaPlayer filePath={pathParam} title={titleParam} />
      </PlayerErrorBoundary>
    );
  }

  if (mode === 'converter') {
    return (
      <SendToFlashModal
        filePath="media"
        openConverterProDirectly
        onClose={() => electron?.ipcRenderer.send('window-close')}
      />
    );
  }

  const [activeTab, setActiveTab] = useState<'downloads' | 'queues' | 'settings' | 'integration' | 'browser'>('downloads');

  const { converterQueueCount, converterState } = useConverterState();

  //  Custom Hooks 
  const {
    downloads, setDownloads,
    selectedTaskId, setSelectedTaskId,
    searchQuery, setSearchQuery,
    selectedDownloadIds, setSelectedDownloadIds,
    extractProgress, setExtractProgress,
  } = useDownloads();

  const pauseDownload = (id: string) => {
    if (electron) electron.ipcRenderer.invoke('pause-download', id);
  };

  const resumeDownload = (id: string) => {
    if (electron) electron.ipcRenderer.invoke('resume-download', id);
  };

  const {
    appSettings, setAppSettings,
    settingsSubTab, setSettingsSubTab,
    updateSetting,
  } = useSettings();

  const {
    showAddModal, setShowAddModal,
    addUrl, setAddUrl,
    addFilename, setAddFilename,
    addSaveDir, setAddSaveDir,
    startImmediately, setStartImmediately,
    isYoutubeCheck, setIsYoutubeCheck,
    interceptedHeaders, setInterceptedHeaders,
    showFormatModal, setShowFormatModal,
    formatLoading, setFormatLoading,
    youtubeInfo, setYoutubeInfo,
    extractError, setExtractError,
    formatsSource, setFormatsSource,
    showPlaylistModal, setShowPlaylistModal,
    playlistLoading, setPlaylistLoading,
    playlistInfo, setPlaylistInfo,
    deleteConfirmTarget, setDeleteConfirmTarget,
    showClearHistoryModal, setShowClearHistoryModal,
    selectedFileDetails, setSelectedFileDetails,
    showFileDetailsModal, setShowFileDetailsModal,
    flashDriveTarget, setFlashDriveTarget,
    showAddSiteModal, setShowAddSiteModal,
    contextMenu, setContextMenu,
  } = useModals();

  const {
    rightPanelTab, setRightPanelTab,
    libraryFiles,
    libraryCategory, setLibraryCategory,
    librarySearch, setLibrarySearch,
    librarySortBy, setLibrarySortBy,
    librarySortOrder, setLibrarySortOrder,
    syncingLibrary,
    selectedLibraryPath, setSelectedLibraryPath,
    libraryViewMode, setLibraryViewMode,
    expandedFolders, setExpandedFolders,
    imgErrors, setImgErrors,
    duplicateDeletePaths, setDuplicateDeletePaths,
    expandedDupGroups, setExpandedDupGroups,
    syncLibrary,
    toggleDuplicateDelete,
  } = useLibrary();

  const {
    currentBrowserUrl,
    urlInput, setUrlInput,
    isWebviewLoading, setIsWebviewLoading,
    isDetectingStream, setIsDetectingStream,
    streamSites, setStreamSites,
    webviewRef,
    navigateBrowser, deleteStreamSite,
    setWebviewRef,
    setBrowserScreenActive,
  } = useBrowser();

  // The embedded browser keeps its webview mounted across tabs. Stop hidden
  // page media and its periodic ad-skip work until the Stream screen is active.
  useEffect(() => {
    setBrowserScreenActive(activeTab === 'browser');
  }, [activeTab, setBrowserScreenActive]);

  // Full view & Tab lock security states
  const [isBrowserFullView, setIsBrowserFullView] = useState<boolean>(false);
  const [unlockedStreamUrls, setUnlockedStreamUrls] = useState<Set<string>>(() => new Set());
  const [siteToUnlock, setSiteToUnlock] = useState<any | null>(null);
  const [unlockPinInput, setUnlockPinInput] = useState<string>('');
  const [showUnlockPin, setShowUnlockPin] = useState<boolean>(false);
  const [unlockPinError, setUnlockPinError] = useState<string>('');
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [siteToEdit, setSiteToEdit] = useState<any | null>(null);
  const [streamTabContextMenu, setStreamTabContextMenu] = useState<{ x: number; y: number; site: any } | null>(null);

  // Listen for external browser links shared to Panamedia via protocol / CLI
  useEffect(() => {
    if (!electron) return;
    const handleExternalUrl = (_event: any, url: string) => {
      if (url && typeof url === 'string') {
        setActiveTab('browser');
        navigateBrowser(url);
      }
    };
    try {
      electron.ipcRenderer.on('open-external-stream-url', handleExternalUrl);
    } catch (e) {
      console.warn('[IPC] open-external-stream-url error:', e);
    }
    return () => {
      try {
        electron.ipcRenderer.removeListener('open-external-stream-url', handleExternalUrl);
      } catch (e) { }
    };
  }, [navigateBrowser]);

  // Close stream tab context menu when clicking anywhere
  useEffect(() => {
    const handleGlobalClick = () => setStreamTabContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Site Tab Password Reset & Management states in Settings -> Privacy & Security
  const [siteToResetPin, setSiteToResetPin] = useState<any | null>(null);
  const [siteResetLockType, setSiteResetLockType] = useState<'archive' | 'custom'>('custom');
  const [siteResetNewPin, setSiteResetNewPin] = useState<string>('');
  const [siteResetConfirmPin, setSiteResetConfirmPin] = useState<string>('');
  const [siteResetShowPin, setSiteResetShowPin] = useState<boolean>(false);
  const [siteResetFeedback, setSiteResetFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [siteToUnlockConfirm, setSiteToUnlockConfirm] = useState<any | null>(null);
  const [settingsPinTarget, setSettingsPinTarget] = useState<string>('archive');

  const handleQuickLockTab = (site: any) => {
    if (site.isLocked) {
      if (unlockedStreamUrls.has(site.url)) {
        setUnlockedStreamUrls((prev: Set<string>) => {
          const next = new Set(prev);
          next.delete(site.url);
          return next;
        });
        addToast(`${site.name} tab is now locked.`);
        try {
          const host = new URL(site.url).hostname.replace('www.', '').toLowerCase();
          if (currentBrowserUrl.toLowerCase().includes(host)) {
            setSiteToUnlock(site);
          }
        } catch (e) {}
      }
      setStreamTabContextMenu(null);
      return;
    }

    const masterPin = settingsArchivePin || localStorage.getItem('player_archive_pin');
    const existingCustomSite = streamSites.find((s: any) => s.isLocked && s.lockType === 'custom' && s.customPin);

    let updatedSite: any = null;
    if (masterPin) {
      updatedSite = { ...site, isLocked: true, lockType: 'archive' };
    } else if (existingCustomSite) {
      updatedSite = { ...site, isLocked: true, lockType: 'custom', customPin: existingCustomSite.customPin };
    }

    if (updatedSite) {
      const nextSites = streamSites.map((s: any) => s.url === site.url ? updatedSite : s);
      setStreamSites(nextSites);
      try { localStorage.setItem('stream_sites', JSON.stringify(nextSites)); } catch (e) {}
      setUnlockedStreamUrls((prev: Set<string>) => {
        const next = new Set(prev);
        next.delete(site.url);
        return next;
      });
      addToast(`${site.name} locked using your set passcode.`);
      try {
        const host = new URL(site.url).hostname.replace('www.', '').toLowerCase();
        if (currentBrowserUrl.toLowerCase().includes(host)) {
          setSiteToUnlock(updatedSite);
        }
      } catch (e) {}
    } else {
      setSiteToEdit({ ...site, isLocked: true });
      setShowAddSiteModal(true);
    }
    setStreamTabContextMenu(null);
  };

  const handleOpenResetSitePin = (site: any) => {
    setSiteToResetPin(site);
    setSiteResetLockType(site.lockType || (site.customPin ? 'custom' : 'archive'));
    setSiteResetNewPin('');
    setSiteResetConfirmPin('');
    setSiteResetShowPin(false);
    setSiteResetFeedback(null);
  };

  const handleSaveSitePinReset = async () => {
    if (!siteToResetPin) return;
    setSiteResetFeedback(null);

    if (siteResetLockType === 'custom') {
      const pin = siteResetNewPin.trim();
      if (!pin || pin.length < 4) {
        setSiteResetFeedback({ type: 'error', text: 'Password or PIN must be at least 4 characters.' });
        return;
      }
      if (pin !== siteResetConfirmPin.trim()) {
        setSiteResetFeedback({ type: 'error', text: 'Passwords do not match. Please re-enter.' });
        return;
      }
      try {
        const hashed = await hashPin(pin);
        setStreamSites((prev: any[]) => {
          const next = prev.map((s: any) => {
            if (s.url === siteToResetPin.url) {
              return {
                ...s,
                isLocked: true,
                lockType: 'custom',
                customPin: hashed
              };
            }
            return s;
          });
          try { localStorage.setItem('stream_sites', JSON.stringify(next)); } catch (e) { }
          return next;
        });
        setSiteResetFeedback({ type: 'success', text: `Successfully updated password for "${siteToResetPin.name}"!` });
        setTimeout(() => {
          setSiteToResetPin(null);
        }, 1100);
      } catch {
        setSiteResetFeedback({ type: 'error', text: 'Failed to securely encrypt PIN.' });
      }
    } else {
      // Switched to Master Archive PIN
      setStreamSites((prev: any[]) => {
        const next = prev.map((s: any) => {
          if (s.url === siteToResetPin.url) {
            return {
              ...s,
              isLocked: true,
              lockType: 'archive',
              customPin: undefined
            };
          }
          return s;
        });
        try { localStorage.setItem('stream_sites', JSON.stringify(next)); } catch (e) { }
        return next;
      });
      setSiteResetFeedback({ type: 'success', text: `"${siteToResetPin.name}" is now secured using the Master Archive PIN!` });
      setTimeout(() => {
        setSiteToResetPin(null);
      }, 1100);
    }
  };

  const handleRemoveSiteLock = (site: any) => {
    setStreamSites((prev: any[]) => {
      const next = prev.map((s: any) => {
        if (s.url === site.url) {
          return {
            ...s,
            isLocked: false,
            customPin: undefined
          };
        }
        return s;
      });
      try { localStorage.setItem('stream_sites', JSON.stringify(next)); } catch (e) { }
      return next;
    });
    setSiteToUnlockConfirm(null);
  };

  // Archive + PIN 
  const {
    archivePaths: _archivePaths, setArchivePaths,
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
  } = useArchive();


  //  Updater 
  const {
    showReleaseDialog, setShowReleaseDialog,
    releaseCheckStatus, setReleaseCheckStatus,
    latestReleaseVersion,
    releaseDownloadUrl: _releaseDownloadUrl,
    updateDownloadProgress,
    updateDownloadedBytes,
    updateTotalBytes,
    updateInstallerPath: _updateInstallerPath,
    updateError,
    releaseNotes,
    checkReleaseUpdate,
    startUpdateDownload,
    installUpdate,
    compareVersions,
  } = useUpdater();


  // App-level constants 
  const APP_VERSION = '1.0.1';
  const [helpSubTab, setHelpSubTab] = useState<'guide' | 'license'>('guide');
  const [browserUrl] = useState('https://www.youtube.com');


  const {
    downloadsTableRef,
    setDownloadsTableRef,
    formatBytes,
    formatSpeed,
    formatEta,
    getPercentage,
  } = useDownloadFormatting();



  // Clear History Modal state
  // Context Menu state
  // Mini-player state (when player window is minimized to sidebar)

  const {
    miniPlayerState, setMiniPlayerState,
    miniPlayerHovered, setMiniPlayerHovered,
    miniThumbError, setMiniThumbError,
    miniVideoRef,
  } = useMiniPlayer();

  const handleRestorePlayerFromMini = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const curTime = miniVideoRef.current ? miniVideoRef.current.currentTime : undefined;
    if (miniVideoRef.current) {
      try { miniVideoRef.current.pause(); } catch (err) { }
    }
    electron?.ipcRenderer.invoke('player-restore', curTime);
  }, [miniVideoRef]);

  // Real-time network speed (provided by useNetworkStatus above) 


  //  Format Picker + Playlist 
  const { fetchFormats, handleCloseFormatsModal, handleDownloadPlaylist } = useFormatPicker({
    setIsYoutubeCheck, setAddUrl, setFormatLoading, setExtractError,
    setExtractProgress, setShowFormatModal, setYoutubeInfo,
    setShowAddModal,
    setFormatsSource: setFormatsSource as (v: 'add_modal' | 'browser' | null) => void,
    formatsSource,
    setShowPlaylistModal, setPlaylistLoading, setPlaylistInfo,
  });







  const {
    handleToggleSelect,
    handleToggleSelectAll,
    handleBulkPause,
    handleBulkResume,
    handleBulkDelete,
    handleClearHistory,
  } = useBulkDownloadActions({
    downloads,
    selectedDownloadIds,
    setSelectedDownloadIds,
    setSelectedTaskId,
    setDeleteConfirmTarget,
    setDownloads,
    setShowClearHistoryModal,
    syncLibrary,
  });

  // YouTube Playlist modal state is provided by useModals() above

  // Application Settings (provided by useSettings hook)

  // Binary Installer 
  const {
    binariesInstalled,
    installingBinaries,
    installProgress,
    startInstall: handleInstallBinaries,
    pauseInstall: handlePauseBinaries,
    resumeInstall: handleResumeBinaries,
    cancelInstall: handleCancelInstall,
  } = useBinaryInstaller();

  //  Toast Notifications 
  const { toasts, addToast } = useToasts();


  // resolveDuplicate was removed — duplicate resolution is handled via handleResolveDuplicates (physical delete)

  const {
    performDeleteFile,
    handleResolveDuplicates,
    deleteDownload,
    openFile,
    openFolder,
  } = useFileOperations({
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
  });

  useAppStartupListeners({
    setDownloads,
    setAppSettings,
    setAddSaveDir,
    syncLibrary,
    setAddUrl,
    setAddFilename,
    setIsYoutubeCheck,
    setInterceptedHeaders,
    setShowAddModal,
    addToast,
  });

  // ─── Keyboard Shortcuts + Context Menu ─────────────────────────────────────
  useKeyboardShortcuts({
    selectedLibraryPath,
    selectedTaskId,
    downloads,
    setFlashDriveTarget,
    setContextMenu,
  });


  // Keyboard listener for Backspace/Delete key to delete file selected in library
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
          return;
        }

        if (selectedLibraryPath) {
          e.preventDefault();
          // Find file details
          const fileToDelete = libraryFiles.find(f => f.path === selectedLibraryPath) ||
            downloads
              .filter(t => t.status === 'completed')
              .map(t => ({
                name: t.filename,
                path: t.saveDir + '\\' + t.filename,
              })).find(f => f.path === selectedLibraryPath);

          if (!fileToDelete) return;

          setDeleteConfirmTarget({
            type: 'file',
            title: 'Delete File from Disk',
            message: `Are you sure you want to permanently delete "${fileToDelete.name}" from disk?`,
            filePath: fileToDelete.path,
            onConfirm: async () => {
              const res = await performDeleteFile(fileToDelete.path);
              if (res && !res.success) {
                alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
              }
            }
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLibraryPath, libraryFiles, downloads]);

  const handleContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedLibraryPath(filePath);
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true, type: 'file', targetPath: filePath });
  };

  const { handleAppDragOver, handleAppDrop } = useAppDragDrop();

  const {
    handleAddDownload,
    handleBrowseDir,
    handleSettingsBrowseDir,
    handleConfirmPlaylist,
  } = useAddDownloadHandler({
    addUrl,
    addFilename,
    addSaveDir,
    startImmediately,
    isYoutubeCheck,
    interceptedHeaders,
    appSettings,
    setShowAddModal,
    setAddUrl,
    setAddFilename,
    setInterceptedHeaders,
    setActiveTab,
    setFormatsSource: setFormatsSource as (src: 'add_modal' | 'browser' | null) => void,
    fetchFormats,
    handleDownloadPlaylist,
    setAddSaveDir,
    setAppSettings,
    setShowPlaylistModal,
    setPlaylistInfo,
  });

  const handleRegisterBrowserIntegration = async () => {
    if (!electron) return;
    const res = await electron.ipcRenderer.invoke('install-browser-integration');
    if (res.success) {
      alert('Browser integration registered successfully! You can now load the extension in Chrome.');
    } else {
      alert('Failed to register integration: ' + res.error);
    }
  };

  useEffect(() => {
    if (binariesInstalled) {
      syncLibrary();
    }
  }, [binariesInstalled, appSettings.downloadDir]);

  // When selectedTaskId changes, auto-switch to details tab in right panel
  useEffect(() => {
    if (selectedTaskId) {
      setRightPanelTab('details');
    }
  }, [selectedTaskId]);

  // Active download count for smart filtering (excluding archived items)
  const activeDownloadCount = useMemo(() => downloads.filter(t => {
    const fullPath = t.saveDir ? `${t.saveDir}\\${t.filename}` : t.filename;
    return !isItemArchived(fullPath) &&
      ['downloading', 'merging', 'preparing', 'compressing'].includes(t.status);
  }).length, [downloads, isItemArchived]);

  // Filter downloads: when >10 active, show only active ones; otherwise show all matching search (excluding archived items)
  const filteredDownloads = useMemo(() => downloads.filter(t => {
    const fullPath = t.saveDir ? `${t.saveDir}\\${t.filename}` : t.filename;
    if (isItemArchived(fullPath)) return false;
    const matchesSearch = t.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.url.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeDownloadCount > 10) {
      return matchesSearch && ['downloading', 'merging', 'preparing', 'compressing'].includes(t.status);
    }
    return matchesSearch;
  }), [downloads, searchQuery, activeDownloadCount, isItemArchived]);

  // Library file list: hoisted filter + sort so that progress/status re-renders
  // (which can happen ~2x/sec during conversions/downloads) no longer re-filter
  // and re-sort thousands of entries on the main thread on every single pass.
  const libraryFilteredItems = useMemo(() => {
    const rawItems = libraryCategory === 'recent'
      ? downloads
        .filter(t => {
          const fullPath = t.saveDir ? `${t.saveDir}\\${t.filename}` : t.filename;
          return t.status === 'completed' && !isItemArchived(fullPath);
        })
        .map(t => {
          const ext = '.' + (t.filename.split('.').pop() || '').toLowerCase();
          return {
            name: t.filename,
            path: t.saveDir + '\\' + t.filename,
            size: t.totalBytes,
            displaySize: t.isYoutube && t.displaySize ? t.displaySize : null,
            mtime: t.addedAt || Date.now(),
            category: 'recent',
            ext: ext
          };
        })
      : libraryFiles.filter(f => {
        if (isItemArchived(f.path)) return false;
        if (f.category !== libraryCategory) return false;
        if (libraryCategory === 'videos' || libraryCategory === 'audios') {
          if (appSettings.downloadDir) {
            const itemDir = (f.path.substring(0, f.path.lastIndexOf('\\')) || f.path.substring(0, f.path.lastIndexOf('/'))).replace(/[\\/]/g, '/').toLowerCase();
            const primaryDir = appSettings.downloadDir.replace(/[\\/]/g, '/').toLowerCase();
            if (itemDir === primaryDir) return false;
          }
        }
        return true;
      });

    return rawItems
      .filter(f => f.name.toLowerCase().includes(librarySearch.toLowerCase()))
      .sort((a, b) => {
        let comp = 0;
        if (librarySortBy === 'name') comp = a.name.localeCompare(b.name);
        else if (librarySortBy === 'date') comp = (a.mtime || 0) - (b.mtime || 0);
        else if (librarySortBy === 'size') comp = (a.size || 0) - (b.size || 0);
        return librarySortOrder === 'asc' ? comp : -comp;
      });
  }, [libraryCategory, downloads, isItemArchived, libraryFiles,
      appSettings.downloadDir, librarySearch, librarySortBy, librarySortOrder]);

  const libraryListRef = useRef<HTMLDivElement>(null);
  // Virtualizer for the library file-list view: only the rows near the visible
  // viewport are in the DOM, so a 4,000-file library renders ~15 row nodes
  // instead of 4,000, and stops re-rendering thousands on every state change.
  const libraryVirtualizer = useVirtualizer({
    count: libraryFilteredItems.length,
    getScrollElement: () => libraryListRef.current,
    estimateSize: () => 88,
    overscan: 8,
    gap: 6,
  });

  // Virtualizer for downloads table — only renders visible rows
  const downloadsVirtualizer = useVirtualizer({
    count: filteredDownloads.length,
    getScrollElement: () => downloadsTableRef.current,
    estimateSize: () => 49,  // matches td padding: 12px top+bottom + ~25px content
    overscan: 5,
  });

  const selectedTask = downloads.find(t => t.id === selectedTaskId);

  // First run binary downloader screen
  if (!binariesInstalled) {
    return (
      <BinarySetupScreen
        installingBinaries={installingBinaries}
        installProgress={installProgress}
        onInstall={handleInstallBinaries}
        onResume={handleResumeBinaries}
        onPause={handlePauseBinaries}
        onCancel={handleCancelInstall}
      />
    );
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          const file = files[0];
          const filePath = (file as any).path;
          if (filePath) {
            electron?.ipcRenderer.invoke('open-player-window', { filePath, filename: file.name });
          }
        }
      }}
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundImage: `linear-gradient(rgba(7, 7, 10, 0.65), rgba(7, 7, 10, 0.65)), url(${playerBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >

      {/* Title Bar (Frameless window draggable) */}
      <div className="titlebar">
        <div className="titlebar-logo" style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.1, WebkitAppRegion: 'drag' } as any}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '13px' }}>
            <img
              src="favicon.svg"
              style={{ width: '16px', height: '16px', objectFit: 'contain', filter: 'drop-shadow(0 0 4px var(--primary))' }}
              alt=""
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'player.ico'; }}
            /> Panamedia
          </div>
          <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 'normal', paddingLeft: '22px' }}>All in One media manager</span>
        </div>

        {/* Help Center and New Release Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px', marginLeft: 'auto', WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => {
              setActiveTab('help' as any);
              setHelpSubTab('guide');
            }}
            className="btn-secondary"
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '600',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === ('help' as any) ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              borderColor: activeTab === ('help' as any) ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
              color: '#fff',
              cursor: 'pointer',
              height: '24px',
              boxSizing: 'border-box'
            }}
          >
            <HelpCircle size={11} />
            Help Center
          </button>
          <button
            onClick={() => {
              if (releaseCheckStatus === 'download-complete') {
                installUpdate();
              } else if (releaseCheckStatus === 'update-available' || releaseCheckStatus === 'downloading') {
                setShowReleaseDialog(true);
              } else {
                checkReleaseUpdate(true);
              }
            }}
            className="btn-primary"
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '700',
              borderRadius: '6px',
              background: releaseCheckStatus === 'update-available' || releaseCheckStatus === 'downloading'
                ? 'linear-gradient(135deg, #a855f7, #6366f1)'
                : releaseCheckStatus === 'download-complete'
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : releaseCheckStatus === 'checking'
                    ? 'linear-gradient(135deg, #059669, #10b981)'
                    : '#10b981',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              height: '24px',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: releaseCheckStatus === 'update-available' || releaseCheckStatus === 'downloading'
                ? '0 0 12px rgba(168, 85, 247, 0.4)'
                : releaseCheckStatus === 'download-complete'
                  ? '0 0 12px rgba(16, 185, 129, 0.4)'
                  : releaseCheckStatus === 'checking'
                    ? '0 0 12px rgba(16, 185, 129, 0.45)'
                    : '0 0 10px rgba(16, 185, 129, 0.3)'
            }}
            title={
              releaseCheckStatus === 'checking'
                ? 'Checking for new releases...'
                : releaseCheckStatus === 'update-available'
                  ? `Update v${latestReleaseVersion} available!`
                  : releaseCheckStatus === 'download-complete'
                    ? 'Update ready to install'
                    : 'Check for new releases'
            }
          >
            {releaseCheckStatus === 'checking' ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Checking updates...
              </>
            ) : releaseCheckStatus === 'installing' ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Installing...
              </>
            ) : releaseCheckStatus === 'downloading' ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Downloading...
              </>
            ) : releaseCheckStatus === 'update-available' ? (
              <>
                <CloudDownload size={11} />
                Update v{latestReleaseVersion}
              </>
            ) : releaseCheckStatus === 'download-complete' ? (
              <>
                <CheckCircle2 size={11} />
                Install Update
              </>
            ) : (
              <>
                <CheckCircle2 size={11} />
                New Release
              </>
            )}
          </button>
        </div>
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={() => electron?.ipcRenderer.send('window-minimize')}>
            <svg viewBox="0 0 10 1" width="10" height="1"><line x1="0" y1="0" x2="10" y2="0" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
          <button className="titlebar-btn" onClick={() => electron?.ipcRenderer.send('window-maximize')}>
            <svg viewBox="0 0 10 10" width="10" height="10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <button className="titlebar-btn close" onClick={() => electron?.ipcRenderer.send('window-close')}>
            <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1,1 L9,9 M9,1 L1,9" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="app-container" onDragOver={handleAppDragOver} onDrop={handleAppDrop}>

        {/* Sidebar Nav */}
        <div className="sidebar">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            {(() => {
              const activeCount = downloads.filter(t =>
                ['downloading', 'merging', 'preparing', 'compressing'].includes(t.status)
              ).length;
              const queuedCount = downloads.filter(t => t.status === 'queued').length;
              return (
                <>
                  <div
                    className={`sidebar-item ${activeTab === 'downloads' ? 'active' : ''}`}
                    onClick={() => setActiveTab('downloads')}
                    style={{ position: 'relative' }}
                  >
                    <LayoutDashboard /> Dashboard
                    <span style={{
                      marginLeft: 'auto',
                      background: activeCount > 0
                        ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                        : 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontSize: '9px',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      minWidth: '18px',
                      textAlign: 'center',
                      animation: activeCount > 0 ? 'pulse 1.5s ease-in-out infinite' : 'none',
                      boxShadow: activeCount > 0 ? '0 0 8px rgba(245,158,11,0.5)' : 'none',
                      transition: 'all 0.3s'
                    }}>
                      {activeCount}
                    </span>
                  </div>
                  <div
                    className={`sidebar-item ${activeTab === 'queues' ? 'active' : ''}`}
                    onClick={() => setActiveTab('queues')}
                  >
                    <PlayCircle /> Queue Manager
                    {queuedCount > 0 && (
                      <span style={{
                        marginLeft: 'auto',
                        background: 'rgba(99,102,241,0.2)',
                        color: 'var(--primary)',
                        fontSize: '9px',
                        fontWeight: '700',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        border: '1px solid rgba(99,102,241,0.3)'
                      }}>
                        {activeCount}/{activeCount + queuedCount}
                      </span>
                    )}
                  </div>
                </>
              );
            })()}

            <div
              className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings /> Settings
            </div>
            {/* Hiding Browser Integration as requested */}
            {/*
            <div
              className={`sidebar-item ${activeTab === 'integration' ? 'active' : ''}`}
              onClick={() => setActiveTab('integration')}
            >
              <Globe /> Browser Integration
            </div>
            */}
            <div
              className={`sidebar-item ${activeTab === 'browser' ? 'active' : ''}`}
              onClick={() => setActiveTab('browser')}
            >
              <Download /> Download
            </div>
            <div
              className="sidebar-item"
              onClick={() => {
                electron?.ipcRenderer.invoke('open-player-window', { filePath: '', filename: 'Panamedia Player' })
                  .catch((error: unknown) => console.error('Failed to open Player:', error));
              }}
              title="Open Panamedia Player in its own window"
            >
              <Tv /> Player
            </div>
            {(() => {
              const isConverterConverting = Boolean(converterState?.converting);
              const isConverterPaused = Boolean(converterState?.isPaused);
              const activeConverterQueueCount = converterState?.queueCount !== undefined && converterState.queueCount !== null
                ? Math.max(converterQueueCount, converterState.queueCount)
                : converterQueueCount;
              const hasConverterActiveProject = activeConverterQueueCount > 0 || isConverterConverting;

              return (
                <div
                  className={`sidebar-item ${hasConverterActiveProject ? 'sidebar-item--converter-active' : ''}`}
                  onClick={() => {
                    electron?.ipcRenderer.invoke('open-converter-window')
                      .catch((error: unknown) => console.error('Failed to open Converter Pro:', error));
                  }}
                  title={
                    isConverterConverting
                      ? `Converter Pro: Conversion in progress (${activeConverterQueueCount} item${activeConverterQueueCount === 1 ? '' : 's'})`
                      : activeConverterQueueCount > 0
                        ? `Converter Pro: ${activeConverterQueueCount} pending item${activeConverterQueueCount === 1 ? '' : 's'} queued`
                        : 'Open Converter Pro in its own window'
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative',
                    cursor: 'pointer',
                    ...(hasConverterActiveProject ? {
                      background: isConverterConverting
                        ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.28) 0%, rgba(99, 102, 241, 0.25) 100%)'
                        : isConverterPaused
                          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.2) 100%)'
                          : 'linear-gradient(135deg, rgba(99, 102, 241, 0.26) 0%, rgba(6, 182, 212, 0.2) 100%)',
                      border: isConverterConverting
                        ? '1px solid rgba(6, 182, 212, 0.7)'
                        : isConverterPaused
                          ? '1px solid rgba(245, 158, 11, 0.7)'
                          : '1px solid rgba(99, 102, 241, 0.65)',
                      color: '#fff',
                      animation: isConverterPaused
                        ? 'converterMenuBlinkAmber 1.6s ease-in-out infinite'
                        : 'converterMenuBlink 1.4s ease-in-out infinite',
                    } : {})
                  }}
                >
                  <Sparkles
                    size={18}
                    style={{
                      color: isConverterConverting
                        ? '#67e8f9'
                        : isConverterPaused
                          ? '#fbbf24'
                          : hasConverterActiveProject
                            ? '#a5b4fc'
                            : 'inherit',
                      filter: hasConverterActiveProject ? 'drop-shadow(0 0 6px rgba(6,182,212,0.65))' : 'none',
                      transition: 'color 0.2s ease',
                      flexShrink: 0
                    }}
                  />
                  <span style={{ fontWeight: hasConverterActiveProject ? 700 : 500 }}>Converter</span>
                  {hasConverterActiveProject && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        background: isConverterConverting
                          ? 'rgba(6, 182, 212, 0.25)'
                          : isConverterPaused
                            ? 'rgba(245, 158, 11, 0.25)'
                            : 'rgba(99, 102, 241, 0.28)',
                        color: isConverterConverting
                          ? '#67e8f9'
                          : isConverterPaused
                            ? '#fef3c7'
                            : '#c7d2fe',
                        fontSize: '9.5px',
                        fontWeight: 800,
                        letterSpacing: '0.4px',
                        padding: '2px 7px',
                        borderRadius: '10px',
                        border: isConverterConverting
                          ? '1px solid rgba(6, 182, 212, 0.6)'
                          : isConverterPaused
                            ? '1px solid rgba(245, 158, 11, 0.6)'
                            : '1px solid rgba(99, 102, 241, 0.5)',
                        whiteSpace: 'nowrap',
                        boxShadow: isConverterConverting
                          ? '0 0 8px rgba(6, 182, 212, 0.4)'
                          : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isConverterConverting && !isConverterPaused && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#67e8f9',
                            boxShadow: '0 0 6px #67e8f9',
                            display: 'inline-block',
                            animation: 'pulse 1s infinite'
                          }}
                        />
                      )}
                      {isConverterConverting
                        ? (converterState?.progress && converterState.progress > 0
                          ? `${converterState.progress}%`
                          : `${activeConverterQueueCount} active`)
                        : isConverterPaused
                          ? 'PAUSED'
                          : `${activeConverterQueueCount}`}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Live Network Speed Widget — always visible in sidebar footer */}
          <div className="glass-panel" style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(10, 10, 16, 0.6)',
            border: '1px solid rgba(99,102,241,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Internet Speed</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} style={{ color: netSpeed > 100 * 1024 ? '#22c55e' : netSpeed > 0 ? '#f59e0b' : 'var(--text-dark)', flexShrink: 0 }} />
              <span style={{
                fontSize: '15px',
                fontWeight: 'bold',
                fontFamily: 'var(--font-title)',
                color: netSpeed > 100 * 1024 ? '#22c55e' : netSpeed > 0 ? '#f59e0b' : 'var(--text-muted)'
              }}>
                {netSpeed > 0 ? formatSpeed(netSpeed) : '0 B/s'}
              </span>
            </div>
            {downloads.some(t => t.status === 'downloading') && (
              <div style={{ fontSize: '9px', color: 'var(--primary)', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }} />
                Downloading {downloads.filter(t => t.status === 'downloading').length} file(s)
              </div>
            )}
          </div>

          {/* Mini-Player Widget (shown when player is minimized to sidebar) */}
          {miniPlayerState && miniPlayerState.minimized && (
            <div
              onMouseEnter={() => setMiniPlayerHovered(true)}
              onMouseLeave={() => setMiniPlayerHovered(false)}
              style={{
                position: 'relative',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(15, 15, 22, 0.6)',
                backdropFilter: 'blur(16px)',
                overflow: 'hidden',
                cursor: 'default',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: miniPlayerHovered ? '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(99, 102, 241, 0.2)' : '0 4px 12px rgba(0,0,0,0.3)',
                transform: miniPlayerHovered ? 'translateY(-2px)' : 'none'
              }}
            >
              {/* Media Preview Container (Clickable to Restore) */}
              <div
                onClick={handleRestorePlayerFromMini}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '110px',
                  background: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'pointer'
                }}
                title="Click to restore player window"
              >
                {(() => {
                  const isMiniAudioFile = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'opus', 'wma'].some(ext => miniPlayerState.filename?.toLowerCase().endsWith(ext));
                  // Try to find a thumbnail from the downloads list
                  const miniMatchedTask = downloads.find(t =>
                    t.filename === miniPlayerState.filename ||
                    (miniPlayerState.filePath && miniPlayerState.filePath.endsWith(t.filename))
                  );
                  const miniThumb = miniMatchedTask?.thumbnail ||
                    (miniPlayerState.filePath
                      ? `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(miniPlayerState.filePath)}`
                      : null);

                  const displayMiniThumb = (!miniThumbError && miniThumb) ? miniThumb : playerBg;

                  if (isMiniAudioFile) {
                    return (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        {/* Hidden image to track thumbnail load errors */}
                        {miniThumb && !miniThumbError && (
                          <img
                            src={miniThumb}
                            alt=""
                            style={{ display: 'none' }}
                            onError={() => setMiniThumbError(true)}
                          />
                        )}
                        {/* Blurred background art */}
                        {displayMiniThumb && (
                          <img
                            src={displayMiniThumb}
                            alt=""
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              filter: 'blur(16px) brightness(0.25) saturate(1.6)',
                              opacity: 0.9
                            }}
                          />
                        )}
                        {/* Spinning vinyl disc with cover art */}
                        <div
                          className={miniPlayerState.playing ? 'spinning' : 'spinning spinning-paused'}
                          style={{
                            position: 'relative',
                            width: '72px',
                            height: '72px',
                            borderRadius: '50%',
                            border: '3px solid rgba(255,255,255,0.12)',
                            background: `url("${displayMiniThumb}") center/cover no-repeat`,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.7), 0 0 16px rgba(168, 85, 247, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2
                          }}
                        >
                          {/* Center hole */}
                          <div style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: 'rgba(9, 9, 14, 0.92)',
                            border: '2px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {displayMiniThumb === playerBg && <Music size={8} style={{ color: 'rgba(255,255,255,0.6)' }} />}
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <video
                        ref={miniVideoRef}
                        src={`http://127.0.0.1:${streamingPort}/stream?path=${encodeURIComponent(miniPlayerState.filePath)}`}
                        muted
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    );
                  }
                })()}

              </div>

              {/* Title & Status row + Interactive Controls - ALWAYS visible */}
              <div style={{ padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flex: 1, marginRight: '6px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--primary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {miniPlayerState.playing ? '▶ Now Playing' : '⏸ Paused'}
                    </span>
                    <span style={{ fontSize: '10px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' }} title={miniPlayerState.filename}>
                      {miniPlayerState.filename}
                    </span>
                  </div>
                  {/* Close button only */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMiniPlayerState(null);
                      electron?.ipcRenderer.send('player-control-close');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255,255,255,0.6)',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Close Player"
                  >
                    <Trash2 size={11} style={{ color: 'var(--danger)' }} />
                  </button>
                </div>

                {/* Always-visible Mini Controls: 5 compact buttons fitting 100% of width */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '3px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: '6px',
                  width: '100%',
                  boxSizing: 'border-box'
                }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.send('player-remote-command', 'prev'); }}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
                    title="Previous"
                  >
                    <SkipBack size={10} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextPlaying = !miniPlayerState.playing;
                      if (nextPlaying) {
                        miniVideoRef.current?.play().catch(() => { });
                        electron?.ipcRenderer.send('player-remote-command', 'play');
                      } else {
                        miniVideoRef.current?.pause();
                        electron?.ipcRenderer.send('player-remote-command', 'pause');
                      }
                      setMiniPlayerState(prev => prev ? { ...prev, playing: nextPlaying } : null);
                    }}
                    style={{ background: 'var(--primary)', border: 'none', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
                    title={miniPlayerState.playing ? 'Pause' : 'Play'}
                  >
                    {miniPlayerState.playing ? <Pause size={10} /> : <Play size={10} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.send('player-remote-command', 'next'); }}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
                    title="Next"
                  >
                    <SkipForward size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.send('player-remote-command', 'mute'); }}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
                    title={miniPlayerState.volume === 0 ? 'Unmute' : 'Mute'}
                  >
                    {miniPlayerState.volume === 0 ? <VolumeX size={10} style={{ color: 'var(--danger)' }} /> : <Volume2 size={10} />}
                  </button>
                  <button
                    onClick={handleRestorePlayerFromMini}
                    style={{ background: 'rgba(99, 102, 241, 0.25)', border: '1px solid rgba(99, 102, 241, 0.4)', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a5b4fc', padding: 0 }}
                    title="Restore Full Player"
                  >
                    <Maximize2 size={10} />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {miniPlayerState.duration > 0 && (
                <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    width: `${(miniPlayerState.currentTime / miniPlayerState.duration) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--primary), #a855f7)',
                    transition: 'width 0.1s linear'
                  }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab Workspaces */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Workspaces list */}

          {/* Downloads Tab */}
          {activeTab === 'downloads' && (
            <div className="dashboard-grid" style={{ width: '100%', display: 'flex', height: '100%', overflow: 'hidden' }}>

              {/* Central List */}
              <div className="main-content" style={(libraryCategory as string) === 'duplicates' ? { flex: 1, width: '100%', maxWidth: '100%', padding: 0 } : undefined}>
                {(libraryCategory as string) === 'duplicates' ? (
                  <Suspense fallback={<div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading duplicates...</div>}>
                    <DuplicatesPanel
                      libraryFiles={libraryFiles}
                      duplicateDeletePaths={duplicateDeletePaths}
                      toggleDuplicateDelete={toggleDuplicateDelete}
                      handleResolveDuplicates={handleResolveDuplicates}
                      setDuplicateDeletePaths={setDuplicateDeletePaths}
                      streamingPort={streamingPort}
                      downloads={downloads}
                      onClose={() => setLibraryCategory('recent')}
                    />
                  </Suspense>
                ) : (
                  <>
                    <div className="main-header">
                      <div className="main-title-container">
                        <h1>Active Downloads</h1>
                        <p>{downloads.length} files total ({downloads.filter(t => t.status === 'downloading').length} running)</p>
                      </div>
                      {/* Hiding the add URL button as requested */}
                    </div>

                    {/* Filter and controls toolbar */}
                    <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between', borderRadius: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '280px', position: 'relative' }}>
                        <Search size={14} style={{ color: 'var(--text-muted)', position: 'absolute', left: '10px' }} />
                        <input
                          type="text"
                          placeholder="Search files..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--panel-border)',
                            borderRadius: '8px',
                            padding: '6px 12px 6px 30px',
                            fontSize: '12px',
                            width: '100%',
                            color: '#fff',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {selectedDownloadIds.length > 0 && (
                          <div className="glass-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 10px', borderRadius: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '11px', flexShrink: 0 }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>{selectedDownloadIds.length} selected:</span>
                            <button className="btn-secondary" style={{ padding: '2px 6px', fontSize: '10px', height: '24px' }} onClick={handleBulkPause}>Pause</button>
                            <button className="btn-primary" style={{ padding: '2px 6px', fontSize: '10px', height: '24px', background: 'var(--primary)' }} onClick={handleBulkResume}>Resume</button>
                            <button className="btn-secondary" style={{ padding: '2px 6px', fontSize: '10px', height: '24px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={handleBulkDelete}>Delete</button>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px' }}
                            onClick={() => downloads.forEach(t => t.status === 'paused' && resumeDownload(t.id))}
                          >
                            Resume All
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px' }}
                            onClick={() => downloads.forEach(t => t.status === 'downloading' && pauseDownload(t.id))}
                          >
                            Pause All
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px', borderColor: 'rgba(255,255,255,0.06)' }}
                            onClick={() => setShowClearHistoryModal(true)}
                            title="Clear records from download history"
                          >
                            Clear History
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Table list - CSS Grid */}
                    <div ref={setDownloadsTableRef} className="glass-panel downloads-table-container" style={{ display: 'flex', flexDirection: 'column', overflowY: 'hidden', overflowX: 'auto' }}>
                      {/* Grid header row */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '28px minmax(140px,1fr) 58px 78px 150px 78px 68px 78px 86px',
                        gap: 0,
                        minWidth: '800px',
                        borderBottom: '1px solid var(--panel-border)',
                        background: 'rgba(0,0,0,0.2)',
                        flexShrink: 0,
                        fontSize: '11px',
                        fontWeight: '600',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}>
                        <div style={{ padding: '8px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={filteredDownloads.length > 0 && selectedDownloadIds.length === filteredDownloads.length}
                            onChange={() => handleToggleSelectAll(filteredDownloads)}
                            style={{ cursor: 'pointer' }}
                          />
                        </div>
                        <div style={{ padding: '8px 12px' }}>Filename</div>
                        <div style={{ padding: '8px 6px' }}>Format</div>
                        <div style={{ padding: '8px 6px' }}>Size</div>
                        <div style={{ padding: '8px 6px' }}>Progress</div>
                        <div style={{ padding: '8px 6px' }}>Speed</div>
                        <div style={{ padding: '8px 6px' }}>Duration</div>
                        <div style={{ padding: '8px 6px' }}>Status</div>
                        <div style={{ padding: '8px 6px', textAlign: 'center' }}>Actions</div>
                      </div>

                      {filteredDownloads.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '10px', color: 'var(--text-muted)', padding: '40px' }}>
                          <Download size={32} strokeWidth={1.5} />
                          <div style={{ fontSize: '14px' }}>No downloads to display</div>
                        </div>
                      ) : (
                        <div
                          style={{
                            flex: 1,
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            position: 'relative',
                            minHeight: 0,
                            minWidth: '800px',
                          }}
                        >
                          <div style={{ height: `${downloadsVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                            {downloadsVirtualizer.getVirtualItems().map(virtualRow => {
                              const task = filteredDownloads[virtualRow.index];
                              const percentage = getPercentage(task);
                              const isSelected = selectedTaskId === task.id;
                              const isRowChecked = selectedDownloadIds.includes(task.id);

                              return (
                                <div
                                  key={task.id}
                                  data-index={virtualRow.index}
                                  ref={downloadsVirtualizer.measureElement}
                                  onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px minmax(140px,1fr) 58px 78px 150px 78px 68px 78px 86px',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                    cursor: 'pointer',
                                    background: isRowChecked
                                      ? 'rgba(99, 102, 241, 0.06)'
                                      : isSelected ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                                    alignItems: 'center',
                                    fontSize: '12px',
                                  }}
                                >

                                  {/* Checkbox */}
                                  <div style={{ padding: '8px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isRowChecked}
                                      onChange={() => handleToggleSelect(task.id)}
                                      style={{ cursor: 'pointer' }}
                                    />
                                  </div>

                                  {/* Filename */}
                                  <div style={{ padding: '8px 12px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                      {task.thumbnail && !task.thumbnail.toLowerCase().includes('.gif') && !task.thumbnail.toLowerCase().includes('banner') && !task.thumbnail.toLowerCase().includes('sponsor') && !task.thumbnail.toLowerCase().includes('advert') ? (
                                        <img
                                          src={task.thumbnail}
                                          alt="thumb"
                                          style={{ width: '42px', height: '24px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.06)' }}
                                        />
                                      ) : (
                                        <div style={{ width: '42px', height: '24px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
                                          <Globe size={12} style={{ color: 'var(--text-dark)' }} />
                                        </div>
                                      )}
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {task.filename || (task.isYoutube ? 'Resolving YouTube Video...' : 'Fetching metadata...')}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Format badge */}
                                  <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'center' }}>
                                    {(() => {
                                      const ext = task.filename.split('.').pop()?.toUpperCase();
                                      const displayExt = ext && ext.length <= 4 && ext !== 'PARTS' ? ext : (task.isYoutube ? 'MP4' : 'URL');
                                      let badgeColor = 'rgba(255,255,255,0.08)';
                                      let textColor = '#fff';
                                      if (['MP4', 'MKV', 'WEBM', 'AVI', 'MOV'].includes(displayExt)) { badgeColor = 'rgba(129,140,248,0.15)'; textColor = '#818cf8'; }
                                      else if (['MP3', 'M4A', 'WAV', 'FLAC'].includes(displayExt)) { badgeColor = 'rgba(236,72,153,0.15)'; textColor = '#ec4899'; }
                                      else if (['PDF', 'DOCX', 'TXT', 'ZIP', 'RAR'].includes(displayExt)) { badgeColor = 'rgba(59,130,246,0.15)'; textColor = '#3b82f6'; }
                                      return (
                                        <span style={{ fontSize: '10px', fontWeight: 'bold', background: badgeColor, color: textColor, padding: '2px 6px', borderRadius: '4px' }}>
                                          {displayExt}
                                        </span>
                                      );
                                    })()}
                                  </div>

                                  {/* Size */}
                                  <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'center', fontSize: '11px' }}>
                                    {task.status === 'completed'
                                      ? (task.totalBytes > 0 ? formatBytes(task.totalBytes) : '-')
                                      : (task.totalBytes > 0
                                        ? <><span style={{ color: 'var(--primary)', fontWeight: '600' }}>{formatBytes(task.downloadedBytes)}</span><span style={{ color: 'var(--text-muted)', fontSize: '10px' }}> / {formatBytes(task.totalBytes)}</span></>
                                        : (task.isYoutube && task.displaySize ? task.displaySize : '-'))
                                    }
                                  </div>

                                  {/* Progress */}
                                  <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'center' }}>
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                                        <span>{percentage}%</span>
                                        <span>{task.isYoutube ? '' : formatBytes(task.downloadedBytes)}</span>
                                      </div>
                                      <div className="progress-bar-bg">
                                        <div className={`progress-bar-fill ${task.status}`} style={{ width: `${percentage}%` }} />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Speed */}
                                  <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'center', fontSize: '11px', fontFamily: 'var(--font-title)' }}>
                                    {task.isYoutube && task.displaySpeed ? task.displaySpeed : (task.status === 'downloading' ? formatSpeed(task.speed) : '0 B/s')}
                                  </div>

                                  {/* Duration */}
                                  <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'center', fontSize: '11px' }}>
                                    {task.duration && task.duration > 0
                                      ? (() => { const m = Math.floor(task.duration / 60); const s = Math.floor(task.duration % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; })()
                                      : (task.isYoutube && task.displayEta ? task.displayEta : (task.status === 'downloading' ? formatEta(task.eta) : '-'))
                                    }
                                  </div>

                                  {/* Status */}
                                  <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'center' }}>
                                    <span className={`status-badge-gui ${task.status}`}>{task.status}</span>
                                  </div>

                                  {/* Actions */}
                                  <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      {task.status === 'downloading' || task.status === 'preparing' ? (
                                        <button className="btn-secondary" style={{ padding: '4px 6px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.05)', cursor: 'pointer' }} title="Pause" onClick={() => pauseDownload(task.id)}>
                                          <Pause size={11} />
                                        </button>
                                      ) : task.status === 'completed' ? (
                                        <button className="btn-primary" style={{ padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#22c55e' }} title="Play Media"
                                          onClick={() => { const filePath = task.saveDir + '/' + task.filename; electron?.ipcRenderer.invoke('open-player-window', { filePath, filename: task.filename }); }}>
                                          <Play size={11} fill="currentColor" />
                                        </button>
                                      ) : task.status !== 'merging' && task.status !== 'compressing' ? (
                                        <button className="btn-primary" style={{ padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--primary)' }} title="Resume" onClick={() => resumeDownload(task.id)}>
                                          <Play size={11} fill="currentColor" />
                                        </button>
                                      ) : null}
                                      <button className="btn-secondary" style={{ padding: '4px 6px', borderRadius: '6px', border: 'none', color: 'var(--danger)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer' }} title="Delete" onClick={() => deleteDownload(task.id, false)}>
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>

                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Right Panel Drawer: Details & Media Library */}
              <div className="detail-drawer" style={{ display: (libraryCategory as string) === 'duplicates' ? 'none' : 'flex', flexDirection: 'column', height: '100%', width: '330px', flexShrink: 0, borderLeft: '1px solid var(--panel-border)', background: 'rgba(10, 10, 16, 0.5)', padding: '16px', minHeight: 0 }}>
                {/* Header Switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setRightPanelTab('details');
                      if ((libraryCategory as string) === 'duplicates') setLibraryCategory('recent');
                    }}
                    disabled={!selectedTask}
                    className={`btn-secondary ${rightPanelTab === 'details' ? 'active' : ''}`}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      fontSize: '11px',
                      borderRadius: '8px',
                      opacity: selectedTask ? 1 : 0.4,
                      background: rightPanelTab === 'details' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                      borderColor: rightPanelTab === 'details' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    Active Details
                  </button>
                  <button
                    onClick={() => {
                      setRightPanelTab('library');
                      if ((libraryCategory as string) === 'duplicates') setLibraryCategory('recent');
                    }}
                    className={`btn-secondary ${rightPanelTab === 'library' ? 'active' : ''}`}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      fontSize: '11px',
                      borderRadius: '8px',
                      background: rightPanelTab === 'library' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                      borderColor: rightPanelTab === 'library' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    Media Library
                  </button>
                  <button
                    onClick={() => {
                      setRightPanelTab('library');
                      setLibraryCategory('duplicates');
                    }}
                    aria-pressed={(libraryCategory as string) === 'duplicates'}
                    className={`btn-secondary ${(libraryCategory as string) === 'duplicates' ? 'active' : ''}`}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      fontSize: '11px',
                      borderRadius: '8px',
                      background: (libraryCategory as string) === 'duplicates' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                      borderColor: (libraryCategory as string) === 'duplicates' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.06)',
                      color: (libraryCategory as string) === 'duplicates' ? '#f87171' : undefined,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Copy size={12} /> Duplicates
                  </button>
                </div>

                <div style={{ display: (libraryCategory as string) === 'duplicates' ? 'none' : 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {/* DETAILS TAB CONTENT */}
                  {rightPanelTab === 'details' && selectedTask ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, overflowY: 'auto', marginTop: '14px', paddingRight: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 'bold' }}>Download Details</h3>
                        <button className="modal-close-btn" style={{ fontSize: '12px' }} onClick={() => setSelectedTaskId(null)}>✕</button>
                      </div>

                      <div className="detail-row">
                        <div className="detail-label">File Name</div>
                        <div className="detail-value" style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', wordBreak: 'break-all' }}>{selectedTask.filename}</div>
                      </div>

                      <div className="detail-row">
                        <div className="detail-label">Source URL</div>
                        <div className="detail-value" style={{ fontSize: '10px', color: 'var(--primary)', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedTask.url}>{selectedTask.url}</div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="detail-row">
                          <div className="detail-label">Status</div>
                          <div className="detail-value">
                            <span className={`status-badge-gui ${selectedTask.status}`} style={{ marginTop: '4px' }}>
                              {selectedTask.status}
                            </span>
                          </div>
                        </div>
                        <div className="detail-row">
                          <div className="detail-label">Size</div>
                          <div className="detail-value">{selectedTask.isYoutube && selectedTask.displaySize ? selectedTask.displaySize : (selectedTask.totalBytes > 0 ? formatBytes(selectedTask.totalBytes) : 'Unknown')}</div>
                        </div>
                      </div>

                      <div className="detail-row">
                        <div className="detail-label">Save Directory</div>
                        <div className="detail-value" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{selectedTask.saveDir}</div>
                      </div>

                      {/* Actions Bar inside Drawer */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        {selectedTask.status === 'downloading' || selectedTask.status === 'preparing' ? (
                          <button className="btn-secondary" style={{ flex: 1, padding: '8px 0', fontSize: '12px', justifyContent: 'center' }} onClick={() => pauseDownload(selectedTask.id)}>
                            <Pause size={14} /> Pause
                          </button>
                        ) : selectedTask.status !== 'completed' && selectedTask.status !== 'merging' && selectedTask.status !== 'compressing' ? (
                          <button className="btn-primary" style={{ flex: 1, padding: '8px 0', fontSize: '12px', justifyContent: 'center' }} onClick={() => resumeDownload(selectedTask.id)}>
                            <Play size={14} /> Resume
                          </button>
                        ) : null}

                        {selectedTask.status === 'completed' && (
                          <>
                            {!['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm4v', 'mpg', 'mpeg', 'mp3', 'm4a', 'flac', 'wav'].includes(selectedTask.filename.split('.').pop()?.toLowerCase() || '') ? (
                              <button className="btn-primary" style={{ flex: 1, padding: '8px 0', fontSize: '12px', justifyContent: 'center' }} onClick={() => openFile(selectedTask)}>
                                <ExternalLink size={14} /> Open
                              </button>
                            ) : null}
                            <button
                              className="btn-secondary"
                              style={{
                                padding: '8px 12px',
                                flex: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm4v', 'mpg', 'mpeg', 'mp3', 'm4a', 'flac', 'wav'].includes(selectedTask.filename.split('.').pop()?.toLowerCase() || '') ? 1 : undefined,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                              onClick={() => openFolder(selectedTask)}
                              title="Open in File Explorer"
                            >
                              <Folder size={14} /> Open Folder
                            </button>
                          </>
                        )}

                        <button
                          className="btn-secondary"
                          style={{ padding: '8px 12px', borderColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)' }}
                          onClick={() => deleteDownload(selectedTask.id, selectedTask.status === 'completed')}
                          title="Delete Download"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {selectedTask.error && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '10px', display: 'flex', gap: '8px', color: '#f87171', fontSize: '12px' }}>
                          <AlertCircle size={16} style={{ flexShrink: 0 }} />
                          <div>{selectedTask.error}</div>
                        </div>
                      )}

                      {/* Real-time Graph in Drawer */}
                      {selectedTask.status === 'downloading' && (
                        <SpeedGraph currentSpeed={selectedTask.speed} isActive={true} />
                      )}

                      {/* Segment block progress indicator */}
                      {!selectedTask.isYoutube && selectedTask.status !== 'completed' && (
                        <SegmentVisualizer segments={selectedTask.segments} />
                      )}

                      {selectedTask.status === 'completed' && ['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm4v', 'mpg', 'mpeg', 'mp3', 'm4a', 'flac', 'wav'].includes(selectedTask.filename.split('.').pop()?.toLowerCase() || '') && (
                        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div className="detail-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <PlayCircle size={12} style={{ color: 'var(--primary)' }} /> Panamedia Player
                          </div>
                          <div
                            onClick={() => {
                              const fullPath = selectedTask.saveDir + (selectedTask.saveDir.endsWith('\\') || selectedTask.saveDir.endsWith('/') ? '' : '\\') + selectedTask.filename;
                              electron?.ipcRenderer.invoke('open-player-window', { filePath: fullPath, filename: selectedTask.filename });
                            }}
                            style={{
                              position: 'relative',
                              width: '100%',
                              height: '145px',
                              borderRadius: '10px',
                              overflow: 'hidden',
                              border: '1px solid var(--panel-border)',
                              background: '#09090e',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 8px 25px rgba(0,0,0,0.5)'
                            }}
                          >
                            <img
                              src={`http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(selectedTask.saveDir + '\\' + selectedTask.filename)}`}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                opacity: 0.75
                              }}
                              alt=""
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = playerBg;
                              }}
                            />
                            <div style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'linear-gradient(to top, rgba(7, 7, 12, 0.92) 0%, rgba(7, 7, 12, 0.3) 60%, rgba(7, 7, 12, 0.5) 100%)'
                            }} />
                            <div style={{
                              position: 'relative',
                              zIndex: 2,
                              width: '46px',
                              height: '46px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 0 25px rgba(99, 102, 241, 0.6)'
                            }}>
                              <Play size={20} color="#fff" style={{ marginLeft: '3px' }} />
                            </div>
                            <div style={{
                              position: 'absolute',
                              bottom: '10px',
                              left: '12px',
                              right: '12px',
                              zIndex: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              color: '#fff'
                            }}>
                              <span style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Play in Panamedia
                              </span>
                              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
                                {selectedTask.filename.split('.').pop()?.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* LIBRARY TAB CONTENT */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, marginTop: '12px' }}>

                      {/*  Category icon+text tabs (Primary, Videos, Audios, Docx, Files)  */}
                      <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.02)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        {([
                          { id: 'recent' as const, label: 'Primary', icon: <Activity size={11} /> },
                          { id: 'videos' as const, label: 'Videos', icon: <Film size={11} /> },
                          { id: 'audios' as const, label: 'Audios', icon: <Music size={11} /> },
                          { id: 'docx' as const, label: 'Docx', icon: <FileText size={11} /> },
                          { id: 'files' as const, label: 'Files', icon: <Folder size={11} /> },
                        ]).map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setLibraryCategory(tab.id)}
                            style={{
                              flex: 1,
                              padding: '7px 2px',
                              borderRadius: '6px',
                              border: 'none',
                              fontSize: '9px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '4px',
                              background: libraryCategory === tab.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                              color: libraryCategory === tab.id ? '#fff' : 'var(--text-muted)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {tab.icon}
                            <span>{tab.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Search and sync controls */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div className="search-bar" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <Search size={12} style={{ color: 'var(--text-muted)' }} />
                          <input
                            type="text"
                            placeholder="Search library..."
                            value={librarySearch}
                            onChange={(e) => setLibrarySearch(e.target.value)}
                            style={{ background: 'transparent', border: 'none', fontSize: '11px', color: '#fff', outline: 'none', width: '100%' }}
                          />
                        </div>
                        <button
                          onClick={syncLibrary}
                          disabled={syncingLibrary}
                          className="btn-secondary"
                          style={{ padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)', color: syncingLibrary ? 'var(--primary)' : '#fff' }}
                          title="Sync Downloads folder"
                        >
                          <RefreshCw size={12} className={syncingLibrary ? 'animate-spin' : ''} />
                        </button>
                      </div>

                      {/* Sorting & View Controls (Same row, compact size) */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <span>Sort:</span>
                          <select
                            value={librarySortBy}
                            onChange={(e) => setLibrarySortBy(e.target.value as any)}
                            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '10px', fontWeight: 'bold', outline: 'none', cursor: 'pointer', paddingRight: '2px' }}
                          >
                            <option value="date" style={{ background: '#0f0f16' }}>Date</option>
                            <option value="name" style={{ background: '#0f0f16' }}>Name</option>
                            <option value="size" style={{ background: '#0f0f16' }}>Size</option>
                          </select>
                          <button
                            onClick={() => setLibrarySortOrder(librarySortOrder === 'asc' ? 'desc' : 'asc')}
                            style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', padding: '0 2px' }}
                            title={librarySortOrder === 'asc' ? 'Ascending' : 'Descending'}
                          >
                            {librarySortOrder === 'asc' ? '▲' : '▼'}
                          </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                          <span>View:</span>
                          <button
                            type="button"
                            aria-pressed={libraryViewMode === 'folders'}
                            onClick={() => setLibraryViewMode(libraryViewMode === 'files' ? 'folders' : 'files')}
                            className="btn-secondary"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 8px',
                              fontSize: '9.5px',
                              lineHeight: '13px',
                              borderRadius: '5px',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: '#fff'
                            }}
                            title={`Switch to ${libraryViewMode === 'files' ? 'folder' : 'file list'} view`}
                          >
                            {libraryViewMode === 'files' ? <List size={11} /> : <Folder size={11} />}
                            {libraryViewMode === 'files' ? 'Files List' : 'Folder View'}
                          </button>
                        </div>
                      </div>

                      {/* Sync Items List */}
                      <div ref={libraryListRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>

                        {/* Duplicates Tab  */}
                        {(libraryCategory as string) === 'duplicates' ? (() => {
                          // Build duplicate groups from libraryFiles using normalized name
                          const nameMap = new Map<string, any[]>();
                          libraryFiles.filter(f => !isItemArchived(f.path)).forEach(f => {
                            const normName = getNormalizedName(f.name);
                            if (!nameMap.has(normName)) nameMap.set(normName, []);
                            nameMap.get(normName)!.push(f);
                          });
                          const dupGroups = Array.from(nameMap.entries())
                            .filter(([, files]) => files.length > 1)
                            .sort(([a], [b]) => a.localeCompare(b));

                          if (dupGroups.length === 0) {
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                <Copy size={24} strokeWidth={1.5} />
                                <span style={{ fontSize: '11px' }}>No duplicate filenames found across synced folders.</span>
                              </div>
                            );
                          }

                          return (
                            <>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 2px', marginBottom: '4px' }}>
                                {dupGroups.length} duplicate groups found.
                                <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: '4px' }}>Click a group header to collapse/expand.</span>
                              </div>
                              {dupGroups.map(([normName, files]) => {
                                const sorted = [...files].sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
                                const groupTitle = files[0]?.name || normName;
                                const isExpanded = expandedDupGroups[normName] !== false; // expanded by default
                                const markedInGroup = sorted.filter(f => duplicateDeletePaths.includes(f.path)).length;
                                return (
                                  <div key={normName} style={{ borderRadius: '8px', border: `1px solid ${isExpanded ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.1)'}`, background: isExpanded ? 'rgba(239,68,68,0.04)' : 'transparent', overflow: 'hidden', marginBottom: '4px', transition: 'all 0.15s' }}>
                                    {/* Clickable group header */}
                                    <div
                                      onClick={() => setExpandedDupGroups(prev => ({ ...prev, [normName]: !isExpanded }))}
                                      style={{ padding: '7px 10px', background: 'rgba(239,68,68,0.06)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                      <span style={{ fontSize: '9px', color: isExpanded ? '#ef4444' : 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                                      <Copy size={10} style={{ color: '#ef4444', flexShrink: 0 }} />
                                      <span style={{ fontSize: '10px', fontWeight: '600', color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={groupTitle}>{groupTitle}</span>
                                      {markedInGroup > 0 && <span style={{ fontSize: '9px', color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>🗑 {markedInGroup}</span>}
                                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>{files.length} copies</span>
                                    </div>
                                    {/* Expanded file list */}
                                    {isExpanded && sorted.map((f: any, idx: number) => {
                                      const checked = duplicateDeletePaths.includes(f.path);
                                      const isOldest = idx === 0;
                                      return (
                                        <div key={`${f.path}-${idx}`} style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', background: checked ? 'rgba(239,68,68,0.06)' : 'transparent', transition: 'background 0.15s' }}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleDuplicateDelete(f.path)}
                                            style={{ cursor: 'pointer', accentColor: '#ef4444', flexShrink: 0 }}
                                          />
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '9px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.path}>{f.path}</div>
                                            <div style={{ display: 'flex', gap: '6px', fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', flexWrap: 'wrap' }}>
                                              <span>{formatBytes(f.size)}</span>
                                              <span>•</span>
                                              <span>{f.mtime ? new Date(f.mtime).toLocaleDateString() : '?'}</span>
                                              {isOldest && <span style={{ color: '#f59e0b', fontWeight: '700' }}>oldest</span>}
                                            </div>
                                          </div>
                                          <span style={{ fontSize: '9px', color: checked ? '#ef4444' : '#4ade80', fontWeight: '700', flexShrink: 0 }}>
                                            {checked ? '✕ Del' : '✓ Keep'}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                              {duplicateDeletePaths.length > 0 && (
                                <button
                                  onClick={handleResolveDuplicates}
                                  style={{ margin: '8px 0', padding: '8px 14px', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', width: '100%' }}
                                >
                                  <Trash2 size={12} /> Delete {duplicateDeletePaths.length} marked file{duplicateDeletePaths.length !== 1 ? 's' : ''} from disk
                                </button>
                              )}
                            </>
                          );
                        })() : (
                          <>{/* ── Normal Categories ── */}
                            {(() => {
                              // Filtered + sorted once per real change (memoized
                              // at component level): thousands of library items
                              // are no longer re-filtered and re-sorted on every
                              // progress-tick re-render.
                              const filteredItems = libraryFilteredItems;

                              if (filteredItems.length === 0) {
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                    <Folder size={24} strokeWidth={1.5} />
                                    <span style={{ fontSize: '11px' }}>No files found in {libraryCategory} category.</span>
                                  </div>
                                );
                              }

                              if (libraryViewMode === 'folders' && libraryCategory !== 'recent') {
                                // Group filteredItems by parentPath
                                const groups: Record<string, typeof filteredItems> = {};
                                filteredItems.forEach(file => {
                                  const parentPath = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/')) || 'Default';
                                  const folderName = (parentPath.replace(/[\\/]/g, '/').split('/').pop() || '').toLowerCase();
                                  if (folderName === 'download' || folderName === 'downloads') return;
                                  if (!groups[parentPath]) {
                                    groups[parentPath] = [];
                                  }
                                  groups[parentPath].push(file);
                                });

                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {Object.entries(groups).map(([folderPath, files]) => {
                                      const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
                                      const isExpanded = !!expandedFolders[folderPath];
                                      return (
                                        <div key={folderPath} className="glass-panel" style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
                                          {/* Folder Header */}
                                          <div
                                            onClick={() => setExpandedFolders(prev => ({ ...prev, [folderPath]: !isExpanded }))}
                                            style={{
                                              padding: '8px 10px',
                                              background: 'rgba(255,255,255,0.02)',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              cursor: 'pointer',
                                              userSelect: 'none'
                                            }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                              <Folder size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={folderPath}>{folderName}</span>
                                              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>({files.length})</span>
                                            </div>
                                            <ChevronRight size={12} style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: 'var(--text-muted)' }} />
                                          </div>

                                          {/* Folder Files List */}
                                          {isExpanded && (
                                            <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.15)' }}>
                                              {(libraryCategory as string) === 'recent' ? (() => {
                                                const vids = files.filter(f => !['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(f.ext.toLowerCase()));
                                                const auds = files.filter(f => ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(f.ext.toLowerCase()));
                                                const renderSubFile = (file: any, idx2: number) => {
                                                  const taskMatch = downloads.find(t => t.filename === file.name);
                                                  const thumbUrl = taskMatch?.thumbnail;
                                                  const isSelected = file.path === selectedLibraryPath;
                                                  return (
                                                    <div
                                                      key={`${file.path}-${idx2}`}
                                                      style={{
                                                        padding: '6px 8px',
                                                        borderRadius: '6px',
                                                        display: 'flex',
                                                        gap: '6px',
                                                        alignItems: 'center',
                                                        background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                                        border: isSelected ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid transparent',
                                                        cursor: 'pointer'
                                                      }}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedLibraryPath(file.path);
                                                      }}
                                                      onContextMenu={(e) => handleContextMenu(e, file.path)}
                                                      onDoubleClick={() => {
                                                        if (file.category === 'videos' || file.category === 'audios' || (file.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(file.ext))) {
                                                          electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                                        } else {
                                                          const parentDir = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/'));
                                                          electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: file.name });
                                                        }
                                                      }}
                                                    >
                                                      {(() => {
                                                        const localThumb = `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(file.path)}`;
                                                        const displayThumb = thumbUrl || (['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv'].includes(file.ext.toLowerCase()) ? localThumb : null);
                                                        const hasError = imgErrors[file.path];

                                                        if (displayThumb && !hasError) {
                                                          return (
                                                            <img
                                                              src={displayThumb}
                                                              alt="thumb"
                                                              style={{ width: '36px', height: '22px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}
                                                              onError={() => setImgErrors(prev => ({ ...prev, [file.path]: true }))}
                                                            />
                                                          );
                                                        }

                                                        const isAudioFile = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(file.ext.toLowerCase());
                                                        return (
                                                          <div style={{ width: '36px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.03)', flexShrink: 0 }}>
                                                            {isAudioFile ? <Music size={10} style={{ color: '#ec4899' }} /> : <FileText size={10} style={{ color: '#3b82f6' }} />}
                                                          </div>
                                                        );
                                                      })()}

                                                      <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '10px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</div>
                                                        <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{file.displaySize ? file.displaySize : formatBytes(file.size)}</div>
                                                      </div>

                                                      <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
                                                        <button
                                                          onClick={() => {
                                                            electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                                          }}
                                                          style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '2px' }}
                                                          title="Play"
                                                        >
                                                          <Play size={10} fill="currentColor" />
                                                        </button>
                                                        <button
                                                          onClick={() => {
                                                            setSelectedFileDetails(file);
                                                            setShowFileDetailsModal(true);
                                                          }}
                                                          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }}
                                                          title="Details"
                                                        >
                                                          <Info size={10} />
                                                        </button>
                                                        <button
                                                          onClick={() => {
                                                            setDeleteConfirmTarget({
                                                              type: 'file',
                                                              title: 'Delete File from Disk',
                                                              message: `Are you sure you want to permanently delete "${file.name}" from disk?`,
                                                              filePath: file.path,
                                                              onConfirm: async () => {
                                                                const res = await performDeleteFile(file.path);
                                                                if (res && !res.success) {
                                                                  alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
                                                                }
                                                              }
                                                            });
                                                          }}
                                                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                                                          title="Delete"
                                                        >
                                                          <Trash2 size={10} />
                                                        </button>
                                                      </div>
                                                    </div>
                                                  );
                                                };
                                                return (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {vids.length > 0 && (
                                                      <div>
                                                        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#a855f7', paddingLeft: '4px', marginBottom: '4px', textTransform: 'uppercase' }}>Videos ({vids.length})</div>
                                                        {vids.map((f, i) => renderSubFile(f, i))}
                                                      </div>
                                                    )}
                                                    {auds.length > 0 && (
                                                      <div>
                                                        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#ec4899', paddingLeft: '4px', marginBottom: '4px', textTransform: 'uppercase' }}>Mp3 ({auds.length})</div>
                                                        {auds.map((f, i) => renderSubFile(f, i))}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })() : (
                                                files.map((file, idx) => {
                                                  const taskMatch = downloads.find(t => t.filename === file.name);
                                                  const thumbUrl = taskMatch?.thumbnail;
                                                  const isSelected = file.path === selectedLibraryPath;

                                                  return (
                                                    <div
                                                      key={`${file.path}-${idx}`}
                                                      style={{
                                                        padding: '6px 8px',
                                                        borderRadius: '6px',
                                                        display: 'flex',
                                                        gap: '6px',
                                                        alignItems: 'center',
                                                        background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                                        border: isSelected ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid transparent',
                                                        cursor: 'pointer'
                                                      }}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedLibraryPath(file.path);
                                                      }}
                                                      onContextMenu={(e) => handleContextMenu(e, file.path)}
                                                      onDoubleClick={() => {
                                                        if (file.category === 'videos' || file.category === 'audios' || (file.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(file.ext))) {
                                                          electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                                        } else {
                                                          const parentDir = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/'));
                                                          electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: file.name });
                                                        }
                                                      }}
                                                    >
                                                      {(() => {
                                                        const localThumb = `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(file.path)}`;
                                                        const displayThumb = thumbUrl || ((file.category === 'videos' || file.category === 'audios') ? localThumb : null);
                                                        const hasError = imgErrors[file.path];

                                                        if (displayThumb && !hasError) {
                                                          return (
                                                            <img
                                                              src={displayThumb}
                                                              alt="thumb"
                                                              style={{ width: '36px', height: '22px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}
                                                              onError={() => setImgErrors(prev => ({ ...prev, [file.path]: true }))}
                                                            />
                                                          );
                                                        }

                                                        return (
                                                          <div style={{ width: '36px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.03)', flexShrink: 0 }}>
                                                            {file.category === 'audios' ? <Music size={10} style={{ color: '#ec4899' }} /> : <FileText size={10} style={{ color: '#3b82f6' }} />}
                                                          </div>
                                                        );
                                                      })()}

                                                      <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '10px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</div>
                                                        <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{file.displaySize ? file.displaySize : formatBytes(file.size)}</div>
                                                      </div>

                                                      <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
                                                        {(() => {
                                                          const isStillDownloading = downloads.some(t => (t.filename === file.name || (t.saveDir + '\\' + t.filename) === file.path || (t.saveDir + '/' + t.filename) === file.path) && t.status !== 'completed');
                                                          return (
                                                            <button
                                                              onClick={isStillDownloading ? undefined : () => {
                                                                if (file.category === 'videos' || file.category === 'audios' || (file.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(file.ext))) {
                                                                  electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                                                } else {
                                                                  const parentDir = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/'));
                                                                  electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: file.name });
                                                                }
                                                              }}
                                                              disabled={isStillDownloading}
                                                              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: isStillDownloading ? 'default' : 'pointer', padding: '2px', opacity: isStillDownloading ? 0.4 : 1 }}
                                                              title={isStillDownloading ? 'Downloading file...' : 'Play'}
                                                            >
                                                              <Play size={10} fill="currentColor" />
                                                            </button>
                                                          );
                                                        })()}
                                                        <button
                                                          onClick={() => {
                                                            setSelectedFileDetails(file);
                                                            setShowFileDetailsModal(true);
                                                          }}
                                                          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }}
                                                          title="Details"
                                                        >
                                                          <Info size={10} />
                                                        </button>
                                                        <button
                                                          onClick={() => {
                                                            setDeleteConfirmTarget({
                                                              type: 'file',
                                                              title: 'Delete File from Disk',
                                                              message: `Are you sure you want to permanently delete "${file.name}" from disk?`,
                                                              filePath: file.path,
                                                              onConfirm: async () => {
                                                                const res = await performDeleteFile(file.path);
                                                                if (res && !res.success) {
                                                                  alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
                                                                }
                                                              }
                                                            });
                                                          }}
                                                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                                                          title="Delete"
                                                        >
                                                          <Trash2 size={10} />
                                                        </button>
                                                      </div>
                                                    </div>
                                                  );
                                                }))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              } else {
                                const virtualRows = libraryVirtualizer.getVirtualItems();
                                return (
                                  <div style={{ position: 'relative', width: '100%', height: libraryVirtualizer.getTotalSize() }}>
                                    {virtualRows.map((virtualRow) => {
                                      const file = filteredItems[virtualRow.index];
                                      const idx = virtualRow.index;
                                      // Find thumbnail from downloads list matching task filename
                                      const taskMatch = downloads.find(t => t.filename === file.name);
                                  const thumbUrl = taskMatch?.thumbnail;

                                  const getFallbackIcon = () => {
                                    if (file.category === 'recent') return <Activity size={14} style={{ color: 'var(--primary)' }} />;
                                    if (file.category === 'videos') return <Film size={14} style={{ color: '#818cf8' }} />;
                                    if (file.category === 'audios') return <Music size={14} style={{ color: '#ec4899' }} />;
                                    if (file.category === 'docx') return <FileText size={14} style={{ color: '#3b82f6' }} />;
                                    return <Folder size={14} style={{ color: '#9ca3af' }} />;
                                  };

                                  const handlePlayFile = () => {
                                    if (file.category === 'videos' || file.category === 'audios' || (file.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(file.ext))) {
                                      electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                    } else {
                                      const parentDir = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/'));
                                      electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: file.name });
                                    }
                                  };

                                  const isSelected = file.path === selectedLibraryPath;

                                  return (
                                    <div
                                      key={`${file.path}-${idx}`}
                                      ref={libraryVirtualizer.measureElement}
                                      data-index={virtualRow.index}
                                      className="glass-panel"
                                      style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${virtualRow.start}px)`,
                                        padding: '8px',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        gap: '8px',
                                        alignItems: 'center',
                                        background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255,255,255,0.02)',
                                        border: isSelected ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(255,255,255,0.04)',
                                        cursor: 'pointer'
                                      }}
                                      onClick={() => {
                                        setSelectedLibraryPath(file.path);
                                      }}
                                      onDoubleClick={handlePlayFile}
                                      onContextMenu={(e) => handleContextMenu(e, file.path)}
                                    >
                                      {/* Thumbnail or icon */}
                                      {(() => {
                                        const isAdOrGif = (src?: string | null) => {
                                          if (!src || typeof src !== 'string') return true;
                                          const l = src.toLowerCase();
                                          if (l.includes('youtube.com') || l.includes('ytimg.com') || l.includes('googlevideo.com')) {
                                            return false;
                                          }
                                          return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
                                            l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
                                            l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
                                            l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
                                        };
                                        const localThumb = `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(file.path)}`;
                                        const cleanThumb = (thumbUrl && !isAdOrGif(thumbUrl)) ? thumbUrl : null;
                                        const displayThumb = cleanThumb || ((file.category === 'videos' || file.category === 'audios') ? localThumb : null);
                                        const hasError = imgErrors[file.path];

                                        if (displayThumb && !hasError) {
                                          return (
                                            <div style={{ width: '46px', height: '30px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, position: 'relative', border: '1px solid rgba(255,255,255,0.05)' }}>
                                              <img
                                                src={displayThumb}
                                                alt="thumb"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={() => setImgErrors(prev => ({ ...prev, [file.path]: true }))}
                                              />
                                            </div>
                                          );
                                        }

                                        return (
                                          <div style={{ width: '46px', height: '30px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.03)' }}>
                                            {getFallbackIcon()}
                                          </div>
                                        );
                                      })()}

                                      {/* File info */}
                                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <div
                                          style={{ fontSize: '11px', fontWeight: '600', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                          title={file.name}
                                        >
                                          {file.name}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                          <span>{file.displaySize ? file.displaySize : formatBytes(file.size)}</span>
                                          <span>•</span>
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: 'rgba(255,255,255,0.04)', padding: '1px 4px', borderRadius: '4px', color: '#a855f7' }}>
                                            <Folder size={8} /> {getParentFolderName(file.path)}
                                          </span>
                                          <span>•</span>
                                          <span>{new Date(file.mtime).toLocaleDateString()}</span>
                                          <span>•</span>
                                          <span style={{ textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 'bold' }}>{file.ext.replace('.', '')}</span>
                                        </div>
                                      </div>

                                      {/* Play/Open/Delete Action */}
                                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                        {(() => {
                                          const isStillDownloading = downloads.some(t => (t.filename === file.name || (t.saveDir + '\\' + t.filename) === file.path || (t.saveDir + '/' + t.filename) === file.path) && t.status !== 'completed');
                                          return (
                                            <button
                                              onClick={isStillDownloading ? undefined : handlePlayFile}
                                              disabled={isStillDownloading}
                                              className="btn-secondary"
                                              style={{
                                                padding: '4px 6px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: (file.category === 'videos' || file.category === 'audios' || file.category === 'recent') ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                                                color: (file.category === 'videos' || file.category === 'audios' || file.category === 'recent') ? 'var(--primary)' : '#fff',
                                                cursor: isStillDownloading ? 'default' : 'pointer',
                                                opacity: isStillDownloading ? 0.4 : 1
                                              }}
                                              title={isStillDownloading ? 'Downloading file...' : ((file.category === 'videos' || file.category === 'audios' || file.category === 'recent') ? 'Play in Player Window' : 'Open in App')}
                                            >
                                              {(file.category === 'videos' || file.category === 'audios' || file.category === 'recent') ? <Play size={10} fill="currentColor" /> : <ExternalLink size={10} />}
                                            </button>
                                          );
                                        })()}

                                        <button
                                          onClick={() => {
                                            setSelectedFileDetails(file);
                                            setShowFileDetailsModal(true);
                                          }}
                                          className="btn-secondary"
                                          style={{
                                            padding: '4px 6px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: 'rgba(255,255,255,0.05)',
                                            color: '#fff',
                                            cursor: 'pointer'
                                          }}
                                          title="View Details"
                                        >
                                          <Info size={10} />
                                        </button>

                                        <button
                                          onClick={() => {
                                            setDeleteConfirmTarget({
                                              type: 'file',
                                              title: 'Delete File from Disk',
                                              message: `Are you sure you want to permanently delete "${file.name}" from disk?`,
                                              filePath: file.path,
                                              onConfirm: async () => {
                                                const res = await performDeleteFile(file.path);
                                                if (res && !res.success) {
                                                  alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
                                                }
                                              }
                                            });
                                          }}
                                          className="btn-secondary"
                                          style={{
                                            padding: '4px 6px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            color: 'var(--danger)',
                                            cursor: 'pointer'
                                          }}
                                          title="Delete from Disk"
                                        >
                                          <Trash2 size={10} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                  </div>
                                );
                              }
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Queue Tab */}
          {activeTab === 'queues' && (
            <div className="main-content">
              <div className="main-header">
                <div className="main-title-container">
                  <h1>Queue Scheduler</h1>
                  <p>Queued tasks download sequentially to conserve system resources</p>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Default Download Queue</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Currently executing maximum <strong>{appSettings.maxConcurrent}</strong> files concurrently.
                    </div>
                  </div>
                </div>

                <div className="downloads-table-container" style={{ border: '1px solid var(--panel-border)', maxHeight: '350px' }}>
                  <table className="downloads-table">
                    <thead>
                      <tr>
                        <th>Filename</th>
                        <th>URL</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {downloads.filter(t => t.status === 'queued' || t.status === 'paused' && t.downloadedBytes === 0).length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            No pending files in download queue
                          </td>
                        </tr>
                      ) : (
                        downloads.filter(t => t.status === 'queued' || t.status === 'paused' && t.downloadedBytes === 0).map(task => (
                          <tr key={task.id}>
                            <td style={{ fontWeight: '600' }}>{task.filename || 'Pending Name...'}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '11px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.url}</td>
                            <td><span className="status-badge-gui queued">Queued</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => resumeDownload(task.id)}>
                                  <Play size={10} /> Start
                                </button>
                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => deleteDownload(task.id)}>
                                  <Trash2 size={10} /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Help Center Tab */}
          {(activeTab as string) === 'help' && (
            <HelpTab helpSubTab={helpSubTab} setHelpSubTab={setHelpSubTab} />
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div className="main-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div className="main-title-container">
                  <h1>Application Settings</h1>
                  <p>Configure downloading profiles and directory folders</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setSettingsSubTab('general')}
                    className={`btn-secondary ${settingsSubTab === 'general' ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: settingsSubTab === 'general' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: settingsSubTab === 'general' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    General Settings
                  </button>
                  <button
                    onClick={() => setSettingsSubTab('folders')}
                    className={`btn-secondary ${settingsSubTab === 'folders' ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: settingsSubTab === 'folders' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: settingsSubTab === 'folders' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    Media Sync Folders
                  </button>
                  <button
                    onClick={() => {
                      setSettingsSubTab('security');
                      setSettingsArchivePin(localStorage.getItem('player_archive_pin') || '');
                      setPinFeedbackMsg(null);
                    }}
                    className={`btn-secondary ${settingsSubTab === 'security' ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: settingsSubTab === 'security' ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
                      borderColor: settingsSubTab === 'security' ? '#eab308' : 'rgba(255,255,255,0.06)',
                      color: settingsSubTab === 'security' ? '#fde047' : 'inherit'
                    }}
                  >
                    Archive PIN & Privacy
                  </button>
                </div>
              </div>

              {settingsSubTab === 'general' && (
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="form-group">
                    <label>Primary Folder (Downloads)</label>
                    <div className="form-input-container">
                      <input type="text" className="text-input" readOnly value={appSettings.downloadDir} style={{ flex: 1 }} />
                      <button className="btn-secondary" onClick={handleSettingsBrowseDir}>
                        Browse...
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                      <label>Parallel Connections (per download)</label>
                      <select
                        value={appSettings.connections}
                        onChange={(e) => updateSetting('connections', parseInt(e.target.value))}
                      >
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="2">2 Connections</option>
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="4">4 Connections</option>
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="8">8 Connections (Default)</option>
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="16">16 Connections (Fast)</option>
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="32">32 Connections (Maximum)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Maximum Concurrent Downloads</label>
                      <select
                        value={appSettings.maxConcurrent}
                        onChange={(e) => updateSetting('maxConcurrent', parseInt(e.target.value))}
                      >
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="1">1 Download at a time</option>
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="2">2 Downloads at a time (Recommended)</option>
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="3">3 Downloads at a time</option>
                        <option style={{ background: '#0f0f18', color: '#fff' }} value="4">4 Downloads at a time</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Auto-Compress Video Streams</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Transcode finished YouTube video streams to H.265 (HEVC) CRF {appSettings.compressionCRF} automatically.
                        </div>
                      </div>
                      <label className="switch autocompress-switch">
                        <input
                          type="checkbox"
                          checked={appSettings.autoCompress}
                          onChange={(e) => updateSetting('autoCompress', e.target.checked)}
                        />
                        <span className="slider autocompress-slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {settingsSubTab === 'folders' && (
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Media Library Sync Folders</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Add folders and drives that net-downloader should scan recursively for media files.
                      </div>
                    </div>
                    <button
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                      onClick={async () => {
                        if (!electron) return;
                        const dir = await electron.ipcRenderer.invoke('select-directory');
                        if (dir && !appSettings.syncedFolders.includes(dir)) {
                          const nextFolders = [...appSettings.syncedFolders, dir];
                          updateSetting('syncedFolders', nextFolders);
                          electron.ipcRenderer.send('synced-folders-updated', nextFolders);
                        }
                      }}
                    >
                      <Plus size={14} /> Add Folder
                    </button>
                  </div>

                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginTop: '4px',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    paddingRight: '6px'
                  }}>
                    {/* Default download dir is always synced */}
                    <div className="glass-panel" style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Folder size={14} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontSize: '12px' }}>{appSettings.downloadDir} <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>(Default Downloads)</span></span>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold' }}>Primary</span>
                    </div>

                    {/* Custom synced folders */}
                    {appSettings.syncedFolders.filter(f => f !== appSettings.downloadDir).map(folder => (
                      <div key={folder} className="glass-panel" style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Folder size={14} style={{ color: '#a855f7' }} />
                          <span style={{ fontSize: '12px' }}>{folder}</span>
                        </div>
                        <button
                          onClick={() => {
                            const nextFolders = appSettings.syncedFolders.filter(f => f !== folder);
                            updateSetting('syncedFolders', nextFolders);
                            // Release OS-level lock / attributes so folder is restored to original visibility
                            if (electron) {
                              electron.ipcRenderer.invoke('archive-set-os-lock', {
                                path: folder,
                                shouldLock: false,
                                isFolder: true
                              }).catch(() => { });
                              electron.ipcRenderer.send('synced-folders-updated', nextFolders);
                            }
                            // Also unarchive from archivePaths if it was archived
                            setArchivePaths(prev => {
                              const normF = folder.replace(/[\\/]/g, '/').toLowerCase();
                              const updated = prev.filter(p => {
                                const normP = p.replace(/[\\/]/g, '/').toLowerCase();
                                return normP !== normF && !normP.startsWith(normF + '/');
                              });
                              if (updated.length !== prev.length) {
                                localStorage.setItem('player_archive', JSON.stringify(updated));
                                if (electron) electron.ipcRenderer.send('archive-updated', updated);
                              }
                              return updated;
                            });
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                          title="Remove from sync list and restore visibility"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {settingsSubTab === 'security' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* Main Two-Column Layout ── */}
                  <div className="glass-panel" style={{
                    padding: '0',
                    display: 'grid',
                    gridTemplateColumns: '280px 1fr',
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>

                    {/*  LEFT: Status & Info Panel ── */}
                    <div style={{
                      padding: '28px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px',
                      background: 'rgba(255,255,255,0.015)',
                      borderRight: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      {/* Status Icon */}
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        background: settingsArchivePin
                          ? 'linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(234,179,8,0.06) 100%)'
                          : 'rgba(255,255,255,0.04)',
                        border: settingsArchivePin
                          ? '1px solid rgba(234,179,8,0.35)'
                          : '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {settingsArchivePin
                          ? <ShieldCheck size={26} style={{ color: '#eab308' }} />
                          : <ShieldAlert size={26} style={{ color: 'rgba(255,255,255,0.3)' }} />}
                      </div>

                      {/* Title & Status Badge */}
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                          Archive PIN & Access Control
                        </div>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '20px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.6px',
                          background: settingsArchivePin
                            ? 'rgba(34,197,94,0.14)'
                            : 'rgba(239,68,68,0.14)',
                          color: settingsArchivePin ? '#4ade80' : '#f87171',
                          border: settingsArchivePin
                            ? '1px solid rgba(34,197,94,0.3)'
                            : '1px solid rgba(239,68,68,0.3)'
                        }}>
                          {settingsArchivePin ? '● Protected' : '○ Unprotected'}
                        </span>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                        {settingsArchivePin
                          ? 'Your archive is secured with an encrypted PIN. Player and settings stay synchronized in real time.'
                          : 'No PIN is currently configured. Anyone can open and browse the archive freely.'}
                      </div>

                      {/* Spacer */}
                      <div style={{ flex: 1 }} />

                      {/* Reset Button (only visible when PIN is active) */}
                      {settingsArchivePin && (
                        <button
                          type="button"
                          onClick={() => setShowResetPinModal(true)}
                          style={{
                            padding: '10px 0',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '7px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#f87171',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            width: '100%'
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.16)';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239, 68, 68, 0.45)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.08)';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239, 68, 68, 0.25)';
                          }}
                        >
                          <Unlock size={14} /> Reset / Remove PIN
                        </button>
                      )}
                    </div>

                    {/* RIGHT: PIN Entry Form ── */}
                    <div style={{
                      padding: '28px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px'
                    }}>
                      {/* Form Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, rgba(234,179,8,0.15) 0%, rgba(234,179,8,0.05) 100%)',
                            border: '1px solid rgba(234,179,8,0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <KeyRound size={15} style={{ color: '#eab308' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                              {settingsPinTarget === 'archive'
                                ? (settingsArchivePin ? 'Change Archive PIN' : 'Set New Archive PIN')
                                : `Change PIN: ${streamSites.find((s: any) => s.url === settingsPinTarget)?.name || 'Site Tab'}`}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                              {settingsPinTarget === 'archive'
                                ? '4–8 digit numeric passcode for Master Archive'
                                : `4–8 digit passcode for ${streamSites.find((s: any) => s.url === settingsPinTarget)?.name || 'this tab'}`}
                            </div>
                          </div>
                        </div>

                        {/* Reset Target Selector (choose Archive or any Site Tab) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Reset Target:</span>
                          <select
                            value={settingsPinTarget}
                            onChange={(e) => {
                              setSettingsPinTarget(e.target.value);
                              setNewSettingsPin('');
                              setConfirmSettingsPin('');
                              setPinFeedbackMsg(null);
                            }}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(234, 179, 8, 0.4)',
                              borderRadius: '8px',
                              color: '#fff',
                              padding: '5px 10px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              outline: 'none',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                            }}
                          >
                            <option value="archive" style={{ background: '#141422', color: '#fff' }}>
                              🔒 Master Archive PIN
                            </option>
                            {streamSites.map((site: any) => (
                              <option key={site.url} value={site.url} style={{ background: '#141422', color: '#fff' }}>
                                🌐 {site.name} {site.isLocked ? '(Protected)' : '(Unprotected)'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* PIN Input Grid - Side by Side */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* New PIN Field */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
                              New PIN
                            </label>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              color: newSettingsPin.length >= 4 ? '#eab308' : 'var(--text-muted)',
                              transition: 'color 0.2s'
                            }}>
                              {newSettingsPin.length}/8
                            </span>
                          </div>
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            background: newPinFocused
                              ? 'rgba(234, 179, 8, 0.05)'
                              : 'rgba(255,255,255,0.025)',
                            border: newPinFocused
                              ? '1.5px solid rgba(234,179,8,0.6)'
                              : '1px solid rgba(255,255,255,0.08)',
                            boxShadow: newPinFocused
                              ? '0 0 16px rgba(234, 179, 8, 0.12)'
                              : 'none',
                            borderRadius: '10px',
                            padding: '5px 10px 6px',
                            transition: 'all 0.25s ease',
                            cursor: 'text'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Lock size={14} style={{
                                color: newPinFocused ? '#eab308' : 'rgba(255,255,255,0.3)',
                                marginRight: '6px',
                                flexShrink: 0,
                                transition: 'color 0.2s'
                              }} />
                              <input
                                type={showNewPin ? 'text' : 'password'}
                                inputMode="numeric"
                                placeholder="••••"
                                maxLength={8}
                                value={newSettingsPin}
                                onFocus={() => setNewPinFocused(true)}
                                onBlur={() => setNewPinFocused(false)}
                                onChange={(e) => setNewSettingsPin(e.target.value.replace(/\D/g, ''))}
                                style={{
                                  flex: 1,
                                  background: 'transparent',
                                  border: 'none',
                                  outline: 'none',
                                  color: '#fff',
                                  fontSize: '15px',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  letterSpacing: showNewPin ? '3px' : '6px',
                                  padding: '3px 4px'
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setShowNewPin(!showNewPin)}
                                title={showNewPin ? 'Hide PIN' : 'Show PIN'}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: showNewPin ? '#eab308' : 'rgba(255,255,255,0.35)',
                                  cursor: 'pointer',
                                  padding: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s'
                                }}
                              >
                                {showNewPin ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Confirm PIN Field */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
                              Confirm PIN
                            </label>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              color: confirmSettingsPin.length >= 4 ? '#eab308' : 'var(--text-muted)',
                              transition: 'color 0.2s'
                            }}>
                              {confirmSettingsPin.length}/8
                            </span>
                          </div>
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            background: confirmPinFocused
                              ? 'rgba(234, 179, 8, 0.05)'
                              : 'rgba(255,255,255,0.025)',
                            border: confirmPinFocused
                              ? '1.5px solid rgba(234,179,8,0.6)'
                              : '1px solid rgba(255,255,255,0.08)',
                            boxShadow: confirmPinFocused
                              ? '0 0 16px rgba(234, 179, 8, 0.12)'
                              : 'none',
                            borderRadius: '10px',
                            padding: '5px 10px 6px',
                            transition: 'all 0.25s ease',
                            cursor: 'text'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Lock size={14} style={{
                                color: confirmPinFocused ? '#eab308' : 'rgba(255,255,255,0.3)',
                                marginRight: '6px',
                                flexShrink: 0,
                                transition: 'color 0.2s'
                              }} />
                              <input
                                type={showConfirmPin ? 'text' : 'password'}
                                inputMode="numeric"
                                placeholder="••••"
                                maxLength={8}
                                value={confirmSettingsPin}
                                onFocus={() => setConfirmPinFocused(true)}
                                onBlur={() => setConfirmPinFocused(false)}
                                onChange={(e) => setConfirmSettingsPin(e.target.value.replace(/\D/g, ''))}
                                style={{
                                  flex: 1,
                                  background: 'transparent',
                                  border: 'none',
                                  outline: 'none',
                                  color: '#fff',
                                  fontSize: '15px',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  letterSpacing: showConfirmPin ? '3px' : '6px',
                                  padding: '3px 4px'
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPin(!showConfirmPin)}
                                title={showConfirmPin ? 'Hide PIN' : 'Show PIN'}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: showConfirmPin ? '#eab308' : 'rgba(255,255,255,0.35)',
                                  cursor: 'pointer',
                                  padding: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s'
                                }}
                              >
                                {showConfirmPin ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Footer Row: Match Feedback + Save Button aligned */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        paddingTop: '4px'
                      }}>
                        {/* Match Feedback (left side) */}
                        <div style={{ flex: 1 }}>
                          {confirmSettingsPin.length > 0 && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: newSettingsPin === confirmSettingsPin && newSettingsPin.length >= 4
                                ? 'rgba(34,197,94,0.08)'
                                : 'rgba(245,158,11,0.08)',
                              border: newSettingsPin === confirmSettingsPin && newSettingsPin.length >= 4
                                ? '1px solid rgba(34,197,94,0.2)'
                                : '1px solid rgba(245,158,11,0.2)',
                              transition: 'all 0.25s ease'
                            }}>
                              {newSettingsPin === confirmSettingsPin && newSettingsPin.length >= 4 ? (
                                <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <Check size={13} /> PINs match - ready to save
                                </span>
                              ) : (
                                <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <X size={13} /> PINs do not match
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Save/Update Button (right side) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {settingsPinTarget !== 'archive' && streamSites.find((s: any) => s.url === settingsPinTarget)?.isLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                const targetSite = streamSites.find((s: any) => s.url === settingsPinTarget);
                                if (!targetSite) return;
                                const nextSites = streamSites.map((s: any) => s.url === settingsPinTarget ? { ...s, isLocked: false, customPin: undefined } : s);
                                setStreamSites(nextSites);
                                try { localStorage.setItem('stream_sites', JSON.stringify(nextSites)); } catch (e) {}
                                setPinFeedbackMsg({ type: 'success', text: `Protection removed from ${targetSite.name}.` });
                                setNewSettingsPin('');
                                setConfirmSettingsPin('');
                              }}
                              className="btn-danger"
                              style={{
                                padding: '9px 18px',
                                borderRadius: '10px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              <Unlock size={13} /> Remove Lock
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin}
                            onClick={async () => {
                              setPinFeedbackMsg(null);
                              if (!newSettingsPin || newSettingsPin.length < 4) {
                                setPinFeedbackMsg({ type: 'error', text: 'PIN must be at least 4 digits.' });
                                return;
                              }
                              if (newSettingsPin !== confirmSettingsPin) {
                                setPinFeedbackMsg({ type: 'error', text: 'PINs do not match. Please re-enter.' });
                                return;
                              }
                              try {
                                const hashedPin = await hashPin(newSettingsPin);
                                if (settingsPinTarget === 'archive') {
                                  localStorage.setItem('player_archive_pin', hashedPin);
                                  setSettingsArchivePin(hashedPin);
                                  if (electron) {
                                    electron.ipcRenderer.send('archive-pin-updated', hashedPin);
                                    electron.ipcRenderer.invoke('save-archive-data', { archivePin: hashedPin }).catch(() => { });
                                  }
                                  setPinFeedbackMsg({ type: 'success', text: 'Archive PIN updated and synchronized with Player!' });
                                } else {
                                  const targetSite = streamSites.find((s: any) => s.url === settingsPinTarget);
                                  const nextSites = streamSites.map((s: any) => {
                                    if (s.url === settingsPinTarget) {
                                      return { ...s, isLocked: true, lockType: 'custom', customPin: hashedPin };
                                    }
                                    return s;
                                  });
                                  setStreamSites(nextSites);
                                  try { localStorage.setItem('stream_sites', JSON.stringify(nextSites)); } catch (e) {}
                                  setPinFeedbackMsg({ type: 'success', text: `PIN for "${targetSite?.name || 'Tab'}" updated successfully!` });
                                }
                                setNewSettingsPin('');
                                setConfirmSettingsPin('');
                              } catch {
                                setPinFeedbackMsg({ type: 'error', text: 'Failed to securely hash PIN.' });
                              }
                            }}
                            style={{
                              padding: '9px 22px',
                              borderRadius: '10px',
                              fontSize: '12.5px',
                              background: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin)
                                ? 'rgba(255,255,255,0.05)'
                                : 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                              color: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin)
                                ? 'rgba(255,255,255,0.25)'
                                : '#000',
                              fontWeight: 700,
                              cursor: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin) ? 'not-allowed' : 'pointer',
                              boxShadow: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin)
                                ? 'none'
                                : '0 4px 16px rgba(234, 179, 8, 0.35)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '7px',
                              border: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin)
                                ? '1px solid rgba(255,255,255,0.06)'
                                : 'none',
                              transition: 'all 0.3s ease',
                              whiteSpace: 'nowrap',
                              flexShrink: 0
                            }}
                          >
                            <Lock size={13} />
                            {settingsPinTarget === 'archive'
                              ? (settingsArchivePin ? 'Update PIN' : 'Save PIN')
                              : (streamSites.find((s: any) => s.url === settingsPinTarget)?.isLocked ? 'Update Tab PIN' : 'Lock Tab with PIN')}
                          </button>
                        </div>
                      </div>

                      {/* Feedback Message (full width below) */}
                      {pinFeedbackMsg && (
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: pinFeedbackMsg.type === 'success' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          color: pinFeedbackMsg.type === 'success' ? '#4ade80' : '#f87171',
                          border: '1px solid ' + (pinFeedbackMsg.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                          fontWeight: 500
                        }}>
                          {pinFeedbackMsg.type === 'success' ? <CheckCircle2 size={15} /> : <ShieldAlert size={15} />}
                          <span>{pinFeedbackMsg.text}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Section 2: Protected Streaming Site Tabs & Passwords ── */}
                  <div className="glass-panel" style={{
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                    background: 'rgba(255,255,255,0.015)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.1) 100%)',
                          border: '1px solid rgba(99, 102, 241, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#a5b4fc'
                        }}>
                          <Globe size={22} />
                        </div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                            Streaming Site Tab Passwords
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Choose which site tab's password to reset, switch lock types, or remove protection
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '4px 12px',
                          borderRadius: '20px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          background: streamSites.some((s: any) => s.isLocked) ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                          color: streamSites.some((s: any) => s.isLocked) ? '#fde047' : 'var(--text-muted)',
                          border: '1px solid ' + (streamSites.some((s: any) => s.isLocked) ? 'rgba(234, 179, 8, 0.25)' : 'rgba(255, 255, 255, 0.08)')
                        }}>
                          {streamSites.filter((s: any) => s.isLocked).length} Protected {streamSites.filter((s: any) => s.isLocked).length === 1 ? 'Tab' : 'Tabs'}
                        </span>
                      </div>
                    </div>

                    {/* Site Tabs List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                      {streamSites.map((site: any, idx: number) => {
                        const isLocked = !!site.isLocked;
                        const isArchiveType = site.lockType === 'archive';
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 16px',
                              borderRadius: '12px',
                              background: isLocked ? 'rgba(234, 179, 8, 0.04)' : 'rgba(255, 255, 255, 0.02)',
                              border: isLocked ? '1px solid rgba(234, 179, 8, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)',
                              transition: 'all 0.2s ease',
                              gap: '12px',
                              flexWrap: 'wrap'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                {getSiteIcon(site)}
                              </div>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {site.name}
                                  {isLocked && <Lock size={12} style={{ color: '#eab308' }} />}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {site.url}
                                </div>
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isLocked ? (
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '3px 10px',
                                  borderRadius: '6px',
                                  background: isArchiveType ? 'rgba(234, 179, 8, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                                  color: isArchiveType ? '#fde047' : '#a5b4fc',
                                  border: isArchiveType ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}>
                                  <KeyRound size={11} />
                                  {isArchiveType ? 'Master Archive PIN' : 'Custom Tab Password'}
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  padding: '3px 10px',
                                  borderRadius: '6px',
                                  background: 'rgba(255, 255, 255, 0.04)',
                                  color: 'rgba(255, 255, 255, 0.4)',
                                  border: '1px solid rgba(255, 255, 255, 0.06)'
                                }}>
                                  Unprotected
                                </span>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                              {isLocked ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenResetSitePin(site)}
                                    className="btn-secondary"
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '8px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      background: 'rgba(234, 179, 8, 0.12)',
                                      borderColor: 'rgba(234, 179, 8, 0.35)',
                                      color: '#fde047'
                                    }}
                                    title="Choose to reset password or switch lock type"
                                  >
                                    <KeyRound size={12} /> Reset Password
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSiteToUnlockConfirm(site)}
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: '8px',
                                      fontSize: '11.5px',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      border: '1px solid rgba(239, 68, 68, 0.25)',
                                      color: '#f87171',
                                      cursor: 'pointer'
                                    }}
                                    title="Remove password protection from this tab"
                                  >
                                    <Unlock size={12} /> Remove Lock
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenResetSitePin(site)}
                                  className="btn-secondary"
                                  style={{
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  title="Add password protection to this tab"
                                >
                                  <Lock size={12} /> Lock Tab
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Site Tab Password Reset Modal ── */}
                  {siteToResetPin && (
                    <div
                      style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 100000,
                        background: 'rgba(0, 0, 0, 0.82)',
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                      }}
                      onClick={() => setSiteToResetPin(null)}
                    >
                      <div
                        style={{
                          background: 'linear-gradient(155deg, #18182b 0%, #0d0d18 100%)',
                          border: '1px solid rgba(234, 179, 8, 0.3)',
                          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.9), 0 0 40px rgba(234, 179, 8, 0.1)',
                          borderRadius: '20px',
                          padding: '30px',
                          maxWidth: '480px',
                          width: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '20px',
                          position: 'relative'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Top Icon & Title */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(234, 179, 8, 0.05) 100%)',
                            border: '1px solid rgba(234, 179, 8, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#eab308'
                          }}>
                            <KeyRound size={22} />
                          </div>
                          <div>
                            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#fff', margin: 0 }}>
                              Reset Password for {siteToResetPin.name}
                            </h3>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                              Choose which type of security password to use for this site tab
                            </p>
                          </div>
                        </div>

                        {/* Lock Type Selection */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <label
                            onClick={() => setSiteResetLockType('archive')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 14px',
                              borderRadius: '10px',
                              background: siteResetLockType === 'archive' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                              border: siteResetLockType === 'archive' ? '1px solid rgba(234, 179, 8, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <ShieldCheck size={18} style={{ color: siteResetLockType === 'archive' ? '#eab308' : 'rgba(255,255,255,0.4)' }} />
                              <div>
                                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#fff' }}>Use Master Archive PIN</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  Protected with your main app Archive PIN
                                </div>
                              </div>
                            </div>
                            <input
                              type="radio"
                              name="siteResetLockType"
                              checked={siteResetLockType === 'archive'}
                              onChange={() => setSiteResetLockType('archive')}
                              style={{ accentColor: '#eab308' }}
                            />
                          </label>

                          <label
                            onClick={() => setSiteResetLockType('custom')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 14px',
                              borderRadius: '10px',
                              background: siteResetLockType === 'custom' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                              border: siteResetLockType === 'custom' ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <KeyRound size={18} style={{ color: siteResetLockType === 'custom' ? '#a5b4fc' : 'rgba(255,255,255,0.4)' }} />
                              <div>
                                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#fff' }}>Set Custom Tab Password / PIN</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  Create a dedicated password unique to this tab
                                </div>
                              </div>
                            </div>
                            <input
                              type="radio"
                              name="siteResetLockType"
                              checked={siteResetLockType === 'custom'}
                              onChange={() => setSiteResetLockType('custom')}
                              style={{ accentColor: '#6366f1' }}
                            />
                          </label>
                        </div>

                        {/* Custom PIN Input Fields */}
                        {siteResetLockType === 'custom' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.25)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>New Password / PIN</label>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: 'rgba(0, 0, 0, 0.35)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '8px',
                                padding: '2px 10px'
                              }}>
                                <input
                                  type={siteResetShowPin ? 'text' : 'password'}
                                  value={siteResetNewPin}
                                  onChange={(e) => setSiteResetNewPin(e.target.value)}
                                  placeholder="Enter new password (min 4 chars)"
                                  style={{
                                    flex: 1,
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    color: '#fff',
                                    fontSize: '13px',
                                    padding: '8px 0'
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setSiteResetShowPin(!siteResetShowPin)}
                                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px' }}
                                >
                                  {siteResetShowPin ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Confirm Password / PIN</label>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: 'rgba(0, 0, 0, 0.35)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '8px',
                                padding: '2px 10px'
                              }}>
                                <input
                                  type={siteResetShowPin ? 'text' : 'password'}
                                  value={siteResetConfirmPin}
                                  onChange={(e) => setSiteResetConfirmPin(e.target.value)}
                                  placeholder="Re-enter password to confirm"
                                  style={{
                                    flex: 1,
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    color: '#fff',
                                    fontSize: '13px',
                                    padding: '8px 0'
                                  }}
                                />
                              </div>
                            </div>

                            {/* Match indicator */}
                            {siteResetConfirmPin.length > 0 && (
                              <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px', color: siteResetNewPin === siteResetConfirmPin && siteResetNewPin.length >= 4 ? '#4ade80' : '#f59e0b' }}>
                                {siteResetNewPin === siteResetConfirmPin && siteResetNewPin.length >= 4 ? (
                                  <>
                                    <Check size={12} /> Passwords match
                                  </>
                                ) : (
                                  <>
                                    <X size={12} /> Passwords do not match
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Feedback message */}
                        {siteResetFeedback && (
                          <div style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: siteResetFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: siteResetFeedback.type === 'success' ? '#4ade80' : '#f87171',
                            border: '1px solid ' + (siteResetFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)')
                          }}>
                            {siteResetFeedback.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                            <span>{siteResetFeedback.text}</span>
                          </div>
                        )}

                        {/* Modal Action Buttons */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setSiteToResetPin(null)}
                            className="btn-secondary"
                            style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveSitePinReset}
                            style={{
                              padding: '8px 20px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                              color: '#000',
                              border: 'none',
                              cursor: 'pointer',
                              boxShadow: '0 4px 14px rgba(234, 179, 8, 0.3)'
                            }}
                          >
                            Save & Update Password
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Remove Site Lock Confirmation Modal ── */}
                  {siteToUnlockConfirm && (
                    <div
                      style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 100000,
                        background: 'rgba(0, 0, 0, 0.82)',
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                      }}
                      onClick={() => setSiteToUnlockConfirm(null)}
                    >
                      <div
                        style={{
                          background: 'linear-gradient(155deg, #18182b 0%, #0d0d18 100%)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.9), 0 0 40px rgba(239, 68, 68, 0.15)',
                          borderRadius: '20px',
                          padding: '30px',
                          maxWidth: '440px',
                          width: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '18px',
                          textAlign: 'center',
                          position: 'relative'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '16px',
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#f87171',
                          margin: '0 auto'
                        }}>
                          <Unlock size={24} />
                        </div>

                        <div>
                          <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#fff', margin: 0 }}>
                            Remove Protection for {siteToUnlockConfirm.name}?
                          </h3>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
                            Anyone using this application will be able to access the <strong>{siteToUnlockConfirm.name}</strong> tab without entering a PIN or password.
                          </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setSiteToUnlockConfirm(null)}
                            className="btn-secondary"
                            style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px' }}
                          >
                            Keep Protected
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSiteLock(siteToUnlockConfirm)}
                            style={{
                              padding: '8px 20px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)'
                            }}
                          >
                            Yes, Remove Lock
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Reset PIN Confirmation Modal ── */}
                  {showResetPinModal && (
                    <div
                      style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 99999,
                        background: 'rgba(0, 0, 0, 0.8)',
                        backdropFilter: 'blur(12px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        animation: 'fadeIn 0.2s ease'
                      }}
                      onClick={() => setShowResetPinModal(false)}
                    >
                      <div
                        style={{
                          background: 'linear-gradient(155deg, #1a1a2e 0%, #0d0d18 100%)',
                          border: '1px solid rgba(234, 179, 8, 0.25)',
                          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.9), 0 0 40px rgba(234, 179, 8, 0.08)',
                          borderRadius: '20px',
                          padding: '32px',
                          maxWidth: '480px',
                          width: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '20px',
                          position: 'relative',
                          animation: 'slideUp 0.3s ease'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '14px',
                              background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#f87171'
                            }}>
                              <ShieldAlert size={24} />
                            </div>
                            <div>
                              <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
                                Reset Archive PIN?
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                This action cannot be undone
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowResetPinModal(false)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '9px',
                              color: 'rgba(255, 255, 255, 0.5)',
                              cursor: 'pointer',
                              padding: '7px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
                              (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
                            }}
                          >
                            <X size={15} />
                          </button>
                        </div>

                        {/* Modal Body */}
                        <p style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.6, margin: 0 }}>
                          Removing your Archive PIN will immediately unlock the protected media archive. Anyone with access to this device will be able to open and browse the archive without a passcode.
                        </p>

                        {/* Info Banner */}
                        <div style={{
                          background: 'rgba(234, 179, 8, 0.06)',
                          border: '1px solid rgba(234, 179, 8, 0.18)',
                          borderRadius: '12px',
                          padding: '14px 16px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          fontSize: '12.5px',
                          color: 'rgba(250, 204, 21, 0.9)',
                          lineHeight: 1.5
                        }}>
                          <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                          <span>The Archive Player will receive this update instantly and unlock the secure playlist without requiring a restart.</span>
                        </div>

                        {/* Modal Actions */}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setShowResetPinModal(false)}
                            style={{
                              padding: '10px 20px',
                              borderRadius: '10px',
                              fontSize: '13px',
                              fontWeight: 600,
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'rgba(255,255,255,0.7)',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                            }}
                          >
                            Keep Current PIN
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.removeItem('player_archive_pin');
                              setSettingsArchivePin('');
                              setNewSettingsPin('');
                              setConfirmSettingsPin('');
                              if (electron) {
                                electron.ipcRenderer.send('archive-pin-updated', '');
                                electron.ipcRenderer.invoke('save-archive-data', { archivePin: '' }).catch(() => { });
                              }
                              setShowResetPinModal(false);
                              setPinFeedbackMsg({ type: 'success', text: 'Archive PIN removed. Archive is now unlocked across player and app.' });
                            }}
                            style={{
                              padding: '10px 22px',
                              borderRadius: '10px',
                              fontSize: '13px',
                              fontWeight: 700,
                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '7px',
                              boxShadow: '0 4px 18px rgba(239, 68, 68, 0.4)',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 24px rgba(239, 68, 68, 0.55)';
                              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 18px rgba(239, 68, 68, 0.4)';
                              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                            }}
                          >
                            <Unlock size={14} /> Yes, Reset & Unlock
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Browser Integration Tab */}
          {activeTab === 'integration' && (
            <div className="main-content">
              <div className="main-header">
                <div className="main-title-container">
                  <h1>Browser Integration</h1>
                  <p>Hook net-downloader directly into Chrome, Edge, and other browsers</p>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Windows Native Messaging Host</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Register the registry hooks so standard browsers can delegate downloads to net-downloader.
                    </div>
                  </div>
                  <button className="btn-primary" onClick={handleRegisterBrowserIntegration}>
                    Register Integration
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>How to Install Chrome Extension:</div>
                  <ol style={{ fontSize: '13px', color: 'var(--text-muted)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>Open <strong>Google Chrome</strong> (or Microsoft Edge).</li>
                    <li>Type <strong style={{ color: '#fff' }}>chrome://extensions/</strong> in the address bar and press Enter.</li>
                    <li>In the top-right corner of the Extensions page, enable <strong>Developer Mode</strong>.</li>
                    <li>Click the <strong>Load unpacked</strong> button in the top-left.</li>
                    <li>Browse and select the folder: <br />
                      <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px', color: '#fff', fontSize: '11px' }}>
                        e:\MY SOFTWARES\net-downloader\extension
                      </code>
                    </li>
                    <li>The extension will load! Look for the NetDownloader logo in your toolbar. It will now automatically grab downloads!</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Stream Tab (Persistent) */}
          <div
            className="main-content"
            style={{
              display: activeTab === 'browser' ? 'flex' : 'none',
              flexDirection: 'column',
              height: '100%',
              width: '100%',
              padding: isBrowserFullView ? '12px 16px' : '20px',
              position: isBrowserFullView ? 'fixed' : 'relative',
              inset: isBrowserFullView ? 0 : 'auto',
              zIndex: isBrowserFullView ? 99999 : 'auto',
              background: isBrowserFullView ? '#09090e' : 'transparent',
              minHeight: 0
            }}
          >
            <div className="main-header" style={{ flexShrink: 0, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div className="main-title-container">
                <h1>Stream</h1>
                <p>Browse video sites and download streams locally</p>
              </div>

              {/* Streaming Sites Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)', maxWidth: '520px', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent', whiteSpace: 'nowrap', flexShrink: 1 }}>
                  {streamSites.map((site: any, idx: number) => {
                    let hostname = '';
                    try {
                      hostname = new URL(site.url).hostname.replace('www.', '').toLowerCase();
                    } catch (e) {
                      hostname = site.name.toLowerCase();
                    }
                    const isCurrent = currentBrowserUrl.toLowerCase().includes(hostname);
                    return (
                      <div
                        key={idx}
                        style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStreamTabContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            site
                          });
                        }}
                      >
                        <button
                          onClick={() => {
                            if (site.isLocked && !unlockedStreamUrls.has(site.url)) {
                              setSiteToUnlock(site);
                              setUnlockPinInput('');
                              setUnlockPinError('');
                              setShowUnlockPin(false);
                              return;
                            }
                            navigateBrowser(site.url);
                          }}
                          className="btn-secondary"
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '11px',
                            background: isCurrent ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                            borderColor: isCurrent ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                            color: isCurrent ? '#fff' : 'var(--text-muted)'
                          }}
                          title={`Navigate to ${site.name}${site.isLocked ? ' (Protected)' : ''} - Right-click to edit or remove`}
                        >
                          {getSiteIcon(site)}
                          <span>{site.name}</span>
                          {site.isLocked && (
                            <Lock
                              size={10}
                              style={{
                                color: unlockedStreamUrls.has(site.url) ? '#4ade80' : '#eab308',
                                marginLeft: '2px',
                                flexShrink: 0
                              }}
                            />
                          )}
                        </button>

                        {/* Delete button for custom sites */}
                        {!DEFAULT_STREAM_SITES.some(ds => ds.url === site.url) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteStreamSite(site.url);
                            }}
                            style={{
                              position: 'absolute',
                              top: '-5px',
                              right: '-5px',
                              background: '#ef4444',
                              color: '#ffffff',
                              border: '1px solid rgba(255, 255, 255, 0.4)',
                              borderRadius: '50%',
                              width: '13px',
                              height: '13px',
                              minWidth: '13px',
                              minHeight: '13px',
                              maxWidth: '13px',
                              maxHeight: '13px',
                              padding: 0,
                              margin: 0,
                              lineHeight: '1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '8px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              zIndex: 10,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.6)'
                            }}
                            title="Remove Site"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setShowAddSiteModal(true)}
                  className="btn-primary"
                  style={{
                    padding: '8px 12px',
                    fontSize: '11px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'
                  }}
                >
                  <Plus size={12} /> Add Site
                </button>
              </div>
            </div>

            {/* Browser Toolbar Controls */}
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--panel-border)', marginBottom: '12px', flexShrink: 0 }}>
              {/* Navigation Buttons */}
              <button
                onClick={() => { try { webviewRef.current?.goBack(); } catch (e) {} }}
                className="btn-secondary"
                style={{ padding: '6px 8px', borderRadius: '8px' }}
                title="Go Back"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => { try { webviewRef.current?.goForward(); } catch (e) {} }}
                className="btn-secondary"
                style={{ padding: '6px 8px', borderRadius: '8px' }}
                title="Go Forward"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => {
                  setIsWebviewLoading(true);
                  try { webviewRef.current?.reload(); } catch (e) { setIsWebviewLoading(false); }
                }}
                className="btn-secondary"
                style={{ padding: '6px 8px', borderRadius: '8px' }}
                title="Reload"
              >
                <RefreshCw size={14} className={isWebviewLoading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setIsBrowserFullView(!isBrowserFullView)}
                className="btn-secondary"
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  color: isBrowserFullView ? '#a5b4fc' : 'var(--text-muted)'
                }}
                title={isBrowserFullView ? "Exit Full View" : "Full View"}
              >
                {isBrowserFullView ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                <span>{isBrowserFullView ? "Exit Full" : "Full View"}</span>
              </button>

              {/* Interactive Address Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  navigateBrowser(urlInput);
                }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}
              >
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <Globe size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Enter URL or stream link..."
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      minWidth: 0
                    }}
                  />
                  {cleanStreamUrl(currentBrowserUrl) !== currentBrowserUrl && (
                    <button
                      type="button"
                      onClick={() => navigateBrowser(cleanStreamUrl(currentBrowserUrl))}
                      style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                      }}
                      title={`Switch to direct video room: ${cleanStreamUrl(currentBrowserUrl)}`}
                    >
                      <Sparkles size={11} /> Open Original Room
                    </button>
                  )}
                </div>
              </form>

              {/* Capture Download Button */}
              {(() => {
                const canDownload = currentBrowserUrl.startsWith('http://') || currentBrowserUrl.startsWith('https://');
                const isYtPlaylist = currentBrowserUrl.includes('list=') || currentBrowserUrl.includes('playlist?list=');
                return (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isYtPlaylist && (
                      <button
                        onClick={async () => {
                          if (!electron) return;
                          setAddUrl(currentBrowserUrl);
                          setIsYoutubeCheck(true);
                          handleDownloadPlaylist(currentBrowserUrl);
                        }}
                        className="btn-primary"
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          boxShadow: '0 2px 10px rgba(16, 185, 129, 0.2)'
                        }}
                      >
                        <List size={12} />
                        <span>Download Playlist</span>
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!electron || isDetectingStream) return;
                        setIsDetectingStream(true);
                        try {
                          const isYt = currentBrowserUrl.includes('youtube.com/') || currentBrowserUrl.includes('youtu.be/');
                          const isSocial = isSocialOrPlatformUrl(currentBrowserUrl);
                          setIsYoutubeCheck(isYt || isSocial);

                          if (isYt || isSocial) {
                            setAddUrl(currentBrowserUrl);
                            let pageCookies = '';
                            try {
                              pageCookies = await electron.ipcRenderer.invoke('get-page-cookies', currentBrowserUrl);
                            } catch (e) { }

                            fetchFormats(currentBrowserUrl, {
                              pageUrl: currentBrowserUrl,
                              headers: {
                                Cookie: pageCookies,
                                Referer: currentBrowserUrl
                              }
                            });
                            return;
                          }

                          // For custom streaming sites:
                          let targetMediaUrl = '';
                          let pageTitle = '';
                          let detectedDuration = 0;
                          let liveThumbnail = '';
                          let detectedCurrentTime = 0;

                          try {
                            if (webviewRef.current && webviewRef.current.isConnected) {
                              const scriptToRun = `(${extractWebviewStreamScript.toString()})()`;
                              const detected = await webviewRef.current.executeJavaScript(scriptToRun);
                              if (detected) {
                                if (detected.mediaUrl) targetMediaUrl = detected.mediaUrl;
                                if (detected.title) pageTitle = detected.title;
                                if (detected.duration) detectedDuration = detected.duration;
                                if (detected.currentTime) detectedCurrentTime = detected.currentTime;

                                // 1. Official studio video poster from player metadata
                                if (detected.poster) {
                                  const isAdOrGif = (src: string) => {
                                    if (!src || typeof src !== 'string') return true;
                                    const l = src.toLowerCase();
                                    return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
                                      l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
                                      l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
                                      l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
                                  };
                                  if (!isAdOrGif(detected.poster)) {
                                    liveThumbnail = detected.poster;
                                  }
                                }

                                // 2. Direct canvas snapshot of active playing video frame
                                if (!liveThumbnail && detected.frameData) {
                                  liveThumbnail = detected.frameData;
                                }

                                // 3. Capture live frame strictly within the video player rectangle
                                if (!liveThumbnail && detected.videoRect && webviewRef.current?.isConnected && typeof (webviewRef.current as any)?.capturePage === 'function') {
                                  try {
                                    const nativeImg = await (webviewRef.current as any).capturePage(detected.videoRect);
                                    if (nativeImg && !nativeImg.isEmpty()) {
                                      liveThumbnail = nativeImg.toDataURL();
                                    }
                                  } catch (err) {
                                    console.warn('[Capture Frame] webview.capturePage error:', err);
                                  }
                                }
                              }
                            }
                          } catch (e) {
                            console.warn('[Stream Detect] Webview inspection error:', e);
                          }

                          // 2. If not found in DOM, check Electron network sniffer
                          if (!targetMediaUrl) {
                            try {
                              const captured = await electron.ipcRenderer.invoke('get-captured-web-media', { pageUrl: currentBrowserUrl });
                              if (captured && captured.success && captured.stream?.mediaUrl) {
                                const isTrash = (u: string) => {
                                  if (!u) return true;
                                  const l = u.toLowerCase();
                                  const adNetworks = [
                                    'trafficjunky', 'exoclick', 'doubleclick', 'googleads', 'googlesyndication',
                                    'tsyndicate', 'adsterra', 'popads', 'juicyads', 'adnxs', 'exosrv', 'realsrv',
                                    'serving-sys', 'innovid', 'spotxchange', 'springserve', 'imasdk',
                                    'flashtalking', 'sizmek', 'connatix', 'vidoomy', 'monetag', 'admaven'
                                  ];
                                  if (adNetworks.some(d => l.includes(d))) return true;
                                  return l.includes('.gif') || l.includes('banner') ||
                                    l.includes('creative') || l.includes('advert') || l.includes('sponsor') ||
                                    l.includes('promo') || l.includes('exclusive') || l.includes('teaser') ||
                                    l.includes('preview') || l.includes('/ads/') || l.includes('/ad/') ||
                                    l.includes('preroll') || l.includes('interstitial') ||
                                    l.includes('video_ad') || l.includes('videoad') || l.includes('ad_video') ||
                                    l.includes('commercial') || l.includes('overlay') ||
                                    l.includes('ad_type=') || l.includes('campaign_id=') || l.includes('creative_id=');
                                };
                                if (!isTrash(captured.stream.mediaUrl)) {
                                  targetMediaUrl = captured.stream.mediaUrl;
                                }
                              }
                            } catch (e) { }
                          }

                          // Fetch cookies from the active session to bypass age verification & CDN token blocks
                          let pageCookies = '';
                          try {
                            pageCookies = await electron.ipcRenderer.invoke('get-page-cookies', currentBrowserUrl);
                          } catch (e) { }

                          const isAdOrGif = (src: string) => {
                            if (!src || typeof src !== 'string') return true;
                            const l = src.toLowerCase();
                            return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
                              l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
                              l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
                              l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
                          };
                          const cleanLiveThumb = isAdOrGif(liveThumbnail) ? '' : liveThumbnail;

                          const effectivePageUrl = cleanStreamUrl(currentBrowserUrl);
                          const resolvedUrl = targetMediaUrl || effectivePageUrl;
                          setAddUrl(resolvedUrl);
                          fetchFormats(resolvedUrl, {
                            title: pageTitle,
                            pageUrl: effectivePageUrl,
                            thumbnail: cleanLiveThumb,
                            duration: detectedDuration,
                            currentTime: detectedCurrentTime,
                            headers: {
                              Cookie: pageCookies,
                              Referer: effectivePageUrl
                            }
                          });
                        } finally {
                          setIsDetectingStream(false);
                        }
                      }}
                      disabled={!canDownload || isDetectingStream}
                      className="btn-primary"
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: (canDownload && !isDetectingStream) ? 1 : 0.6,
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        boxShadow: canDownload ? '0 2px 10px rgba(99, 102, 241, 0.2)' : 'none'
                      }}
                    >
                      {isDetectingStream ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Detecting Stream...</span>
                        </>
                      ) : (
                        <>
                          <Download size={12} />
                          <span>Download Video</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* WebView Frame with Dark Background & Loading Overlay */}
            <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--panel-border)', background: '#09090e', position: 'relative', minHeight: 0 }}>
              {isWebviewLoading && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 25,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(9, 9, 14, 0.88)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  gap: '16px',
                  pointerEvents: 'none'
                }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    border: '3.5px solid rgba(255, 255, 255, 0.08)',
                    borderTopColor: '#6366f1',
                    borderRightColor: '#a855f7',
                    animation: 'spin 0.85s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    filter: 'drop-shadow(0 0 16px rgba(168, 85, 247, 0.45))'
                  }} />
                  <span style={{
                    fontFamily: "'Outfit', 'Inter', sans-serif",
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'rgba(255, 255, 255, 0.8)',
                    letterSpacing: '0.4px'
                  }}>
                    Loading web stream...
                  </span>
                </div>
              )}
              <webview
                ref={setWebviewRef}
                partition="persist:panamedia_stream"
                src={browserUrl}
                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                webpreferences="allowRunningInsecureContent=yes, javascript=yes"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  visibility: (showFormatModal || showAddModal || showClearHistoryModal || showFileDetailsModal || showReleaseDialog || Boolean(deleteConfirmTarget)) ? 'hidden' : 'visible'
                }}
              />
            </div>
          </div>

        </div>

      </div>

      {/* Add Download Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Download</h2>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Source URL</label>
              <input
                type="text"
                placeholder="Paste HTTP, HTTPS, or YouTube link..."
                value={addUrl}
                onChange={(e) => {
                  setAddUrl(e.target.value);
                  setIsYoutubeCheck(e.target.value.includes('youtube.com/') || e.target.value.includes('youtu.be/'));
                }}
              />
            </div>

            <div className="form-group">
              <label>Rename File (Optional)</label>
              <input
                type="text"
                placeholder="e.g. video.mp4 (leave empty for original name)"
                value={addFilename}
                onChange={(e) => setAddFilename(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Save Folder</label>
              <div className="form-input-container">
                <input type="text" readOnly value={addSaveDir} />
                <button className="btn-secondary" onClick={handleBrowseDir}>
                  Browse...
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={startImmediately}
                  onChange={(e) => setStartImmediately(e.target.checked)}
                />
                Start downloading immediately
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isYoutubeCheck}
                  onChange={(e) => setIsYoutubeCheck(e.target.checked)}
                />
                {addUrl && (addUrl.toLowerCase().includes('youtube.com/') || addUrl.toLowerCase().includes('youtu.be/'))
                  ? 'YouTube Media Stream'
                  : 'Web Video Stream (Auto Extract)'}
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAddDownload}>
                Add Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stream Site Modal */}
      {showAddSiteModal && (
        <AddStreamSiteModal
          initialData={siteToEdit}
          onClose={() => {
            setShowAddSiteModal(false);
            setSiteToEdit(null);
          }}
          onEditSite={(updatedData: NewStreamSiteData) => {
            setStreamSites((prev: any[]) => {
              const next = prev.map(s => (s.url === siteToEdit?.url ? updatedData : s));
              try { localStorage.setItem('stream_sites', JSON.stringify(next)); } catch (e) { }
              return next;
            });
            setShowAddSiteModal(false);
            setSiteToEdit(null);
            if (currentBrowserUrl === siteToEdit?.url) {
              navigateBrowser(updatedData.url);
            }
          }}
          onAddSite={(siteData: NewStreamSiteData) => {
            setStreamSites((prev: any[]) => {
              const next = [...prev.filter(s => s.url !== siteData.url), siteData];
              try { localStorage.setItem('stream_sites', JSON.stringify(next)); } catch (e) { }
              return next;
            });
            setShowAddSiteModal(false);
            navigateBrowser(siteData.url);
          }}
        />
      )}

      {/* Stream Tab Right-Click Context Menu */}
      {streamTabContextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: streamTabContextMenu.y,
            left: streamTabContextMenu.x,
            zIndex: 100010,
            background: 'rgba(20, 20, 32, 0.96)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.85)',
            padding: '5px',
            minWidth: '150px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <div style={{ padding: '5px 8px', fontSize: '10px', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 }}>
            {streamTabContextMenu.site.name}
          </div>

          {/* Quick Lock / Unlock Tab Option */}
          {streamTabContextMenu.site.isLocked ? (
            unlockedStreamUrls.has(streamTabContextMenu.site.url) ? (
              <button
                onClick={() => handleQuickLockTab(streamTabContextMenu.site)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#eab308',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  textAlign: 'left',
                  fontWeight: 600
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(234, 179, 8, 0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Lock size={12} /> Lock Tab Now
              </button>
            ) : (
              <button
                onClick={() => {
                  setSiteToUnlock(streamTabContextMenu.site);
                  setUnlockPinInput('');
                  setUnlockPinError('');
                  setShowUnlockPin(false);
                  setStreamTabContextMenu(null);
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: '#4ade80',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  textAlign: 'left',
                  fontWeight: 600
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(74, 222, 128, 0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Unlock size={12} /> Unlock Tab
              </button>
            )
          ) : (
            <button
              onClick={() => handleQuickLockTab(streamTabContextMenu.site)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: '#eab308',
                fontSize: '11.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(234, 179, 8, 0.15)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Lock size={12} /> Lock Tab
            </button>
          )}

          <button
            onClick={() => {
              setSiteToEdit(streamTabContextMenu.site);
              setShowAddSiteModal(true);
              setStreamTabContextMenu(null);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: '#fff',
              fontSize: '11.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span>✏️</span> Edit Tab
          </button>
          {!DEFAULT_STREAM_SITES.some(ds => ds.url === streamTabContextMenu.site.url) && (
            <button
              onClick={() => {
                deleteStreamSite(streamTabContextMenu.site.url);
                setStreamTabContextMenu(null);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: '#f87171',
                fontSize: '11.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Trash2 size={12} /> Delete Tab
            </button>
          )}
        </div>
      )}

      {/* Unlock Stream Tab Modal */}
      {siteToUnlock && (
        <div className="modal-backdrop" onClick={() => setSiteToUnlock(null)} style={{ zIndex: 100020 }}>
          <div
            className="glass-panel modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '420px',
              maxWidth: '92vw',
              borderRadius: '18px',
              background: 'linear-gradient(155deg, #141424 0%, #0a0a14 100%)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.9), 0 0 40px rgba(234, 179, 8, 0.15)',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            {/* Top Lock Badge */}
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(234, 179, 8, 0.05) 100%)',
              border: '1px solid rgba(234, 179, 8, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#eab308',
              margin: '0 auto',
              boxShadow: '0 8px 24px rgba(234, 179, 8, 0.2)'
            }}>
              <Lock size={26} />
            </div>

            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>
                Protected Streaming Site
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                Enter {siteToUnlock.lockType === 'archive' ? 'Master Archive PIN' : 'Tab PIN / Password'} to view{' '}
                <strong style={{ color: '#fff' }}>{siteToUnlock.name}</strong>
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!unlockPinInput.trim()) return;
                setIsUnlocking(true);
                setUnlockPinError('');

                try {
                  if (siteToUnlock.lockType === 'archive') {
                    const storedMasterPin = localStorage.getItem('player_archive_pin') || '';
                    if (!storedMasterPin) {
                      setUnlockPinError('No Master Archive PIN is configured in Settings.');
                      setIsUnlocking(false);
                      return;
                    }
                    const verifyRes = await verifyPin(unlockPinInput.trim(), storedMasterPin);
                    if (verifyRes.valid) {
                      setUnlockedStreamUrls(prev => new Set(prev).add(siteToUnlock.url));
                      const target = siteToUnlock.url;
                      setSiteToUnlock(null);
                      navigateBrowser(target);
                    } else {
                      setUnlockPinError('Incorrect PIN. Please try again.');
                    }
                  } else {
                    const storedCustomPin = siteToUnlock.customPin || '';
                    const verifyRes = await verifyPin(unlockPinInput.trim(), storedCustomPin);
                    if (verifyRes.valid) {
                      setUnlockedStreamUrls(prev => new Set(prev).add(siteToUnlock.url));
                      const target = siteToUnlock.url;
                      setSiteToUnlock(null);
                      navigateBrowser(target);
                    } else {
                      setUnlockPinError('Incorrect PIN or Password. Please try again.');
                    }
                  }
                } catch (err) {
                  setUnlockPinError('Verification error.');
                } finally {
                  setIsUnlocking(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(0, 0, 0, 0.4)',
                border: unlockPinError ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                padding: '2px 12px'
              }}>
                <KeyRound size={16} style={{ color: 'rgba(255, 255, 255, 0.4)', marginRight: '8px' }} />
                <input
                  type={showUnlockPin ? 'text' : 'password'}
                  value={unlockPinInput}
                  onChange={(e) => setUnlockPinInput(e.target.value)}
                  placeholder="Enter PIN or Password"
                  autoFocus
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#fff',
                    fontSize: '14px',
                    padding: '10px 0',
                    textAlign: 'center',
                    letterSpacing: showUnlockPin ? '2px' : '4px'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowUnlockPin(!showUnlockPin)}
                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px' }}
                >
                  {showUnlockPin ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {unlockPinError && (
                <div style={{ fontSize: '11.5px', color: '#f87171', fontWeight: 500 }}>
                  {unlockPinError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setSiteToUnlock(null)}
                  className="btn-secondary"
                  style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUnlocking || !unlockPinInput.trim()}
                  style={{
                    padding: '8px 22px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                    color: '#000',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)'
                  }}
                >
                  Unlock & Browse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* YouTube Playlist Modal */}
      {showPlaylistModal && (
        <div className="modal-backdrop" onClick={() => setShowPlaylistModal(false)}>
          <div className="glass-panel modal-content" style={{ width: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>YouTube Playlist Analyzer</h2>
              <button className="modal-close-btn" onClick={() => { setShowPlaylistModal(false); setPlaylistInfo(null); }}>✕</button>
            </div>

            {playlistLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
                <div style={{ fontSize: '14px', fontWeight: '500' }}>Analyzing playlist entries...</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>This queries yt-dlp to extract video metadata.</div>
              </div>
            ) : playlistInfo ? (
              <PlaylistSelector
                playlistInfo={playlistInfo}
                onCancel={() => { setShowPlaylistModal(false); setPlaylistInfo(null); }}
                onConfirm={handleConfirmPlaylist}
              />
            ) : (
              <div style={{ color: 'var(--danger)', display: 'flex', gap: '8px', fontSize: '13px' }}>
                <AlertCircle size={16} /> Failed to load playlist details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* YouTube Video Format Modal */}
      {showFormatModal && (
        <div className="modal-backdrop" onClick={handleCloseFormatsModal}>
          <div className="glass-panel modal-content" style={{ width: '680px', maxWidth: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Select Media Format</h2>
              <button className="modal-close-btn" onClick={handleCloseFormatsModal}>✕</button>
            </div>

            {formatLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px', width: '100%' }}>
                <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', width: '100%', maxWidth: '400px', fontSize: '13px', fontWeight: 'bold' }}>
                  <span>Extracting media formats...</span>
                  <span>{extractProgress}%</span>
                </div>
                <div className="progress-bar-bg" style={{ height: '8px', width: '100%', maxWidth: '400px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${extractProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)'
                    }}
                  ></div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={12} className="animate-spin" /> {isYoutubeCheck ? 'Querying YouTube streams and calculating sizes...' : 'Extracting web video streams and calculating sizes...'}
                </div>
              </div>
            ) : extractError ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '20px', width: '100%', textAlign: 'center' }}>
                <AlertCircle size={44} style={{ color: 'var(--danger)' }} />
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '6px' }}>Failed to extract formats</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '400px', lineHeight: '1.5' }}>{extractError}</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button className="btn-primary" onClick={() => fetchFormats(addUrl)} style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '8px', fontWeight: '600' }}>Retry</button>
                  <button className="btn-secondary" onClick={handleCloseFormatsModal} style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '8px', fontWeight: '600' }}>Cancel</button>
                </div>
              </div>
            ) : youtubeInfo ? (
              <FormatPickerContent
                info={youtubeInfo}
                saveDir={addSaveDir || appSettings.downloadDir}
                onCancel={handleCloseFormatsModal}
                onDownload={async (downloadOptions: { filename: string; totalBytes?: number; youtubeOptions: any; directUrl?: string }) => {
                  setShowFormatModal(false);
                  const isYt = Boolean(youtubeInfo?.isYoutube);
                  const isSocial = isSocialOrPlatformUrl(youtubeInfo?.pageUrl || addUrl);
                  const requiresYtDlp = isYt || isSocial || Boolean(youtubeInfo?.useYtDlp) || Boolean(downloadOptions.youtubeOptions?.useYtDlp);
                  const refererUrl = youtubeInfo?.pageUrl || (!isYt ? addUrl : '');
                  const pageUrl = youtubeInfo?.pageUrl || addUrl;
                  const isAdOrGif = (src?: string | null) => {
                    if (!src || typeof src !== 'string') return true;
                    const l = src.toLowerCase();
                    if (l.includes('youtube.com') || l.includes('ytimg.com') || l.includes('googlevideo.com')) {
                      return false;
                    }
                    return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
                      l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
                      l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
                      l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
                  };
                  const ytFallback = (isYt && youtubeInfo?.id) ? `https://i.ytimg.com/vi/${youtubeInfo.id}/hqdefault.jpg` : '';
                  const cleanThumb = (isAdOrGif(youtubeInfo?.thumbnail) ? '' : (youtubeInfo?.thumbnail || '')) || ytFallback;
                  const finalDownloadUrl = requiresYtDlp ? pageUrl : ((!isYt && downloadOptions.directUrl) ? downloadOptions.directUrl : addUrl);
                  if (electron) {
                    await electron.ipcRenderer.invoke('add-download', {
                      url: finalDownloadUrl,
                      pageUrl: pageUrl,
                      filename: downloadOptions.filename,
                      saveDir: addSaveDir || appSettings.downloadDir,
                      startImmediately: true,
                      isYoutube: isYt,
                      isWebExtractor: !isYt,
                      useYtDlp: requiresYtDlp,
                      thumbnail: cleanThumb,
                      totalBytes: downloadOptions.totalBytes || -1,
                      youtubeOptions: {
                        ...downloadOptions.youtubeOptions,
                        useYtDlp: requiresYtDlp
                      },
                      duration: youtubeInfo.duration || 0,
                      headers: {
                        ...(youtubeInfo?.headers || {}),
                        ...(refererUrl ? { Referer: refererUrl } : {})
                      }
                    });
                  }
                  setAddUrl('');
                  setAddFilename('');
                  setActiveTab('downloads');
                }}
              />
            ) : (
              <div style={{ color: 'var(--danger)', display: 'flex', gap: '8px', fontSize: '14px', padding: '20px', alignItems: 'center' }}>
                <AlertCircle size={20} /> Failed to extract video stream formats. Make sure the URL is valid.
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Details Modal */}
      {showFileDetailsModal && selectedFileDetails && (
        <div className="modal-backdrop" onClick={() => setShowFileDetailsModal(false)}>
          <div className="glass-panel modal-content" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>File Details</h2>
              <button className="modal-close-btn" onClick={() => setShowFileDetailsModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
              <div className="detail-row">
                <div className="detail-label">File Name</div>
                <div className="detail-value" style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', wordBreak: 'break-all' }}>
                  {selectedFileDetails.name}
                </div>
              </div>

              <div className="detail-row">
                <div className="detail-label">Full Path</div>
                <div className="detail-value" style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  {selectedFileDetails.path}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="detail-row">
                  <div className="detail-label">File Size</div>
                  <div className="detail-value">{selectedFileDetails.displaySize ? selectedFileDetails.displaySize : formatBytes(selectedFileDetails.size)}</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Category</div>
                  <div className="detail-value" style={{ textTransform: 'capitalize' }}>{selectedFileDetails.category}</div>
                </div>
              </div>

              <div className="detail-row">
                <div className="detail-label">Last Modified</div>
                <div className="detail-value">
                  {new Date(selectedFileDetails.mtime).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => {
                    setShowFileDetailsModal(false);
                    if (selectedFileDetails.category === 'videos' || selectedFileDetails.category === 'audios' || (selectedFileDetails.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(selectedFileDetails.ext))) {
                      electron?.ipcRenderer.invoke('open-player-window', { filePath: selectedFileDetails.path, filename: selectedFileDetails.name });
                    } else {
                      const parentDir = selectedFileDetails.path.substring(0, selectedFileDetails.path.lastIndexOf('\\')) || selectedFileDetails.path.substring(0, selectedFileDetails.path.lastIndexOf('/'));
                      electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: selectedFileDetails.name });
                    }
                  }}
                >
                  <Play size={14} fill="currentColor" style={{ marginRight: '6px' }} /> Play / Open
                </button>

                <button
                  className="btn-secondary"
                  style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.05)', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => {
                    setDeleteConfirmTarget({
                      type: 'file',
                      title: 'Delete File from Disk',
                      message: `Are you sure you want to permanently delete "${selectedFileDetails.name}" from disk?`,
                      filePath: selectedFileDetails.path,
                      onConfirm: async () => {
                        const res = await performDeleteFile(selectedFileDetails.path);
                        if (res && res.success) {
                          setShowFileDetailsModal(false);
                          setSelectedFileDetails(null);
                        } else {
                          alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
                        }
                      }
                    });
                  }}
                >
                  <Trash2 size={14} /> Delete from Disk
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Choice Modal */}
      {showClearHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowClearHistoryModal(false)}>
          <div className="glass-panel modal-content" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Clear History</h2>
              <button className="modal-close-btn" onClick={() => setShowClearHistoryModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Select which download records you want to clear from history:
              </p>

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
                onClick={() => handleClearHistory('completed')}
              >
                Clear Completed only
              </button>

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
                onClick={() => handleClearHistory('pending')}
              >
                Clear Pending / Queued only
              </button>

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
                onClick={() => handleClearHistory('paused')}
              >
                Clear Paused only
              </button>

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
                onClick={() => handleClearHistory('active')}
              >
                Clear Active / Running only
              </button>

              <button
                className="btn-primary"
                style={{ justifyContent: 'center', padding: '10px 14px', fontSize: '12px', borderRadius: '8px', background: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#fff' }}
                onClick={() => {
                  setShowClearHistoryModal(false);
                  setDeleteConfirmTarget({
                    type: 'all-history',
                    title: 'Clear All History',
                    message: 'Are you sure you want to clear ALL download history? This will stop any running downloads.',
                    onConfirm: () => {
                      handleClearHistory('all');
                    }
                  });
                }}
              >
                Clear All History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="modal-backdrop" style={{ zIndex: 100020 }}>
          <div className="glass-panel modal-content" style={{ width: '400px' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
                {deleteConfirmTarget.title}
              </h2>
            </div>

            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {deleteConfirmTarget.message}
              </p>

              {deleteConfirmTarget.showDeleteFileOption && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    id="custom-delete-disk-option"
                    defaultChecked={false}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Also delete downloaded files from disk</span>
                </label>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setDeleteConfirmTarget(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#fff' }}
                  onClick={() => {
                    const chk = document.getElementById('custom-delete-disk-option') as HTMLInputElement | null;
                    const deleteFromDisk = chk ? chk.checked : false;
                    deleteConfirmTarget.onConfirm(deleteFromDisk);
                    setDeleteConfirmTarget(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right-click Context Menu */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 15000,
            background: 'rgba(12,12,20,0.97)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '6px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            minWidth: '160px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: '9px',
              padding: '8px 12px', background: 'transparent', border: 'none',
              borderRadius: '6px', color: '#bbb', fontSize: '12px', cursor: 'pointer',
              textAlign: 'left', width: '100%', transition: 'all 0.1s'
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.12)'; (e.currentTarget as HTMLElement).style.color = '#a5b4fc'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#bbb'; }}
            onClick={() => {
              if (contextMenu.targetPath) setFlashDriveTarget(contextMenu.targetPath);
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            <Send size={13} /> Send
          </button>
        </div>
      )}

      {/* Send Modal */}
      {flashDriveTarget && (
        <SendToFlashModal
          filePath={flashDriveTarget}
          onClose={() => setFlashDriveTarget(null)}
        />
      )}

      {/* Bottom Toasts container */}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} className="glass-panel" style={{ padding: '12px 18px', background: 'rgba(10, 10, 16, 0.9)', borderLeft: '4px solid var(--success)', display: 'flex', alignItems: 'center', gap: '10px', animation: 'slide-in 0.3s ease' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{t.message}</div>
          </div>
        ))}
      </div>

      {showReleaseDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '420px',
            borderRadius: '20px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            position: 'relative',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
            overflow: 'hidden'
          }}>
            {/* Ambient Background Glow */}
            <div style={{
              position: 'absolute',
              top: '-40px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: releaseCheckStatus === 'update-available' || releaseCheckStatus === 'downloading'
                ? 'rgba(168, 85, 247, 0.2)'
                : releaseCheckStatus === 'download-complete'
                  ? 'rgba(16, 185, 129, 0.2)'
                  : releaseCheckStatus === 'no-internet' || releaseCheckStatus === 'error'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : releaseCheckStatus === 'checking' || releaseCheckStatus === 'installing'
                      ? 'rgba(99, 102, 241, 0.18)'
                      : 'rgba(16, 185, 129, 0.18)',
              filter: 'blur(35px)',
              pointerEvents: 'none',
              zIndex: 0
            }} />

            {/* Close button */}
            <button
              onClick={() => setShowReleaseDialog(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s',
                zIndex: 2
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              ✕
            </button>

            {/* 1. CHECKING STATE */}
            {releaseCheckStatus === 'checking' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px dashed rgba(99, 102, 241, 0.35)', boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)'
                }}>
                  <Loader2 size={32} style={{ color: 'var(--primary)' }} className="animate-spin" />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Checking for Updates...</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px', maxWidth: '300px' }}>
                  Connecting to update servers to check for a newer version of Panamedia.
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Installed Version:</span>
                  <strong style={{ color: '#fff' }}>v{APP_VERSION}</strong>
                </div>
                <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ padding: '8px 24px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                  Cancel
                </button>
              </div>
            )}

            {/* 2. NO INTERNET STATE */}
            {releaseCheckStatus === 'no-internet' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(239, 68, 68, 0.25)', boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)'
                }}>
                  <AlertCircle size={34} style={{ color: '#f87171' }} />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>No Internet Connection</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '24px', maxWidth: '300px' }}>
                  Unable to check for updates. Please verify your internet connection and try again.
                </p>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                    Close
                  </button>
                  <button onClick={() => checkReleaseUpdate(true)} className="btn-primary" style={{
                    flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    background: 'linear-gradient(135deg, var(--primary), #a855f7)', boxShadow: '0 4px 15px rgba(99,102,241,0.3)'
                  }}>
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* 3. UPDATE AVAILABLE STATE */}
            {releaseCheckStatus === 'update-available' && (
              compareVersions(latestReleaseVersion, APP_VERSION) > 0 ? (
                <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{
                    width: '68px', height: '68px', borderRadius: '50%',
                    background: 'rgba(168, 85, 247, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '18px', border: '1px solid rgba(168, 85, 247, 0.3)', boxShadow: '0 0 25px rgba(168, 85, 247, 0.25)'
                  }}>
                    <CloudDownload size={34} style={{ color: '#c084fc' }} />
                  </div>
                  <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>New Version Available!</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px' }}>
                    A new release of Panamedia is available. Download and install the update to get the latest features and improvements.
                  </p>
                  {releaseNotes && (
                    <p style={{ fontSize: '11px', color: 'rgba(192,132,252,0.7)', lineHeight: '1.4', marginBottom: '12px', maxWidth: '340px', fontStyle: 'italic' }}>
                      {releaseNotes.length > 150 ? releaseNotes.substring(0, 150) + '...' : releaseNotes}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.04)', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Current:</span>
                      <strong style={{ color: '#fff' }}>v{APP_VERSION}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(168, 85, 247, 0.12)', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                      <span style={{ color: '#c084fc' }}>Latest:</span>
                      <strong style={{ color: '#e9d5ff' }}>v{latestReleaseVersion}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                      Later
                    </button>
                    <button
                      onClick={startUpdateDownload}
                      className="btn-primary"
                      style={{
                        flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                        background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}
                    >
                      <CloudDownload size={14} /> Download Update
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{
                    width: '68px', height: '68px', borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '18px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)'
                  }}>
                    <CheckCircle2 size={36} style={{ color: '#10b981' }} />
                  </div>
                  <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>You're Up to Date!</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px', maxWidth: '320px' }}>
                    You have the latest version of Panamedia installed. No new version is required.
                  </p>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.22)',
                    borderRadius: '10px', padding: '6px 14px', marginBottom: '24px'
                  }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Installed Version:</span>
                    <strong style={{ fontSize: '13px', color: '#fff' }}>v{APP_VERSION}</strong>
                    <span style={{
                      fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399',
                      padding: '2px 7px', borderRadius: '5px', fontWeight: '700', letterSpacing: '0.3px',
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                      Latest
                    </span>
                  </div>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ padding: '10px 24px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', width: '100%' }}>
                    Close
                  </button>
                </div>
              )
            )}

            {/* IDLE / DEFAULT STATE */}
            {releaseCheckStatus === 'idle' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(99, 102, 241, 0.3)', boxShadow: '0 0 25px rgba(99, 102, 241, 0.2)'
                }}>
                  <CloudDownload size={34} style={{ color: '#818cf8' }} />
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Panamedia Updates</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px' }}>
                  Check if a newer release of Panamedia is available for download.
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Installed Version:</span>
                  <strong style={{ color: '#fff' }}>v{APP_VERSION}</strong>
                </div>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                    Close
                  </button>
                  <button onClick={() => checkReleaseUpdate(true)} className="btn-primary" style={{
                    flex: 1.3, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                    background: 'linear-gradient(135deg, var(--primary), #a855f7)', boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}>
                    <RefreshCw size={13} /> Check Now
                  </button>
                </div>
              </div>
            )}

            {/* 4. DOWNLOADING STATE */}
            {releaseCheckStatus === 'downloading' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(168, 85, 247, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(168, 85, 247, 0.3)', boxShadow: '0 0 25px rgba(168, 85, 247, 0.2)'
                }}>
                  <Loader2 size={32} style={{ color: '#c084fc' }} className="animate-spin" />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Downloading Update...</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '16px' }}>
                  Downloading Panamedia v{latestReleaseVersion}. Please wait...
                </p>

                {/* Progress Bar */}
                <div style={{ width: '100%', marginBottom: '10px' }}>
                  <div style={{
                    width: '100%', height: '8px', borderRadius: '4px',
                    background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${updateDownloadProgress}%`,
                      borderRadius: '4px',
                      background: 'linear-gradient(90deg, #6366f1, #a855f7, #c084fc)',
                      transition: 'width 0.3s ease',
                      boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)'
                    }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  <span>{updateDownloadProgress > 0 ? `${updateDownloadProgress}%` : 'Starting...'}</span>
                  <span>
                    {updateTotalBytes > 0
                      ? `${(updateDownloadedBytes / 1024 / 1024).toFixed(1)} / ${(updateTotalBytes / 1024 / 1024).toFixed(1)} MB`
                      : updateDownloadedBytes > 0 ? `${(updateDownloadedBytes / 1024 / 1024).toFixed(1)} MB downloaded` : ''}
                  </span>
                </div>

                <button
                  onClick={() => {
                    if (electron) electron.ipcRenderer.invoke('cancel-app-update-download');
                    setReleaseCheckStatus('update-available');
                  }}
                  className="btn-secondary"
                  style={{ padding: '8px 24px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}
                >
                  Cancel Download
                </button>
              </div>
            )}

            {/* 5. DOWNLOAD COMPLETE STATE — Install Button */}
            {releaseCheckStatus === 'download-complete' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)'
                }}>
                  <CheckCircle2 size={36} style={{ color: '#10b981' }} />
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Download Complete!</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px', maxWidth: '320px' }}>
                  Panamedia v{latestReleaseVersion} has been downloaded successfully. Click "Install & Restart" to apply the update.
                </p>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px',
                  padding: '5px 12px', fontSize: '11px', color: '#34d399', marginBottom: '24px'
                }}>
                  <CheckCircle2 size={12} /> Ready to install
                </div>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                    Install Later
                  </button>
                  <button
                    onClick={installUpdate}
                    className="btn-primary"
                    style={{
                      flex: 1.3, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                  >
                    <CloudDownload size={14} /> Install & Restart
                  </button>
                </div>
              </div>
            )}

            {/* 6. INSTALLING STATE */}
            {releaseCheckStatus === 'installing' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px dashed rgba(99, 102, 241, 0.35)', boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)'
                }}>
                  <Loader2 size={32} style={{ color: 'var(--primary)' }} className="animate-spin" />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Installing Update...</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
                  Launching installer. The app will close shortly...
                </p>
              </div>
            )}

            {/* 7. ERROR STATE */}
            {releaseCheckStatus === 'error' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(239, 68, 68, 0.25)', boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)'
                }}>
                  <AlertCircle size={34} style={{ color: '#f87171' }} />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Update Failed</h2>
                <p style={{ fontSize: '12px', color: '#f87171', lineHeight: '1.5', marginBottom: '8px' }}>
                  {updateError || 'An unexpected error occurred.'}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  Please check your connection and try again.
                </p>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                    Close
                  </button>
                  <button
                    onClick={() => checkReleaseUpdate(true)}
                    className="btn-primary"
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      background: 'linear-gradient(135deg, var(--primary), #a855f7)', boxShadow: '0 4px 15px rgba(99,102,241,0.3)'
                    }}
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* 8. UP TO DATE STATE */}
            {releaseCheckStatus === 'up-to-date' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)'
                }}>
                  <CheckCircle2 size={36} style={{ color: '#10b981' }} />
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>You're Up to Date!</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px', maxWidth: '320px' }}>
                  You are using the latest version of Panamedia. All the newest features, video format support, and optimizations are already installed.
                </p>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.22)',
                  borderRadius: '10px', padding: '6px 14px', marginBottom: '24px'
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Current Version:</span>
                  <strong style={{ fontSize: '13px', color: '#fff' }}>v{APP_VERSION}</strong>
                  <span style={{
                    fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399',
                    padding: '2px 7px', borderRadius: '5px', fontWeight: '700', letterSpacing: '0.3px',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    Latest
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button
                    onClick={startUpdateDownload}
                    className="btn-primary"
                    style={{
                      flex: 1.3, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                      background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                      boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                    title="Download the latest Panamedia installer directly to your PC"
                  >
                    <CloudDownload size={13} /> Download Setup (v{latestReleaseVersion})
                  </button>
                  <button
                    onClick={() => setShowReleaseDialog(false)}
                    className="btn-secondary"
                    style={{ flex: 0.7, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
