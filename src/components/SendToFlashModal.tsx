import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Send, ChevronLeft, HardDrive, MoveRight, 
  Loader2, ChevronRight, Heart, Lock, CheckCircle2, AlertCircle,
  Folder, FolderPlus, Plus, Minimize2, Sparkles
} from 'lucide-react';
import { electron } from './panamedia/types';
import {
  getQueue,
  subscribeQueue,
  addToQueue,
  removeFromQueue,
  clearQueue,
  isInQueue,
  mapWithConcurrency,
  conversionConcurrency
} from './panamedia/converterQueue';
import { registerOutputs, classifyOutput } from './panamedia/converterOutputs';
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
  // `ready` and `freeBytes` come from the engine (or the PowerShell
  // fallback) and are what stop a job being sent to a card reader with no
  // card in it, or to a stick that has just been pulled.
  const [drives, setDrives] = useState<Array<{ letter: string; label: string; ready?: boolean; freeBytes?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'completed' | 'failed'>('idle');
  const [copyProgress, setCopyProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  // Opening the converter from the player header lands on the preparation screen
  // directly, skipping the send/copy menu. That intent used to travel as a
  // window flag set by the header button, but the flag was also the thing that
  // added the playing file to the queue -- so "open the converter" and "add my
  // current media" were welded into one action. They are separate now: the
  // header asks for the preparation screen, and the queue is left alone.
  //
  // The flag is read once, here, at mount, and consumed immediately.
  const openedFromPlayer = Boolean((window as any).__openConverterProOpen);
  if ((window as any).__openConverterProOpen) {
    (window as any).__openConverterProOpen = false;
  }
  const [activeSection, setActiveSection] = useState<
    'main' | 'prepare' | 'drives' | 'sendtray_progress' | 'sendtray_destination'
  >(() => (openedFromPlayer ? 'prepare' : 'main'));
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

  /**
   * The settings the preparation screen last applied.
   *
   * A per-card convert used to invent its own settings -- hard-coded mp4/1080p
   * or mp3/320k, and it read the card's type from an `isVideoFile` guess rather
   * than the toggle the user had actually flipped. The result was that the same
   * file could convert one way from its card and another way from the footer,
   * with nothing on screen saying which. These refs let the card use the real
   * choices without re-reading storage on every click.
   */
  const perFileOptionsRef = useRef<NonNullable<SendConvertOptions['perFileOptions']>>({});
  const pendingOptionsRef = useRef<Partial<SendConvertOptions> | null>(null);

  /**
   * The folders the Output tabs list: Documents\Panamedia\Video Output and
   * Audio Output.
   *
   * Fetched once here so a per-card convert can write straight to the folder the
   * user is looking at, rather than beside the source file where nothing would
   * find it. The preparation screen owns the same two paths and lets the user
   * change them, so localStorage is consulted on every read and these are only
   * the fallback for a first run before the folders have been created.
   */
  const videoOutputDirRef = useRef<string>('');
  const audioOutputDirRef = useRef<string>('');

  /**
   * Directory a finished conversion of the given kind should be written to.
   *
   * The user's chosen location lives in localStorage, which the main process
   * cannot read, so it is passed across; the main process creates the folder if
   * needed. Returns '' on failure, in which case callers leave `targetDir`
   * undefined and the engine falls back to writing beside the source.
   */
  const resolveOutputDir = async (kind: 'video' | 'audio'): Promise<string> => {
    const key = kind === 'audio' ? 'panamedia_audio_output_dir' : 'panamedia_video_output_dir';
    const dirPath = localStorage.getItem(key)
      || (kind === 'audio' ? audioOutputDirRef.current : videoOutputDirRef.current);
    if (!electron) return dirPath || '';
    try {
      const r = await electron.ipcRenderer.invoke('resolve-output-dir', { kind, dirPath });
      return r && r.success && r.dir ? r.dir : '';
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    if (!electron) return;
    electron.ipcRenderer.invoke('get-converter-output-paths').then((paths: any) => {
      if (paths?.videoOutputDir) videoOutputDirRef.current = paths.videoOutputDir;
      if (paths?.audioOutputDir) audioOutputDirRef.current = paths.audioOutputDir;
    }).catch(() => {});
  }, []);

  // Queue state lives in converterQueue, under its own `converter_queue` key.
  // It is deliberately separate from the sendtray's `player_sendTray`: files
  // staged for sending are not work waiting to be converted, and sharing the key
  // made each list show the other's contents.
  //
  // Nothing seeds it from `filePath` either: the media currently playing is not a
  // queue member, which is what previously made it impossible to remove.
  const [queuedFiles, setQueuedFiles] = useState<string[]>(() => getQueue());
  useEffect(() => subscribeQueue(setQueuedFiles), []);

  // The converter icon in the player header OPENS the converter. It does not add
  // anything to the queue.
  //
  // Adding the playing file here was an interpretation of what the button
  // meant, and it was the wrong one: a button labelled "converter" reads as
  // "show me the converter", and quietly changing the queue as a side effect
  // meant the queue was never what the user last left it as. It also made the
  // current media undeletable, since it was re-added on the next open.
  //
  // To convert what is playing, add it explicitly from the queue. `filePath`
  // is no longer read here at all, so nothing about the player can reach the
  // queue without an explicit add.
  const [isMinimized, setIsMinimized] = useState(false);
  // Pause state is NOT held here. It lives in `fileConversionMap`, one entry per
  // file, because that is the only place a card's own Pause button writes to --
  // and having a second copy is what broke the footer: pausing a card left
  // `isPaused` false, so the big button kept reading PAUSE and kept pulsing
  // while the card read RESUME. It is derived below instead.
  const [fileConversionMap, setFileConversionMap] = useState<Record<string, { status: 'idle' | 'converting' | 'paused' | 'completed' | 'failed'; progress: number; error?: string }>>({});

  // Files the user deleted from the queue while converting. Their
  // jobs were cancelled, so late progress events are dropped here --
  // otherwise a removed row resurrected itself in the queue list.
  const removedFilesRef = useRef<Set<string>>(new Set());
  const handleQueueFilesRemoved = (files: string[]) => {
    if (!files || files.length === 0) return;
    files.forEach(f => removedFilesRef.current.add(f));
  };
  // Mirror of the above, readable from callbacks without re-creating them.
  const fileConversionMapRef = useRef(fileConversionMap);
  fileConversionMapRef.current = fileConversionMap;

  /**
   * Splits the live jobs into the ones running and the ones held.
   *
   * Driven by the map's own keys rather than by the queue. A file only has an
   * entry once it has actually been handed to the engine, so this is exactly
   * the set that can be paused -- and it keeps this independent of `allFiles`,
   * which is derived further down, so the IPC handlers that use it can be
   * registered once instead of being rebuilt on every queue change.
   */
  const splitInFlight = useCallback((map: Record<string, { status: string }>) => {
    const running: string[] = [];
    const held: string[] = [];
    for (const f of Object.keys(map)) {
      const s = map[f]?.status;
      if (s === 'converting') running.push(f);
      else if (s === 'paused') held.push(f);
    }
    return { running, held };
  }, []);

  /**
   * The footer's single Pause/Resume control has to answer one question about N
   * independently pausable jobs. It reads "held" only when every in-flight job is
   * held -- that is the only state where Resume is the honest label. With a mix,
   * the button still offers Pause, and clicking it pauses whichever jobs are
   * actually running without disturbing the ones the user held on purpose.
   *
   */
  const isPaused = useMemo(() => {
    const { running, held } = splitInFlight(fileConversionMap);
    return held.length > 0 && running.length === 0;
  }, [fileConversionMap, splitInFlight]);

  /** Applies a pause state to specific jobs in the engine and in the map. */
  const applyPauseTo = useCallback(async (targets: string[], toPaused: boolean) => {
    if (!electron || targets.length === 0) return;
    const bridge = electron;
    await Promise.all(targets.map(async (f) => {
      try {
        await bridge.ipcRenderer.invoke('converter-toggle-pause', f);
      } catch (e) {}
    }));
    setFileConversionMap(prev => {
      const next = { ...prev };
      for (const f of targets) {
        const item = next[f];
        if (!item) continue;
        next[f] = { ...item, status: toPaused ? 'paused' : 'converting' };
      }
      return next;
    });
  }, []);

  const [isConvertingBatch, setIsConvertingBatch] = useState(false);

  useEffect(() => {
    // The IPC route into the preparation screen (tray button, restore-from-taskbar).
    // This only navigates; it never adds to the queue.
    //
    // `directSendFiles` was the other route by which sendtray contents reached
    // the converter: it overrode the real queue for as long as the sendtray was
    // non-empty, so opening the converter showed staged-for-sending files as if
    // they were work waiting to be converted. Removed -- if the user wants a
    // sendtray file converted, the Convert tile adds it explicitly.
    if ((window as any).__openConverterProOpen) {
      setActiveSection('prepare');
    }
  }, []);

  // The media currently playing is NOT a queue member.
  //
  // This effect used to add `filePath` on every change, writing straight to
  // localStorage and bypassing converterQueue entirely. Two things went wrong:
  // it added the playing file even when the converter was opened from the tray
  // rather than from the player, and because it re-ran on every filePath
  // change it resurrected the entry immediately after the user removed it --
  // which is why the currently watching media could not be cleared.
  //
  // Opening from the player header says "convert what I'm watching", and that
  // is handled explicitly and once by the directAddDone effect above. Opening
  // any other way means the user wants the queue they already have.

  useEffect(() => {
    if (!electron) return;
    // Narrow via a local const: the narrowing of an imported binding is not
    // carried into the cleanup closure below, so `electron` would still be
    // `ElectronBridge | null` there.
    const bridge = electron;
    // Navigation only. Neither of these adds anything to the queue: the
    // header button and the tray button both mean "show me the converter".
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
    // These used to flip a local boolean and nothing else, so pausing from the
    // tray or the title bar relabelled the button while every ffmpeg kept
    // running. They now go through the same path as the on-screen controls.
    const handlePause = () => {
      const { running } = splitInFlight(fileConversionMapRef.current);
      if (running.length === 0) return;
      applyPauseTo(running, true);
    };
    const handleResume = () => {
      const { held } = splitInFlight(fileConversionMapRef.current);
      if (held.length === 0) return;
      applyPauseTo(held, false);
    };
    bridge.ipcRenderer.on('converter-open-request', handleDirectOpen);
    bridge.ipcRenderer.on('converter-restore-request', handleRestore);
    bridge.ipcRenderer.on('converter-close-request', handleClose);
    bridge.ipcRenderer.on('converter-pause-request', handlePause);
    bridge.ipcRenderer.on('converter-resume-request', handleResume);
    return () => {
      bridge.ipcRenderer.removeListener('converter-open-request', handleDirectOpen);
      bridge.ipcRenderer.removeListener('converter-restore-request', handleRestore);
      bridge.ipcRenderer.removeListener('converter-close-request', handleClose);
      bridge.ipcRenderer.removeListener('converter-pause-request', handlePause);
      bridge.ipcRenderer.removeListener('converter-resume-request', handleResume);
    };
  }, [onClose, splitInFlight, applyPauseTo]);


  const handleAddFilesToQueue = async () => {
    // addToQueue de-duplicates by normalised path, so re-adding a file that is
    // already queued is a no-op instead of creating a second entry (which used
    // to make the file unpausable, since both shared one job id).
    const enqueue = (paths: string[]) => {
      if (!paths.length) return;
      const { added, duplicates } = addToQueue(paths);
      if (duplicates.length > 0) {
        console.log(`[Converter] already queued, skipped: ${duplicates.length} file(s)`);
      }
      // Deliberately does not touch `setSendTrayItems`. Queued-for-conversion
      // and staged-for-sending are different intentions, and pushing converter
      // additions into the sendtray made them show up in both lists at once.
      if (added.length > 0) setErrorMsg('');
    };

    if (electron) {
      try {
        const selected = await electron.ipcRenderer.invoke('select-media-files');
        if (Array.isArray(selected)) enqueue(selected);
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
        enqueue(files.map((f: any) => f.path || f.name).filter(Boolean));
      };
      input.click();
    }
  };

  const handleRemoveFromQueue = (indexToRemove: number, targetPath?: string) => {
    // There used to be a branch here for a `__SYNC_ALL__:<json>` sentinel that
    // overwrote the whole queue and wrote it straight to localStorage. Nothing
    // in the codebase ever produced that sentinel, so it was a second writer
    // that only existed to disagree with converterQueue. Removed.
    const doomed = targetPath
      ? [targetPath]
      : queuedFiles.filter((_, idx) => idx === indexToRemove);
    const next = removeFromQueue(doomed);

    // Mirror the queue that actually survived, rather than blanking the
    // sidebar. Setting it to [] here left the player's own list disagreeing
    // with storage, and its next update restored entries the user had just
    // deleted.
    if (setSendTrayItems) {
      setSendTrayItems(next);
    }
  };

  const handleClearQueue = () => {
    clearQueue();
    if (setSendTrayItems) {
      setSendTrayItems([]);
    }
    if (electron) {
      electron.ipcRenderer.send('converter-minimize-state', {
        minimized: false,
        queueCount: 0,
        converting: false
      });
    }
  };

  // Set only by the Output tabs' Direct Send button, i.e. the user explicitly
  // asking to send specific already-converted files. It never picks up sendtray
  // contents on its own.
  const [directSendFiles, setDirectSendFiles] = useState<string[] | null>(null);
  const [isFromConverter, setIsFromConverter] = useState(false);

  // No implicit fallback to `filePath`: an empty queue now genuinely means empty.
  // Previously this expression refilled the queue with the playing file the
  // instant the user cleared it.
  const effectiveFiles = (directSendFiles && directSendFiles.length > 0)
    ? directSendFiles
    : queuedFiles;
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
      // Deleted mid-conversion: the job was cancelled, so ignore the
      // straggler events that arrive before ffmpeg actually exits.
      if (!data || !data.filePath || removedFilesRef.current.has(data.filePath)) return;
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
    // Kept so a later per-card convert uses the same settings the user just
    // chose, instead of the hard-coded ones it used before.
    pendingOptionsRef.current = options as Partial<SendConvertOptions>;
    perFileOptionsRef.current = options.perFileOptions || {};

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
    // Local const so the non-null narrowing survives into the async closures
    // created by allFiles.map() below.
    const bridge = electron;
    removedFilesRef.current.clear();
    if (activeSection !== 'prepare') {
      setActiveSection('sendtray_progress');
    }
    setCopyStatus('copying');
    setIsConvertingBatch(true);
    setCopyProgress(0.01);
    setCurrentFileIndex(0);
    setErrorMsg('');

    try {
      // Convert several files at once, but with a bounded pool. The previous
      // `allFiles.map(async ...)` started every conversion simultaneously, so a
      // 30-file queue launched 30 ffmpeg processes and the machine stalled --
      // exactly the "feels heavy" problem. The cap scales with core count.
      const poolSize = conversionConcurrency();
      // Split the core budget across the pool so concurrent jobs do not
      // oversubscribe the machine: 3 jobs on 8 cores get 2 threads each,
      // not 4 each (which would be 12 threads fighting over 8 cores).
      const coreCount = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
      const threadBudget = Math.max(1, Math.floor(coreCount / poolSize));
      console.log(`[Converter] converting ${allFiles.length} file(s), ${poolSize} at a time, ${threadBudget} threads each`);

      const conversionPromises = mapWithConcurrency(allFiles, poolSize, async (target, i) => {
        setFileConversionMap(prev => ({
          ...prev,
          [target]: { status: 'converting', progress: 0.05 }
        }));

        // Track which file is actually running. This used to stay pinned at 0,
        // so the main PAUSE button always targeted allFiles[0] and paused the
        // wrong job (or nothing) whenever the queue had more than one entry.
        setCurrentFileIndex(prev => (prev === i ? prev : i));

        // Record persistent event state
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

        try {
          if (dest === 'drive' && options.exportDriveLetter) {
            // Both branches can produce output; the copy branch has no output
            // path of its own, hence the outer declaration.
            let driveOutputs: string[] = [];

            if (options.mode === 'original') {
              const res = await bridge.ipcRenderer.invoke('copy-file-to-drive', {
                filePath: target,
                driveLetter: options.exportDriveLetter
              });
              if (!res.success) throw new Error(res.error || 'Copy to drive failed');
            } else {
              const res = await bridge.ipcRenderer.invoke('convert-and-send-to-drive', {
                filePath: target,
                driveLetter: options.exportDriveLetter,
                options: {
                  mode: itemOpt.mode,
                  format: itemOpt.format,
                  bitrate: itemOpt.bitrate,
                  audioBitrate: itemOpt.audioBitrate || options.audioBitrate,
                  highQuality: itemOpt.highQuality ?? options.highQuality,
                  tools: itemOpt.tools
                }
              });
              if (!res.success) throw new Error(res.error || 'Conversion to drive failed');
              if (res.outputs && res.outputs.length) driveOutputs = res.outputs;
              else if (res.outputPath) driveOutputs = [res.outputPath];
            }

            // Same bookkeeping as the sendtray/folder branch below: record what
            // was produced so it appears under Video or Audio, and take the
            // source off the queue so a finished job stops looking pending.
            registerOutputs(driveOutputs, classifyOutput(itemOpt.mode, target, driveOutputs[0] || ''));
            setFileConversionMap(prev => ({
              ...prev,
              [target]: { status: 'completed', progress: 1.0, outputPath: driveOutputs[0] }
            }));
            removeFromQueue([target]);
          } else {
            // This branch is the not-a-drive case, so the target directory is
            // always resolved and passed through: the engine then writes
            // straight to the destination instead of writing beside the source
            // and relocating afterwards.
            let targetDir: string | undefined;
            if (dest === 'folder') {
              targetDir = options.exportCustomPath;
            } else {
              // Default: the folder matching what this file became. Passing
              // 'folder' rather than 'sendtray' is what makes the engine honour
              // the directory; the sendtray is a staging list, not a location.
              const kind = classifyOutput(itemOpt.mode, target, target);
              targetDir = (await resolveOutputDir(kind)) || undefined;
            }

            const res = await bridge.ipcRenderer.invoke('convert-media-file', {
              filePath: target,
              targetDir,
              destination: 'folder',
              options: {
                mode: itemOpt.mode,
                format: itemOpt.format,
                bitrate: itemOpt.bitrate,
                audioBitrate: itemOpt.audioBitrate || options.audioBitrate,
                highQuality: itemOpt.highQuality ?? options.highQuality,
                threadBudget,
                tools: itemOpt.tools
              }
            });
            if (res.success && res.outputPath) {
              // Split writes a numbered series that already sits in
              // the destination, so every segment is registered and
              // no relocation happens. A single-file conversion is
              // relocated out of the source folder as before.
              const outputs = res.outputs && res.outputs.length
                ? res.outputs
                : [res.outputPath];
              let finalPath = res.outputPath;
              if (!res.outputs && !targetDir) {
                // Only when no directory was given could the engine have written
                // beside the source. With a targetDir it already wrote to the
                // destination, and moving it again would push it somewhere the
                // user did not ask for.
                try {
                  const moved = await bridge.ipcRenderer.invoke('move-converted-output', {
                    sourcePath: res.outputPath,
                    destination: 'folder',
                    destPath: targetDir
                  });
                  if (moved && moved.success && moved.path) {
                    finalPath = moved.path;
                  } else if (moved && moved.error) {
                    console.warn('[Converter] could not relocate output:', moved.error);
                  }
                } catch (moveErr) {
                  console.warn('[Converter] move failed:', moveErr);
                }
              }

              if (dest === 'sendtray') {
                // Staging for a later copy-out. The file itself already lives in
                // its output folder; this only records that the user asked for
                // it to be sent, and does not move it.
                outputs.forEach(seg => handleMoveFileToSendtray(seg, options.targetFolderId));
              }

              // Record the finished files against the side they belong to, so a
              // conversion that landed in a folder the scan cannot reach is
              // still listed.
              // Classified by the mode used for *this* file, not by the source
              // extension: extracting audio from an .mp4 is the common case, and
              // it produced an audio file that the video tab then claimed.
              registerOutputs(
                outputs,
                classifyOutput(itemOpt.mode, target, finalPath || res.outputPath)
              );

              setFileConversionMap(prev => ({
                ...prev,
                [target]: {
                  status: 'completed', progress: 1.0, outputPath: finalPath,
                  segments: res.segments
                }
              }));

              // Done means done: the source leaves the queue. Only failures stay
              // behind, so they can be retried, and the title-bar badge stops
              // counting finished jobs as work still to do.
              removeFromQueue([target]);

              // Save completed event
              try {
                const history = JSON.parse(localStorage.getItem('converter_event_history') || '[]');
                history.unshift({
                  file: target,
                  output: res.segments
                    ? `${res.segments} segment(s)`
                    : (res.outputPath || options.exportDriveLetter || 'Saved'),
                  timestamp: new Date().toISOString(),
                  status: 'completed'
                });
                localStorage.setItem('converter_event_history', JSON.stringify(history.slice(0, 50)));
              } catch (e) {}
            } else {
              throw new Error(res.error || `Conversion failed for ${target.split(/[\\/]/).pop()}`);
            }
          }
          return { file: target, success: true };
        } catch (err: any) {
          setFileConversionMap(prev => ({
            ...prev,
            [target]: { status: 'failed', progress: 0, error: err?.message }
          }));
          return { file: target, success: false, error: err?.message };
        }
      });

      // mapWithConcurrency already awaits its own pool.
      const results = await conversionPromises;
      const anyFailed = results.some(r => !r.success);

      if (anyFailed) {
        setCopyStatus('failed');
        const failedFiles = results.filter(r => !r.success);
        setErrorMsg(`${failedFiles.length} file(s) failed to convert`);
      } else {
        setCopyStatus('completed');
      }
      setIsConvertingBatch(false);

      try {
        localStorage.removeItem('converter_active_progress');
        localStorage.setItem('converter_last_event', JSON.stringify({
          status: anyFailed ? 'partial' : 'completed',
          completedAt: Date.now(),
          totalFiles: allFiles.length
        }));
      } catch (e) {}
      if (!anyFailed && activeSection !== 'prepare') {
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
    // Derived from the per-file statuses rather than from a toggled flag. The
    // flag version had two failure modes: it read false whenever the user had
    // paused an individual card (so the footer said PAUSE over a paused job),
    // and when it did fire it toggled *every* in-flight job, silently undoing
    // whichever ones the user had deliberately singled out.
    const { running, held } = splitInFlight(fileConversionMapRef.current);
    if (!electron) return;

    // Resume only when there is nothing left running, which is exactly the
    // condition under which the button is labelled RESUME.
    const toPaused = !(held.length > 0 && running.length === 0);
    const targets = toPaused ? running : held;
    if (targets.length === 0) return;

    await applyPauseTo(targets, toPaused);
  };

  const handleConvertSingleFile = async (targetFile: string) => {
    if (!electron || !targetFile) return;

    // Reads the card's own state instead of assuming a video, and takes the
    // format and quality the user picked in the dock rather than hard-coding
    // mp4/1080p/mp3/320k. The hard-coded values are why a per-card convert could
    // produce something different from what the rest of the screen said.
    const itemOpt = perFileOptionsRef.current[targetFile] || {};
    const savedType = (() => {
      try {
        return JSON.parse(localStorage.getItem('converter_media_types') || '{}')[targetFile];
      } catch (e) {
        return undefined;
      }
    })();
    const mType = savedType || (isVideoFile(targetFile) ? 'video' : 'audio');
    const isAudio = mType === 'audio';

    const settings = pendingOptionsRef.current || {};
    const format = itemOpt.format || settings.format
      || (isAudio ? 'mp3' : 'mp4');
    const quality = itemOpt.bitrate || settings.bitrate
      || (isAudio ? '320k' : '1080p');

    // Where the result belongs, so it lands in the folder the Output tabs
    // actually list rather than beside the source file.
    const targetDir = await resolveOutputDir(isAudio ? 'audio' : 'video') || undefined;

    setFileConversionMap(prev => ({
      ...prev,
      [targetFile]: { status: 'converting', progress: 0.05 }
    }));
    try {
      const res = await electron.ipcRenderer.invoke('convert-media-file', {
        filePath: targetFile,
        targetDir,
        destination: 'folder',
        options: {
          mode: isAudio ? 'extract_audio' : 'convert_video',
          format,
          bitrate: quality,
          audioBitrate: settings.audioBitrate,
          highQuality: settings.highQuality,
          tools: itemOpt.tools
        }
      });

      if (res.success && res.outputPath) {
        // Split writes a numbered series that already sits in the destination,
        // so each segment is registered and nothing needs moving. A single
        // output is relocated out of the source folder.
        const outputs = res.outputs && res.outputs.length ? res.outputs : [res.outputPath];
        let finalPath = res.outputPath;
        if (!res.outputs && !targetDir) {
          const moved = await electron.ipcRenderer.invoke('move-converted-output', {
            sourcePath: res.outputPath,
            destination: 'folder',
            destPath: targetDir
          }).catch(() => null);
          if (moved && moved.success && moved.path) finalPath = moved.path;
        }

        registerOutputs(outputs, isAudio ? 'audio' : 'video');

        setFileConversionMap(prev => ({
          ...prev,
          [targetFile]: {
            status: 'completed', progress: 1.0, outputPath: finalPath,
            segments: res.segments
          }
        }));

        // Same contract as the batch path: a finished job leaves the queue.
        removeFromQueue([targetFile]);
      } else {
        setFileConversionMap(prev => ({
          ...prev,
          [targetFile]: { status: 'failed', progress: 0, error: res.error || 'Conversion failed' }
        }));
      }
    } catch (err: any) {
      setFileConversionMap(prev => ({
        ...prev,
        [targetFile]: { status: 'failed', progress: 0, error: err?.message || 'Error' }
      }));
    }
  };

  const handleTogglePauseSingleFile = async (targetFile: string) => {
    if (!electron || !targetFile) return;

    // What this file is doing now, before the round trip. Used as the fallback
    // when the engine does not answer, so the button still moves rather than
    // silently sticking -- it used to fall back to the *global* flag, which is
    // how a single-file pause could leave the footer reading PAUSE.
    const wasPaused = fileConversionMapRef.current[targetFile]?.status === 'paused';

    const res = await electron.ipcRenderer.invoke('converter-toggle-pause', targetFile);
    const isNowPaused = typeof res?.isPaused === 'boolean' ? res.isPaused : !wasPaused;

    setFileConversionMap(prev => {
      const curr = prev[targetFile];
      if (!curr) return prev;
      return {
        ...prev,
        [targetFile]: { ...curr, status: isNowPaused ? 'paused' : 'converting' }
      };
    });
    // No aggregate update needed: the footer's state is derived from this map,
    // so holding the only running job now reads RESUME there automatically.
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

  // Read through converterQueue rather than raw localStorage: this used to check
// the legacy `converter_queue` key with `Array.includes`, which both missed
// entries once the paths differed only in slashes/case, and reported membership
// for files nothing had ever added to the queue.
  const isAlreadyInConverterQueue = Boolean(
    filePath && filePath !== 'media' && isInQueue(filePath)
  );

  // This button is the explicit "add this to the converter" action, so it is
  // where the queue write belongs.
  //
  // It used to rely on two implicit feeders instead: an effect in this modal
  // that added `filePath` whenever it changed, and another in
  // SendConvertPreparationModal that wrote the `queuedFiles` prop back to
  // storage. Those ran whether or not the user ever chose Convert, which made
  // right-click itself queue the file and made the playing file undeletable.
  //
  // Now the only path into the queue is this button, which is what the label
  // says it does.
  const handleConvert = () => {
    // `allFiles` rather than `filePath`: the modal can also be opened from the
    // converter's own tray with a batch selected, and Convert should take all
    // of it, not just the one the modal was pointed at.
    const targets = allFiles.length > 0 ? allFiles : [filePath];
    const usable = targets.filter((f) => f && f !== 'media');
    if (usable.length === 0) return;

    const { added, duplicates } = addToQueue(usable);
    if (added.length === 0 && duplicates.length > 0) {
      console.log('[Converter] already in queue, opening it');
    }

    setPendingAction('convert');
    setActiveSection('prepare');
  };

  const convertOption = {
    id: 'convert',
    icon: <Sparkles size={18} style={{ color: isAlreadyInConverterQueue ? '#6b7280' : '#c084fc' }} />,
    label: isAlreadyInConverterQueue ? 'In Converter' : 'Convert',
    desc: isAlreadyInConverterQueue ? 'Already added to Converter' : 'Tools & export',
    fullTitle: isAlreadyInConverterQueue ? 'Already added to Converter queue' : 'Convert Media (Audio extraction, video format conversion & export)',
    color: isAlreadyInConverterQueue ? '#6b7280' : '#a855f7',
    disabled: isAlreadyInConverterQueue,
    action: handleConvert
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
      (window as any).__openConverterProOpen = false;
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
          onQueueFilesRemoved={handleQueueFilesRemoved}
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
            // Arrived here from the player header, so back means close rather
            // than drop back to the send/copy menu.
            if (openedFromPlayer) {
              (window as any).__openConverterProOpen = false;
              onClose();
            } else {
              setActiveSection('main');
            }
          }}
          onClose={() => {
            setIsMinimized(false);
            (window as any).__openConverterProOpen = false;
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
                    // A drive that reports no media, or that stopped accepting
                    // writes while the window was open, is shown but not
                    // offered. The alternative -- accepting it and failing
                    // after a full-length encode -- is the thing to avoid.
                    const notReady = d.ready === false;
                    const free = typeof d.freeBytes === 'number' && d.freeBytes > 0
                      ? `${(d.freeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB free`
                      : '';
                    return (
                      <button
                        key={d.letter}
                        className="btn-secondary"
                        disabled={notReady}
                        title={notReady ? 'This drive is not ready. It may have been removed, or a card reader may have no card in it.' : undefined}
                        style={{ 
                          justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', fontSize: '13px', width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                          background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSelected ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.06)'}`,
                          opacity: notReady ? 0.45 : 1,
                          cursor: notReady ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => handleSend(d.letter)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <HardDrive size={16} style={{ color: notReady ? 'var(--text-muted)' : 'var(--primary)' }} />
                          <span>{d.label}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({d.letter.replace('\\', '')})</span>
                          {free && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{free}</span>
                          )}
                          {notReady && (
                            <span style={{ color: '#f87171', fontSize: '11px', fontWeight: 600 }}>not ready</span>
                          )}
                        </div>
                        <span style={{ color: notReady ? 'var(--text-muted)' : 'var(--primary)', fontWeight: 'bold', fontSize: '12px' }}>
                          {notReady ? 'Unavailable' : 'Send ➔'}
                        </span>
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