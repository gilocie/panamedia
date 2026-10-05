/**
 * SendConvertPreparationModal.tsx
 * ================================
 * VideoProc-style high-performance Media Converter UI for Panamedia.
 * Modular orchestrator utilizing components from ./converter-pro/
 */

import React, { useState, useEffect, useCallback } from 'react';
import { electron } from './panamedia/types';
import {
  getQueue,
  subscribeQueue,
  removeFromQueue,
  clearQueue,
  normalizeQueuePath
} from './panamedia/converterQueue';
import { getOutputs, removeOutputs, subscribeOutputs } from './panamedia/converterOutputs';
import {
  type SendConvertOptions,
  type SendConvertPreparationModalProps,
  type MediaToolItem,
  isVideoFile,
  formatSeconds,
  VIDEO_FORMATS,
  AUDIO_FORMATS,
  ConverterHeader,
  TopTabsBar,
  ConvertQueueList,
  OutputHistoryList,
  PreviewMonitor,
  ExportSettingsPanel,
  ConverterBottomDock,
  FormatSettingsModal,
  CutTrimTool,
  CropTool,
  SubtitleTool,
  EffectTool,
  RotateTool,
  WatermarkTool,
  CompressTool,
  GifTool,
  DenoiseTool,
  SplitTool,
  ToolInfoModal
} from './converter-pro';

export { isVideoFile, formatSeconds, type SendConvertOptions };

