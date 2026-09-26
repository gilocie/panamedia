import { Play, Trash2 } from 'lucide-react';

export interface FileDetailsModalProps {
  selectedFileDetails: {
    name: string;
    path: string;
    size: number;
    category: string;
    mtime: number | string | Date;
    displaySize?: string;
    ext?: string;
  };
  onClose: () => void;
  onPlayOrOpen: (file: any) => void;
  onDeleteFileFromDisk: (file: any) => void;
}

export function FileDetailsModal({
  selectedFileDetails,
  onClose,
  onPlayOrOpen,
  onDeleteFileFromDisk
}: FileDetailsModalProps) {
  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-content" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>File Details</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
          <div className="detail-row">
            <div className="detail-label">File Name</div>
            <div className="detail-value" style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', wordBreak: 'break-all' }}>
              {selectedFileDetails.name}
            </div>
          </div>

          <div className="detail-row">
            <div className="detail-label">Full Path</div>
            <div className="detail-value" style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              {selectedFileDetails.path}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="detail-row">
              <div className="detail-label">File Size</div>
              <div className="detail-value">
                {selectedFileDetails.displaySize ? selectedFileDetails.displaySize : formatBytes(selectedFileDetails.size)}
              </div>
            </div>
            <div className="detail-row">
              <div className="detail-label">Category</div>
              <div className="detail-value" style={{ textTransform: 'capitalize' }}>{selectedFileDetails.category}</div>
            </div>
          </div>

          <div className="detail-row">
            <div className="detail-label">Last Modified</div>
            <div className="detail-value">
              {new Date(selectedFileDetails.mtime).toLocaleString()}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
            <button
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onPlayOrOpen(selectedFileDetails)}
            >
              <Play size={14} fill="currentColor" style={{ marginRight: '6px' }} /> Play / Open
            </button>

            <button
              className="btn-secondary"
              style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.05)', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => onDeleteFileFromDisk(selectedFileDetails)}
            >
              <Trash2 size={14} /> Delete from Disk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
