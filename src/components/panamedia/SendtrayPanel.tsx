import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Trash, Inbox, X as XIcon, Play,
  Folder, FolderPlus, FolderOpen, ChevronDown, ChevronRight,
  Download, Edit2, Check, MoreVertical
} from 'lucide-react';
import { electron } from './types';
import { 
  getSendtrayFolders, 
  saveSendtrayFolders, 
  createSendtrayFolder, 
  deleteSendtrayFolder, 
  renameSendtrayFolder, 
  getSendtrayAssignments, 
  assignFileToSendtrayFolder, 
  type SendtrayFolder 
} from './sendtrayUtils';

export interface SendtrayPanelProps {
  sendTrayItems: string[];
  setSendTrayItems: React.Dispatch<React.SetStateAction<string[]>>;
  setFlashDriveTarget: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSendTrayBatch: React.Dispatch<React.SetStateAction<boolean>>;
  onPlayMedia?: (filePath: string, title?: string) => void;
  currentPath?: string;
  isPlaying?: boolean;
  streamingPort?: number;
}

export function SendtrayPanel({
  sendTrayItems,
  setSendTrayItems,
  setFlashDriveTarget,
  setIsSendTrayBatch,
  onPlayMedia,
  currentPath = '',
  isPlaying = false,
  streamingPort = 52321,
}: SendtrayPanelProps) {
  const [folders, setFolders] = useState<SendtrayFolder[]>(() => getSendtrayFolders());
  const [assignments, setAssignments] = useState<Record<string, string>>(() => getSendtrayAssignments());
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  
  // New folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Rename folder state
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  // Status message for saves/exports
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Folder context menu state
  const [activeContextMenu, setActiveContextMenu] = useState<{
    x: number;
    y: number;
    type: 'folder' | 'file';
    folder?: SendtrayFolder;
    filePath?: string;
  } | null>(null);

  // Sync when storage events trigger
  useEffect(() => {
    const handleFoldersUpdated = () => setFolders(getSendtrayFolders());
    const handleAssignmentsUpdated = () => setAssignments(getSendtrayAssignments());
    window.addEventListener('sendtray-folders-updated', handleFoldersUpdated);
    window.addEventListener('sendtray-assignments-updated', handleAssignmentsUpdated);
    return () => {
      window.removeEventListener('sendtray-folders-updated', handleFoldersUpdated);
      window.removeEventListener('sendtray-assignments-updated', handleAssignmentsUpdated);
    };
  }, []);

  // Close context menu on external click
  useEffect(() => {
    const handleClickOutside = () => setActiveContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const showNotice = (msg: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusNotice(msg);
    statusTimerRef.current = setTimeout(() => {
      setStatusNotice(null);
    }, 4000);
  };

  const handleCreateFolder = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = createSendtrayFolder(newFolderName.trim());
    setFolders(getSendtrayFolders());
    setExpandedFolders(prev => ({ ...prev, [created.id]: true }));
    setNewFolderName('');
    setIsCreatingFolder(false);
    showNotice(`Folder "${created.name}" created`);
  };

  const handleStartRename = (folder: SendtrayFolder) => {
    setEditingFolderId(folder.id);
    setEditFolderName(folder.name);
    setActiveContextMenu(null);
  };

  const handleSaveRename = (folderId: string) => {
    if (!editFolderName.trim()) return;
    renameSendtrayFolder(folderId, editFolderName.trim());
    setFolders(getSendtrayFolders());
    setEditingFolderId(null);
    setEditFolderName('');
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    deleteSendtrayFolder(folderId);
    setFolders(getSendtrayFolders());
    setAssignments(getSendtrayAssignments());
    setActiveContextMenu(null);
    showNotice(`Folder "${folderName}" removed (files retained in tray)`);
  };

  // Save folder to computer via native picker & fs copy
  const handleSaveFolderToDisk = async (folder: SendtrayFolder) => {
    setActiveContextMenu(null);
    const folderFiles = sendTrayItems.filter(p => assignments[p] === folder.id);
    if (folderFiles.length === 0) {
      showNotice(`Folder "${folder.name}" has no files to save`);
      return;
    }

    if (!electron) {
      showNotice('Saving to disk is only supported in desktop app');
      return;
    }

    try {
      showNotice(`Saving "${folder.name}" (${folderFiles.length} files)...`);
      const res = await electron.ipcRenderer.invoke('save-folder-to-disk', {
        folderName: folder.name,
        filePaths: folderFiles
      });

      if (res && res.success) {
        showNotice(`✓ Saved "${folder.name}" (${res.copiedCount} files) to ${res.targetPath}`);
      } else if (res && res.canceled) {
        setStatusNotice(null);
      } else {
        showNotice(`Failed to save: ${res?.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      showNotice(`Error saving folder: ${err.message}`);
    }
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: prev[folderId] === undefined ? false : !prev[folderId]
    }));
  };

  const isFolderExpanded = (folderId: string) => {
    return expandedFolders[folderId] !== false; // Default expanded
  };

  const handlePlayItem = (filePath: string) => {
    if (!onPlayMedia) return;
    const fname = filePath.split(/[\\/]/).pop() || filePath;
    onPlayMedia(filePath, fname);
  };

  // Group files by folder
  const filesByFolder: Record<string, string[]> = {};
  const unfiledFiles: string[] = [];

  folders.forEach(f => {
    filesByFolder[f.id] = [];
  });

  sendTrayItems.forEach(filePath => {
    const fId = assignments[filePath];
    if (fId && filesByFolder[fId]) {
      filesByFolder[fId].push(filePath);
    } else {
      unfiledFiles.push(filePath);
    }
  });

  const renderFileCard = (filePath: string, idx: number) => {
    const fname = filePath.split(/[\\/]/).pop() || filePath;
    const fext = fname.split('.').pop()?.toLowerCase() || '';
    const isAudio = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac'].includes(fext);
    const isCurrentPlaying = currentPath && (currentPath.toLowerCase() === filePath.toLowerCase());

    return (
      <div
        key={filePath}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setActiveContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'file',
            filePath
          });
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 8px',
          borderRadius: '8px',
          marginBottom: '4px',
          background: isCurrentPlaying ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255, 255, 255, 0.02)',
          border: `1px solid ${isCurrentPlaying ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.06)'}`,
          boxShadow: isCurrentPlaying ? '0 2px 12px rgba(99, 102, 241, 0.2)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        {/* Interactive Thumbnail Button with player.ico Fallback */}
        <button
          type="button"
          onClick={() => handlePlayItem(filePath)}
          title="Play media"
          style={{
            position: 'relative',
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#10111a',
            border: `1px solid ${isCurrentPlaying ? '#818cf8' : 'rgba(255, 255, 255, 0.12)'}`,
            boxShadow: isCurrentPlaying ? '0 0 12px rgba(99, 102, 241, 0.6)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            padding: 0,
            transition: 'all 0.18s ease'
          }}
        >
          {/* Custom thumbnail or player.ico as background cover */}
          {!imgErrors[filePath] ? (
            <img
              src={`http://localhost:${streamingPort}/thumbnail?path=${encodeURIComponent(filePath)}`}
              alt=""
              onError={() => setImgErrors(prev => ({ ...prev, [filePath]: true }))}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                position: 'absolute',
                inset: 0
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.28), rgba(236, 72, 153, 0.28))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'absolute',
              inset: 0
            }}>
              <img 
                src="player.ico" 
                alt="" 
                style={{ 
                  width: '20px', 
                  height: '20px', 
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' 
                }} 
              />
            </div>
          )}

          {/* Translucent Corporate Glass Overlay - ALWAYS PLAY ICON (NO PAUSE) */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: isCurrentPlaying 
              ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.7), rgba(168, 85, 247, 0.7))' 
              : 'rgba(0, 0, 0, 0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.18s ease'
          }}>
            <Play size={13} fill="#fff" color="#fff" style={{ marginLeft: '1.5px', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
          </div>
        </button>

        {/* Media Details */}
        <div 
          onClick={() => handlePlayItem(filePath)} 
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          title={filePath}
        >
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: isCurrentPlaying ? '#e0e7ff' : '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {fname}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: 'var(--text-muted)' }}>
            <span style={{ textTransform: 'uppercase', fontWeight: 700, color: isAudio ? '#ec4899' : '#818cf8' }}>{fext || 'file'}</span>
            <span>• #{idx + 1}</span>
            {isCurrentPlaying && (
              <span style={{ color: '#a5b4fc', fontWeight: 600 }}>• {isPlaying ? 'Playing' : 'Paused'}</span>
            )}
          </div>
        </div>

        {/* Folder move selector */}
        {folders.length > 0 && (
          <select
            value={assignments[filePath] || ''}
            onChange={(e) => {
              const targetFolder = e.target.value;
              assignFileToSendtrayFolder(filePath, targetFolder || undefined);
              setAssignments(getSendtrayAssignments());
            }}
            title="Move to folder"
            style={{
              fontSize: '9.5px',
              padding: '2px 6px',
              borderRadius: '5px',
              background: 'rgba(15, 16, 26, 0.9)',
              border: '1px solid rgba(99, 102, 241, 0.32)',
              color: '#c7d2fe',
              outline: 'none',
              maxWidth: '75px',
              cursor: 'pointer'
            }}
          >
            <option value="">Unfiled</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        )}

        {/* Remove Button */}
        <button
          onClick={() => {
            setSendTrayItems(prev => prev.filter(p => p !== filePath));
            assignFileToSendtrayFolder(filePath, undefined);
            setAssignments(getSendtrayAssignments());
          }}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'rgba(255, 255, 255, 0.4)', 
            cursor: 'pointer', 
            padding: '3px', 
            display: 'flex', 
            flexShrink: 0,
            transition: 'color 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ec4899')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)')}
          title="Remove from tray"
        >
          <XIcon size={12} />
        </button>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Top Header: Corporate Group / Folder Tab only */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid rgba(99, 102, 241, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(99, 102, 241, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Inbox size={13} style={{ color: '#818cf8' }} />
          <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#c7d2fe' }}>Sendtray Groups</span>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>({sendTrayItems.length} files)</span>
        </div>

        {/* Top only has Group / Folder creation */}
        <button
          onClick={() => setIsCreatingFolder(true)}
          title="Create new folder group"
          style={{
            padding: '4px 9px',
            fontSize: '10.5px',
            borderRadius: '6px',
            border: '1px solid rgba(99, 102, 241, 0.45)',
            background: 'rgba(99, 102, 241, 0.18)',
            color: '#c7d2fe',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 700,
            transition: 'all 0.15s ease'
          }}
        >
          <FolderPlus size={12} style={{ color: '#a5b4fc' }} /> + Folder
        </button>
      </div>

      {/* Inline New Folder Form */}
      {isCreatingFolder && (
        <form
          onSubmit={handleCreateFolder}
          style={{
            padding: '8px 10px',
            background: 'rgba(99, 102, 241, 0.1)',
            borderBottom: '1px solid rgba(99, 102, 241, 0.25)',
            display: 'flex',
            gap: '6px'
          }}
        >
          <input
            type="text"
            placeholder="Folder name (e.g. Afrobeats)..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsCreatingFolder(false);
            }}
            autoFocus
            style={{
              flex: 1,
              padding: '4px 8px',
              borderRadius: '5px',
              border: '1px solid rgba(99, 102, 241, 0.5)',
              background: 'rgba(0, 0, 0, 0.5)',
              color: '#fff',
              fontSize: '11px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '4px 9px',
              borderRadius: '5px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              fontSize: '10.5px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)'
            }}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFolder(false)}
            style={{
              padding: '4px 6px',
              borderRadius: '5px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: '10px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </form>
      )}

      {/* Notification Banner */}
      {statusNotice && (
        <div style={{
          padding: '6px 10px',
          background: 'rgba(16, 185, 129, 0.15)',
          borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#10b981',
          fontSize: '10.5px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Check size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {statusNotice}
          </span>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {sendTrayItems.length === 0 && folders.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Inbox size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.35, color: '#818cf8' }} />
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#c7d2fe' }}>Sendtray is empty</div>
            <div style={{ fontSize: '11px', opacity: 0.7 }}>
              Right-click files and choose "Send" → "Move to Sendtray" to queue and organize media in folders.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            
            {/* User Folders */}
            {folders.map(folder => {
              const folderItems = filesByFolder[folder.id] || [];
              const expanded = isFolderExpanded(folder.id);
              const isRenaming = editingFolderId === folder.id;

              return (
                <div
                  key={folder.id}
                  style={{
                    borderRadius: '9px',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    background: 'rgba(99, 102, 241, 0.03)',
                    overflow: 'hidden'
                  }}
                >
                  {/* Folder Header */}
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        type: 'folder',
                        folder
                      });
                    }}
                    style={{
                      padding: '7px 10px',
                      background: 'rgba(99, 102, 241, 0.08)',
                      borderBottom: expanded ? '1px solid rgba(99, 102, 241, 0.15)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    onClick={() => toggleFolderExpanded(folder.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                      <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                      {expanded ? (
                        <FolderOpen size={14} style={{ color: '#a855f7', flexShrink: 0 }} />
                      ) : (
                        <Folder size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
                      )}

                      {isRenaming ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editFolderName}
                            onChange={(e) => setEditFolderName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(folder.id);
                              if (e.key === 'Escape') setEditingFolderId(null);
                            }}
                            autoFocus
                            style={{
                              padding: '2px 5px',
                              borderRadius: '4px',
                              border: '1px solid #6366f1',
                              background: '#000',
                              color: '#fff',
                              fontSize: '11px',
                              outline: 'none',
                              width: '100px'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(folder.id)}
                            style={{ background: '#6366f1', border: 'none', borderRadius: '3px', color: '#fff', padding: '2px 4px', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {folder.name}
                        </span>
                      )}

                      <span style={{ fontSize: '9.5px', color: '#c7d2fe', background: 'rgba(99, 102, 241, 0.15)', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                        {folderItems.length}
                      </span>
                    </div>

                    {/* Folder Quick Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                      {/* Save to Computer button */}
                      <button
                        type="button"
                        onClick={() => handleSaveFolderToDisk(folder)}
                        title="Save folder and files to computer location"
                        style={{
                          height: '21px',
                          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(168, 85, 247, 0.18))',
                          border: '1px solid rgba(99, 102, 241, 0.45)',
                          borderRadius: '4px',
                          color: '#e0e7ff',
                          padding: '0 6px',
                          fontSize: '9.5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '3px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          lineHeight: 1,
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.32), rgba(168, 85, 247, 0.32))')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(168, 85, 247, 0.18))')}
                      >
                        <Download size={10} style={{ color: '#c084fc' }} /> Save
                      </button>

                      {/* Send folder button */}
                      {folderItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setFlashDriveTarget(folderItems[0]);
                            setIsSendTrayBatch(true);
                          }}
                          title="Send this folder to drive"
                          style={{
                            height: '21px',
                            width: '24px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: '1px solid rgba(139, 92, 246, 0.55)',
                            borderRadius: '4px',
                            color: '#fff',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                            boxShadow: '0 2px 6px rgba(99, 102, 241, 0.35)',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)')}
                        >
                          <Send size={10} style={{ display: 'block', margin: 'auto' }} />
                        </button>
                      )}

                      {/* More Menu Trigger */}
                      <button
                        type="button"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setActiveContextMenu({
                            x: rect.left,
                            y: rect.bottom + 4,
                            type: 'folder',
                            folder
                          });
                        }}
                        title="Folder options (or right click)"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          padding: '2px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Folder Items */}
                  {expanded && (
                    <div style={{ padding: '6px 6px 2px 6px' }}>
                      {folderItems.length === 0 ? (
                        <div style={{ padding: '12px 10px', fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                          Folder is empty. Select this folder when adding media to Sendtray.
                        </div>
                      ) : (
                        folderItems.map((filePath, idx) => renderFileCard(filePath, idx))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unfiled Files Section */}
            {unfiledFiles.length > 0 && (
              <div style={{
                borderRadius: '9px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(255, 255, 255, 0.01)',
                padding: '6px'
              }}>
                {folders.length > 0 && (
                  <div style={{
                    padding: '4px 6px 8px 6px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    color: '#818cf8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px'
                  }}>
                    <Inbox size={11} />
                    <span>Unfiled Items ({unfiledFiles.length})</span>
                  </div>
                )}
                {unfiledFiles.map((filePath, idx) => renderFileCard(filePath, idx))}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Bottom Sticky Action Footer (Corporate Colors) */}
      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid rgba(99, 102, 241, 0.15)',
        background: 'rgba(12, 13, 20, 0.95)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <button
          onClick={() => {
            setSendTrayItems([]);
            saveSendtrayFolders([]);
            setFolders([]);
          }}
          disabled={sendTrayItems.length === 0}
          title="Clear all files from sendtray"
          style={{
            flex: '1',
            padding: '8px 10px',
            fontSize: '11px',
            borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#f87171',
            cursor: sendTrayItems.length === 0 ? 'not-allowed' : 'pointer',
            opacity: sendTrayItems.length === 0 ? 0.35 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            fontWeight: 600,
            transition: 'all 0.15s ease'
          }}
        >
          <Trash size={12} /> Clear All
        </button>

        <button
          onClick={() => {
            if (sendTrayItems.length > 0) {
              setFlashDriveTarget(sendTrayItems[0]);
              setIsSendTrayBatch(true);
            }
          }}
          disabled={sendTrayItems.length === 0}
          title="Send all queued files to drive / USB"
          style={{
            flex: '2',
            padding: '8px 14px',
            fontSize: '11.5px',
            borderRadius: '8px',
            border: '1px solid rgba(168, 85, 247, 0.5)',
            background: sendTrayItems.length > 0
              ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)'
              : 'rgba(255, 255, 255, 0.05)',
            color: sendTrayItems.length > 0 ? '#fff' : 'var(--text-muted)',
            cursor: sendTrayItems.length === 0 ? 'not-allowed' : 'pointer',
            opacity: sendTrayItems.length === 0 ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontWeight: 700,
            boxShadow: sendTrayItems.length > 0 ? '0 4px 18px rgba(99, 102, 241, 0.45)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <Send size={12} /> Send All ({sendTrayItems.length})
        </button>
      </div>

      {/* Floating Context Menu for Folders & Files */}
      {activeContextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: `${Math.min(activeContextMenu.x, window.innerWidth - 180)}px`,
            top: `${Math.min(activeContextMenu.y, window.innerHeight - 160)}px`,
            zIndex: 15000,
            background: 'rgba(18, 20, 32, 0.97)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)',
            padding: '4px',
            minWidth: '170px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          {activeContextMenu.type === 'folder' && activeContextMenu.folder && (
            <>
              <div style={{ padding: '5px 8px', fontSize: '10px', fontWeight: 700, color: '#818cf8', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                📁 {activeContextMenu.folder.name}
              </div>

              {/* Save Folder to Computer */}
              <button
                onClick={() => handleSaveFolderToDisk(activeContextMenu.folder!)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#c7d2fe',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <Download size={13} style={{ color: '#818cf8' }} /> Save Folder to Computer
              </button>

              {/* Rename Folder */}
              <button
                onClick={() => handleStartRename(activeContextMenu.folder!)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <Edit2 size={13} /> Rename Folder
              </button>

              {/* Delete Folder */}
              <button
                onClick={() => handleDeleteFolder(activeContextMenu.folder!.id, activeContextMenu.folder!.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <Trash size={13} /> Delete Folder
              </button>
            </>
          )}

          {activeContextMenu.type === 'file' && activeContextMenu.filePath && (
            <>
              <button
                onClick={() => {
                  handlePlayItem(activeContextMenu.filePath!);
                  setActiveContextMenu(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <Play size={13} /> Play / Listen
              </button>

              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => {
                    assignFileToSendtrayFolder(activeContextMenu.filePath!, f.id);
                    setAssignments(getSendtrayAssignments());
                    setActiveContextMenu(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <Folder size={12} style={{ color: '#818cf8' }} /> Move to {f.name}
                </button>
              ))}

              <button
                onClick={() => {
                  setSendTrayItems(prev => prev.filter(p => p !== activeContextMenu.filePath));
                  assignFileToSendtrayFolder(activeContextMenu.filePath!, undefined);
                  setAssignments(getSendtrayAssignments());
                  setActiveContextMenu(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <Trash size={13} /> Remove from Tray
              </button>
            </>
          )}
        </div>
      )}

    </div>
  );
}
