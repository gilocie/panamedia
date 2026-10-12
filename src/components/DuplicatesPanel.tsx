import React, { useState, useMemo, memo } from 'react';
import {
  Trash2,
  Copy,
  Music,
  Video,
  FileText,
  Folder,
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  ExternalLink,
  Sparkles,
  RotateCcw,
  Search,
  Check,
} from 'lucide-react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

export interface FileItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
  category: string;
  ext?: string;
}

export interface DuplicatesPanelProps {
  libraryFiles: FileItem[];
  duplicateDeletePaths: string[];
  toggleDuplicateDelete: (path: string) => void;
  handleResolveDuplicates: () => void;
  onClose: () => void;
  streamingPort?: number;
  downloads?: any[];
  setDuplicateDeletePaths?: React.Dispatch<React.SetStateAction<string[]>>;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || isNaN(bytes) || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getNormalizedName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/(_\d+|\(\d+\))/g, '') // remove trailing (1) or _1
    .replace(/[-_]/g, ' ')
    .trim()
    .toLowerCase();
}

// ─── Thumbnail Component with Real Port Streaming & Fallbacks ───────
function DuplicateThumbnail({
  file,
  streamingPort = 3000,
  downloads = []
}: {
  file: FileItem;
  streamingPort?: number;
  downloads?: any[];
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const ext = (file.ext || file.name.split('.').pop() || '').toLowerCase();
  const isAudio = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'opus', 'wma'].includes(ext);
  const isVideo = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', '3gp', 'ts'].includes(ext);

  // Check matching download task for cached thumbnail
  const matchedTask = downloads.find(t =>
    t.filename === file.name || (t.saveDir && file.path.endsWith(t.filename))
  );

  const thumbUrl = matchedTask?.thumbnail || `http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(file.path)}`;

  if (error || (!isVideo && !isAudio)) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        background: isAudio
          ? 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(168,85,247,0.15) 100%)'
          : isVideo
          ? 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(168,85,247,0.15) 100%)'
          : 'rgba(255,255,255,0.03)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px'
      }}>
        {isAudio ? (
          <Music size={26} style={{ color: '#ec4899', opacity: 0.8 }} />
        ) : isVideo ? (
          <Video size={26} style={{ color: '#818cf8', opacity: 0.8 }} />
        ) : (
          <FileText size={26} style={{ color: '#94a3b8', opacity: 0.8 }} />
        )}
        <span style={{ fontSize: '9px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px' }}>
          {ext.toUpperCase() || 'FILE'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#0a0a12' }}>
      <img
        src={thumbUrl}
        alt={file.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: loaded ? 'block' : 'none',
          transition: 'transform 0.25s ease'
        }}
      />
      {!loaded && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(30,27,75,0.4) 0%, rgba(49,16,66,0.4) 100%)'
        }}>
          {isAudio ? (
            <Music size={22} style={{ color: '#ec4899', opacity: 0.6 }} />
          ) : (
            <Video size={22} style={{ color: '#818cf8', opacity: 0.6 }} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Duplicates Panel ───────────────────────────────────────────
export const DuplicatesPanel = memo(function DuplicatesPanel({
  libraryFiles,
  duplicateDeletePaths,
  toggleDuplicateDelete,
  handleResolveDuplicates,
  onClose,
  streamingPort = 3000,
  downloads = [],
  setDuplicateDeletePaths
}: DuplicatesPanelProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio'>('all');
  const itemsPerPage = 8;

  // Group library files by normalized name
  const groupsMap = useMemo(() => {
    const map = new Map<string, FileItem[]>();
    libraryFiles.forEach(file => {
      const key = getNormalizedName(file.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(file);
    });
    return map;
  }, [libraryFiles]);

  // Filter groups that have actual duplicates (more than 1 file)
  const duplicateGroups = useMemo(() => {
    return Array.from(groupsMap.entries())
      .filter(([, files]) => files.length > 1)
      .filter(([name, files]) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = name.toLowerCase().includes(q);
          const matchFiles = files.some(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
          if (!matchName && !matchFiles) return false;
        }

        if (filterType === 'video') {
          return files.some(f => ['mp4', 'mkv', 'webm', 'avi', 'mov'].includes((f.ext || f.name.split('.').pop() || '').toLowerCase()));
        } else if (filterType === 'audio') {
          return files.some(f => ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac'].includes((f.ext || f.name.split('.').pop() || '').toLowerCase()));
        }

        return true;
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [groupsMap, searchQuery, filterType]);

  const totalGroups = duplicateGroups.length;
  const totalPages = Math.ceil(totalGroups / itemsPerPage) || 1;

  // Paginated groups
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedGroups = duplicateGroups.slice(startIndex, startIndex + itemsPerPage);

  // Compute total disk space reclaimable
  const reclaimableBytes = useMemo(() => {
    let total = 0;
    const pathSet = new Set(duplicateDeletePaths);
    libraryFiles.forEach(file => {
      if (pathSet.has(file.path)) {
        total += file.size || 0;
      }
    });
    return total;
  }, [duplicateDeletePaths, libraryFiles]);

  // ─── Smart Selection Presets ─────────────────────────────────────────
  const handleAutoSelectKeepNewest = () => {
    if (!setDuplicateDeletePaths) return;
    const pathsToDelete: string[] = [];
    duplicateGroups.forEach(([, files]) => {
      // Find the file with the latest mtime
      const newestMtime = Math.max(...files.map(f => f.mtime || 0));
      let kept = false;
      files.forEach(f => {
        if ((f.mtime || 0) === newestMtime && !kept) {
          kept = true; // Keep newest
        } else {
          pathsToDelete.push(f.path);
        }
      });
    });
    setDuplicateDeletePaths(Array.from(new Set(pathsToDelete)));
  };

  const handleAutoSelectKeepBestQuality = () => {
    if (!setDuplicateDeletePaths) return;
    const pathsToDelete: string[] = [];
    duplicateGroups.forEach(([, files]) => {
      // Find file with largest size (usually best resolution / quality)
      const maxSize = Math.max(...files.map(f => f.size || 0));
      let kept = false;
      files.forEach(f => {
        if ((f.size || 0) === maxSize && !kept) {
          kept = true; // Keep best quality
        } else {
          pathsToDelete.push(f.path);
        }
      });
    });
    setDuplicateDeletePaths(Array.from(new Set(pathsToDelete)));
  };

  const handleAutoSelectKeepOldest = () => {
    if (!setDuplicateDeletePaths) return;
    const pathsToDelete: string[] = [];
    duplicateGroups.forEach(([, files]) => {
      // Find file with earliest mtime
      const oldestMtime = Math.min(...files.map(f => f.mtime || Infinity));
      let kept = false;
      files.forEach(f => {
        if ((f.mtime || 0) === oldestMtime && !kept) {
          kept = true; // Keep oldest
        } else {
          pathsToDelete.push(f.path);
        }
      });
    });
    setDuplicateDeletePaths(Array.from(new Set(pathsToDelete)));
  };

  const handleDeselectAll = () => {
    if (setDuplicateDeletePaths) {
      setDuplicateDeletePaths([]);
    }
  };

  const handlePlayFile = (file: FileItem) => {
    if (electron) {
      electron.ipcRenderer.invoke('open-player-window', {
        filePath: file.path,
        filename: file.name
      }).catch(() => {});
    }
  };

  const handleRevealInExplorer = (filePath: string) => {
    if (electron) {
      const parentDir = filePath.substring(0, filePath.lastIndexOf('\\')) || filePath.substring(0, filePath.lastIndexOf('/'));
      electron.ipcRenderer.invoke('open-file', {
        saveDir: parentDir,
        filename: filePath.split(/[\\/]/).pop() || ''
      }).catch(() => {});
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      maxWidth: '100%',
      overflow: 'hidden',
      background: 'rgba(10, 10, 16, 0.95)',
      boxSizing: 'border-box'
    }}>

      {/* Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        background: 'rgba(255, 255, 255, 0.015)',
        flexShrink: 0,
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(168,85,247,0.2) 100%)',
            border: '1px solid rgba(239,68,68,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(239,68,68,0.15)'
          }}>
            <Copy size={20} style={{ color: '#f87171' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>
                Duplicate File Manager
              </h2>
              <span style={{
                fontSize: '10px',
                fontWeight: '700',
                background: 'rgba(239,68,68,0.15)',
                color: '#f87171',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid rgba(239,68,68,0.25)'
              }}>
                Smart Detection
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
              {totalGroups} duplicate group{totalGroups !== 1 ? 's' : ''} found &bull; {duplicateDeletePaths.length} file{duplicateDeletePaths.length !== 1 ? 's' : ''} marked for removal
              {reclaimableBytes > 0 && (
                <span style={{ color: '#4ade80', fontWeight: '600', marginLeft: '6px' }}>
                  ({formatBytes(reclaimableBytes)} reclaimable)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {duplicateDeletePaths.length > 0 && (
            <button
              onClick={handleResolveDuplicates}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              <Trash2 size={15} />
              <span>Delete {duplicateDeletePaths.length} File{duplicateDeletePaths.length !== 1 ? 's' : ''}</span>
              <span style={{
                background: 'rgba(0,0,0,0.2)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px'
              }}>
                {formatBytes(reclaimableBytes)}
              </span>
            </button>
          )}

          <button
            onClick={onClose}
            title="Close Duplicate Manager"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Smart Quick Selection Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 24px',
        background: 'rgba(255, 255, 255, 0.02)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        flexShrink: 0,
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        {/* Search & Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '220px' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '8px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Filter duplicate groups..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                padding: '5px 10px 5px 30px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '11px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'video', 'audio'] as const).map(t => (
              <button
                key={t}
                onClick={() => {
                  setFilterType(t);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: filterType === t ? 'rgba(99,102,241,0.18)' : 'transparent',
                  border: `1px solid ${filterType === t ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  color: filterType === t ? '#fff' : 'var(--text-muted)',
                  fontSize: '10px',
                  fontWeight: filterType === t ? '600' : 'normal',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {t === 'all' ? 'All Types' : t + 's'}
              </button>
            ))}
          </div>
        </div>

        {/* Smart 1-Click Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Sparkles size={11} color="#a855f7" /> Auto-Select:
          </span>

          <button
            onClick={handleAutoSelectKeepBestQuality}
            title="Keep the highest resolution/largest file in each group and mark smaller duplicates for deletion"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: '#a5b4fc',
              fontSize: '10.5px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>⭐ Keep Best Quality</span>
          </button>

          <button
            onClick={handleAutoSelectKeepNewest}
            title="Keep the newest downloaded/modified copy and mark older duplicates for deletion"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(168,85,247,0.12)',
              border: '1px solid rgba(168,85,247,0.25)',
              color: '#d8b4fe',
              fontSize: '10.5px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>✨ Keep Newest</span>
          </button>

          <button
            onClick={handleAutoSelectKeepOldest}
            title="Keep the original earliest copy and mark newer duplicates for deletion"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-muted)',
              fontSize: '10.5px',
              cursor: 'pointer'
            }}
          >
            <span>🕒 Keep Oldest</span>
          </button>

          {duplicateDeletePaths.length > 0 && (
            <button
              onClick={handleDeselectAll}
              title="Clear all selections"
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#fca5a5',
                fontSize: '10.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <RotateCcw size={10} />
              <span>Deselect All</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area - Strictly Vertical Scroll ONLY */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxSizing: 'border-box'
      }}>
        {totalGroups === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
            gap: '12px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: 'rgba(74, 222, 128, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Check size={26} color="#4ade80" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>
              No Duplicate Files Found!
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '380px', margin: 0 }}>
              Your library is completely clean. All synced files across folders are unique.
            </p>
          </div>
        ) : (
          paginatedGroups.map(([normName, files]) => {
            const newestMtime = Math.max(...files.map(f => f.mtime || 0));
            const oldestMtime = Math.min(...files.map(f => f.mtime || Infinity));
            const maxSize = Math.max(...files.map(f => f.size || 0));
            const minSize = Math.min(...files.map(f => f.size || Infinity));
            const groupTitle = files[0]?.name || normName;
            const markedCount = files.filter(f => duplicateDeletePaths.includes(f.path)).length;

            return (
              <div
                key={normName}
                style={{
                  background: markedCount > 0 ? 'rgba(239, 68, 68, 0.025)' : 'rgba(255, 255, 255, 0.015)',
                  border: `1px solid ${markedCount > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                  boxSizing: 'border-box',
                  width: '100%',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Group Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingBottom: '10px',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      background: 'rgba(239,68,68,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Copy size={13} style={{ color: '#f87171' }} />
                    </div>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={groupTitle}
                    >
                      {groupTitle}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      color: 'rgba(255,255,255,0.45)',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      flexShrink: 0
                    }}>
                      {files.length} copies
                    </span>
                  </div>

                  {/* Group Quick Action */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {markedCount > 0 ? (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: '700',
                        color: '#ef4444',
                        background: 'rgba(239,68,68,0.12)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(239,68,68,0.2)'
                      }}>
                        🗑 {markedCount} marked to delete
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '10px',
                        color: '#4ade80',
                        background: 'rgba(74,222,128,0.08)',
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}>
                        ✓ All kept
                      </span>
                    )}

                    <button
                      onClick={() => {
                        // Toggle group: keep the first/largest file, mark all others for deletion
                        if (!setDuplicateDeletePaths) return;
                        if (markedCount > 0) {
                          // Unmark all in this group
                          setDuplicateDeletePaths(prev => prev.filter(p => !files.some(f => f.path === p)));
                        } else {
                          // Keep highest quality/newest, delete others
                          const targetKeep = files.find(f => (f.size || 0) === maxSize) || files[0];
                          const toDelete = files.filter(f => f.path !== targetKeep.path).map(f => f.path);
                          setDuplicateDeletePaths(prev => Array.from(new Set([...prev, ...toDelete])));
                        }
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.7)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      {markedCount > 0 ? 'Clear Group' : 'Mark Duplicates (Keep 1)'}
                    </button>
                  </div>
                </div>

                {/* Responsive Grid - Wraps completely without horizontal scrolling! */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '12px',
                  width: '100%',
                  boxSizing: 'border-box'
                }}>
                  {files.map((file, idx) => {
                    const isChecked = duplicateDeletePaths.includes(file.path);
                    const isNewest = file.mtime === newestMtime && files.length > 1;
                    const isOldest = file.mtime === oldestMtime && files.length > 1 && !isNewest;
                    const isBestQuality = file.size === maxSize && files.length > 1 && maxSize !== minSize;
                    const isSmaller = file.size === minSize && files.length > 1 && maxSize !== minSize && !isBestQuality;

                    // Extract folder name
                    const parts = file.path.split(/[\\/]/);
                    const parentFolder = parts.length > 1 ? parts[parts.length - 2] : 'Default';

                    return (
                      <div
                        key={`${file.path}-${idx}`}
                        style={{
                          background: isChecked ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          border: `1.5px solid ${isChecked ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.06)'}`,
                          borderRadius: '10px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          transition: 'all 0.15s ease',
                          position: 'relative',
                          boxShadow: isChecked ? '0 4px 14px rgba(239,68,68,0.15)' : 'none'
                        }}
                      >
                        {/* Header Badge & Checkbox */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          background: 'rgba(0, 0, 0, 0.25)',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleDuplicateDelete(file.path)}
                              style={{
                                cursor: 'pointer',
                                accentColor: '#ef4444',
                                width: '14px',
                                height: '14px'
                              }}
                            />
                            <span style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              color: isChecked ? '#f87171' : 'rgba(255,255,255,0.7)'
                            }}>
                              {isChecked ? 'Delete' : 'Keep'}
                            </span>
                          </label>

                          {/* Smart Badges */}
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {isChecked ? (
                              <span style={{
                                fontSize: '8.5px',
                                fontWeight: '800',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(239, 68, 68, 0.25)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.4)'
                              }}>
                                🗑 MARKED
                              </span>
                            ) : isBestQuality ? (
                              <span style={{
                                fontSize: '8.5px',
                                fontWeight: '800',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(99, 102, 241, 0.25)',
                                color: '#a5b4fc',
                                border: '1px solid rgba(99, 102, 241, 0.4)'
                              }}>
                                ⭐ BEST QUALITY
                              </span>
                            ) : isNewest ? (
                              <span style={{
                                fontSize: '8.5px',
                                fontWeight: '800',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(168, 85, 247, 0.25)',
                                color: '#d8b4fe',
                                border: '1px solid rgba(168, 85, 247, 0.4)'
                              }}>
                                ✨ NEWEST
                              </span>
                            ) : isSmaller ? (
                              <span style={{
                                fontSize: '8.5px',
                                fontWeight: '700',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#fbbf24',
                                border: '1px solid rgba(245, 158, 11, 0.3)'
                              }}>
                                📦 SMALLER
                              </span>
                            ) : isOldest ? (
                              <span style={{
                                fontSize: '8.5px',
                                fontWeight: '700',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                color: 'rgba(255,255,255,0.6)'
                              }}>
                                🕒 OLDER
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '8.5px',
                                fontWeight: '700',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(74, 222, 128, 0.12)',
                                color: '#4ade80'
                              }}>
                                ✓ KEEP
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Thumbnail Viewport */}
                        <div
                          style={{
                            height: '110px',
                            width: '100%',
                            position: 'relative',
                            background: '#09090f',
                            cursor: 'pointer'
                          }}
                          onClick={() => handlePlayFile(file)}
                          title="Click to play in Panamedia Player"
                        >
                          <DuplicateThumbnail
                            file={file}
                            streamingPort={streamingPort}
                            downloads={downloads}
                          />

                          {/* Hover Play Overlay */}
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.4)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0,
                              transition: 'opacity 0.15s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
                          >
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'rgba(99, 102, 241, 0.9)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                            }}>
                              <Play size={14} fill="#fff" style={{ marginLeft: '2px' }} />
                            </div>
                          </div>
                        </div>

                        {/* File Metadata Details */}
                        <div style={{
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          background: 'rgba(0,0,0,0.15)'
                        }}>
                          <div
                            style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: '#fff',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={file.name}
                          >
                            {file.name}
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '9.5px',
                            color: 'var(--text-muted)'
                          }}>
                            <span style={{ fontWeight: '700', color: isBestQuality ? '#a5b4fc' : '#e2e8f0' }}>
                              {formatBytes(file.size)}
                            </span>
                            <span>
                              {file.mtime ? new Date(file.mtime).toLocaleDateString() : '?'}
                            </span>
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderTop: '1px solid rgba(255,255,255,0.04)',
                            paddingTop: '6px',
                            marginTop: '2px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'rgba(255,255,255,0.45)', overflow: 'hidden' }}>
                              <Folder size={10} style={{ color: '#a855f7', flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }} title={parentFolder}>
                                {parentFolder.toUpperCase()}
                              </span>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRevealInExplorer(file.path);
                              }}
                              title="Reveal file in Windows Explorer"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'rgba(255,255,255,0.4)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.15s ease'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                            >
                              <ExternalLink size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          background: 'rgba(255, 255, 255, 0.015)',
          flexShrink: 0
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Page {currentPage} of {totalPages} &bull; Showing {paginatedGroups.length} of {totalGroups} duplicate groups
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 14px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: currentPage === 1 ? 'rgba(255,255,255,0.2)' : '#fff',
                fontSize: '11px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                outline: 'none'
              }}
            >
              <ChevronLeft size={13} />
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 14px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: currentPage === totalPages ? 'rgba(255,255,255,0.2)' : '#fff',
                fontSize: '11px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                outline: 'none'
              }}
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});