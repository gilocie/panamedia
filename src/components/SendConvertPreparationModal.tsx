/**
 * SendConvertPreparationModal.tsx
 * ================================
 * VideoProc-style high-performance Media Converter UI for Panamedia.
 * Modular orchestrator utilizing components from ./converter-pro/
 */

import React, { useState, useEffect, useCallback } from 'react';
import './converter-pro/features/featureTools.css';
import './converter-pro/features/proWorkspace.css';
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
  MEDIA_TOOLS,
  FormatSettingsModal,
  CutTrimTool,
  CropTool,
  SubtitleTool,
  EffectTool,
  RotateTool,
  MirrorTool,
  ProToolStudioProvider,
  ProMediaBar,
  WatermarkTool,
  CompressTool,
  GifTool,
  DenoiseTool,
  SplitTool,
  ToolInfoModal
} from './converter-pro';

export { isVideoFile, formatSeconds, type SendConvertOptions };

export function SendConvertPreparationModal({
  targetAction = 'convert',
  isBatch: _isBatch = false,
  batchCount: _batchCount = 1,
  queuedFiles,
  onAddFiles,
  onRemoveFile,
  onClearQueue,
  drives = [],
  streamingPort = 52322,
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
  const [isExpanded, setIsExpanded] = useState<boolean>(() =>
    localStorage.getItem('panamedia_converter_expanded') === 'true'
  );
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const handleToggleExpand = () => {
    setIsExpanded((expanded) => {
      const next = !expanded;
      localStorage.setItem('panamedia_converter_expanded', String(next));
      return next;
    });
  };

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
    thumbnailPath?: string;
    size?: string;
    format: string;
    resolutionOrBitrate?: string;
    date: string;
  }>>([]);

  const [convertedAudios, setConvertedAudios] = useState<Array<{
    name: string;
    path: string;
    thumbnailPath?: string;
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
  const [outputPreview, setOutputPreview] = useState<{ path: string; thumbnailPath?: string } | null>(null);
  const [outputPlaybackRequest, setOutputPlaybackRequest] = useState<{
    id: number;
    path: string;
    action: 'play' | 'pause';
  }>({ id: 0, path: '', action: 'pause' });
  const [playingOutputPath, setPlayingOutputPath] = useState<string | null>(null);

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
      const activeFile = (activeConvertingFile || localQueue[selectedFileIdx] || '').split(/[\\/]/).pop() || '';
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
  }, [isMinimized, isConverting, isPaused, conversionProgress, activeConvertingFile, localQueue, selectedFileIdx, useHwAccel, mediaTypes]);

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
    const activeFile = (activeConvertingFile || localQueue[selectedFileIdx] || '').split(/[\\/]/).pop() || '';
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

  useEffect(() => {
    if (activeMainTab === 'convert') {
      setOutputPreview(null);
      return;
    }
    const outputs = activeMainTab === 'video_output' ? convertedVideos : convertedAudios;
    setOutputPreview((current) =>
      current && outputs.some((item) => item.path === current.path)
        ? current
        : outputs[0] ? { path: outputs[0].path, thumbnailPath: outputs[0].thumbnailPath } : null
    );
  }, [activeMainTab, convertedVideos, convertedAudios]);

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

  const activeOutputPreview = activeMainTab === 'convert' ? null : outputPreview;
  const currentFile = activeOutputPreview?.path
    || localQueue[selectedFileIdx]
    || (isConverting ? activeConvertingFile : '')
    || '';
  const currentFileTools = toolSettings[normalizeQueuePath(currentFile)] || {};
  const savedCutSettings = currentFileTools.cut;
  const initialCutSettings = savedCutSettings
    && typeof savedCutSettings === 'object'
    && 'startSec' in savedCutSettings
    && typeof savedCutSettings.startSec === 'number'
    && 'endSec' in savedCutSettings
    && typeof savedCutSettings.endSec === 'number'
    ? {
        startSec: savedCutSettings.startSec,
        endSec: savedCutSettings.endSec
      }
    : undefined;
  const configuredToolIds = new Set(Object.keys(currentFileTools));

  // Duration for the targeted item. The player's figure is authoritative when
  // it is the same file; the tools fall back to probing the stream themselves
  // when it is zero (see CutTrimTool's onLoadedMetadata).
  const currentDuration =
    appPlayerState?.filePath === currentFile ? appPlayerState.duration || 0 : 0;

  /* Tab captions match the reference studio's strip; the dock keeps its
     shorter labels. */
  const STUDIO_TAB_LABELS: Record<string, string> = {
    cut: 'Cut / Trim',
    crop: 'Crop & Aspect',
    subtitle: 'Subtitles',
    effect: 'Visual Effects',
    rotate: 'Rotate & Level',
    watermark: 'Watermark & Logo',
    mirror: 'Mirror & Flip',
    compress: 'Smart Compress',
    gif: 'GIF Creator',
    denoise: 'Denoise & Audio',
    split: 'Split File'
  };

  /* ── Tool workspace wiring ────────────────────────────────────────────
     The tools render as one full-bleed studio with a tab strip, so they read
     as views inside Converter Pro rather than dialogs stacked on top of it.
     The media is always the Convert tab's targeted queue item — the studio
     never prompts for a file, it is handed `currentFile` from here. */
  const TOOL_STUDIO_IDS = [
    'cut', 'crop', 'subtitle', 'effect', 'rotate',
    'watermark', 'mirror', 'compress', 'gif', 'denoise', 'split'
  ];

  const studioTabs = MEDIA_TOOLS
    .filter(tool => TOOL_STUDIO_IDS.includes(tool.id))
    .map(tool => ({
      id: tool.id,
      label: STUDIO_TAB_LABELS[tool.id] ?? tool.label,
      accent: tool.color,
      icon: tool.icon
    }));

  const openStudioTool = (id: string) => {
    const match = MEDIA_TOOLS.find(tool => tool.id === id);
    if (match) setActiveTool(match);
  };

  const closeStudio = () => {
    setActiveTool(null);
    if (onActiveMainTabChange) onActiveMainTabChange('convert');
  };

  const handlePlayOutput = (item: { path: string; thumbnailPath?: string }) => {
    const shouldPause = playingOutputPath === item.path;
    setOutputPreview(item);
    setOutputPlaybackRequest((request) => ({
      id: request.id + 1,
      path: item.path,
      action: shouldPause ? 'pause' : 'play'
    }));
  };
  const handleSelectOutput = (item: { path: string; thumbnailPath?: string }) => {
    const shouldContinuePlayback = playingOutputPath !== null;
    setOutputPreview(item);
    if (shouldContinuePlayback) {
      setOutputPlaybackRequest((request) => ({
        id: request.id + 1,
        path: item.path,
        action: 'play'
      }));
    }
  };
  const handlePreviewStep = (direction: -1 | 1) => {
    const outputs = activeMainTab === 'video_output'
      ? convertedVideos
      : activeMainTab === 'audio_output' ? convertedAudios : null;
    if (!outputs) {
      setSelectedFileIdx((index) => Math.max(0, Math.min(localQueue.length - 1, index + direction)));
      return;
    }
    const currentIndex = outputs.findIndex((item) => item.path === currentFile);
    const next = outputs[Math.max(0, Math.min(outputs.length - 1, currentIndex + direction))];
    if (next) handleSelectOutput({ path: next.path, thumbnailPath: next.thumbnailPath });
  };

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
      const hasVideoEdits = mType === 'video' && Boolean(fileTools && Object.keys(fileTools).length > 0);
      perFileOptions[f] = {
        mode: mType === 'video' ? (autoCopy && !hasVideoEdits ? 'original' : 'convert') : 'extract_audio',
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
    const hasVideoEdits = localQueue.some(f => {
      const isVideo = (mediaTypes[f] || (isVideoFile(f) ? 'video' : 'audio')) === 'video';
      const fileTools = toolSettings[normalizeQueuePath(f)];
      return isVideo && Boolean(fileTools && Object.keys(fileTools).length > 0);
    });
    const defaultOutputPath = hasVideos ? videoOutputPath : audioOutputPath;

    onProceed({
      mode: hasVideos ? (autoCopy && !hasVideoEdits ? 'original' : 'convert') : 'extract_audio',
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
      ? (autoCopy && !(tools && Object.keys(tools).length > 0) ? 'original' : 'convert')
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
        showDone={activeMainTab === 'convert' && localQueue.length > 0 && !(activeTool && TOOL_STUDIO_IDS.includes(activeTool.id))}
        isExpanded={isExpanded}
        useHwAccel={useHwAccel}
        onToggleExpand={handleToggleExpand}
        onMinimize={onClose || onBack || (() => {})}
        onBack={isConverting ? handleMinimizeModal : (onClose || onBack || (() => {}))}
        onClose={isConverting ? handleMinimizeModal : (onClose || onBack || (() => {}))}
      />

      {/* Phase G: speak up before starting rather than failing during.
          Advisory only -- the engine still refuses a destination it knows is
          unusable, and a tight-but-workable disk is allowed to proceed. */}
      {(capacityNote || onBattery) && !isConverting && !(activeTool && TOOL_STUDIO_IDS.includes(activeTool.id)) && (
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

      {/* ─── 2. MAIN CENTER WORKSPACE ─── hidden while a tool is open */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: activeTool && TOOL_STUDIO_IDS.includes(activeTool.id) ? 'none' : 'flex',
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
              onPlayMedia={handlePlayOutput}
              onSelectMedia={handleSelectOutput}
              selectedPath={outputPreview?.path}
              playingPath={playingOutputPath}
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
              onPlayMedia={handlePlayOutput}
              onSelectMedia={handleSelectOutput}
              selectedPath={outputPreview?.path}
              playingPath={playingOutputPath}
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
            thumbnailPath={activeOutputPreview?.path === currentFile ? activeOutputPreview.thumbnailPath : undefined}
            playbackRequest={outputPlaybackRequest}
            streamingPort={streamingPort}
            appPlayerState={appPlayerState}
            onPlaybackStateChange={(path, playing) => {
              setPlayingOutputPath((current) => {
                if (playing) return path;
                return current === path ? null : current;
              });
            }}
            onPrevFile={() => {
              handlePreviewStep(-1);
            }}
            onNextFile={() => {
              handlePreviewStep(1);
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

      {/* ─── 3. BOTTOM DOCK ─── hidden while a tool is open */}
      {!(activeTool && TOOL_STUDIO_IDS.includes(activeTool.id)) && (
      <ConverterBottomDock
        formatModalMode={formatModalMode}
        activeVideoPreset={activeVideoPreset}
        activeAudioPreset={activeAudioPreset}
        videoQuality={videoQuality}
        audioBitrate={audioBitrate}
        configuredToolIds={configuredToolIds}
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
      )}

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

      {/* ─── 5a. MEDIA BAR ──────────────────────────────────────────────
          Sits in the 52–98px gap between the converter header and the tool
          studio. Positioned separately so the studio (position:absolute) can
          cover the main modal content without also hiding the media bar. */}
      {activeTool && TOOL_STUDIO_IDS.includes(activeTool.id) && (
        <div className="pro-media-host">
          <ProMediaBar
            fileName={currentFile}
            meta={{
              resolution: isVideoFile(currentFile) ? 'SOURCE' : undefined,
              duration: currentDuration > 0 ? formatSeconds(currentDuration) : undefined,
              status: 'READY'
            }}
            onBack={closeStudio}
          />
        </div>
      )}

      {/* ─── 5b. TOOL STUDIO ────────────────────────────────────────────
          Fills from 98px (below media bar) to bottom. The inner pro-studio
          uses position:absolute;inset:0 to cover the main modal content. */}
      {activeTool && TOOL_STUDIO_IDS.includes(activeTool.id) && (
        <div className="pro-studio-host">
          <ProToolStudioProvider
            tabs={studioTabs}
            activeId={activeTool.id}
            onSelect={openStudioTool}
          >
            {activeTool.id === 'cut' && (
              <CutTrimTool
                key={`cut-${normalizeQueuePath(currentFile)}`}
                fileName={currentFile}
                duration={currentDuration}
                streamingPort={streamingPort}
                initialSettings={initialCutSettings}
                onApply={(cutSettings) => {
                  applyToolSettings(currentFile, 'cut', cutSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'crop' && (
              <CropTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={(cropSettings) => {
                  applyToolSettings(currentFile, 'crop', cropSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'subtitle' && (
              <SubtitleTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={(subSettings) => {
                  applyToolSettings(currentFile, 'subtitle', subSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'effect' && (
              <EffectTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={(effectSettings) => {
                  applyToolSettings(currentFile, 'effect', effectSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'rotate' && (
              <RotateTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={(rotateSettings) => {
                  applyToolSettings(currentFile, 'rotate', rotateSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'watermark' && (
              <WatermarkTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={(wmSettings) => {
                  applyToolSettings(currentFile, 'watermark', wmSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'compress' && (
              <CompressTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={(compSettings) => {
                  applyToolSettings(currentFile, 'compress', compSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {/* Mirror & Flip has its own studio panel, but writes into the
                same `rotate` bag so the engine keeps one hflip/vflip path. */}
            {activeTool.id === 'mirror' && (
              <MirrorTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={({ flipH, flipV }) => {
                  const existing = (currentFileTools.rotate ?? {}) as Record<string, unknown>;
                  applyToolSettings(currentFile, 'rotate', { ...existing, angle: 0, flipH, flipV });
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'gif' && (
              <GifTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={(gifSettings) => {
                  applyToolSettings(currentFile, 'gif', gifSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'denoise' && (
              <DenoiseTool
                fileName={currentFile}
                streamingPort={streamingPort}
              duration={currentDuration}
                onApply={(denoiseSettings) => {
                  applyToolSettings(currentFile, 'denoise', denoiseSettings);
                }}
                onClose={closeStudio}
              />
            )}

            {activeTool.id === 'split' && (
              <SplitTool
                fileName={currentFile}
                duration={currentDuration}
                onApply={(splitSettings) => {
                  applyToolSettings(currentFile, 'split', splitSettings);
                }}
                onClose={closeStudio}
              />
            )}
          </ProToolStudioProvider>
        </div>
      )}

      {activeTool && !TOOL_STUDIO_IDS.includes(activeTool.id) && (
        <ToolInfoModal
          tool={activeTool}
          fileName={currentFile}
          onClose={closeStudio}
        />
      )}
    </div>
  );
}
