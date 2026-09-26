import React from 'react';
import { RefreshCw, Search, Inbox, Heart, Lock, Unlock } from 'lucide-react';

interface SidebarTabsProps {
  sidebarTab: 'videos' | 'audios' | 'primary' | 'effects' | 'sendtray';
  playerSyncing: boolean;
  playerSyncedDirs: string[];
  playerSearch: string;
  playerViewMode: 'files' | 'folders';
  sendTrayItems: string[];
  mediaSubTab?: 'all' | 'favourites' | 'archive';
  setMediaSubTab?: (val: 'all' | 'favourites' | 'archive') => void;
  favouriteCount?: number;
  archiveCount?: number;
  isArchiveUnlocked?: boolean;
  onLockArchive?: () => void;
  setSidebarTab: React.Dispatch<React.SetStateAction<'videos' | 'audios' | 'primary' | 'effects' | 'sendtray'>>;
  setPlayerSearch: (val: string) => void;
  setPlayerViewMode: React.Dispatch<React.SetStateAction<'files' | 'folders'>>;
  handleSyncClick: () => void;
}

const TABS = [
  { id: 'primary',  label: 'Primary', icon: null },
  { id: 'videos',   label: 'Videos',  icon: null },
  { id: 'audios',   label: 'Mp3',     icon: null },
  { id: 'effects',  label: 'Eq',      icon: null },
  { id: 'sendtray', label: '',        icon: Inbox },
] as const;

