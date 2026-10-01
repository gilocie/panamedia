import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, ChevronLeft, HardDrive, MoveRight, 
  Loader2, ChevronRight, Heart, Lock, CheckCircle2, AlertCircle,
  Folder, FolderPlus, Plus, Minimize2, Sparkles
} from 'lucide-react';
import { electron } from './panamedia/types';
import { 
  SendConvertPreparationModal, 
  type SendConvertOptions, 
  isVideoFile 
} from './SendConvertPreparationModal';
import { 
  getSendtrayFolders, 
  createSendtrayFolder, 
  assignFileToSendtrayFolder, 
  type SendtrayFolder 
} from './panamedia/sendtrayUtils';

interface SendToFlashModalProps {
  filePath: string;
  onClose: () => void;
  isBatch?: boolean;
  sendTrayItems?: string[];
  setSendTrayItems?: React.Dispatch<React.SetStateAction<string[]>>;
  isFolder?: boolean;
  isFavourite?: boolean;
  isArchived?: boolean;
  onToggleFavourite?: (path: string) => void;
  onToggleArchive?: (path: string, isFolder?: boolean) => void;
}

export function SendToFlashModal({ 
  filePath, 
  onClose, 
  isBatch = false,
  sendTrayItems = [], 
  setSendTrayItems,
  isFolder = false,
  isFavourite = false,
  isArchived = false,
  onToggleFavourite,
  onToggleArchive
}: SendToFlashModalProps) {
  const [drives, setDrives] = useState<Array<{ letter: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'completed' | 'failed'>('idle');
  const [copyProgress, setCopyProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const isDirectConverter = Boolean((window as any).__openConverterProDirect);
  const [activeSection, setActiveSection] = useState<'main' | 'prepare' | 'drives' | 'sendtray_progress' | 'sendtray_destination'>(() => {
    if ((window as any).__openConverterProDirect) {
      return 'prepare';
    }
    return 'main';
  });
  const [pendingAction, setPendingAction] = useState<'drive' | 'sendtray' | 'convert'>('convert');
  const [destinationFolders, setDestinationFolders] = useState<SendtrayFolder[]>(() => getSendtrayFolders());
  const [isCreatingDestFolder, setIsCreatingDestFolder] = useState(false);
  const [newDestFolderName, setNewDestFolderName] = useState('');
  const [sendConvertOptions, setSendConvertOptions] = useState<SendConvertOptions>({
    mode: 'original',
    format: 'mp3',
    bitrate: '192k',
    keepOriginal: true
  });

  const [queuedFiles, setQueuedFiles] = useState<string[]>(() => {
    let baseList: string[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem('converter_queue') || '[]');
      if (Array.isArray(saved)) baseList = saved;
    } catch (e) {}
    if (isBatch && sendTrayItems && sendTrayItems.length > 0) {
      return Array.from(new Set([...baseList, ...sendTrayItems]));
    }
    if (filePath && filePath !== 'media') {
      return Array.from(new Set([...baseList, filePath]));
    }
    return baseList;
  });
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [fileConversionMap, setFileConversionMap] = useState<Record<string, { status: 'idle' | 'converting' | 'paused' | 'completed' | 'failed'; progress: number; error?: string }>>({});
  const [isConvertingBatch, setIsConvertingBatch] = useState(false);

  useEffect(() => {
    if ((window as any).__openConverterProDirect) {
      setActiveSection('prepare');
    }
  }, []);

  useEffect(() => {
    if (filePath && filePath !== 'media') {
      setQueuedFiles(prev => {
        const next = Array.from(new Set([...prev, filePath]));
        localStorage.setItem('converter_queue', JSON.stringify(next));
        return next;
      });
    }
  }, [filePath]);

  useEffect(() => {
    if (!electron) return;
    const handleRestore = () => {
      setActiveSection('prepare');
      setIsMinimized(false);
    };
    const handleDirectOpen = () => {
      setActiveSection('prepare');
      setIsMinimized(false);
    };
    const handleClose = () => {
      setIsMinimized(false);
      onClose();
    };
    const handlePause = () => {
      setIsPaused(true);
      isPausedRef.current = true;
    };
    const handleResume = () => {
      setIsPaused(false);
      isPausedRef.current = false;
    };
    electron.ipcRenderer.on('converter-open-request', handleDirectOpen);
    electron.ipcRenderer.on('converter-restore-request', handleRestore);
    electron.ipcRenderer.on('converter-close-request', handleClose);
    electron.ipcRenderer.on('converter-pause-request', handlePause);
    electron.ipcRenderer.on('converter-resume-request', handleResume);
    return () => {
      electron.ipcRenderer.removeListener('converter-open-request', handleDirectOpen);
      electron.ipcRenderer.removeListener('converter-restore-request', handleRestore);
      electron.ipcRenderer.removeListener('converter-close-request', handleClose);
      electron.ipcRenderer.removeListener('converter-pause-request', handlePause);
      electron.ipcRenderer.removeListener('converter-resume-request', handleResume);
    };
  }, [onClose]);


  const handleAddFilesToQueue = async () => {
    if (electron) {
      try {
        const selected = await electron.ipcRenderer.invoke('select-media-files');
        if (Array.isArray(selected) && selected.length > 0) {
          setQueuedFiles(prev => {
            const next = Array.from(new Set([...prev, ...selected]));
            localStorage.setItem('converter_queue', JSON.stringify(next));
            return next;
          });
        }
      } catch (err) {
        console.error('File selection error:', err);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,audio/*';
      input.onchange = (e: any) => {
        const files = Array.from(e.target.files || []) as File[];
        const paths = files.map((f: any) => f.path || f.name).filter(Boolean);
        if (paths.length > 0) {
          setQueuedFiles(prev => {
            const next = Array.from(new Set([...prev, ...paths]));
            localStorage.setItem('converter_queue', JSON.stringify(next));
            return next;
          });
        }
      };
      input.click();
    }
  };

  const handleRemoveFromQueue = (indexToRemove: number, targetPath?: string) => {
    if (targetPath && targetPath.startsWith('__SYNC_ALL__:')) {
      try {
        const fullQueue = JSON.parse(targetPath.replace('__SYNC_ALL__:', ''));
        if (Array.isArray(fullQueue)) {
          setQueuedFiles(fullQueue);
          if (setSendTrayItems) setSendTrayItems(fullQueue);
          localStorage.setItem('converter_queue', JSON.stringify(fullQueue));
          return;
        }
      } catch (e) {}
    }

    setQueuedFiles(prev => {
      const next = prev.filter((f, idx) => targetPath ? f !== targetPath : idx !== indexToRemove);
      localStorage.setItem('converter_queue', JSON.stringify(next));
      return next;
    });

    if (setSendTrayItems) {
      setSendTrayItems(prev => prev.filter((f, idx) => targetPath ? f !== targetPath : idx !== indexToRemove));
    }
  };

  const handleClearQueue = () => {
    setQueuedFiles([]);
    if (setSendTrayItems) {
      setSendTrayItems([]);
    }
    localStorage.removeItem('converter_queue');
    if (electron) {
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: false,
        queueCount: 0,
        converting: false
      });
    }
  };

  const [directSendFiles, setDirectSendFiles] = useState<string[] | null>(null);
  const [isFromConverter, setIsFromConverter] = useState(false);

  const effectiveFiles = (directSendFiles && directSendFiles.length > 0)
    ? directSendFiles
    : (queuedFiles.length > 0 ? queuedFiles : (filePath ? [filePath] : []));
  const allFiles = effectiveFiles.filter(Boolean);

  // Sync minimize state and conversion progress with PlayerTitleBar
  useEffect(() => {
    if (!electron) return;
    if (isMinimized) {
      const activeFile = allFiles[currentFileIndex] || filePath || '';
      const cleanFileName = activeFile ? activeFile.split(/[/\\]/).pop() : '';
      const isConvertingNow = copyStatus === 'copying' || isConvertingBatch;
      const progressVal = Math.round(copyProgress <= 1 && copyProgress > 0 ? copyProgress * 100 : copyProgress);
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: true,
        converting: isConvertingNow,
        isPaused,
        progress: progressVal,
        currentFile: cleanFileName,
        queueCount: allFiles.length,
        status: copyStatus,
        statusText: isPaused
          ? 'Conversion Paused'
          : copyStatus === 'completed'
          ? 'Conversion Complete!'
          : copyStatus === 'failed'
          ? 'Conversion Failed'
          : isConvertingNow
          ? (allFiles.length > 1 ? `Converting [${currentFileIndex + 1}/${allFiles.length}] (${progressVal}%)` : `Converting... ${progressVal}%`)
          : 'Converter Pro'
      });
    }
  }, [isMinimized, copyProgress, copyStatus, currentFileIndex, allFiles, filePath, isPaused, isConvertingBatch]);

  useEffect(() => {
    if (!electron) { 
      setLoading(false); 
      return; 
    }
    electron.ipcRenderer.invoke('get-flash-drives').then((list: any) => {
      setDrives(list || []);
      setLoading(false);
    });

    const handleProgress = (_event: any, data: any) => {
      if (data && data.filePath) {
        setFileConversionMap(prev => ({
          ...prev,
          [data.filePath]: {
            status: data.status || 'converting',
            progress: typeof data.progress === 'number' ? data.progress : 0,
            error: data.error
          }
        }));
      }
      if (allFiles[currentFileIndex] && data.filePath === allFiles[currentFileIndex]) {
        setCopyProgress(data.progress);
        if (data.status === 'completed') {
          if (currentFileIndex < allFiles.length - 1) {
            setCurrentFileIndex(idx => idx + 1);
            setCopyProgress(0);
          } else {
            setCopyStatus('completed');
            if (setSendTrayItems && isBatch) setSendTrayItems([]);
          }
        } else if (data.status === 'failed') {
          setCopyStatus('failed');
          setErrorMsg(data.error || 'Operation failed');
        }
      }
    };

    if (!electron) return;
    electron.ipcRenderer.on('copy-progress', handleProgress);
    return () => { 
      electron?.ipcRenderer.removeListener('copy-progress', handleProgress); 
    };
  }, [allFiles, currentFileIndex, isBatch, sendTrayItems]);

  const handleSend = async (driveLetter: string) => {
    if (!electron) return;
    setCopyStatus('copying');
    setCopyProgress(0);
    setCurrentFileIndex(0);
    
    for (let i = 0; i < allFiles.length; i++) {
      setCurrentFileIndex(i);
      const targetFile = allFiles[i];
      let res;
      if (sendConvertOptions && sendConvertOptions.mode !== 'original' && isVideoFile(targetFile)) {
        res = await electron.ipcRenderer.invoke('convert-and-send-to-drive', { 
          filePath: targetFile, 
          driveLetter,
          options: {
            mode: sendConvertOptions.mode,
            format: sendConvertOptions.format,
            bitrate: sendConvertOptions.bitrate
          }
        });
      } else {
        res = await electron.ipcRenderer.invoke('copy-file-to-drive', { 
          filePath: targetFile, 
          driveLetter 
        });
      }
      if (!res.success) {
        setCopyStatus('failed');
        setErrorMsg(res.error || 'Copy failed');
        return;
      }
    }
    setCopyStatus('completed');
    if (setSendTrayItems && isBatch) setSendTrayItems([]);
  };

  const handleCreateDestFolderAndSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newDestFolderName.trim()) return;
    const created = createSendtrayFolder(newDestFolderName.trim());
    setDestinationFolders(getSendtrayFolders());
    setNewDestFolderName('');
    setIsCreatingDestFolder(false);
    handleMoveToSendtray(created.id);
  };

  const handleMoveFileToSendtray = (targetPath: string, folderId?: string) => {
    if (setSendTrayItems) {
      setSendTrayItems(prev => prev.includes(targetPath) ? prev : [...prev, targetPath]);
    }
    if (folderId) {
      assignFileToSendtrayFolder(targetPath, folderId);
    }
  };

  const handleProceedFromPreparation = async (options: SendConvertOptions) => {
    setSendConvertOptions(options);
    const dest = options.exportDestination || (pendingAction === 'drive' ? 'drive' : 'sendtray');

    if (dest === 'drive' && !options.exportDriveLetter) {
      setActiveSection('drives');
      return;
    }

    if (dest === 'sendtray' && options.mode === 'original') {
      allFiles.forEach(f => handleMoveFileToSendtray(f, options.targetFolderId));
      onClose();
      return;
    }

    if (!electron) return;
    if (activeSection !== 'prepare') {
      setActiveSection('sendtray_progress');
    }
    setCopyStatus('copying');
    setIsConvertingBatch(true);
    setCopyProgress(0.01);
    setCurrentFileIndex(0);
    setErrorMsg('');

    try {
      for (let i = 0; i < allFiles.length; i++) {
        while (isPausedRef.current) {
          await new Promise(r => setTimeout(r, 400));
        }
        setCurrentFileIndex(i);
        const target = allFiles[i];
        setCopyProgress(0.05);
        setFileConversionMap(prev => ({
          ...prev,
          [target]: { status: 'converting', progress: 0.05 }
        }));

        // Record persistent event state so status is retained across power loss / restarts
        try {
          localStorage.setItem('converter_active_progress', JSON.stringify({
            status: 'converting',
            currentFileIndex: i,
            totalFiles: allFiles.length,
            currentFile: target,
            timestamp: Date.now()
          }));
        } catch (e) {}

        const itemOpt = options.perFileOptions?.[target] || {
          mode: options.mode,
          format: options.format,
          bitrate: options.bitrate
        };

        if (dest === 'drive' && options.exportDriveLetter) {
          if (options.mode === 'original') {
            const res = await electron.ipcRenderer.invoke('copy-file-to-drive', {
              filePath: target,
              driveLetter: options.exportDriveLetter
            });
            if (!res.success) throw new Error(res.error || 'Copy to drive failed');
          } else {
            const res = await electron.ipcRenderer.invoke('convert-and-send-to-drive', {
              filePath: target,
              driveLetter: options.exportDriveLetter,
              options: {
                mode: itemOpt.mode,
                format: itemOpt.format,
                bitrate: itemOpt.bitrate
              }
            });
            if (!res.success) throw new Error(res.error || 'Conversion to drive failed');
          }
          setFileConversionMap(prev => ({
            ...prev,
            [target]: { status: 'completed', progress: 1.0 }
          }));
        } else {
          // Export to Sendtray or custom folder
          const targetDir = dest === 'folder' ? options.exportCustomPath : undefined;
          const res = await electron.ipcRenderer.invoke('convert-media-file', {
            filePath: target,
            targetDir,
            options: {
              mode: itemOpt.mode,
              format: itemOpt.format,
              bitrate: itemOpt.bitrate
            }
          });
          if (res.success && res.outputPath) {
            if (dest === 'sendtray') {
              handleMoveFileToSendtray(res.outputPath, options.targetFolderId);
            }
            setCopyProgress(1);
            setFileConversionMap(prev => ({
              ...prev,
              [target]: { status: 'completed', progress: 1.0, outputPath: res.outputPath }
            }));

            // Save completed event
            try {
              const history = JSON.parse(localStorage.getItem('converter_event_history') || '[]');
              history.unshift({
                file: target,
                output: res.outputPath || options.exportDriveLetter || 'Saved',
                timestamp: new Date().toISOString(),
                status: 'completed'
              });
              localStorage.setItem('converter_event_history', JSON.stringify(history.slice(0, 50)));
            } catch (e) {}
          } else {
            setCopyStatus('failed');
            setErrorMsg(res.error || `Conversion failed for ${target.split(/[\\/]/).pop()}`);
            setFileConversionMap(prev => ({
              ...prev,
              [target]: { status: 'failed', progress: 0, error: res.error }
            }));
            setIsConvertingBatch(false);
            return;
          }
        }
      }
      setCopyStatus('completed');
      setIsConvertingBatch(false);
      try {
        localStorage.removeItem('converter_active_progress');
        localStorage.setItem('converter_last_event', JSON.stringify({
          status: 'completed',
          completedAt: Date.now(),
          totalFiles: allFiles.length
        }));
      } catch (e) {}
      if (activeSection !== 'prepare') {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setCopyStatus('failed');
      setIsConvertingBatch(false);
      setErrorMsg(err.message || 'Conversion failed');
      try {
        localStorage.setItem('converter_active_progress', JSON.stringify({
          status: 'failed',
          error: err.message,
          timestamp: Date.now()
        }));
      } catch (e) {}
    }
  };

  const handleTogglePauseConversion = async () => {
    const nextPaused = !isPausedRef.current;
    isPausedRef.current = nextPaused;
    setIsPaused(nextPaused);
    const currFile = allFiles[currentFileIndex];
    if (currFile && electron) {
      await electron.ipcRenderer.invoke('converter-toggle-pause', currFile);
      setFileConversionMap(prev => {
        const item = prev[currFile];
        if (!item) return prev;
        return {
          ...prev,
          [currFile]: { ...item, status: nextPaused ? 'paused' : 'converting' }
        };
      });
    }
  };

  const handleConvertSingleFile = async (targetFile: string) => {
    if (!electron || !targetFile) return;
    setIsConvertingBatch(true);
    setCopyStatus('copying');
    setFileConversionMap(prev => ({
      ...prev,
      [targetFile]: { status: 'converting', progress: 0.05 }
    }));
    try {
      const isVid = isVideoFile(targetFile);
      let mType = 'video';
      try {
        const saved = JSON.parse(localStorage.getItem('converter_media_types') || '{}');
        mType = saved[targetFile] || (isVid ? 'video' : 'audio');
      } catch (e) {
        mType = isVid ? 'video' : 'audio';
      }
      const res = await electron.ipcRenderer.invoke('convert-media-file', {
        filePath: targetFile,
        options: {
          mode: mType === 'video' ? 'convert_video' : 'extract_audio',
          format: mType === 'video' ? 'mp4' : 'mp3',
          bitrate: mType === 'video' ? '1080p' : '320k'
        }
      });
      if (res.success) {
        setFileConversionMap(prev => ({
          ...prev,
          [targetFile]: { status: 'completed', progress: 1.0, outputPath: res.outputPath }
        }));
      } else {
        setFileConversionMap(prev => ({
          ...prev,
          [targetFile]: { status: 'failed', progress: 0, error: res.error }
        }));
      }
    } catch (err: any) {
      setFileConversionMap(prev => ({
        ...prev,
        [targetFile]: { status: 'failed', progress: 0, error: err?.message || 'Error' }
      }));
    } finally {
      setIsConvertingBatch(false);
    }
  };

  const handleTogglePauseSingleFile = async (targetFile: string) => {
    if (!electron || !targetFile) return;
    const res = await electron.ipcRenderer.invoke('converter-toggle-pause', targetFile);
    const isNowPaused = res?.isPaused ?? !isPausedRef.current;
    setFileConversionMap(prev => {
      const curr = prev[targetFile];
      if (!curr) return prev;
      return {
        ...prev,
        [targetFile]: { ...curr, status: isNowPaused ? 'paused' : 'converting' }
      };
    });
  };

  const handleMoveToSendtray = (folderId?: string) => {
    allFiles.forEach(f => handleMoveFileToSendtray(f, folderId));
    onClose();
  };

  const currentFilePath = allFiles[currentFileIndex] || filePath;
  const filename = currentFilePath.split(/[\\/]/).pop() || '';
  const totalLabel = allFiles.length > 1 ? `${allFiles.length} files` : filename;

  const [localFav, setLocalFav] = useState(isFavourite);
  const [localArch, setLocalArch] = useState(isArchived);

  useEffect(() => {
    setLocalFav(isFavourite);
  }, [isFavourite]);

  useEffect(() => {
    setLocalArch(isArchived);
  }, [isArchived]);

  const handleToggleFavourite = () => {
    if (onToggleFavourite) {
      onToggleFavourite(filePath);
      setLocalFav(prev => !prev);
      onClose();
    }
  };

  const handleToggleArchive = () => {
    if (onToggleArchive) {
      onToggleArchive(filePath, isFolder);
      setLocalArch(prev => !prev);
      onClose();
    }
  };

  const topRowOptions = [
    ...(onToggleFavourite && !isBatch && !isFolder ? [{
      id: 'favourite',
      icon: <Heart size={18} fill={localFav ? '#f43f5e' : 'none'} style={{ color: '#f43f5e' }} />,
      label: localFav ? 'Remove Fav' : 'Mark Favourite',
      desc: localFav ? 'Restore playlist' : 'Hide & save to fav',
      fullTitle: localFav ? 'Remove from Favourites (Restore to original playlist)' : 'Mark as Favourite (Save to favourites and hide from public)',
      color: '#f43f5e',
      action: handleToggleFavourite
    }] : []),
    ...(onToggleArchive && !isBatch ? [{
      id: 'archive',
      icon: <Lock size={18} style={{ color: '#eab308' }} />,
      label: localArch 
        ? 'Restore Public' 
        : (isFolder ? 'Archive Folder' : 'Archive File'),
      desc: localArch 
        ? 'Unlock to public' 
        : 'Hide behind PIN',
      fullTitle: localArch 
        ? 'Restore to Public (Unlock and make visible again in public playlist)' 
        : (isFolder ? 'Archive Folder (Hide from public and lock behind PIN)' : 'Archive File (Hide from public and lock behind PIN)'),
      color: '#eab308',
      action: handleToggleArchive
    }] : []),
  ];

  const driveOption = {
    id: 'drives',
    icon: <HardDrive size={20} />,
    label: 'Hard Drives & USB',
    desc: allFiles.length > 1 ? `Copy ${allFiles.length} files to drive` : 'Copy to removable flash drives or local drives',
    fullTitle: 'Copy to removable flash drives or local drives',
    color: '#6366f1',
    action: () => {
      setSendConvertOptions(prev => ({ ...prev, mode: 'original' }));
      setActiveSection('drives');
    }
  };

  const trayOption = !isBatch ? {
    id: 'sendtray',
    icon: <MoveRight size={18} style={{ color: '#f59e0b' }} />,
    label: 'Move to Sendtray',
    desc: 'Hold in tray for later',
    fullTitle: 'Move to Sendtray (Hold in tray for batch sending later)',
    color: '#f59e0b',
    action: () => {
      setDestinationFolders(getSendtrayFolders());
      setActiveSection('sendtray_destination');
    }
  } : null;

  const isAlreadyInConverterQueue = Boolean(
    filePath && filePath !== 'media' && (() => {
      try {
        const q = JSON.parse(localStorage.getItem('converter_queue') || '[]');
        return Array.isArray(q) && q.includes(filePath);
      } catch (e) {
        return false;
      }
    })()
  );

  const convertOption = {
    id: 'convert',
    icon: <Sparkles size={18} style={{ color: isAlreadyInConverterQueue ? '#6b7280' : '#c084fc' }} />,
    label: isAlreadyInConverterQueue ? 'In Converter' : 'Convert',
    desc: isAlreadyInConverterQueue ? 'Already added to Converter' : 'Tools & export',
    fullTitle: isAlreadyInConverterQueue ? 'Already added to Converter queue' : 'Convert Media (Audio extraction, video format conversion & export)',
    color: isAlreadyInConverterQueue ? '#6b7280' : '#a855f7',
    disabled: isAlreadyInConverterQueue,
    action: () => {
      if (isAlreadyInConverterQueue) return;
      setPendingAction('convert');
      setActiveSection('prepare');
    }
  };

  const bottomRowOptions = [
    ...(trayOption ? [trayOption] : []),
    ...(!isFromConverter ? [convertOption] : [])
  ];

  const allMainOptions = [
    ...topRowOptions,
    driveOption,
    ...bottomRowOptions
  ];

  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleCancelOrClose = React.useCallback(() => {
    if (isFromConverter) {
      setIsFromConverter(false);
      setDirectSendFiles(null);
      setActiveSection('prepare');
    } else {
      setIsMinimized(false);
      (window as any).__openConverterProDirect = false;
      onClose();
    }
  }, [isFromConverter, onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [activeSection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (copyStatus === 'copying') return;
        if (activeSection === 'prepare') {
          setActiveSection('main');
        } else if (activeSection === 'drives' || activeSection === 'sendtray_destination') {
          setActiveSection('main');
        } else if (activeSection === 'main' && isFromConverter) {
          handleCancelOrClose();
        } else {
          onClose();
        }
        return;
      }

      // Backspace: Back to main in drives/prepare, or exit modal in main menu
      if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (copyStatus === 'copying') return;
        if (activeSection === 'prepare') {
          setActiveSection('main');
        } else if (activeSection === 'drives' || activeSection === 'sendtray_destination') {
          setActiveSection('main');
        } else if (activeSection === 'main' && isFromConverter) {
          handleCancelOrClose();
        } else if (activeSection === 'main') {
          onClose();
        }
        return;
      }

      // Navigation in main options list
      if (activeSection === 'main') {
        const topLen = topRowOptions.length;
        const driveIdx = topLen;
        const bottomLen = bottomRowOptions.length;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (selectedIndex < topLen) {
            setSelectedIndex(driveIdx);
          } else if (selectedIndex === driveIdx) {
            if (bottomLen > 0) setSelectedIndex(driveIdx + 1);
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (selectedIndex >= driveIdx + 1) {
            setSelectedIndex(driveIdx);
          } else if (selectedIndex === driveIdx) {
            if (topLen > 0) setSelectedIndex(0);
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (topLen === 2 && selectedIndex === 0) {
            setSelectedIndex(1);
          } else if (bottomLen === 2 && selectedIndex === driveIdx + 1) {
            setSelectedIndex(driveIdx + 2);
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (topLen === 2 && selectedIndex === 1) {
            setSelectedIndex(0);
          } else if (bottomLen === 2 && selectedIndex === driveIdx + 2) {
            setSelectedIndex(driveIdx + 1);
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopImmediatePropagation();
          allMainOptions[selectedIndex]?.action();
        }
      } else if (activeSection === 'drives') {
        const maxIndex = drives.length - 1;
        if (maxIndex >= 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopImmediatePropagation();
            setSelectedIndex(prev => (prev < maxIndex ? prev + 1 : prev));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopImmediatePropagation();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (drives[selectedIndex] && copyStatus === 'idle') {
              handleSend(drives[selectedIndex].letter);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeSection, selectedIndex, drives, allMainOptions, topRowOptions.length, bottomRowOptions.length, copyStatus, onClose]);


  const defaultDisplayName = (allFiles[0] || filePath || '').split(/[/\\]/).pop() || 'Media File';

  return (
    <div 
      className="modal-backdrop send-to-flash-modal" 
      data-modal="send" 
      style={{ 
        zIndex: 12000, 
        display: isMinimized ? 'none' : 'flex' 
      }} 
      onClick={onClose}
    >
      {activeSection === 'prepare' ? (
        <SendConvertPreparationModal
          fileName={allFiles.length > 1 ? `${allFiles.length} files queued` : defaultDisplayName}
          targetAction={pendingAction}
          isBatch={allFiles.length > 1 || isBatch}
          batchCount={allFiles.length}
          queuedFiles={allFiles}
          onAddFiles={handleAddFilesToQueue}
          onRemoveFile={handleRemoveFromQueue}
          onClearQueue={handleClearQueue}
          drives={drives}
          isConverting={copyStatus === 'copying' || isConvertingBatch}
          isPaused={isPaused}
          conversionProgress={copyProgress}
          activeConvertingFile={allFiles[currentFileIndex]}
          conversionStatus={fileConversionMap}
          onTogglePauseConversion={handleTogglePauseConversion}
          onConvertSingleFile={handleConvertSingleFile}
          onTogglePauseSingleFile={handleTogglePauseSingleFile}
          onProceed={handleProceedFromPreparation}
          onDirectSend={(target) => {
            if (Array.isArray(target) && target.length > 0) {
              setDirectSendFiles(target);
              setIsFromConverter(true);
              setActiveSection('main');
            } else if (target === 'drive') {
              setActiveSection('drives');
            } else {
              setActiveSection('sendtray_destination');
            }
          }}
          onMinimizeChange={setIsMinimized}
          onBack={() => {
            setIsMinimized(false);
            if (isDirectConverter) {
              (window as any).__openConverterProDirect = false;
              onClose();
            } else {
              setActiveSection('main');
            }
          }}
          onClose={() => {
            setIsMinimized(false);
            (window as any).__openConverterProDirect = false;
            onClose();
          }}
        />
      ) : (
        <div 
          className="glass-panel modal-content" 
          style={{ 
            width: '440px', 
            maxWidth: '94vw',
            padding: '0', 
            overflow: 'hidden', 
            borderRadius: '18px', 
            border: '1px solid rgba(255,255,255,0.1)',
            animation: 'panamediaMenuPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }} 
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(99,102,241,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {((activeSection === 'drives' || activeSection === 'sendtray_destination') || (isFromConverter && activeSection === 'main')) && (
                <button 
                  onClick={() => { 
                    if (isFromConverter && activeSection === 'main') {
                      handleCancelOrClose();
                    } else {
                      setActiveSection('main');
                      setCopyStatus('idle'); 
                    }
                  }} 
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Back"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <Send size={16} style={{ color: 'var(--primary)' }} />
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: '#fff' }}>
                  {activeSection === 'drives' 
                    ? 'Select Drive' 
                    : activeSection === 'sendtray_progress'
                    ? 'Processing Media'
                    : activeSection === 'sendtray_destination'
                    ? 'Choose Sendtray Folder'
                    : 'Send File'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{totalLabel}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {copyStatus === 'copying' && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(168, 85, 247, 0.16)',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                    color: '#e9d5ff',
                    borderRadius: '7px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Minimize & continue working in background"
                >
                  <Minimize2 size={12} /> Minimize
                </button>
              )}
              <button className="modal-close-btn" onClick={handleCancelOrClose} disabled={copyStatus === 'copying'}>✕</button>
            </div>
          </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* Main Options Menu */}
          {activeSection === 'main' && (
            <>
              {/* Top Row: Favourite & Archive buttons side-by-side */}
              {topRowOptions.length > 0 && (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: topRowOptions.length === 2 ? '1fr 1fr' : '1fr', 
                  gap: '10px' 
                }}>
                  {topRowOptions.map((opt, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={opt.id}
                        onClick={opt.action}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        title={opt.fullTitle}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '11px 12px',
                          background: isSelected ? `${opt.color}15` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSelected ? opt.color + '75' : 'rgba(255,255,255,0.07)'}`,
                          borderRadius: '12px',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                          boxShadow: isSelected ? `0 4px 16px ${opt.color}25` : 'none',
                          transform: isSelected ? 'translateY(-1px)' : 'none',
                        }}
                      >
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: `${opt.color}1a`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: opt.color,
                          flexShrink: 0,
                          transition: 'transform 0.18s ease',
                          transform: isSelected ? 'scale(1.08)' : 'scale(1)'
                        }}>
                          {opt.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: '600',
                            fontSize: '12.5px',
                            color: '#fff',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {opt.label}
                          </div>
                          <div style={{
                            fontSize: '10.5px',
                            color: 'var(--text-muted)',
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {opt.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Row 2: Hard Drives & USB (Removable Disk) */}
              {(() => {
                const idx = topRowOptions.length;
                const isSelected = idx === selectedIndex;
                const opt = driveOption;
                return (
                  <button
                    key={opt.id}
                    onClick={opt.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    title={opt.fullTitle}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '12px 14px',
                      background: isSelected ? `${opt.color}15` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? opt.color + '75' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: isSelected ? `0 4px 16px ${opt.color}25` : 'none',
                      transform: isSelected ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: `${opt.color}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: opt.color,
                      flexShrink: 0,
                      transition: 'transform 0.18s ease',
                      transform: isSelected ? 'scale(1.06)' : 'scale(1)'
                    }}>
                      {opt.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: '#fff', marginBottom: '2px' }}>{opt.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{opt.desc}</div>
                    </div>
                    <ChevronRight size={14} style={{ color: isSelected ? '#fff' : 'var(--text-muted)', flexShrink: 0, transition: 'transform 0.18s ease', transform: isSelected ? 'translateX(2px)' : 'none' }} />
                  </button>
                );
              })()}

              {/* Row 3: Move to Sendtray & Convert side-by-side */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: bottomRowOptions.length === 2 ? '1fr 1fr' : '1fr',
                gap: '10px'
              }}>
                {bottomRowOptions.map((opt: any, bIdx) => {
                  const idx = topRowOptions.length + 1 + bIdx;
                  const isSelected = idx === selectedIndex && !opt.disabled;
                  return (
                    <button
                      key={opt.id}
                      onClick={opt.disabled ? undefined : opt.action}
                      onMouseEnter={() => !opt.disabled && setSelectedIndex(idx)}
                      disabled={Boolean(opt.disabled)}
                      title={opt.fullTitle}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '11px 12px',
                        background: opt.disabled 
                          ? 'rgba(255,255,255,0.015)' 
                          : isSelected 
                          ? `${opt.color}15` 
                          : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${opt.disabled ? 'rgba(255,255,255,0.04)' : isSelected ? opt.color + '75' : 'rgba(255,255,255,0.07)'}`,
                        borderRadius: '12px',
                        cursor: opt.disabled ? 'not-allowed' : 'pointer',
                        opacity: opt.disabled ? 0.45 : 1,
                        filter: opt.disabled ? 'grayscale(0.6)' : 'none',
                        width: '100%',
                        textAlign: 'left',
                        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                        boxShadow: isSelected && !opt.disabled ? `0 4px 16px ${opt.color}25` : 'none',
                        transform: isSelected && !opt.disabled ? 'translateY(-1px)' : 'none',
                      }}
                    >
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: `${opt.color}1a`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: opt.color,
                        flexShrink: 0,
                        transition: 'transform 0.18s ease',
                        transform: isSelected ? 'scale(1.08)' : 'scale(1)'
                      }}>
                        {opt.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: '600',
                          fontSize: '12.5px',
                          color: '#fff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {opt.label}
                        </div>
                        <div style={{
                          fontSize: '10.5px',
                          color: 'var(--text-muted)',
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                  ↑ ↓ ← → navigate • ↵ select • ⌫ back
                </span>
                <button className="btn-secondary" onClick={handleCancelOrClose} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px' }}>Cancel</button>
              </div>
            </>
          )}

          {/* Sendtray Destination Selection */}
          {activeSection === 'sendtray_destination' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Select where to place this media inside your Sendtray:
              </div>

              {/* Main Tray (Root) Option */}
              <button
                onClick={() => handleMoveToSendtray()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f59e0b',
                  flexShrink: 0
                }}>
                  <MoveRight size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>Main Sendtray</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Default root tray queue</div>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              </button>

              {/* Existing Folders */}
              {destinationFolders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => handleMoveToSendtray(folder.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                    flexShrink: 0
                  }}>
                    <Folder size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{folder.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sendtray folder group</div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}

              {/* Create New Folder Inline */}
              <div style={{
                marginTop: '4px',
                padding: '12px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {!isCreatingDestFolder ? (
                  <button
                    onClick={() => setIsCreatingDestFolder(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#f59e0b',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px'
                    }}
                  >
                    <FolderPlus size={16} /> + Create New Folder &amp; Send Here
                  </button>
                ) : (
                  <form onSubmit={handleCreateDestFolderAndSend} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Enter folder name..."
                      value={newDestFolderName}
                      onChange={(e) => setNewDestFolderName(e.target.value)}
                      autoFocus
                      style={{
                        flex: 1,
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        background: 'rgba(0, 0, 0, 0.4)',
                        color: '#fff',
                        fontSize: '12px',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#f59e0b',
                        color: '#000',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={13} /> Create &amp; Send
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingDestFolder(false)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        fontSize: '11.5px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
                <button className="btn-secondary" onClick={() => setActiveSection('main')} style={{ fontSize: '12px', padding: '6px 14px' }}>
                  ⌫ Back
                </button>
              </div>
            </div>
          )}

          {/* Sendtray Conversion Progress View */}
          {activeSection === 'sendtray_progress' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  position: 'relative',
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                  background: 'rgba(255, 255, 255, 0.04)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
                }}>
                  {copyStatus === 'copying' && (
                    <div style={{
                      position: 'absolute',
                      inset: '-60%',
                      background: 'conic-gradient(from 0deg, transparent 0%, #ec4899 40%, #8b5cf6 75%, transparent 100%)',
                      animation: 'spin 1.4s linear infinite',
                      zIndex: 0
                    }} />
                  )}
                  <div style={{
                    position: 'relative',
                    zIndex: 1,
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: '#13141f',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {copyStatus === 'completed' ? (
                      <CheckCircle2 size={22} style={{ color: '#10b981' }} />
                    ) : copyStatus === 'failed' ? (
                      <AlertCircle size={22} style={{ color: '#ef4444' }} />
                    ) : (
                      <img 
                        src="player.ico" 
                        alt="Panamedia" 
                        style={{ 
                          width: '26px', 
                          height: '26px', 
                          objectFit: 'contain',
                          filter: 'drop-shadow(0 2px 6px rgba(236, 72, 153, 0.4))'
                        }} 
                      />
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>
                    {copyStatus === 'completed' 
                      ? 'Process Complete!' 
                      : copyStatus === 'failed' 
                      ? 'Process Failed' 
                      : sendConvertOptions.mode === 'extract_audio'
                      ? `Extracting ${sendConvertOptions.format.toUpperCase()} audio...`
                      : `Converting to ${sendConvertOptions.format.toUpperCase()}...`}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {copyStatus === 'completed' 
                      ? 'Added to your Send Tray for quick sharing' 
                      : filename}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>{copyStatus === 'copying' ? 'Converting via FFmpeg...' : copyStatus === 'completed' ? 'Saved & Added to Tray' : 'Error occurred'}</span>
                  <span style={{ fontWeight: 600, color: '#fff' }}>{Math.round(copyProgress * 100)}%</span>
                </div>
                <div className="progress-bar-bg" style={{ height: '8px', borderRadius: '4px' }}>
                  <div 
                    className="progress-bar-fill" 
                    style={{ 
                      width: `${Math.max(5, copyProgress * 100)}%`, 
                      background: copyStatus === 'completed' 
                        ? 'var(--success)' 
                        : copyStatus === 'failed' 
                        ? 'var(--danger)' 
                        : 'linear-gradient(90deg, #ec4899, #8b5cf6)',
                      borderRadius: '4px',
                      transition: 'width 0.2s ease'
                    }} 
                  />
                </div>
                {copyStatus === 'copying' && (
                  <button
                    type="button"
                    onClick={() => setIsMinimized(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      width: '100%',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.35)',
                      color: '#e9d5ff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: '6px'
                    }}
                  >
                    <Minimize2 size={13} /> Minimize &amp; Process in Background
                  </button>
                )}
                {copyStatus === 'failed' && (
                  <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '4px' }}>
                    {errorMsg}
                  </div>
                )}
              </div>

              {(copyStatus === 'completed' || copyStatus === 'failed') && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button className="btn-primary" onClick={onClose} style={{ fontSize: '12px', padding: '6px 16px' }}>
                    Done
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Drive Selection Section */}
          {activeSection === 'drives' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '24px 0', color: 'var(--text-muted)', justifyContent: 'center' }}>
                  <Loader2 className="animate-spin" size={16} /> Scanning drives...
                </div>
              ) : copyStatus === 'idle' ? (
                drives.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    <HardDrive size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
                    No removable USB drives detected.<br />Please insert a flash drive.
                  </div>
                ) : (
                  drives.map((d, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={d.letter}
                        className="btn-secondary"
                        style={{ 
                          justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', fontSize: '13px', width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                          background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSelected ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.06)'}`,
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => handleSend(d.letter)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <HardDrive size={16} style={{ color: 'var(--primary)' }} />
                          <span>{d.label}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({d.letter.replace('\\', '')})</span>
                        </div>
                        <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '12px' }}>Send ➔</span>
                      </button>
                    );
                  })
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
                  {allFiles.length > 1 && copyStatus === 'copying' && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      File {currentFileIndex + 1} of {allFiles.length}: {filename}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span>{copyStatus === 'copying' ? (sendConvertOptions.mode !== 'original' ? 'Converting & Copying...' : 'Copying...') : copyStatus === 'completed' ? '✓ Completed!' : '✕ Failed'}</span>
                    <span>{Math.round(copyProgress * 100)}%</span>
                  </div>
                  <div className="progress-bar-bg" style={{ height: '8px' }}>
                    <div className="progress-bar-fill" style={{ width: `${copyProgress * 100}%`, background: copyStatus === 'completed' ? 'var(--success)' : copyStatus === 'failed' ? 'var(--danger)' : 'var(--primary-gradient)' }}></div>
                  </div>
                  {copyStatus === 'failed' && <div style={{ color: 'var(--danger)', fontSize: '12px' }}>Error: {errorMsg}</div>}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                <button className="btn-secondary" onClick={() => setActiveSection('main')} style={{ fontSize: '12px', padding: '6px 14px' }}>
                  ⌫ Back
                </button>
                {(copyStatus === 'completed' || copyStatus === 'failed') && (
                  <button className="btn-primary" onClick={onClose} style={{ fontSize: '12px', padding: '6px 16px' }}>Done</button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
      )}
    </div>
  );
}