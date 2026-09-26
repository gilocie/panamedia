import React, { useState, useEffect } from 'react';
import { Square, CheckSquare, Film } from 'lucide-react';

interface PlaylistItem {
  id: string;
  title: string;
  url: string;
  duration?: number; // in seconds
  thumbnail?: string;
}

interface PlaylistSelectorProps {
  playlistInfo: {
    title: string;
    entries: PlaylistItem[];
  };
  onCancel: () => void;
  onConfirm: (selectedItems: { url: string; title: string; duration?: number }[], options: { compress: boolean }) => void;
}

export const PlaylistSelector: React.FC<PlaylistSelectorProps> = ({ playlistInfo, onCancel, onConfirm }) => {
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [compressVideos, setCompressVideos] = useState<boolean>(false);

  useEffect(() => {
    // Select all by default
    const initial: Record<string, boolean> = {};
    playlistInfo.entries.forEach(entry => {
      initial[entry.id] = true;
    });
    setSelectedIds(initial);
  }, [playlistInfo]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    playlistInfo.entries.forEach(entry => {
      next[entry.id] = true;
    });
    setSelectedIds(next);
  };

  const selectNone = () => {
    const next: Record<string, boolean> = {};
    playlistInfo.entries.forEach(entry => {
      next[entry.id] = false;
    });
    setSelectedIds(next);
  };

  // Estimate file size based on duration (~3MB per minute for standard 1080p)
  const estimateSize = (duration?: number) => {
    if (!duration) return 'N/A';
    const minutes = duration / 60;
    const sizeMb = minutes * 3.5; // ~3.5MB/minute
    if (sizeMb >= 1024) {
      return (sizeMb / 1024).toFixed(1) + ' GB';
    }
    return sizeMb.toFixed(0) + ' MB';
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const selectedEntries = playlistInfo.entries.filter(e => selectedIds[e.id]);
  
  // Calculate total size estimation
  const totalEstimatedMb = selectedEntries.reduce((total, entry) => {
    if (!entry.duration) return total + 50; // assume 50MB if no duration
    return total + (entry.duration / 60) * 3.5;
  }, 0);

  const formatTotalSize = (mb: number) => {
    if (mb >= 1024) {
      return (mb / 1024).toFixed(2) + ' GB';
    }
    return mb.toFixed(0) + ' MB';
  };

  const handleConfirm = () => {
    const items = selectedEntries.map(e => ({
      url: e.url,
      title: e.title,
      duration: e.duration
    }));
    onConfirm(items, { compress: compressVideos });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxHeight: '480px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }}>
          <Film size={14} /> YouTube Playlist Detected
        </div>
        <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {playlistInfo.title}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Contains {playlistInfo.entries.length} videos. Select which ones to download.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px' }} onClick={selectAll}>Select All</button>
        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px' }} onClick={selectNone}>Deselect All</button>
      </div>

      {/* Playlist entries list */}
      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', maxHeight: '220px', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
        {playlistInfo.entries.map((entry, index) => (
          <div 
            key={entry.id} 
            onClick={() => toggleSelect(entry.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'between',
              padding: '10px 14px',
              borderBottom: index < playlistInfo.entries.length - 1 ? '1px solid var(--panel-border)' : 'none',
              cursor: 'pointer',
              background: selectedIds[entry.id] ? 'rgba(99, 102, 241, 0.03)' : 'transparent',
              transition: 'background 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              {selectedIds[entry.id] ? (
                <CheckSquare size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              ) : (
                <Square size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {entry.title}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '12px' }}>
              <span>{formatDuration(entry.duration)}</span>
              <span style={{ width: '60px', textAlign: 'right' }}>{estimateSize(entry.duration)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Options Panel */}
      <div className="glass-panel" style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>HEVC / H.265 Compression</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Compress size up to 50% further while keeping visual quality</div>
          </div>
          <label className="switch" style={{ width: '40px', height: '20px' }}>
            <input 
              type="checkbox" 
              checked={compressVideos} 
              onChange={(e) => setCompressVideos(e.target.checked)}
            />
            <span className="slider" style={{ borderRadius: '20px' }}></span>
          </label>
        </div>
      </div>

      {/* Summary and Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--panel-border)', paddingTop: '12px' }}>
        <div style={{ fontSize: '12px' }}>
          Selected: <strong style={{ color: 'var(--primary)' }}>{selectedEntries.length}</strong> / {playlistInfo.entries.length} videos
          <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
            Est. Total Size: <strong>{formatTotalSize(totalEstimatedMb)}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button 
            className="btn-primary" 
            onClick={handleConfirm}
            disabled={selectedEntries.length === 0}
            style={{ opacity: selectedEntries.length === 0 ? 0.5 : 1 }}
          >
            Add to Queue
          </button>
        </div>
      </div>
    </div>
  );
};
