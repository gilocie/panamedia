import React, { useState, useEffect } from 'react';
import { 
  Send, ChevronLeft, HardDrive, MoveRight, 
  Loader2, ChevronRight, Heart, Lock, CheckCircle2, AlertCircle,
  Folder, FolderPlus, Plus
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
  const [activeSection, setActiveSection] = useState<'main' | 'prepare' | 'drives' | 'sendtray_progress' | 'sendtray_destination'>('main');
  const [pendingAction, setPendingAction] = useState<'drive' | 'sendtray'>('drive');
  const [destinationFolders, setDestinationFolders] = useState<SendtrayFolder[]>(() => getSendtrayFolders());
  const [isCreatingDestFolder, setIsCreatingDestFolder] = useState(false);
  const [newDestFolderName, setNewDestFolderName] = useState('');
  const [sendConvertOptions, setSendConvertOptions] = useState<SendConvertOptions>({
    mode: 'original',
    format: 'mp3',
    bitrate: '192k',
    keepOriginal: true
  });

  const allFiles = isBatch ? sendTrayItems : [filePath];
  const hasVideo = allFiles.some(f => isVideoFile(f));

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
      if (data.filePath === allFiles[currentFileIndex]) {
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
          setErrorMsg(data.error || 'Copy failed');
        }
      }
    };

    if (!electron) return;
    electron.ipcRenderer.on('copy-progress', handleProgress);
    return () => { 
      electron?.ipcRenderer.removeListener('copy-progress', handleProgress); 
    };
  }, [filePath, currentFileIndex, isBatch, sendTrayItems]);

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

  const handleProceedFromPreparation = async (options: SendConvertOptions) => {
    setSendConvertOptions(options);
    if (pendingAction === 'drive') {
      setActiveSection('drives');
    } else {
      if (options.mode === 'original') {
        handleMoveToSendtray(options.targetFolderId);
      } else {
        if (!electron) return;
        setActiveSection('sendtray_progress');
        setCopyStatus('copying');
        setCopyProgress(0.05);
        try {
          const res = await electron.ipcRenderer.invoke('convert-media-file', {
            filePath,
            options: {
              mode: options.mode,
              format: options.format,
              bitrate: options.bitrate
            }
          });
          if (res.success && res.outputPath) {
            setCopyStatus('completed');
            if (setSendTrayItems && !sendTrayItems.includes(res.outputPath)) {
              setSendTrayItems(prev => [...prev, res.outputPath]);
            }
            if (options.targetFolderId) {
              assignFileToSendtrayFolder(res.outputPath, options.targetFolderId);
            }
            setTimeout(() => {
              onClose();
            }, 1200);
          } else {
            setCopyStatus('failed');
            setErrorMsg(res.error || 'Conversion failed');
          }
        } catch (err: any) {
          setCopyStatus('failed');
          setErrorMsg(err.message || 'Conversion failed');
        }
      }
    }
  };

  const handleMoveToSendtray = (folderId?: string) => {
    if (setSendTrayItems && !sendTrayItems.includes(filePath)) {
      setSendTrayItems(prev => [...prev, filePath]);
    }
    if (folderId) {
      assignFileToSendtrayFolder(filePath, folderId);
    }
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

  const bottomOptions = [
    {
      id: 'drives',
      icon: <HardDrive size={20} />,
      label: 'Hard Drives & USB',
      desc: allFiles.length > 1 ? `Copy ${allFiles.length} files to drive` : 'Copy to removable flash drives or local drives',
      fullTitle: 'Copy to removable flash drives or local drives',
      color: '#6366f1',
      action: () => {
        if (hasVideo) {
          setPendingAction('drive');
          setActiveSection('prepare');
        } else {
          setActiveSection('drives');
        }
      }
    },
    ...(!isBatch ? [{
      id: 'sendtray',
      icon: <MoveRight size={20} style={{ color: '#f59e0b' }} />,
      label: 'Move to Sendtray',
      desc: 'Hold in tray for batch sending later',
      fullTitle: 'Move to Sendtray (Hold in tray for batch sending later)',
      color: '#f59e0b',
      action: () => {
        if (hasVideo) {
          setPendingAction('sendtray');
          setActiveSection('prepare');
        } else {
          setDestinationFolders(getSendtrayFolders());
          setActiveSection('sendtray_destination');
        }
      }
    }] : [])
  ];

  const allMainOptions = [...topRowOptions, ...bottomOptions];

  const [selectedIndex, setSelectedIndex] = useState(0);

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
        } else if (activeSection === 'drives') {
          setActiveSection(hasVideo ? 'prepare' : 'main');
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
        } else if (activeSection === 'drives') {
          setActiveSection(hasVideo ? 'prepare' : 'main');
        } else if (activeSection === 'main') {
          onClose();
        }
        return;
      }

      // Navigation in main options list
      if (activeSection === 'main') {
        const maxIndex = allMainOptions.length - 1;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (topRowOptions.length === 2 && (selectedIndex === 0 || selectedIndex === 1)) {
            setSelectedIndex(Math.min(2, maxIndex));
          } else {
            setSelectedIndex(prev => (prev < maxIndex ? prev + 1 : prev));
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (topRowOptions.length === 2 && selectedIndex === 2) {
            setSelectedIndex(0);
          } else {
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (topRowOptions.length === 2 && selectedIndex === 0) {
            setSelectedIndex(1);
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (topRowOptions.length === 2 && selectedIndex === 1) {
            setSelectedIndex(0);
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
  }, [activeSection, selectedIndex, drives, allMainOptions, topRowOptions.length, copyStatus, onClose, hasVideo]);

  return (
    <div className="modal-backdrop send-to-flash-modal" data-modal="send" style={{ zIndex: 12000 }} onClick={onClose}>
      {activeSection === 'prepare' ? (
        <SendConvertPreparationModal
          fileName={filename}
          targetAction={pendingAction}
          isBatch={isBatch}
          batchCount={allFiles.length}
          onProceed={handleProceedFromPreparation}
          onBack={() => setActiveSection('main')}
          onClose={onClose}
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
              {(activeSection === 'drives' || activeSection === 'sendtray_destination') && (
                <button 
                  onClick={() => { 
                    if (activeSection === 'drives') {
                      setActiveSection(hasVideo ? 'prepare' : 'main');
                    } else {
                      setActiveSection('main');
                    }
                    setCopyStatus('idle'); 
                  }} 
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Back (Backspace)"
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
            <button className="modal-close-btn" onClick={onClose} disabled={copyStatus === 'copying'}>✕</button>
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

              {/* Bottom Options: Hard Drives & Sendtray */}
              {bottomOptions.map((opt, bIdx) => {
                const idx = topRowOptions.length + bIdx;
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
              })}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                  ↑ ↓ ← → navigate • ↵ select • ⌫ back
                </span>
                <button className="btn-secondary" onClick={onClose} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px' }}>Cancel</button>
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
                <button className="btn-secondary" onClick={() => setActiveSection(hasVideo ? 'prepare' : 'main')} style={{ fontSize: '12px', padding: '6px 14px' }}>
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