import React, { useEffect, useState } from 'react';
import { Film, Music, Play, Pause, Send, FolderEdit, FolderOpen, Trash2, AlertTriangle, X } from 'lucide-react';
import { electron } from '../panamedia/types';

interface OutputItem {
  name: string;
  path: string;
  thumbnailPath?: string;
  size?: string;
  format: string;
  resolutionOrBitrate?: string;
  date: string;
}

interface OutputHistoryListProps {
  type: 'video' | 'audio';
  items: OutputItem[];
  outputPath?: string;
  streamingPort?: number;
  onChangeOutputPath?: () => void;
  onDirectSend?: (files: string[]) => void;
  onPlayMedia?: (item: OutputItem) => void;
  onSelectMedia?: (item: OutputItem) => void;
  selectedPath?: string | null;
  playingPath?: string | null;
  onItemsDeleted?: (paths: string[]) => void;
}

export const OutputHistoryList: React.FC<OutputHistoryListProps> = ({
  type,
  items,
  outputPath,
  streamingPort = 52322,
  onChangeOutputPath,
  onDirectSend,
  onPlayMedia,
  onSelectMedia,
  selectedPath,
  playingPath,
  onItemsDeleted
}) => {
  const isVideo = type === 'video';
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDeleteItems, setPendingDeleteItems] = useState<OutputItem[] | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [thumbnailErrors, setThumbnailErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!pendingDeleteItems) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingDeleteItems(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingDeleteItems]);

  useEffect(() => {
    const currentPaths = new Set(items.map((item) => item.path));
    setSelectedPaths((prev) => {
      const next = new Set([...prev].filter((filePath) => currentPaths.has(filePath)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const allSelected = items.length > 0 && selectedPaths.size === items.length;

  const toggleSelected = (filePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
    setDeleteError('');
  };

  const handleDeleteSelected = () => {
    const targets = items.filter((item) => selectedPaths.has(item.path));
    if (targets.length === 0 || isDeleting) return;
    if (!electron) {
      setDeleteError('File deletion is only available in the Panamedia desktop app.');
      return;
    }
    setDeleteError('');
    setPendingDeleteItems(targets);
  };

  const handleConfirmDelete = async () => {
    const targets = pendingDeleteItems;
    if (!targets || isDeleting) return;
    const bridge = electron;
    if (!bridge) {
      setPendingDeleteItems(null);
      setDeleteError('File deletion is only available in the Panamedia desktop app.');
      return;
    }
    setPendingDeleteItems(null);
    setIsDeleting(true);
    setDeleteError('');

    // Pre-emptively signal all player and preview monitors to release media handles
    window.dispatchEvent(new CustomEvent('converter-release-media', {
      detail: { paths: targets.map((t) => t.path) }
    }));
    await new Promise((resolve) => setTimeout(resolve, 80));

    const deleted: string[] = [];
    const failures: string[] = [];
    try {
      for (const item of targets) {
        try {
          const result = await bridge.ipcRenderer.invoke('trash-converter-output', item.path);
          if (result?.success) deleted.push(item.path);
          else failures.push(`${item.name}: ${result?.error || 'Delete failed'}`);
        } catch (error) {
          failures.push(`${item.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (deleted.length > 0) {
        onItemsDeleted?.(deleted);
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          deleted.forEach((filePath) => next.delete(filePath));
          return next;
        });
      }
      if (failures.length > 0) {
        setDeleteError(`Could not delete ${failures.length} file${failures.length === 1 ? '' : 's'}: ${failures.join('; ')}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenLocation = async (filePath: string) => {
    if (!electron || !filePath) return;
    try {
      const opened = await electron.ipcRenderer.invoke('show-item-in-folder', filePath);
      if (opened !== true) setDeleteError('Could not locate this output file.');
    } catch (error) {
      setDeleteError(`Could not open the file location: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '16px' }}>
      {/* Top Header Row with Title and Tab-Specific Send Button (matching user layout) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isVideo ? (
            <Film size={16} style={{ color: '#818cf8' }} />
          ) : (
            <Music size={16} style={{ color: '#ec4899' }} />
          )}
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
            {isVideo ? 'Converted Video Outputs' : 'Extracted Audio Outputs'}
          </span>
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            padding: '1px 6px',
            borderRadius: '10px',
            background: isVideo ? 'rgba(99, 102, 241, 0.25)' : 'rgba(236, 72, 153, 0.25)',
            color: isVideo ? '#c7d2fe' : '#fbcfe8'
          }}>
            {items.length} file{items.length === 1 ? '' : 's'}
          </span>

          {/* Change Location Button (styled tiny matching the 1 media item queued header badge) */}
          {onChangeOutputPath && (
            <button
              type="button"
              onClick={onChangeOutputPath}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 9px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-muted, rgba(255, 255, 255, 0.65))',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.color = 'var(--text-muted, rgba(255, 255, 255, 0.65))';
              }}
              title={`Output Folder: ${outputPath || (isVideo ? 'Documents\\Panamedia\\Video Output' : 'Documents\\Panamedia\\Audio Output')}. Click to change location.`}
            >
              <FolderEdit size={11} style={{ opacity: 0.8 }} />
              <span>Change Location</span>
            </button>
          )}
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: 'var(--text-muted, rgba(255,255,255,0.65))',
            fontSize: '10px',
            cursor: items.length > 0 ? 'pointer' : 'default',
            whiteSpace: 'nowrap'
          }}>
            <input
              type="checkbox"
              checked={allSelected}
              disabled={items.length === 0 || isDeleting}
              onChange={() => setSelectedPaths(allSelected ? new Set() : new Set(items.map((item) => item.path)))}
              aria-label={`Select all ${isVideo ? 'video' : 'audio'} outputs`}
            />
            Select all
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {selectedPaths.size > 0 && (
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleDeleteSelected}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.14)',
              border: '1px solid rgba(239, 68, 68, 0.42)',
              color: '#fca5a5',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isDeleting ? 'wait' : 'pointer',
              opacity: isDeleting ? 0.65 : 1
            }}
          >
            <Trash2 size={13} /> {isDeleting ? 'Deleting...' : `Delete (${selectedPaths.size})`}
          </button>
        )}
        {/* Send Button inside Output Tab: Active only when items exist */}
        {onDirectSend && (
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => {
              if (items.length > 0) {
                const targets = items.filter((item) => selectedPaths.has(item.path));
                onDirectSend((targets.length > 0 ? targets : items).map((item) => item.path));
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: items.length > 0 
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(217, 119, 6, 0.12) 100%)' 
                : 'rgba(255, 255, 255, 0.03)',
              border: items.length > 0 
                ? '1.5px solid rgba(245, 158, 11, 0.5)' 
                : '1px solid rgba(255, 255, 255, 0.08)',
              color: items.length > 0 ? '#fef08a' : 'rgba(255, 255, 255, 0.3)',
              fontSize: '12px',
              fontWeight: 800,
              cursor: items.length > 0 ? 'pointer' : 'not-allowed',
              opacity: items.length > 0 ? 1 : 0.45,
              boxShadow: items.length > 0 ? '0 2px 10px rgba(245, 158, 11, 0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
            title={items.length > 0
              ? `Send ${selectedPaths.size > 0 ? selectedPaths.size : items.length} converted file${(selectedPaths.size > 0 ? selectedPaths.size : items.length) === 1 ? '' : 's'}`
              : 'No files in output folder to send'}
          >
            <Send size={13} style={{ color: items.length > 0 ? '#f59e0b' : 'rgba(255, 255, 255, 0.3)' }} />
            <span>{selectedPaths.size > 0 ? 'Send Selected' : 'Send All'}</span>
          </button>
        )}
        </div>
      </div>

      {deleteError && (
        <div role="alert" style={{ color: '#fca5a5', fontSize: '11px', margin: '0 0 8px' }}>
          {deleteError}
        </div>
      )}

      {pendingDeleteItems && (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDeleteItems(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 12000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            background: 'rgba(3, 5, 12, 0.76)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)'
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="output-delete-title"
            aria-describedby="output-delete-description"
            style={{
              width: 'min(440px, 100%)',
              overflow: 'hidden',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'linear-gradient(160deg, #191a25 0%, #101117 100%)',
              boxShadow: '0 28px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(239,68,68,0.08)',
              color: '#f8fafc'
            }}
          >
            <div style={{ padding: '22px 22px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '13px',
                  color: '#fca5a5',
                  background: 'linear-gradient(145deg, rgba(239,68,68,0.2), rgba(239,68,68,0.08))',
                  border: '1px solid rgba(248,113,113,0.24)'
                }}>
                  <AlertTriangle size={20} />
                </div>
                <div style={{ minWidth: 0, flex: 1, paddingTop: '2px' }}>
                  <h2 id="output-delete-title" style={{ margin: 0, fontSize: '17px', fontWeight: 750, letterSpacing: '-0.02em' }}>
                    Move to Recycle Bin?
                  </h2>
                  <p id="output-delete-description" style={{ margin: '7px 0 0', color: 'rgba(226,232,240,0.72)', fontSize: '12px', lineHeight: 1.55 }}>
                    {pendingDeleteItems.length === 1
                      ? 'This file will be moved to the Recycle Bin. You can restore it later.'
                      : `${pendingDeleteItems.length} files will be moved to the Recycle Bin. You can restore them later.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingDeleteItems(null)}
                  aria-label="Close confirmation"
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: '28px',
                    height: '28px',
                    margin: '-4px -6px 0 0',
                    flexShrink: 0,
                    color: 'rgba(203,213,225,0.65)',
                    border: 0,
                    borderRadius: '8px',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{
                marginTop: '18px',
                padding: '11px 13px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.035)'
              }}>
                <div style={{ marginBottom: '6px', color: 'rgba(148,163,184,0.8)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {pendingDeleteItems.length} selected {pendingDeleteItems.length === 1 ? 'item' : 'items'}
                </div>
                {pendingDeleteItems.slice(0, 2).map((item) => (
                  <div
                    key={item.path}
                    title={item.name}
                    style={{
                      overflow: 'hidden',
                      color: 'rgba(241,245,249,0.9)',
                      fontSize: '12px',
                      lineHeight: 1.7,
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.name}
                  </div>
                ))}
                {pendingDeleteItems.length > 2 && (
                  <div style={{ marginTop: '2px', color: 'rgba(148,163,184,0.75)', fontSize: '11px' }}>
                    and {pendingDeleteItems.length - 2} more
                  </div>
                )}
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '9px',
              padding: '14px 22px',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(0,0,0,0.16)'
            }}>
              <button
                type="button"
                autoFocus
                onClick={() => setPendingDeleteItems(null)}
                style={{
                  minWidth: '94px',
                  padding: '9px 15px',
                  borderRadius: '9px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.055)',
                  color: '#e2e8f0',
                  fontSize: '12px',
                  fontWeight: 650,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  minWidth: '164px',
                  padding: '9px 15px',
                  borderRadius: '9px',
                  border: '1px solid rgba(248,113,113,0.45)',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  boxShadow: '0 5px 16px rgba(220,38,38,0.22)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={14} />
                Move to Recycle Bin
              </button>
            </div>
          </section>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '240px',
            color: 'rgba(255, 255, 255, 0.4)',
            gap: '10px'
          }}>
            {isVideo ? <Film size={36} style={{ opacity: 0.3 }} /> : <Music size={36} style={{ opacity: 0.3 }} />}
            <div style={{ fontSize: '13px', fontWeight: 600 }}>
              No {isVideo ? 'videos' : 'audios'} converted yet
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.3)' }}>
              Completed conversions will automatically appear in this tab
            </div>
          </div>
        ) : (
          items.map((item, idx) => (
            (() => {
              const isPlaying = playingPath === item.path;
              const isSelected = selectedPath === item.path;
              return (
            <div
              key={`${item.path}-${idx}`}
              aria-current={isSelected ? 'true' : undefined}
              tabIndex={0}
              onClick={() => onSelectMedia?.(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectMedia?.(item);
                }
              }}
              style={{
                background: isSelected || isPlaying
                  ? 'linear-gradient(110deg, rgba(99, 102, 241, 0.16), rgba(236, 72, 153, 0.09))'
                  : 'rgba(255, 255, 255, 0.03)',
                border: isSelected || isPlaying ? '1px solid rgba(129, 140, 248, 0.55)' : '1px solid rgba(255, 255, 255, 0.07)',
                boxShadow: isPlaying
                  ? '0 0 0 1px rgba(236, 72, 153, 0.3), 0 0 18px rgba(99, 102, 241, 0.16)'
                  : isSelected ? '0 0 12px rgba(99, 102, 241, 0.14)' : 'none',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                cursor: onSelectMedia ? 'pointer' : 'default',
                transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <input
                  type="checkbox"
                  checked={selectedPaths.has(item.path)}
                  disabled={isDeleting}
                  onChange={() => toggleSelected(item.path)}
                  aria-label={`Select ${item.name}`}
                  onClick={(event) => event.stopPropagation()}
                  style={{ flexShrink: 0, accentColor: isVideo ? '#818cf8' : '#ec4899' }}
                />
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '7px',
                  backgroundImage: `linear-gradient(rgba(7, 7, 10, 0.35), rgba(7, 7, 10, 0.35)), url(/player.ico)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  border: isVideo ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(236, 72, 153, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isVideo ? '#818cf8' : '#ec4899',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  {thumbnailErrors.has(item.path) ? (
                    <img
                      src="/player.ico"
                      alt=""
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        borderRadius: '6px',
                        objectFit: 'cover',
                        zIndex: 1
                      }}
                    />
                  ) : (
                    <img
                      src={`http://127.0.0.1:${streamingPort}/thumbnail?path=${encodeURIComponent(item.thumbnailPath || item.path)}`}
                      alt=""
                      loading="lazy"
                      onError={() => setThumbnailErrors((prev) => new Set(prev).add(item.path))}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        borderRadius: '6px',
                        objectFit: 'cover',
                        zIndex: 1
                      }}
                    />
                  )}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {item.name}
                  </div>
                  <div style={{
                    fontSize: '10.5px',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px'
                  }}>
                    {item.path}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#e2e8f0'
                  }}>
                    {item.format.toUpperCase()}
                  </span>
                  {item.resolutionOrBitrate && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-muted)'
                    }}>
                      {item.resolutionOrBitrate}
                    </span>
                  )}
                  {item.size && (
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>
                      {item.size}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {onPlayMedia && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPlayMedia(item);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      background: isPlaying ? 'rgba(6, 182, 212, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      border: isPlaying ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(99, 102, 241, 0.4)',
                      color: isPlaying ? '#a5f3fc' : '#c7d2fe',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title={isPlaying ? 'Pause preview' : 'Play in preview monitor'}
                  >
                    {isPlaying
                      ? <><Pause size={12} fill="#a5f3fc" /> Pause</>
                      : <><Play size={12} fill="#c7d2fe" /> Play</>}
                  </button>
                )}

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenLocation(item.path);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Open in Windows File Explorer"
                >
                  <FolderOpen size={12} /> Open Folder
                </button>
              </div>
            </div>
              );
            })()
          ))
        )}
      </div>
    </div>
  );
};