export function SendConvertPreparationModal({
  fileName,
  targetAction = 'convert',
  isBatch: _isBatch = false,
  batchCount: _batchCount = 1,
  queuedFiles,
  onAddFiles,
  onRemoveFile,
  onClearQueue,
  drives = [],
  streamingPort = 52321,
  onProceed,
  onDirectSend,
  onMinimizeChange,
  isConverting = false,
  isPaused = false,
  conversionProgress = 0,
  activeConvertingFile,
  conversionStatus: externalConversionStatus = {},
  onTogglePauseConversion,
  onConvertSingleFile,
  onTogglePauseSingleFile,
  onBack,
  onClose,
  onQueueFilesRemoved,
  activeMainTab: restoredMainTab = 'convert',
  onActiveMainTabChange,
}: SendConvertPreparationModalProps) {
  // The queue is owned by converterQueue. This used to keep its own copy seeded
  // from `converter_queue` and then fall back to `fileName` (the playing file),
  // re-persisting it -- so entries the user had just removed came straight back.
  const [localQueue, setLocalQueue] = useState<string[]>(() => getQueue());
  useEffect(() => subscribeQueue(setLocalQueue), []);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Per-file tool settings (Cut, Crop, Subtitle, Effect, Rotate,
  // Watermark, Compress). Keyed by normalised path so settings survive
  // queue reordering. The engine consumes them as options.tools.
  const [toolSettings, setToolSettings] = useState<Record<string, Record<string, unknown>>>({});
  const applyToolSettings = (file: string, tool: string, settings: Record<string, unknown>) => {
    const key = normalizeQueuePath(file);
    if (!key) return;
    setToolSettings(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [tool]: settings }
    }));
  };

  // Phase G: capacity and power, checked before a queue starts rather than
  // discovered by ffmpeg halfway through. `capacityNote` is advisory -- the
  // engine still refuses a destination it knows cannot work -- while
  // `onBattery` explains a queue that is running slower than usual.
  const [capacityNote, setCapacityNote] = useState<string>('');
  const [onBattery, setOnBattery] = useState<boolean>(false);

  // Window states: Expand/Maximize to fit device screen, Minimize to background
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);


  useEffect(() => {
    if (onMinimizeChange) {
      onMinimizeChange(isMinimized);
    }
  }, [isMinimized, onMinimizeChange]);

  // Top Tabs: Convert Tab, Video Output, Audio Output
  const [activeMainTab, setActiveMainTab] = useState<'convert' | 'video_output' | 'audio_output'>(restoredMainTab);

  const handleSelectMainTab = (tab: 'convert' | 'video_output' | 'audio_output') => {
    setActiveMainTab(tab);
    onActiveMainTabChange?.(tab);
  };

  // Format modal mode: video or audio
  const [formatModalMode, setFormatModalMode] = useState<'video' | 'audio'>('video');

  // Media type per card (user can toggle Video vs Audio - fully persisted across app restarts & power loss)
  const [mediaTypes, setMediaTypes] = useState<Record<string, 'video' | 'audio'>>(() => {
    let saved: Record<string, 'video' | 'audio'> = {};
    try {
      saved = JSON.parse(localStorage.getItem('converter_media_types') || '{}');
    } catch (e) {}
    const map: Record<string, 'video' | 'audio'> = { ...saved };
    const queueList = localQueue && localQueue.length > 0 ? localQueue : (queuedFiles || []);
    queueList.forEach(f => {
      if (!map[f]) {
        map[f] = isVideoFile(f) ? 'video' : 'audio';
      }
    });
    return map;
  });

  // Converted outputs history
  const [convertedVideos, setConvertedVideos] = useState<Array<{
    name: string;
    path: string;
    size?: string;
    format: string;
    resolutionOrBitrate?: string;
    date: string;
  }>>([]);

  const [convertedAudios, setConvertedAudios] = useState<Array<{
    name: string;
    path: string;
    size?: string;
    format: string;
    resolutionOrBitrate?: string;
    date: string;
  }>>([]);

  // The `queuedFiles` prop is deliberately NOT merged back into the queue here.
  //
  // This effect used to do exactly that, and it is why "remove all" appeared
  // not to work: the parent still held the pre-removal list for a render, this
  // effect wrote it straight back to storage, and the freshly cleared queue was
  // repopulated behind the user's back. The same happened one card at a time.
  //
  // converterQueue is now the only writer. If something genuinely needs adding,
  // it calls addToQueue itself -- which is what the Add button and the player
  // header do.

  // Format Presets - persisted across sessions & reboots
  const [selectedVideoFmt, setSelectedVideoFmt] = useState<string>(() => {
    return localStorage.getItem('converter_video_fmt') || 'mp4';
  });
  const [videoQuality, setVideoQuality] = useState<string>(() => {
    return localStorage.getItem('converter_video_quality') || '1080p';
  });
  const [selectedAudioFmt, setSelectedAudioFmt] = useState<string>(() => {
    return localStorage.getItem('converter_audio_fmt') || 'mp3';
  });
  const [audioBitrate, setAudioBitrate] = useState<string>(() => {
    return localStorage.getItem('converter_audio_bitrate') || '320k';
  });

  useEffect(() => {
    localStorage.setItem('converter_video_fmt', selectedVideoFmt);
  }, [selectedVideoFmt]);
  useEffect(() => {
    localStorage.setItem('converter_video_quality', videoQuality);
  }, [videoQuality]);
  useEffect(() => {
    localStorage.setItem('converter_audio_fmt', selectedAudioFmt);
  }, [selectedAudioFmt]);
  useEffect(() => {
    localStorage.setItem('converter_audio_bitrate', audioBitrate);
  }, [audioBitrate]);

  const activeVideoPreset = VIDEO_FORMATS.find(f => f.id === selectedVideoFmt) || VIDEO_FORMATS[0];
  const activeAudioPreset = AUDIO_FORMATS.find(f => f.id === selectedAudioFmt) || AUDIO_FORMATS[0];

  // Format Settings Dialog Modal & Active Feature Tool Dialog
  const [showFormatModal, setShowFormatModal] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<MediaToolItem | null>(null);

  // Preview & Queue Navigation
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);

  // Corner player state synced from Electron main player
  const [appPlayerState, setAppPlayerState] = useState<{
    filePath: string;
    filename: string;
    playing: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    minimized: boolean;
  } | null>(null);

  useEffect(() => {
    if (!electron) return;
    // Local const so the non-null narrowing survives into the cleanup closure.
    const bridge = electron;
    const handlePlayerState = (_event: any, state: any) => {
      setAppPlayerState(state);
    };
    bridge.ipcRenderer.on('player-state-changed', handlePlayerState);
    bridge.ipcRenderer.invoke('get-player-state').then((state: any) => {
      if (state) setAppPlayerState(state);
    }).catch(() => {});

    // Ensure player is paused by default when converter opens
    bridge.ipcRenderer.send('player-remote-command', 'pause');

    return () => {
      bridge.ipcRenderer.removeListener('player-state-changed', handlePlayerState);
    };
  }, []);

  // Engine Settings
  const [useHwAccel, setUseHwAccel] = useState<boolean>(() => localStorage.getItem('converter_useHwAccel') !== 'false');
  useEffect(() => {
    localStorage.setItem('converter_useHwAccel', String(useHwAccel));
  }, [useHwAccel]);

  // Sync minimized state to Electron and Player Titlebar progress card
  useEffect(() => {
    if (!electron) return;
    if (isMinimized) {
      const activeFile = (activeConvertingFile || localQueue[selectedFileIdx] || fileName || '').split(/[\\/]/).pop() || '';
      const displayProgress = Math.round(conversionProgress <= 1 && conversionProgress > 0 ? conversionProgress * 100 : conversionProgress);
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: true,
        converting: isConverting,
        isPaused: isPaused,
        progress: displayProgress,
        queueCount: localQueue.length,
        currentFile: activeFile,
        statusText: isConverting
          ? (isPaused ? 'Conversion Paused' : (localQueue.length > 1 ? `Converting (${displayProgress}%)` : `Converting... ${displayProgress}%`))
          : (localQueue.length > 1 ? `${localQueue.length} files queued` : 'Ready to Convert'),
        useHwAccel: useHwAccel,
        queue: localQueue,
        mediaTypes: mediaTypes
      });
    }
  }, [isMinimized, isConverting, isPaused, conversionProgress, activeConvertingFile, localQueue, selectedFileIdx, fileName, useHwAccel, mediaTypes]);

  // Listen for restore requests from Player Header progress card
  useEffect(() => {
    if (!electron) return;
    const bridge = electron;
    const handleRestoreRequest = () => {
      setIsMinimized(false);
    };
    bridge.ipcRenderer.on('converter-restore-request', handleRestoreRequest);
    return () => {
      bridge.ipcRenderer.removeListener('converter-restore-request', handleRestoreRequest);
    };
  }, []);

  const handleMinimizeModal = () => {
    setIsMinimized(true);
    if (onMinimizeChange) onMinimizeChange(true);
    const activeFile = (activeConvertingFile || localQueue[selectedFileIdx] || fileName || '').split(/[\\/]/).pop() || '';
    const displayProgress = Math.round(conversionProgress <= 1 && conversionProgress > 0 ? conversionProgress * 100 : conversionProgress);
    if (electron) {
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: true,
        converting: isConverting,
        isPaused: isPaused,
        progress: displayProgress,
        queueCount: localQueue.length,
        currentFile: activeFile,
        statusText: isConverting
          ? (isPaused ? 'Conversion Paused' : (localQueue.length > 1 ? `Converting (${displayProgress}%)` : `Converting... ${displayProgress}%`))
          : (localQueue.length > 1 ? `${localQueue.length} files queued` : 'Ready to Convert'),
        useHwAccel: useHwAccel,
        queue: localQueue,
        mediaTypes: mediaTypes
      });
      electron.ipcRenderer.send('player-remote-command', 'play');
    }
  };

  const handleDone = () => {
    // The queue is NOT written here. converterQueue already persisted it at the
    // moment of the change, and by the time this runs the local copy may be
    // stale -- dismissing the modal could therefore put back an entry the user
    // had just deleted, or resurrect the whole queue after "remove all".
    localStorage.setItem('converter_media_types', JSON.stringify(mediaTypes));
    
    // If conversion is actively running, never unmount or kill the conversion process!
    if (isConverting) {
      handleMinimizeModal();
      return;
    }

    const activeFile = (localQueue[selectedFileIdx] || fileName).split(/[\\/]/).pop() || '';
    if (electron) {
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: true,
        converting: false,
        isPaused: false,
        progress: 0,
        queueCount: localQueue.length,
        currentFile: activeFile,
        statusText: localQueue.length > 1 ? `${localQueue.length} files queued` : 'Ready to Convert',
        useHwAccel: useHwAccel,
        queue: localQueue,
        mediaTypes: mediaTypes,
        options: {
          videoFormat: selectedVideoFmt,
          videoQuality: videoQuality,
          audioFormat: selectedAudioFmt,
          audioBitrate: audioBitrate,
          useHwAccel: useHwAccel,
          destination: exportDestination,
          driveLetter: selectedDriveLetter,
          customFolder: customExportFolder,
          videoOutputDir: videoOutputPath,
          audioOutputDir: audioOutputPath
        }
      });
      electron.ipcRenderer.send('player-remote-command', 'play');
    }
    if (onClose) onClose();
    else if (onBack) onBack();
  };

  // Engine Settings - persisted across reboots & power loss
  const [useHqEngine, setUseHqEngine] = useState<boolean>(() => {
    return localStorage.getItem('converter_useHqEngine') !== 'false';
  });
  const [deinterlacing, setDeinterlacing] = useState<boolean>(() => {
    return localStorage.getItem('converter_deinterlacing') !== 'false';
  });
  const [autoCopy, setAutoCopy] = useState<boolean>(() => {
    return localStorage.getItem('converter_autoCopy') === 'true';
  });
  const [mergeFiles, setMergeFiles] = useState<boolean>(() => {
    return localStorage.getItem('converter_mergeFiles') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('converter_useHqEngine', String(useHqEngine));
  }, [useHqEngine]);
  useEffect(() => {
    localStorage.setItem('converter_deinterlacing', String(deinterlacing));
  }, [deinterlacing]);
  useEffect(() => {
    localStorage.setItem('converter_autoCopy', String(autoCopy));
  }, [autoCopy]);
  useEffect(() => {
    localStorage.setItem('converter_mergeFiles', String(mergeFiles));
  }, [mergeFiles]);

  // Output Destination Settings - persisted across reboots & power loss
  const [exportDestination, setExportDestination] = useState<'sendtray' | 'drive' | 'folder'>(() => {
    const saved = localStorage.getItem('converter_export_dest') as 'sendtray' | 'drive' | 'folder';
    if (saved) return saved;
    return targetAction === 'drive' ? 'drive' : 'sendtray';
  });
  useEffect(() => {
    localStorage.setItem('converter_export_dest', exportDestination);
  }, [exportDestination]);

  const [selectedDriveLetter, setSelectedDriveLetter] = useState<string>(
    drives && drives.length > 0 ? drives[0].letter : ''
  );
  const [customExportFolder, setCustomExportFolder] = useState<string>(() => {
    return localStorage.getItem('converter_custom_export_folder') || '';
  });
  useEffect(() => {
    if (customExportFolder) {
      localStorage.setItem('converter_custom_export_folder', customExportFolder);
    }
  }, [customExportFolder]);

  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);

  // Dedicated Video & Audio Output Folders in Documents\Panamedia
  const [videoOutputPath, setVideoOutputPath] = useState<string>(() => {
    return localStorage.getItem('panamedia_video_output_dir') || '';
  });
  const [audioOutputPath, setAudioOutputPath] = useState<string>(() => {
    return localStorage.getItem('panamedia_audio_output_dir') || '';
  });

  /**
   * Builds one output tab: the folder scan, plus everything the converter
   * actually produced, merged on normalised path.
   *
   * This used to be the folder scan alone, assigned wholesale. That is why a
   * finished conversion never showed up. The destination defaults to the
   * sendtray (or a flash drive, or a custom folder), and only the two
   * Documents\Panamedia output folders were ever read -- so the default path
   * wrote to a place nothing looked at. Assigning rather than merging also
   * meant any entry remembered elsewhere was erased by the next refresh.
   *
   * The scan still runs, because browsing those folders by hand is a real
   * feature; it is simply no longer the only source.
   */
  const buildOutputList = (
    scanned: any[] | null | undefined,
    kind: 'video' | 'audio'
  ) => {
    const fromScan: Array<{
      name: string; path: string; thumbnailPath?: string; size?: string; format: string;
      resolutionOrBitrate?: string; date: string;
    }> = Array.isArray(scanned)
      ? scanned.map((f: any) => ({
          name: f.name,
          path: f.path,
          size: f.size,
          format: f.format,
          resolutionOrBitrate: f.resolutionOrBitrate,
          date: f.date,
        }))
      : [];

    const fromRegistry: typeof fromScan = getOutputs(kind).map((o) => ({
      name: o.name,
      path: o.path,
      thumbnailPath: o.thumbnailPath,
      size: o.size,
      format: o.format,
      resolutionOrBitrate: o.detail,
      date: o.date,
    }));

    // Registry entries win on conflict: they carry the kind the user actually
    // chose, whereas the scan has no idea what produced the file.
    const seen = new Set<string>();
    const merged: typeof fromScan = [];
    for (const item of [...fromRegistry, ...fromScan]) {
      if (!item.path) continue;
      const key = normalizeQueuePath(item.path);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    // Newest first. Dates are localised strings, so fall back to keeping the
    // registry's order rather than pretending to compare them.
    return merged.sort((a, b) => {
      const ta = Date.parse(a.date);
      const tb = Date.parse(b.date);
      if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
      return tb - ta;
    });
  };

  const refreshOutputFiles = useCallback(() => {
    if (!electron) return;
    const vPath = videoOutputPath || localStorage.getItem('panamedia_video_output_dir');
    const aPath = audioOutputPath || localStorage.getItem('panamedia_audio_output_dir');

    // Whatever the scan returns, or fails to return, the registry still shows
    // everything that was converted.
    setConvertedVideos(buildOutputList(null, 'video'));
    setConvertedAudios(buildOutputList(null, 'audio'));

    if (vPath) {
      electron.ipcRenderer.invoke('get-converter-output-files', vPath).then((files: any) => {
        setConvertedVideos(buildOutputList(files, 'video'));
      }).catch(() => {});
    }
    if (aPath) {
      electron.ipcRenderer.invoke('get-converter-output-files', aPath).then((files: any) => {
        setConvertedAudios(buildOutputList(files, 'audio'));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoOutputPath, audioOutputPath]);

  const handleOutputFilesDeleted = (paths: string[]) => {
    removeOutputs(paths);
    refreshOutputFiles();
  };

  // Conversions run in the parent, so this component never saw a completion
  // event -- it only refreshed on mount, on tab change and on folder change.
  // That is the second reason the output tabs stayed empty: even for output
  // that did land in a scanned folder, the list did not update until the user
  // navigated away and back. Subscribing to the registry closes that gap.
  useEffect(() => {
    return subscribeOutputs(() => refreshOutputFiles());
  }, [refreshOutputFiles]);

  // Fetch or create default Documents\Panamedia\Video Output & Audio Output folders
  useEffect(() => {
    if (!electron) return;
    electron.ipcRenderer.invoke('get-converter-output-paths').then((paths: any) => {
      if (paths) {
        if (!localStorage.getItem('panamedia_video_output_dir') && paths.videoOutputDir) {
          setVideoOutputPath(paths.videoOutputDir);
        }
        if (!localStorage.getItem('panamedia_audio_output_dir') && paths.audioOutputDir) {
          setAudioOutputPath(paths.audioOutputDir);
        }
        refreshOutputFiles();
      }
    }).catch(() => {});
  }, [refreshOutputFiles]);

  useEffect(() => {
    refreshOutputFiles();
  }, [refreshOutputFiles, activeMainTab]);

  const handleChangeVideoOutputPath = async () => {
    if (!electron) return;
    try {
      const chosen = await electron.ipcRenderer.invoke('select-converter-output-folder', videoOutputPath);
      if (chosen) {
        setVideoOutputPath(chosen);
        localStorage.setItem('panamedia_video_output_dir', chosen);
        refreshOutputFiles();
      }
    } catch (err) {
      console.error('Error selecting video output directory:', err);
    }
  };

  const handleChangeAudioOutputPath = async () => {
    if (!electron) return;
    try {
      const chosen = await electron.ipcRenderer.invoke('select-converter-output-folder', audioOutputPath);
      if (chosen) {
        setAudioOutputPath(chosen);
        localStorage.setItem('panamedia_audio_output_dir', chosen);
        refreshOutputFiles();
      }
    } catch (err) {
      console.error('Error selecting audio output directory:', err);
    }
  };

  const currentFile = localQueue[selectedFileIdx] || fileName;

  // Toggle media type on a card (Video <-> Audio) with immediate localStorage persistence
  const toggleMediaType = (fPath: string) => {
    setMediaTypes(prev => {
      const curr = prev[fPath] || (isVideoFile(fPath) ? 'video' : 'audio');
      const nextType: 'video' | 'audio' = curr === 'video' ? 'audio' : 'video';
      const next = { ...prev, [fPath]: nextType };
      localStorage.setItem('converter_media_types', JSON.stringify(next));
      return next;
    });
  };

  // Queue Selection & Removal Handlers
  const isAllSelected = localQueue.length > 0 && selectedIndices.size === localQueue.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(localQueue.map((_, i) => i)));
    }
  };

  const handleToggleSelectCard = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleRemoveCard = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemoveFile) {
      onRemoveFile(idx);
    }
    const removedFile = localQueue[idx];

    // Removing a file must also stop any conversion running for it. Without this
    // the engine kept encoding. The parent is told to ignore the job's late
    // progress events so a deleted entry cannot resurrect itself in the UI.
    if (removedFile) {
      if (electron) {
        electron.ipcRenderer.invoke('converter-cancel', removedFile).catch(() => {});
      }
      onQueueFilesRemoved?.([removedFile]);
    }

    // Route through the shared store so the player sidebar and this modal cannot
    // disagree about what is queued.
    const nextQueue = removeFromQueue([removedFile]).filter(Boolean);
    if (removedFile) {
      setMediaTypes(prev => {
        const nextMap = { ...prev };
        delete nextMap[removedFile];
        localStorage.setItem('converter_media_types', JSON.stringify(nextMap));
        return nextMap;
      });
    }
    if (electron) {
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: nextQueue.length > 0,
        converting: false,
        isPaused: false,
        progress: 0,
        queueCount: nextQueue.length,
        currentFile: nextQueue[0] ? nextQueue[0].split(/[\\/]/).pop() : '',
        statusText: nextQueue.length > 1 ? `${nextQueue.length} files queued` : (nextQueue.length === 1 ? 'Ready to Convert' : 'Idle')
      });
    }
    if (selectedFileIdx >= nextQueue.length) {
      setSelectedFileIdx(Math.max(0, nextQueue.length - 1));
    }
    setSelectedIndices(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  };

  const handleClearAll = () => {
    if (onClearQueue) {
      onClearQueue();
    }
    // Clear the shared store, not just local state, otherwise the player's
    // sendTrayItems keeps re-seeding this list on the next open.
    clearQueue();
    // Stop every conversion still running for a queued file, then mark
    // those files removed so their late progress events are dropped.
    const inFlight = Object.entries(externalConversionStatus)
      .filter(([, s]) => s && (s.status === 'converting' || s.status === 'paused'))
      .map(([f]) => f);
    if (inFlight.length > 0) {
      inFlight.forEach(f => {
        if (electron) {
          electron.ipcRenderer.invoke('converter-cancel', f).catch(() => {});
        }
      });
      onQueueFilesRemoved?.(inFlight);
    }
    setMediaTypes({});
    localStorage.removeItem('converter_media_types');
    if (electron) {
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: false,
        converting: false,
        isPaused: false,
        progress: 0,
        queueCount: 0,
        currentFile: '',
        statusText: 'Idle'
      });
    }
    setSelectedIndices(new Set());
    setSelectedFileIdx(0);
  };

  const handleRemoveSelected = () => {
    if (selectedIndices.size === 0) return;
    if (selectedIndices.size === localQueue.length) {
      handleClearAll();
      return;
    }
    const removedFiles = localQueue.filter((_, i) => selectedIndices.has(i));
    removedFiles.forEach(f => {
      if (electron) {
        electron.ipcRenderer.invoke('converter-cancel', f).catch(() => {});
      }
    });
    onQueueFilesRemoved?.(removedFiles);
    const nextQueue = removeFromQueue(removedFiles).filter(Boolean);
    setMediaTypes(prev => {
      const nextMap = { ...prev };
      removedFiles.forEach(f => delete nextMap[f]);
      localStorage.setItem('converter_media_types', JSON.stringify(nextMap));
      return nextMap;
    });
    if (electron) {
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: nextQueue.length > 0,
        converting: false,
        isPaused: false,
        progress: 0,
        queueCount: nextQueue.length,
        currentFile: nextQueue[0] ? nextQueue[0].split(/[\\/]/).pop() : '',
        statusText: nextQueue.length > 1 ? `${nextQueue.length} files queued` : (nextQueue.length === 1 ? 'Ready to Convert' : 'Idle')
      });
    }
    setSelectedIndices(new Set());
    setSelectedFileIdx(0);
  };

  // Capacity is re-read on the destination, the format and the queue size:
  // those are the three things that change how much room a run needs.
  // Declared here because it reads customExportFolder and activeMainTab.
  useEffect(() => {
    let cancelled = false;
    const el = (window as any).electron;
    if (!el || !el.ipcRenderer) return;

    el.ipcRenderer.invoke('get-power-status').then((p: any) => {
      if (!cancelled && p) setOnBattery(!!p.onBattery);
    }).catch(() => {});

    const target = customExportFolder || localQueue[0];
    if (!target) { setCapacityNote(''); return; }

    el.ipcRenderer.invoke('describe-volume', { path: target, files: localQueue }).then((v: any) => {
      if (cancelled || !v) return;
      if (v.writable === false) {
        setCapacityNote('The chosen destination cannot be written to. Pick another folder or reconnect the drive.');
        return;
      }
      const free = typeof v.freeBytes === 'number' ? v.freeBytes : 0;
      const need = typeof v.neededBytes === 'number' ? v.neededBytes : 0;
      if (free > 0 && need > 0 && free < need) {
        setCapacityNote(
          `About ${(need / (1024 * 1024 * 1024)).toFixed(1)} GB may be needed but only ` +
          `${(free / (1024 * 1024 * 1024)).toFixed(1)} GB is free. ` +
          'Smaller files or fewer at a time will fit.'
        );
      } else {
        setCapacityNote('');
      }
    }).catch(() => { if (!cancelled) setCapacityNote(''); });

    return () => { cancelled = true; };
  }, [customExportFolder, localQueue, activeMainTab, selectedVideoFmt, selectedAudioFmt]);

  const handleProceed = () => {
    const perFileOptions: Record<string, { mode: 'original' | 'convert' | 'extract_audio'; format: string; bitrate: string; audioBitrate?: string; highQuality?: boolean; tools?: Record<string, unknown> }> = {};
    localQueue.forEach(f => {
      const mType = mediaTypes[f] || (isVideoFile(f) ? 'video' : 'audio');
      const fileTools = toolSettings[normalizeQueuePath(f)];
      perFileOptions[f] = {
        mode: mType === 'video' ? (autoCopy ? 'original' : 'convert') : 'extract_audio',
        // The GIF tool always produces an animated GIF,
        // whatever container the dock selector shows.
        format: fileTools && fileTools.gif
          ? 'gif'
          : (mType === 'video' ? selectedVideoFmt : selectedAudioFmt),
        bitrate: mType === 'video' ? videoQuality : audioBitrate,
        audioBitrate,
        highQuality: useHqEngine,
        tools: fileTools
      };
    });

    const hasVideos = localQueue.some(f => (mediaTypes[f] || (isVideoFile(f) ? 'video' : 'audio')) === 'video');
    const defaultOutputPath = hasVideos ? videoOutputPath : audioOutputPath;

    onProceed({
      mode: hasVideos ? (autoCopy ? 'original' : 'convert') : 'extract_audio',
      format: hasVideos ? selectedVideoFmt : selectedAudioFmt,
      bitrate: hasVideos ? videoQuality : audioBitrate,
      audioBitrate,
      highQuality: useHqEngine,
      keepOriginal: true,
      targetFolderId: selectedFolderId,
      exportDestination,
      exportDriveLetter: exportDestination === 'drive' ? selectedDriveLetter : undefined,
      exportCustomPath: exportDestination === 'folder' ? (customExportFolder || defaultOutputPath) : undefined,
      perFileOptions
    });
  };

  const handleConvertSingleFile = (filePath: string) => {
    const mediaType = mediaTypes[filePath] || (isVideoFile(filePath) ? 'video' : 'audio');
    const tools = toolSettings[normalizeQueuePath(filePath)];
    const mode = mediaType === 'video'
      ? (autoCopy ? 'original' : 'convert')
      : 'extract_audio';
    const format = tools?.gif
      ? 'gif'
      : (mediaType === 'video' ? selectedVideoFmt : selectedAudioFmt);
    const bitrate = mediaType === 'video' ? videoQuality : audioBitrate;

    onConvertSingleFile?.(filePath, {
      mode,
      format,
      bitrate,
      audioBitrate,
      highQuality: useHqEngine,
      keepOriginal: true,
      targetFolderId: selectedFolderId,
      exportDestination,
      exportDriveLetter: exportDestination === 'drive' ? selectedDriveLetter : undefined,
      exportCustomPath: exportDestination === 'folder'
        ? (customExportFolder || (mediaType === 'video' ? videoOutputPath : audioOutputPath))
        : undefined,
      perFileOptions: {
        [filePath]: {
          mode,
          format,
          bitrate,
          audioBitrate,
          highQuality: useHqEngine,
          tools
        }
      }
    });
  };

  const handleDirectSend = (files?: string[]) => {
    if (onDirectSend) {
      if (files && files.length > 0) {
        onDirectSend(files);
      } else {
        onDirectSend(exportDestination === 'drive' ? 'drive' : 'sendtray');
      }
    } else {
      handleProceed();
    }
  };

  useEffect(() => {
    if (!electron) return;
    const bridge = electron;
    const handleRunRequest = () => {
      handleProceed();
    };
    const handleCloseRequest = () => {
      setIsMinimized(false);
      onClose();
    };
    bridge.ipcRenderer.on('converter-run-request', handleRunRequest);
    bridge.ipcRenderer.on('converter-close-request', handleCloseRequest);
    return () => {
      bridge.ipcRenderer.removeListener('converter-run-request', handleRunRequest);
      bridge.ipcRenderer.removeListener('converter-close-request', handleCloseRequest);
    };
  }, [handleProceed, onClose]);


  return (
    <div 
      className="videoproc-converter-modal glass-panel"
      onClick={(e) => e.stopPropagation()}
      style={{
        width: isExpanded ? '100vw' : '1060px',
        maxWidth: isExpanded ? '100vw' : '96vw',
        height: isExpanded ? '100vh' : '760px',
        maxHeight: isExpanded ? '100vh' : '92vh',
        background: 'linear-gradient(180deg, #121320 0%, #0a0b12 100%)',
        border: isExpanded ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: isExpanded ? '0px' : '18px',
        boxShadow: isExpanded ? 'none' : '0 25px 80px rgba(0, 0, 0, 0.9), 0 0 50px rgba(99, 102, 241, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'panamediaMenuPop 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        color: '#fff',
        fontFamily: 'inherit',
        position: isExpanded ? 'fixed' : 'relative',
        inset: isExpanded ? 0 : undefined,
        zIndex: isExpanded ? 9999 : undefined,
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {/* ─── 1. TOP TITLEBAR (Converter Header with Window Controls) ─── */}
      <ConverterHeader
        queueCount={localQueue.length}
        isExpanded={isExpanded}
        useHwAccel={useHwAccel}
        onToggleExpand={() => setIsExpanded(prev => !prev)}
        onMinimize={handleMinimizeModal}
        onBack={handleDone}
        onClose={isConverting ? handleMinimizeModal : (onClose || handleDone)}
      />

      {/* Phase G: speak up before starting rather than failing during.
          Advisory only -- the engine still refuses a destination it knows is
          unusable, and a tight-but-workable disk is allowed to proceed. */}
      {(capacityNote || onBattery) && !isConverting && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 16px', fontSize: '11.5px',
          background: capacityNote ? 'rgba(251, 191, 36, 0.10)' : 'rgba(6, 182, 212, 0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          color: capacityNote ? '#fbbf24' : '#67e8f9',
        }}>
          {capacityNote && <span>{capacityNote}</span>}
          {!capacityNote && onBattery && (
            <span>
              On battery power: conversions are using fewer threads, so they will take longer and stay cooler.
            </span>
          )}
        </div>
      )}

      {/* ─── 2. MAIN CENTER WORKSPACE (Split Left 65% / Right 35%) ─── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        background: 'rgba(0, 0, 0, 0.25)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        {/* ── LEFT PANEL: Tabs + Media Items Queue ── */}
        <div style={{
          flex: 1,
          minWidth: 0,
          borderRight: '1px solid rgba(255, 255, 255, 0.07)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 16, 26, 0.55)'
        }}>
          {/* Top Subheader: Clean 3 Main Tabs (No duplicate settings buttons) */}
          <TopTabsBar
            activeMainTab={activeMainTab}
            onSelectTab={handleSelectMainTab}
            queueCount={localQueue.length}
            videoOutputCount={convertedVideos.length}
            audioOutputCount={convertedAudios.length}
          />

          {/* Active In-Place Conversion Status Banner */}
          {isConverting && (
            <div style={{
              padding: '6px 16px',
              background: isPaused ? 'rgba(245, 158, 11, 0.15)' : 'rgba(6, 182, 212, 0.12)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isPaused ? '#f59e0b' : '#06b6d4',
                  boxShadow: isPaused ? '0 0 8px #f59e0b' : '0 0 10px #06b6d4'
                }} />
                <span style={{ color: isPaused ? '#fbbf24' : '#67e8f9', fontWeight: 600 }}>
                  {isPaused ? 'Conversion Paused' : `Converting: ${activeConvertingFile ? activeConvertingFile.split(/[\\/]/).pop() : 'Processing...'}`}
                </span>
              </div>
              <span style={{ fontWeight: 800, color: '#fff' }}>
                {Math.round(conversionProgress * 100)}%
              </span>
            </div>
          )}

          {/* Tab Views */}
          {activeMainTab === 'convert' ? (
            <ConvertQueueList
              localQueue={localQueue}
              selectedIndices={selectedIndices}
              selectedFileIdx={selectedFileIdx}
              mediaTypes={mediaTypes}
              streamingPort={streamingPort}
              activeVideoPreset={activeVideoPreset}
              activeAudioPreset={activeAudioPreset}
              videoQuality={videoQuality}
              audioBitrate={audioBitrate}
              conversionStatus={externalConversionStatus}
              onConvertSingleFile={handleConvertSingleFile}
              onTogglePauseSingleFile={onTogglePauseSingleFile}
              onSelectFile={setSelectedFileIdx}
              onToggleSelectAll={handleToggleSelectAll}
              onToggleSelectCard={handleToggleSelectCard}
              onRemoveCard={handleRemoveCard}
              onRemoveSelected={handleRemoveSelected}
              onClearAll={handleClearAll}
              onToggleMediaType={toggleMediaType}
              onAddFiles={onAddFiles}
            />
          ) : activeMainTab === 'video_output' ? (
            <OutputHistoryList
              type="video"
              items={convertedVideos}
              outputPath={videoOutputPath}
              streamingPort={streamingPort}
              onChangeOutputPath={handleChangeVideoOutputPath}
              onDirectSend={handleDirectSend}
              onItemsDeleted={handleOutputFilesDeleted}
            />
          ) : (
            <OutputHistoryList
              type="audio"
              items={convertedAudios}
              outputPath={audioOutputPath}
              streamingPort={streamingPort}
              onChangeOutputPath={handleChangeAudioOutputPath}
              onDirectSend={handleDirectSend}
              onItemsDeleted={handleOutputFilesDeleted}
            />
          )}
        </div>

        {/* ── RIGHT PANEL: Video Preview Player + Destination Selector (Comfortable 300px width) ── */}
        <div style={{
          width: '300px',
          flex: '0 0 300px',
          minWidth: '290px',
          maxWidth: '320px',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(12, 13, 22, 0.75)'
        }}>
          {/* Preview Monitor */}
          <PreviewMonitor
            currentFile={currentFile}
            streamingPort={streamingPort}
            appPlayerState={appPlayerState}
            onPrevFile={() => {
              setSelectedFileIdx(prev => Math.max(0, prev - 1));
            }}
            onNextFile={() => {
              setSelectedFileIdx(prev => Math.min(localQueue.length - 1, prev + 1));
            }}
            isMinimized={isMinimized}
          />

          {/* Export Settings Panel */}
          <ExportSettingsPanel
            useHwAccel={useHwAccel}
            setUseHwAccel={setUseHwAccel}
            useHqEngine={useHqEngine}
            setUseHqEngine={setUseHqEngine}
            deinterlacing={deinterlacing}
            setDeinterlacing={setDeinterlacing}
            autoCopy={autoCopy}
            setAutoCopy={setAutoCopy}
            mergeFiles={mergeFiles}
            setMergeFiles={setMergeFiles}
            exportDestination={exportDestination}
            setExportDestination={setExportDestination}
            selectedDriveLetter={selectedDriveLetter}
            setSelectedDriveLetter={setSelectedDriveLetter}
            customExportFolder={customExportFolder}
            setCustomExportFolder={setCustomExportFolder}
            selectedFolderId={selectedFolderId}
            setSelectedFolderId={setSelectedFolderId}
            drives={drives}
          />
        </div>
      </div>

      {/* ─── 3. BOTTOM DOCK (Target Format, Media Tools Carousel & Circular RUN) ─── */}
      <ConverterBottomDock
        formatModalMode={formatModalMode}
        activeVideoPreset={activeVideoPreset}
        activeAudioPreset={activeAudioPreset}
        videoQuality={videoQuality}
        audioBitrate={audioBitrate}
        isConverting={isConverting}
        isPaused={isPaused}
        onTogglePause={onTogglePauseConversion}
        onOpenFormatModal={(mode) => {
          setFormatModalMode(mode);
          setShowFormatModal(true);
        }}
        onSelectTool={setActiveTool}
        onRunConvert={handleProceed}
      />

      {/* ─── 4. FORMAT SETTINGS DIALOG MODAL ─── */}
      <FormatSettingsModal
        isOpen={showFormatModal}
        formatModalMode={formatModalMode}
        setFormatModalMode={setFormatModalMode}
        selectedVideoFmt={selectedVideoFmt}
        setSelectedVideoFmt={setSelectedVideoFmt}
        videoQuality={videoQuality}
        setVideoQuality={setVideoQuality}
        selectedAudioFmt={selectedAudioFmt}
        setSelectedAudioFmt={setSelectedAudioFmt}
        audioBitrate={audioBitrate}
        setAudioBitrate={setAudioBitrate}
        onClose={() => setShowFormatModal(false)}
      />

      {/* ─── 5. DEDICATED CONVERSION FEATURE TOOLS ─── */}
      {activeTool?.id === 'cut' && (
        <CutTrimTool
          fileName={currentFile}
          duration={appPlayerState?.duration || 180}
          onApply={(cutSettings) => {
            applyToolSettings(currentFile, 'cut', cutSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'crop' && (
        <CropTool
          fileName={currentFile}
          onApply={(cropSettings) => {
            applyToolSettings(currentFile, 'crop', cropSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'subtitle' && (
        <SubtitleTool
          fileName={currentFile}
          onApply={(subSettings) => {
            applyToolSettings(currentFile, 'subtitle', subSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'effect' && (
        <EffectTool
          fileName={currentFile}
          onApply={(effectSettings) => {
            applyToolSettings(currentFile, 'effect', effectSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'rotate' && (
        <RotateTool
          fileName={currentFile}
          onApply={(rotateSettings) => {
            applyToolSettings(currentFile, 'rotate', rotateSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'watermark' && (
        <WatermarkTool
          fileName={currentFile}
          onApply={(wmSettings) => {
            applyToolSettings(currentFile, 'watermark', wmSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'compress' && (
        <CompressTool
          fileName={currentFile}
          onApply={(compSettings) => {
            applyToolSettings(currentFile, 'compress', compSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {/* Mirror & Flip is the flip half of the Rotate tool, so
          both share one settings panel and one engine path. */}
      {activeTool?.id === 'mirror' && (
        <RotateTool
          fileName={currentFile}
          onApply={(rotateSettings) => {
            applyToolSettings(currentFile, 'rotate', rotateSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'gif' && (
        <GifTool
          fileName={currentFile}
          onApply={(gifSettings) => {
            applyToolSettings(currentFile, 'gif', gifSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'denoise' && (
        <DenoiseTool
          fileName={currentFile}
          onApply={(denoiseSettings) => {
            applyToolSettings(currentFile, 'denoise', denoiseSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'split' && (
        <SplitTool
          fileName={currentFile}
          duration={appPlayerState?.duration || 0}
          onApply={(splitSettings) => {
            applyToolSettings(currentFile, 'split', splitSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool && !['cut', 'crop', 'subtitle', 'effect', 'rotate', 'watermark', 'compress', 'mirror', 'gif', 'denoise', 'split'].includes(activeTool.id) && (
        <ToolInfoModal
          tool={activeTool}
          fileName={currentFile}
          onClose={() => setActiveTool(null)}
        />
      )}
    </div>
  );
}