export function SidebarTabs({
  sidebarTab,
  playerSyncing,
  playerSearch,
  playerViewMode,
  sendTrayItems,
  mediaSubTab = 'all',
  setMediaSubTab,
  favouriteCount = 0,
  archiveCount = 0,
  isArchiveUnlocked = false,
  onLockArchive,
  setSidebarTab,
  setPlayerSearch,
  setPlayerViewMode,
  handleSyncClick,
}: SidebarTabsProps) {
  return (
    <div style={{ flexShrink: 0 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto', paddingLeft: '6px' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSidebarTab(tab.id as any);
                setMediaSubTab?.('all');
              }}
              style={{
                flex: 1,
                padding: '9px 4px',
                background: 'none',
                border: 'none',
                borderBottom: sidebarTab === tab.id
                  ? '2px solid var(--primary)'
                  : '2px solid transparent',
                color: sidebarTab === tab.id ? '#fff' : 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: sidebarTab === tab.id ? '600' : 'normal',
                cursor: 'pointer',
                letterSpacing: '0.4px',
                position: 'relative',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              {Icon ? <Icon size={12} /> : tab.label}
              {tab.id === 'sendtray' && sendTrayItems.length > 0 && (
                <span style={{
                  position: 'absolute', top: '2px', right: '2px',
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff',
                  borderRadius: '50%', width: '12px', height: '12px',
                  fontSize: '8px', fontWeight: 'bold',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  boxShadow: '0 2px 6px rgba(99, 102, 241, 0.4)'
                }}>
                  {sendTrayItems.length}
                </span>
              )}
            </button>
          );
        })}

        {/* Sync button */}
        <button
          onClick={handleSyncClick}
          title={playerSyncing
            ? 'Syncing...'
            : 'Sync media library'}
          style={{
            padding: '9px 10px',
            background: 'none',
            border: 'none',
            color: playerSyncing ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RefreshCw
            size={12}
            style={{
              animation: playerSyncing ? 'spin 1s linear infinite' : 'none',
            }}
          />
        </button>
      </div>

      {/* Media Sub-tabs for Videos and Mp3: All | Favourites | Archive (Reduced Height by 50%) */}
      {(sidebarTab === 'videos' || sidebarTab === 'audios') && setMediaSubTab && (
        <div style={{
          display: 'flex',
          padding: '2px 8px',
          margin: '1px 0',
          gap: '4px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
        }}>
          <button
            onClick={() => setMediaSubTab('all')}
            style={{
              flex: 1,
              height: '22px',
              minHeight: '22px',
              padding: '0 4px',
              background: mediaSubTab === 'all' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
              border: '1px solid ' + (mediaSubTab === 'all' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255,255,255,0.06)'),
              borderRadius: '5px',
              color: mediaSubTab === 'all' ? '#fff' : 'var(--text-muted)',
              fontSize: '9.5px',
              fontWeight: mediaSubTab === 'all' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              transition: 'all 0.15s ease'
            }}
          >
            All
          </button>
          <button
            onClick={() => setMediaSubTab('favourites')}
            style={{
              flex: 1.2,
              height: '22px',
              minHeight: '22px',
              padding: '0 4px',
              background: mediaSubTab === 'favourites' ? 'rgba(244, 63, 94, 0.18)' : 'transparent',
              border: '1px solid ' + (mediaSubTab === 'favourites' ? 'rgba(244, 63, 94, 0.4)' : 'rgba(255,255,255,0.06)'),
              borderRadius: '5px',
              color: mediaSubTab === 'favourites' ? '#fda4af' : 'var(--text-muted)',
              fontSize: '9.5px',
              fontWeight: mediaSubTab === 'favourites' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              transition: 'all 0.15s ease'
            }}
            title="Favourites list"
          >
            <Heart size={10} style={{ color: mediaSubTab === 'favourites' ? '#f43f5e' : 'inherit' }} fill={mediaSubTab === 'favourites' ? '#f43f5e' : 'none'} />
            <span>Favourite</span>
            {favouriteCount > 0 && <span style={{ fontSize: '8px', opacity: 0.8 }}>({favouriteCount})</span>}
          </button>
          <button
            onClick={() => setMediaSubTab('archive')}
            style={{
              flex: 1.1,
              height: '22px',
              minHeight: '22px',
              padding: '0 4px',
              background: mediaSubTab === 'archive' ? 'rgba(234, 179, 8, 0.18)' : 'transparent',
              border: '1px solid ' + (mediaSubTab === 'archive' ? 'rgba(234, 179, 8, 0.4)' : 'rgba(255,255,255,0.06)'),
              borderRadius: '5px',
              color: mediaSubTab === 'archive' ? '#fef08a' : 'var(--text-muted)',
              fontSize: '9.5px',
              fontWeight: mediaSubTab === 'archive' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              transition: 'all 0.15s ease'
            }}
            title="Secured Archive (PIN-protected)"
          >
            {isArchiveUnlocked ? <Unlock size={10} style={{ color: '#eab308' }} /> : <Lock size={10} style={{ color: '#eab308' }} />}
            <span>Archive</span>
            {archiveCount > 0 && <span style={{ fontSize: '8px', opacity: 0.8 }}>({archiveCount})</span>}
          </button>
        </div>
      )}

      {/* Search + view mode row — only shown for media tabs */}
      {(sidebarTab === 'primary' || sidebarTab === 'videos' || sidebarTab === 'audios') && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 6px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          {/* Search */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={9}
              style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="Search..."
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              style={{
                width: '100%',
                height: '22px',
                paddingLeft: '20px',
                paddingRight: '6px',
                paddingTop: 0,
                paddingBottom: 0,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '5px',
                color: '#fff',
                fontSize: '10px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Lock Archive button (only shown when in archive tab and unlocked) */}
          {mediaSubTab === 'archive' && isArchiveUnlocked && onLockArchive && (
            <button
              onClick={onLockArchive}
              title="Lock Archive now"
              style={{
                padding: '0 5px',
                height: '22px',
                minHeight: '22px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '5px',
                color: '#f87171',
                fontSize: '8.5px',
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                transition: 'all 0.15s ease'
              }}
            >
              <Lock size={8} />
              <span style={{ fontSize: '8px', fontWeight: 600 }}>Lock</span>
            </button>
          )}

          {/* View mode toggle */}
          <button
            onClick={() => setPlayerViewMode(m => m === 'files' ? 'folders' : 'files')}
            title={playerViewMode === 'files' ? 'Switch to folder view' : 'Switch to file view'}
            style={{
              padding: '0 6px',
              height: '22px',
              minHeight: '22px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '5px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '10px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box'
            }}
          >
            {playerViewMode === 'files' ? '📂' : '📄'}
          </button>
        </div>
      )}
    </div>
  );
}