import { Loader2, AlertCircle } from 'lucide-react';
import { PlaylistSelector } from './PlaylistSelector';

export interface YoutubePlaylistModalProps {
  playlistLoading: boolean;
  playlistInfo: any;
  onClose: () => void;
  onConfirmPlaylist: (items: { url: string; title: string; duration?: number }[], options: { compress: boolean }) => void;
}

export function YoutubePlaylistModal({
  playlistLoading,
  playlistInfo,
  onClose,
  onConfirmPlaylist
}: YoutubePlaylistModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-content" style={{ width: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>YouTube Playlist Analyzer</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {playlistLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
            <div style={{ fontSize: '14px', fontWeight: '500' }}>Analyzing playlist entries...</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>This queries yt-dlp to extract video metadata.</div>
          </div>
        ) : playlistInfo ? (
          <PlaylistSelector
            playlistInfo={playlistInfo}
            onCancel={onClose}
            onConfirm={onConfirmPlaylist}
          />
        ) : (
          <div style={{ color: 'var(--danger)', display: 'flex', gap: '8px', fontSize: '13px', padding: '20px 0' }}>
            <AlertCircle size={16} /> Failed to load playlist details.
          </div>
        )}
      </div>
    </div>
  );
}
