import React, { useState, useEffect } from 'react';
import {
  Folder,
  RefreshCw,
  Heart,
  Lock,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  FolderPlus,
  Tag,
  Undo2,
  X,
  Plus,
  Layers,
} from 'lucide-react';
import { formatBytes } from './types';

interface PlaylistPanelProps {
  currentPlaylist: any[];
  currentPath: string;
  playerSearch: string;
  playerViewMode: 'files' | 'folders';
  playerExpandedFolders: Record<string, boolean>;
  downloads: any[];
  imgErrors: Record<string, boolean>;
  setPlayerExpandedFolders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setImgErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  playPlaylistItem: (item: any) => void;
  showContextMenu: (clientX: number, clientY: number, targetPath: string, isFolder?: boolean) => void;
  sidebarTab: string;
  primarySubTab?: 'videos' | 'audios';
  setPrimarySubTab?: React.Dispatch<React.SetStateAction<'videos' | 'audios'>>;
  mediaSubTab?: 'all' | 'favourites' | 'archive';
  isArchiveUnlocked?: boolean;
  archivePin?: string;
  onUnlockArchive?: (enteredPin: string) => boolean | Promise<boolean>;
  onSetArchivePin?: (newPin: string) => void | Promise<void>;
  isItemFavourite?: (path: string) => boolean;
  toggleFavourite?: (path: string) => void;
  batchUnarchive?: (paths: string[]) => void;
  batchUnfavourite?: (paths: string[]) => void;
}

function PlaylistItemThumbnail({
  item,
  itemExt: _itemExt,
  isAudioItem,
  itemThumb,
  imgErrors,
  setImgErrors,
  size,
}: {
  item: any;
  itemExt?: string;
  isAudioItem: boolean;
  itemThumb: string | undefined;
  imgErrors: Record<string, boolean>;
  setImgErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  size: number;
}) {
  const localThumb = `http://localhost:52321/thumbnail?path=${encodeURIComponent(item.path)}`;
  const displayThumb = itemThumb || localThumb;
  const hasError = imgErrors[item.path];
  const [loaded, setLoaded] = React.useState(false);

  if (!displayThumb || hasError) {
    return isAudioItem ? (
      <img src="player.ico" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.85 }} alt="" />
    ) : (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#6366f1" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2" /><path d="M10 8l6 4-6 4V8z" /></svg>
    );
  }

  return (
    <>
      <img
        src={displayThumb}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: loaded ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
        onError={() => setImgErrors(prev => ({ ...prev, [item.path]: true }))}
      />
      {!loaded && (
        isAudioItem ? (
          <img src="player.ico" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.85 }} alt="" />
        ) : (
          <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#6366f1" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2" /></svg>
        )
      )}
    </>
  );
}

