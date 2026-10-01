/**
 * SendConvertPreparationModal.tsx
 * ================================
 * VideoProc-style high-performance Media Converter UI for Panamedia.
 * Modular orchestrator utilizing components from ./converter-pro/
 */

import React, { useState, useEffect, useCallback } from 'react';
import { electron } from './panamedia/types';
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
}: SendConvertPreparationModalProps) {
  const initialFiles = queuedFiles && queuedFiles.length > 0 ? queuedFiles : (fileName && fileName !== 'media' ? [fileName] : []);
  const [localQueue, setLocalQueue] = useState<string[]>(() => {
    let saved: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('converter_queue') || '[]');
      if (Array.isArray(parsed)) saved = parsed;
    } catch (e) {}
    const incoming = queuedFiles && queuedFiles.length > 0 ? queuedFiles : (fileName && fileName !== 'media' ? [fileName] : []);
    const merged = Array.from(new Set([...saved, ...incoming]));
    if (merged.length > 0) {
      localStorage.setItem('converter_queue', JSON.stringify(merged));
    }
    return merged.length > 0 ? merged : initialFiles;
  });
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Window states: Expand/Maximize to fit device screen, Minimize to background
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  useEffect(() => {
    if (onMinimizeChange) {
      onMinimizeChange(isMinimized);
    }
  }, [isMinimized, onMinimizeChange]);

  // Top Tabs: Convert Tab, Video Output, Audio Output
  const [activeMainTab, setActiveMainTab] = useState<'convert' | 'video_output' | 'audio_output'>('convert');

  // Format modal mode: video or audio
  const [formatModalMode, setFormatModalMode] = useState<'video' | 'audio'>('video');

  // Media type per card (user can toggle Video vs Audio - fully persisted across app restarts & power loss)
  const [mediaTypes, setMediaTypes] = useState<Record<string, 'video' | 'audio'>>(() => {
    let saved: Record<string, 'video' | 'audio'> = {};
    try {
      saved = JSON.parse(localStorage.getItem('converter_media_types') || '{}');
    } catch (e) {}
    const map: Record<string, 'video' | 'audio'> = { ...saved };
    initialFiles.forEach(f => {
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

  // Sync if queuedFiles prop changes: append newly added files under previous ones and keep stored types
  useEffect(() => {
    if (queuedFiles && queuedFiles.length > 0) {
      setLocalQueue(prev => {
        const next = Array.from(new Set([...prev, ...queuedFiles]));
        localStorage.setItem('converter_queue', JSON.stringify(next));
        return next;
      });
      setMediaTypes(prev => {
        let saved: Record<string, 'video' | 'audio'> = {};
        try {
          saved = JSON.parse(localStorage.getItem('converter_media_types') || '{}');
        } catch (e) {}
        const next = { ...saved, ...prev };
        queuedFiles.forEach(f => {
          if (!next[f]) next[f] = isVideoFile(f) ? 'video' : 'audio';
        });
        localStorage.setItem('converter_media_types', JSON.stringify(next));
        return next;
      });
    }
  }, [queuedFiles]);

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
    const handlePlayerState = (_event: any, state: any) => {
      setAppPlayerState(state);
    };
    electron.ipcRenderer.on('player-state-changed', handlePlayerState);
    electron.ipcRenderer.invoke('get-player-state').then((state: any) => {
      if (state) setAppPlayerState(state);
    }).catch(() => {});

    // Ensure player is paused by default when converter opens
    electron.ipcRenderer.send('player-remote-command', 'pause');

    return () => {
      electron.ipcRenderer.removeListener('player-state-changed', handlePlayerState);
    };
  }, []);

  // Sync minimized state to Electron and Player Titlebar progress card
  useEffect(() => {
    if (!electron) return;
    if (isMinimized) {
      const activeFile = (localQueue[selectedFileIdx] || fileName).split(/[\\/]/).pop() || '';
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: true,
        converting: false,
        isPaused: false,
        progress: 0,
        queueCount: localQueue.length,
        currentFile: activeFile,
        statusText: 'Converter Pro'
      });
    }
  }, [isMinimized, localQueue.length, selectedFileIdx, fileName]);

  // Listen for restore requests from Player Header progress card
  useEffect(() => {
    if (!electron) return;
    const handleRestoreRequest = () => {
      setIsMinimized(false);
    };
    electron.ipcRenderer.on('converter-restore-request', handleRestoreRequest);
    return () => {
      electron.ipcRenderer.removeListener('converter-restore-request', handleRestoreRequest);
    };
  }, []);

  // Engine Settings
  const [useHwAccel, setUseHwAccel] = useState<boolean>(() => localStorage.getItem('converter_useHwAccel') !== 'false');
  useEffect(() => {
    localStorage.setItem('converter_useHwAccel', String(useHwAccel));
  }, [useHwAccel]);

  const handleDone = () => {
    const activeFile = (localQueue[selectedFileIdx] || fileName).split(/[\\/]/).pop() || '';
    localStorage.setItem('converter_queue', JSON.stringify(localQueue));
    localStorage.setItem('converter_media_types', JSON.stringify(mediaTypes));
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

  const refreshOutputFiles = useCallback(() => {
    if (!electron) return;
    const vPath = videoOutputPath || localStorage.getItem('panamedia_video_output_dir');
    const aPath = audioOutputPath || localStorage.getItem('panamedia_audio_output_dir');
    if (vPath) {
      electron.ipcRenderer.invoke('get-converter-output-files', vPath).then((files: any) => {
        if (Array.isArray(files)) setConvertedVideos(files);
      }).catch(() => {});
    }
    if (aPath) {
      electron.ipcRenderer.invoke('get-converter-output-files', aPath).then((files: any) => {
        if (Array.isArray(files)) setConvertedAudios(files);
      }).catch(() => {});
    }
  }, [videoOutputPath, audioOutputPath]);

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
    const nextQueue = localQueue.filter((_, i) => i !== idx);
    setLocalQueue(nextQueue);
    localStorage.setItem('converter_queue', JSON.stringify(nextQueue));
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
    setLocalQueue([]);
    setMediaTypes({});
    localStorage.removeItem('converter_queue');
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
    const nextQueue = localQueue.filter((_, i) => !selectedIndices.has(i));
    setLocalQueue(nextQueue);
    localStorage.setItem('converter_queue', JSON.stringify(nextQueue));
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

  const handleProceed = () => {
    const perFileOptions: Record<string, { mode: 'original' | 'convert' | 'extract_audio'; format: string; bitrate: string }> = {};
    localQueue.forEach(f => {
      const mType = mediaTypes[f] || (isVideoFile(f) ? 'video' : 'audio');
      perFileOptions[f] = {
        mode: mType === 'video' ? (autoCopy ? 'original' : 'convert') : 'extract_audio',
        format: mType === 'video' ? selectedVideoFmt : selectedAudioFmt,
        bitrate: mType === 'video' ? videoQuality : audioBitrate
      };
    });

    const hasVideos = localQueue.some(f => (mediaTypes[f] || (isVideoFile(f) ? 'video' : 'audio')) === 'video');
    const defaultOutputPath = hasVideos ? videoOutputPath : audioOutputPath;

    onProceed({
      mode: hasVideos ? (autoCopy ? 'original' : 'convert') : 'extract_audio',
      format: hasVideos ? selectedVideoFmt : selectedAudioFmt,
      bitrate: hasVideos ? videoQuality : audioBitrate,
      keepOriginal: true,
      targetFolderId: selectedFolderId,
      exportDestination,
      exportDriveLetter: exportDestination === 'drive' ? selectedDriveLetter : undefined,
      exportCustomPath: exportDestination === 'folder' ? (customExportFolder || defaultOutputPath) : undefined,
      perFileOptions
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
    const handleRunRequest = () => {
      handleProceed();
    };
    const handleCloseRequest = () => {
      setIsMinimized(false);
      onClose();
    };
    electron.ipcRenderer.on('converter-run-request', handleRunRequest);
    electron.ipcRenderer.on('converter-close-request', handleCloseRequest);
    return () => {
      electron.ipcRenderer.removeListener('converter-run-request', handleRunRequest);
      electron.ipcRenderer.removeListener('converter-close-request', handleCloseRequest);
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
        onMinimize={handleDone}
        onBack={handleDone}
        onClose={handleDone}
      />

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
            onSelectTab={setActiveMainTab}
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
              onConvertSingleFile={onConvertSingleFile}
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
              onChangeOutputPath={handleChangeVideoOutputPath}
              onDirectSend={handleDirectSend}
            />
          ) : (
            <OutputHistoryList
              type="audio"
              items={convertedAudios}
              outputPath={audioOutputPath}
              onChangeOutputPath={handleChangeAudioOutputPath}
              onDirectSend={handleDirectSend}
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
          onApply={(_cutSettings) => {
            console.log('Applied Cut Settings:', _cutSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'crop' && (
        <CropTool
          fileName={currentFile}
          onApply={(_cropSettings) => {
            console.log('Applied Crop Settings:', _cropSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'subtitle' && (
        <SubtitleTool
          fileName={currentFile}
          onApply={(_subSettings) => {
            console.log('Applied Subtitle Settings:', _subSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'effect' && (
        <EffectTool
          fileName={currentFile}
          onApply={(_effectSettings) => {
            console.log('Applied Effect Settings:', _effectSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'rotate' && (
        <RotateTool
          fileName={currentFile}
          onApply={(_rotateSettings) => {
            console.log('Applied Rotate Settings:', _rotateSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'watermark' && (
        <WatermarkTool
          fileName={currentFile}
          onApply={(_wmSettings) => {
            console.log('Applied Watermark Settings:', _wmSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool?.id === 'compress' && (
        <CompressTool
          fileName={currentFile}
          onApply={(_compSettings) => {
            console.log('Applied Compress Settings:', _compSettings);
          }}
          onClose={() => setActiveTool(null)}
        />
      )}

      {activeTool && !['cut', 'crop', 'subtitle', 'effect', 'rotate', 'watermark', 'compress'].includes(activeTool.id) && (
        <ToolInfoModal
          tool={activeTool}
          fileName={currentFile}
          onClose={() => setActiveTool(null)}
        />
      )}
    </div>
  );
}