export function PlaylistPanel({
  currentPlaylist,
  currentPath,
  playerSearch,
  playerViewMode,
  playerExpandedFolders,
  downloads,
  imgErrors,
  setPlayerExpandedFolders,
  setImgErrors,
  playPlaylistItem,
  showContextMenu,
  sidebarTab,
  primarySubTab,
  setPrimarySubTab,
  mediaSubTab = 'all',
  isArchiveUnlocked = false,
  archivePin = '',
  onUnlockArchive,
  onSetArchivePin,
  isItemFavourite,
  toggleFavourite,
  batchUnarchive,
  batchUnfavourite,
}: PlaylistPanelProps) {
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  // ─── Multi-Selection State for Favourite & Archive ─────────────────
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Clear selections when switching sub-tabs or primary tabs
  useEffect(() => {
    setSelectedPaths(new Set());
  }, [mediaSubTab, sidebarTab]);

  // ─── Custom Grouping State for Favourite & Archive ────────────────
  const [favouriteGroups, setFavouriteGroups] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('player_favourite_groups') || '{}');
    } catch {
      return {};
    }
  });

  const [archiveGroups, setArchiveGroups] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('player_archive_groups') || '{}');
    } catch {
      return {};
    }
  });

  const [collapsedCustomGroups, setCollapsedCustomGroups] = useState<Record<string, boolean>>({});
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    localStorage.setItem('player_favourite_groups', JSON.stringify(favouriteGroups));
  }, [favouriteGroups]);

  useEffect(() => {
    localStorage.setItem('player_archive_groups', JSON.stringify(archiveGroups));
  }, [archiveGroups]);

  // Clear PIN inputs whenever archive is locked so form is fresh
  useEffect(() => {
    if (!isArchiveUnlocked) {
      setPinInput('');
      setPinConfirmInput('');
      setPinError('');
      setShowPin(false);
      setShowConfirmPin(false);
    }
  }, [isArchiveUnlocked]);

  // Helper to normalize path for consistent keying
  const normKey = (p: string) => p.replace(/[\\/]/g, '/').toLowerCase();

  const currentGroupMap = mediaSubTab === 'favourites' ? favouriteGroups : archiveGroups;
  const setCurrentGroupMap = mediaSubTab === 'favourites' ? setFavouriteGroups : setArchiveGroups;

  // Toggle selection for a single file
  const toggleSelectPath = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Assign selected files to a named group
  const handleAssignSelectedToGroup = (groupName: string) => {
    if (!selectedPaths.size) return;
    const trimmed = groupName.trim();
    setCurrentGroupMap(prev => {
      const next = { ...prev };
      selectedPaths.forEach(p => {
        const k = normKey(p);
        if (trimmed) {
          next[k] = trimmed;
        } else {
          delete next[k];
        }
      });
      return next;
    });
    setShowGroupModal(false);
    setNewGroupName('');
  };

  // Ungroup all files in a specific group
  const handleUngroupGroup = (groupNameToUngroup: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentGroupMap(prev => {
      const next = { ...prev };
      Object.entries(next).forEach(([p, g]) => {
        if (g === groupNameToUngroup) delete next[p];
      });
      return next;
    });
  };

  // Batch restore from archive
  const handleExecuteBatchUnarchive = () => {
    if (!selectedPaths.size || !batchUnarchive) return;
    batchUnarchive(Array.from(selectedPaths));
    setArchiveGroups(prev => {
      const next = { ...prev };
      selectedPaths.forEach(p => delete next[normKey(p)]);
      return next;
    });
    setSelectedPaths(new Set());
  };

  // Batch remove/restore from favourites
  const handleExecuteBatchUnfavourite = () => {
    if (!selectedPaths.size || !batchUnfavourite) return;
    batchUnfavourite(Array.from(selectedPaths));
    setFavouriteGroups(prev => {
      const next = { ...prev };
      selectedPaths.forEach(p => delete next[normKey(p)]);
      return next;
    });
    setSelectedPaths(new Set());
  };

  // When viewing Archive and it is locked, show PIN Unlock / PIN Setup Card
  if (mediaSubTab === 'archive' && !isArchiveUnlocked) {
    const isSettingNewPin = !archivePin;

    const handlePinSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setPinError('');

      if (isSettingNewPin) {
        if (!pinInput || pinInput.length < 4) {
          setPinError('PIN must be at least 4 digits.');
          return;
        }
        if (pinInput !== pinConfirmInput) {
          setPinError('PIN confirmation does not match.');
          return;
        }
        await onSetArchivePin?.(pinInput);
        setPinInput('');
        setPinConfirmInput('');
      } else {
        if (!pinInput) {
          setPinError('Please enter your security PIN.');
          return;
        }
        const success = await onUnlockArchive?.(pinInput);
        if (!success) {
          setPinError('Incorrect PIN. Please try again.');
          setPinInput('');
        }
      }
    };

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', textAlign: 'center' }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: 'rgba(99, 102, 241, 0.14)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a5b4fc',
          marginBottom: '12px'
        }}>
          {isSettingNewPin ? <ShieldCheck size={24} /> : <Lock size={24} />}
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: 0, marginBottom: '4px' }}>
          {isSettingNewPin ? 'Set Archive Security PIN' : 'Secured Archive Locked'}
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, marginBottom: '16px', maxWidth: '220px', lineHeight: 1.4 }}>
          {isSettingNewPin
            ? 'Set a 4-digit PIN to securely protect and hide private media.'
            : 'Enter your 4-digit security PIN to unlock and view archived media.'}
        </p>

        <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '210px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <KeyRound size={12} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type={showPin ? 'text' : 'password'}
              maxLength={8}
              placeholder={isSettingNewPin ? 'Choose 4-digit PIN' : 'Enter PIN'}
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(''); }}
              style={{
                width: '100%',
                padding: '8px 28px 8px 28px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid ' + (pinError ? '#ef4444' : 'rgba(99,102,241,0.3)'),
                borderRadius: '8px',
                color: '#fff',
                fontSize: '13px',
                letterSpacing: showPin ? '4px' : '3px',
                textAlign: 'center',
                outline: 'none'
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(prev => !prev)}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                color: showPin ? '#a855f7' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px'
              }}
              title={showPin ? 'Hide PIN' : 'Show PIN'}
            >
              {showPin ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>

          {isSettingNewPin && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <KeyRound size={12} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type={showConfirmPin ? 'text' : 'password'}
                maxLength={8}
                placeholder="Confirm PIN"
                value={pinConfirmInput}
                onChange={(e) => { setPinConfirmInput(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                style={{
                  width: '100%',
                  padding: '8px 28px 8px 28px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid ' + (pinError ? '#ef4444' : 'rgba(99,102,241,0.3)'),
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '13px',
                  letterSpacing: showConfirmPin ? '4px' : '3px',
                  textAlign: 'center',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPin(prev => !prev)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: showConfirmPin ? '#a855f7' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px'
                }}
              >
                {showConfirmPin ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          )}

          {pinError && (
            <div style={{ fontSize: '11px', color: '#f87171', marginTop: '2px' }}>
              {pinError}
            </div>
          )}

          <button
            type="submit"
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#fff',
              fontWeight: 700,
              marginTop: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            {isSettingNewPin ? 'Save PIN & Unlock' : 'Unlock Archive'}
          </button>
        </form>
      </div>
    );
  }

  const filtered = playerSearch
    ? currentPlaylist.filter((item: any) => item.name.toLowerCase().includes(playerSearch.toLowerCase()))
    : currentPlaylist;

  // Render Primary sub-tabs (Videos | Mp3) with reduced height (50% reduction)
  const renderPrimarySubTabs = () => {
    if (sidebarTab !== 'primary') return null;
    return (
      <div style={{
        display: 'flex',
        padding: '2px 6px',
        gap: '4px',
        background: 'rgba(255, 255, 255, 0.02)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
      }}>
        <button
          onClick={() => setPrimarySubTab?.('videos')}
          style={{
            flex: 1,
            height: '18px',
            minHeight: '18px',
            padding: '1px 0',
            background: primarySubTab === 'videos' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
            border: '1px solid ' + (primarySubTab === 'videos' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255,255,255,0.06)'),
            borderRadius: '4px',
            color: primarySubTab === 'videos' ? '#fff' : 'var(--text-muted)',
            fontSize: '9px',
            fontWeight: primarySubTab === 'videos' ? '600' : 'normal',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          Videos
        </button>
        <button
          onClick={() => setPrimarySubTab?.('audios')}
          style={{
            flex: 1,
            height: '18px',
            minHeight: '18px',
            padding: '1px 0',
            background: primarySubTab === 'audios' ? 'rgba(168, 85, 247, 0.18)' : 'transparent',
            border: '1px solid ' + (primarySubTab === 'audios' ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255,255,255,0.06)'),
            borderRadius: '4px',
            color: primarySubTab === 'audios' ? '#fff' : 'var(--text-muted)',
            fontSize: '9px',
            fontWeight: primarySubTab === 'audios' ? '600' : 'normal',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          Mp3
        </button>
      </div>
    );
  };

  // Group Management Modal / Popover
  const renderGroupModal = () => {
    if (!showGroupModal) return null;
    const existingGroupNames = Array.from(new Set(Object.values(currentGroupMap))).filter(Boolean);

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(10, 10, 18, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px',
        }}
        onClick={() => setShowGroupModal(false)}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '240px',
            background: 'rgba(20, 20, 32, 0.96)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: '#fff' }}>
              <FolderPlus size={13} color="#a855f7" />
              <span>{selectedPaths.size > 0 ? `Group (${selectedPaths.size} items)` : 'Manage Groups'}</span>
            </div>
            <button
              onClick={() => setShowGroupModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
            >
              <X size={12} />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newGroupName.trim()) {
                handleAssignSelectedToGroup(newGroupName.trim());
              }
            }}
            style={{ display: 'flex', gap: '4px' }}
          >
            <input
              type="text"
              placeholder="New group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                padding: '5px 8px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '11px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!newGroupName.trim() || selectedPaths.size === 0}
              style={{
                padding: '5px 10px',
                background: newGroupName.trim() && selectedPaths.size > 0
                  ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'
                  : 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: '6px',
                color: newGroupName.trim() && selectedPaths.size > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
                fontSize: '10px',
                fontWeight: 600,
                cursor: newGroupName.trim() && selectedPaths.size > 0 ? 'pointer' : 'default',
              }}
            >
              Add
            </button>
          </form>

          {existingGroupNames.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                Existing Groups:
              </div>
              {existingGroupNames.map((gName) => (
                <div
                  key={gName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    borderRadius: '5px',
                    background: 'rgba(255,255,255,0.03)',
                    cursor: selectedPaths.size > 0 ? 'pointer' : 'default',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                  onClick={() => {
                    if (selectedPaths.size > 0) {
                      handleAssignSelectedToGroup(gName);
                    }
                  }}
                  title={selectedPaths.size > 0 ? `Move selected to "${gName}"` : gName}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                    <Tag size={10} color="#a5b4fc" />
                    <span style={{ fontSize: '10px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {gName}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleUngroupGroup(gName, e)}
                    title="Ungroup all files in this group"
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedPaths.size > 0 && (
            <button
              onClick={() => handleAssignSelectedToGroup('')}
              style={{
                padding: '5px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '6px',
                color: '#fca5a5',
                fontSize: '10px',
                fontWeight: 500,
                cursor: 'pointer',
                marginTop: '2px',
              }}
            >
              Remove from Group (Move to Ungrouped)
            </button>
          )}
        </div>
      </div>
    );
  };

  if (filtered.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {renderPrimarySubTabs()}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '11px', gap: '8px', opacity: 0.6, padding: '20px', textAlign: 'center' }}>
          {mediaSubTab === 'favourites' ? (
            <>
              <Heart size={20} style={{ color: '#f43f5e' }} />
              <div>No favourites marked yet. Right-click any file to add to Favourites.</div>
            </>
          ) : mediaSubTab === 'archive' ? (
            <>
              <Lock size={20} style={{ color: '#eab308' }} />
              <div>No archived files. Right-click any file or folder to move to Archive.</div>
            </>
          ) : (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <div>No files found. Click ↻ to sync.</div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Custom Grouped View for Favourite & Archive Tabs ─────────────
  if (mediaSubTab === 'favourites' || mediaSubTab === 'archive') {
    const isAllSelected = filtered.length > 0 && filtered.every((item: any) => selectedPaths.has(item.path));

    const handleToggleSelectAll = () => {
      if (isAllSelected) {
        setSelectedPaths(new Set());
      } else {
        setSelectedPaths(new Set(filtered.map((item: any) => item.path)));
      }
    };

    // Organize files into custom groups
    const groupBuckets: Record<string, any[]> = {};
    filtered.forEach((item: any) => {
      const gName = currentGroupMap[normKey(item.path)] || 'Ungrouped';
      if (!groupBuckets[gName]) groupBuckets[gName] = [];
      groupBuckets[gName].push(item);
    });

    const sortedGroupNames = Object.keys(groupBuckets).sort((a, b) => {
      if (a === 'Ungrouped') return 1;
      if (b === 'Ungrouped') return -1;
      return a.localeCompare(b);
    });

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        {renderPrimarySubTabs()}
        {renderGroupModal()}

        {/* Multi-Select & Batch Actions Toolbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'rgba(255, 255, 255, 0.025)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          fontSize: '10px',
          gap: '6px',
        }}>
          {/* Select All Checkbox */}
          <div
            onClick={handleToggleSelectAll}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', userSelect: 'none' }}
          >
            {isAllSelected ? (
              <CheckSquare size={13} color="#a855f7" />
            ) : selectedPaths.size > 0 ? (
              <div style={{
                width: '13px',
                height: '13px',
                borderRadius: '3px',
                border: '1.5px solid #a855f7',
                background: 'rgba(168, 85, 247, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <div style={{ width: '7px', height: '1.5px', background: '#fff' }} />
              </div>
            ) : (
              <Square size={13} color="rgba(255,255,255,0.4)" />
            )}
            <span style={{ color: selectedPaths.size > 0 ? '#fff' : 'var(--text-muted)', fontWeight: selectedPaths.size > 0 ? 600 : 400 }}>
              {selectedPaths.size > 0 ? `${selectedPaths.size} selected` : 'Select All'}
            </span>
          </div>

          {/* Batch Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {selectedPaths.size > 0 && (
              <>
                {/* Batch Unarchive / Restore Button */}
                <button
                  onClick={mediaSubTab === 'archive' ? handleExecuteBatchUnarchive : handleExecuteBatchUnfavourite}
                  title={mediaSubTab === 'archive' ? 'Unarchive and restore selected files' : 'Remove selected from favourites'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: mediaSubTab === 'archive' ? 'rgba(234, 179, 8, 0.18)' : 'rgba(244, 63, 94, 0.18)',
                    border: '1px solid ' + (mediaSubTab === 'archive' ? 'rgba(234, 179, 8, 0.4)' : 'rgba(244, 63, 94, 0.4)'),
                    color: mediaSubTab === 'archive' ? '#fef08a' : '#fda4af',
                    fontSize: '9px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Undo2 size={10} />
                  <span>{mediaSubTab === 'archive' ? 'Unarchive' : 'Restore'}</span>
                </button>

                {/* Group Selected Button */}
                <button
                  onClick={() => setShowGroupModal(true)}
                  title="Assign selected to a group"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '1px 4px',
                    height: '14px',
                    minHeight: '14px',
                    borderRadius: '2px',
                    background: 'rgba(99, 102, 241, 0.18)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#a5b4fc',
                    fontSize: '7.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <FolderPlus size={8} />
                  <span>Group</span>
                </button>
              </>
            )}

            {/* Create Group shortcut when nothing is selected */}
            {selectedPaths.size === 0 && (
              <button
                onClick={() => setShowGroupModal(true)}
                title="Create or manage custom groups"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '1px 4px',
                  height: '14px',
                  minHeight: '14px',
                  borderRadius: '2px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-muted)',
                  fontSize: '7.5px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Plus size={7.5} />
                <span>Group</span>
              </button>
            )}
          </div>
        </div>

        {/* Grouped Items List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px', minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sortedGroupNames.map((groupName) => {
              const items = groupBuckets[groupName] || [];
              const isCollapsed = !!collapsedCustomGroups[groupName];
              const isUngrouped = groupName === 'Ungrouped';
              const allGroupSelected = items.length > 0 && items.every((it: any) => selectedPaths.has(it.path));

              return (
                <div
                  key={groupName}
                  style={{
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: isUngrouped ? 'rgba(255,255,255,0.015)' : 'rgba(99, 102, 241, 0.03)',
                  }}
                >
                  {/* Group Header */}
                  <div
                    onClick={() => setCollapsedCustomGroups(prev => ({ ...prev, [groupName]: !isCollapsed }))}
                    style={{
                      padding: '5px 8px',
                      background: 'rgba(255,255,255,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{
                      fontSize: '9px',
                      color: 'var(--text-muted)',
                      transition: 'transform 0.2s',
                      display: 'inline-block',
                      transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                    }}>
                      ▶
                    </span>

                    {isUngrouped ? (
                      <Layers size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    ) : (
                      <Tag size={11} style={{ color: '#a855f7', flexShrink: 0 }} />
                    )}

                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: isUngrouped ? 'var(--text-muted)' : '#fff',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {groupName}
                    </span>

                    <span style={{
                      fontSize: '8.5px',
                      color: 'var(--text-muted)',
                      background: 'rgba(255,255,255,0.06)',
                      padding: '1px 5px',
                      borderRadius: '4px',
                    }}>
                      {items.length}
                    </span>

                    {/* Quick Select All in this Group */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPaths(prev => {
                          const next = new Set(prev);
                          if (allGroupSelected) {
                            items.forEach((it: any) => next.delete(it.path));
                          } else {
                            items.forEach((it: any) => next.add(it.path));
                          }
                          return next;
                        });
                      }}
                      title={allGroupSelected ? 'Deselect group' : 'Select all in group'}
                      style={{ padding: '2px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                    >
                      {allGroupSelected ? (
                        <CheckSquare size={12} color="#a855f7" />
                      ) : (
                        <Square size={12} color="rgba(255,255,255,0.3)" />
                      )}
                    </div>

                    {!isUngrouped && (
                      <button
                        onClick={(e) => handleUngroupGroup(groupName, e)}
                        title={`Ungroup all items in "${groupName}"`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'rgba(255,255,255,0.35)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  {/* Group Items */}
                  {!isCollapsed && (
                    <div style={{ padding: '3px' }}>
                      {items.map((item: any, idx: number) => {
                        const isCurrent = item.path && currentPath &&
                          normKey(item.path) === normKey(currentPath);
                        const isSelected = selectedPaths.has(item.path);
                        const itemExt = (item.ext || item.path.split('.').pop() || '').toLowerCase().replace('.', '');
                        const isAudioItem = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'opus', 'wma'].includes(itemExt);
                        const itemThumb = downloads.find((t: any) => item.path.endsWith(t.filename))?.thumbnail;
                        const isFav = isItemFavourite?.(item.path);

                        return (
                          <div
                            key={`${item.path}-${idx}`}
                            onClick={() => playPlaylistItem(item)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              showContextMenu(e.clientX, e.clientY, item.path, false);
                            }}
                            style={{
                              padding: '4px 6px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              background: isSelected
                                ? 'rgba(168, 85, 247, 0.12)'
                                : isCurrent
                                ? 'rgba(99, 102, 241, 0.12)'
                                : 'transparent',
                              border: isSelected
                                ? '1px solid rgba(168, 85, 247, 0.3)'
                                : isCurrent
                                ? '1px solid rgba(99, 102, 241, 0.25)'
                                : '1px solid transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginBottom: '2px',
                              transition: 'all 0.12s ease',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected && !isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected && !isCurrent) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            {/* Checkbox */}
                            <div
                              onClick={(e) => toggleSelectPath(item.path, e)}
                              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}
                            >
                              {isSelected ? (
                                <CheckSquare size={13} color="#a855f7" />
                              ) : (
                                <Square size={13} color="rgba(255,255,255,0.3)" />
                              )}
                            </div>

                            {/* Thumbnail */}
                            <div style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              flexShrink: 0,
                              background: 'rgba(255,255,255,0.05)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <PlaylistItemThumbnail
                                item={item}
                                itemExt={itemExt}
                                isAudioItem={isAudioItem}
                                itemThumb={itemThumb}
                                imgErrors={imgErrors}
                                setImgErrors={setImgErrors}
                                size={12}
                              />
                            </div>

                            {/* Details */}
                            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '10.5px',
                                  color: isCurrent ? 'var(--primary)' : '#fff',
                                  fontWeight: isCurrent ? '600' : 'normal',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={item.name}
                              >
                                {item.name}
                              </div>
                              <div style={{ fontSize: '8.5px', color: 'var(--text-muted)' }}>
                                {formatBytes(item.size || 0)}
                              </div>
                            </div>

                            {/* Action Icon */}
                            {mediaSubTab === 'favourites' && toggleFavourite && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavourite(item.path);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: '3px',
                                  cursor: 'pointer',
                                  color: isFav ? '#f43f5e' : 'rgba(255,255,255,0.25)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                                title="Restore to library (Remove Favourite)"
                              >
                                <Heart size={11} fill={isFav ? '#f43f5e' : 'none'} />
                              </button>
                            )}

                            {mediaSubTab === 'archive' && (
                              <div style={{ padding: '3px', color: '#eab308', display: 'flex', alignItems: 'center', flexShrink: 0 }} title="Archived">
                                <Lock size={10} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── Folders View for Normal Library ──────────────────────────────
  if (playerViewMode === 'folders' || sidebarTab === 'primary') {
    const groups: Record<string, typeof filtered> = {};
    const folderFiltered = filtered;

    folderFiltered.forEach((item: any) => {
      const dir = item.path.substring(0, item.path.lastIndexOf('\\')) || item.path.substring(0, item.path.lastIndexOf('/')) || 'Unknown';
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(item);
    });

    const sortedGroups = Object.entries(groups).sort(([pathA], [pathB]) => {
      const playingDir = currentPath ? (currentPath.substring(0, currentPath.lastIndexOf('\\')) || currentPath.substring(0, currentPath.lastIndexOf('/'))).replace(/[\\/]/g, '/').toLowerCase() : '';
      const pathANormalized = pathA.replace(/[\\/]/g, '/').toLowerCase();
      const pathBNormalized = pathB.replace(/[\\/]/g, '/').toLowerCase();
      const aIsPlaying = playingDir && pathANormalized === playingDir;
      const bIsPlaying = playingDir && pathBNormalized === playingDir;
      if (aIsPlaying && !bIsPlaying) return -1;
      if (!aIsPlaying && bIsPlaying) return 1;
      return pathANormalized.localeCompare(pathBNormalized);
    });

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {renderPrimarySubTabs()}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px', paddingLeft: sidebarTab === 'primary' ? '20px' : '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sortedGroups.map(([folderPath, items]) => {
              const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
              const isExpanded = !!playerExpandedFolders[folderPath];
              return (
                <div key={folderPath} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                  <div
                    onClick={() => setPlayerExpandedFolders(prev => ({ ...prev, [folderPath]: !isExpanded }))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      showContextMenu(e.clientX, e.clientY, folderPath, true);
                    }}
                    style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    <Folder size={11} style={{ color: '#a855f7', flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={folderPath}>{folderName}</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px' }}>{items.length}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px' }}>
                      {(items as any[]).map((item: any, idx: number) => {
                        const isCurrent = item.path && currentPath &&
                          item.path.replace(/[\\/]/g, '/').toLowerCase() === currentPath.replace(/[\\/]/g, '/').toLowerCase();
                        const itemExt = (item.ext || item.path.split('.').pop() || '').toLowerCase().replace('.', '');
                        const isAudio = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'opus', 'wma'].includes(itemExt);
                        const itemThumb = downloads.find((t: any) => item.path.endsWith(t.filename))?.thumbnail;
                        const isFav = isItemFavourite?.(item.path);

                        return (
                          <div key={`${item.path}-${idx}`} onClick={() => playPlaylistItem(item)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              showContextMenu(e.clientX, e.clientY, item.path, false);
                            }}
                            style={{ padding: '5px 8px', borderRadius: '6px', cursor: 'pointer', background: isCurrent ? 'rgba(99,102,241,0.1)' : 'transparent', border: isCurrent ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', transition: 'all 0.12s ease' }}
                            onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                            onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ width: '32px', height: '32px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <PlaylistItemThumbnail item={item} itemExt={itemExt} isAudioItem={isAudio} itemThumb={itemThumb} imgErrors={imgErrors} setImgErrors={setImgErrors} size={14} />
                            </div>
                            <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', color: isCurrent ? 'var(--primary)' : '#fff', fontWeight: isCurrent ? '600' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                                {formatBytes(item.size || 0)}
                              </div>
                            </div>
                            {toggleFavourite && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavourite(item.path);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: '4px',
                                  cursor: 'pointer',
                                  color: isFav ? '#f43f5e' : 'rgba(255,255,255,0.25)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                                title={isFav ? 'Remove from Favourites' : 'Send to Favourites'}
                              >
                                <Heart size={11} fill={isFav ? '#f43f5e' : 'none'} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── Flat Files View for Normal Library ───────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {renderPrimarySubTabs()}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: 0 }}>
        {filtered.map((item: any, idx: number) => {
          const isCurrent = item.path && currentPath &&
            item.path.replace(/[\\/]/g, '/').toLowerCase() === currentPath.replace(/[\\/]/g, '/').toLowerCase();
          const itemExt = (item.ext || item.path.split('.').pop() || '').toLowerCase().replace('.', '');
          const isAudioItem = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'opus', 'wma'].includes(itemExt);
          const itemThumb = downloads.find((t: any) => item.path.endsWith(t.filename))?.thumbnail;
          const isFav = isItemFavourite?.(item.path);

          return (
            <div
              key={`${item.path}-${idx}`}
              onClick={() => playPlaylistItem(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e.clientX, e.clientY, item.path, false);
              }}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isCurrent ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: isCurrent ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '3px',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PlaylistItemThumbnail item={item} itemExt={itemExt} isAudioItem={isAudioItem} itemThumb={itemThumb} imgErrors={imgErrors} setImgErrors={setImgErrors} size={14} />
              </div>
              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '11px',
                  color: isCurrent ? 'var(--primary)' : '#fff',
                  fontWeight: isCurrent ? '600' : 'normal',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }} title={item.name}>
                  {item.name}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                  {formatBytes(item.size || 0)}
                </div>
              </div>
              {toggleFavourite && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavourite(item.path);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: isFav ? '#f43f5e' : 'rgba(255,255,255,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  title={isFav ? 'Remove from Favourites' : 'Send to Favourites'}
                >
                  <Heart size={11} fill={isFav ? '#f43f5e' : 'none'} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
