export interface AddDownloadModalProps {
  addUrl: string;
  setAddUrl: (url: string) => void;
  addFilename: string;
  setAddFilename: (name: string) => void;
  addSaveDir: string;
  onBrowseDir: () => void;
  startImmediately: boolean;
  setStartImmediately: (val: boolean) => void;
  isYoutubeCheck: boolean;
  setIsYoutubeCheck: (val: boolean) => void;
  onClose: () => void;
  onAdd: () => void;
}

export function AddDownloadModal({
  addUrl,
  setAddUrl,
  addFilename,
  setAddFilename,
  addSaveDir,
  onBrowseDir,
  startImmediately,
  setStartImmediately,
  isYoutubeCheck,
  setIsYoutubeCheck,
  onClose,
  onAdd
}: AddDownloadModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Download</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-group">
          <label>Source URL</label>
          <input
            type="text"
            placeholder="Paste HTTP, HTTPS, or YouTube link..."
            value={addUrl}
            onChange={(e) => {
              setAddUrl(e.target.value);
              setIsYoutubeCheck(e.target.value.includes('youtube.com/') || e.target.value.includes('youtu.be/'));
            }}
          />
        </div>

        <div className="form-group">
          <label>Rename File (Optional)</label>
          <input
            type="text"
            placeholder="e.g. video.mp4 (leave empty for original name)"
            value={addFilename}
            onChange={(e) => setAddFilename(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Save Folder</label>
          <div className="form-input-container">
            <input type="text" readOnly value={addSaveDir} />
            <button className="btn-secondary" onClick={onBrowseDir}>
              Browse...
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', marginTop: '4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={startImmediately}
              onChange={(e) => setStartImmediately(e.target.checked)}
            />
            Start downloading immediately
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isYoutubeCheck}
              onChange={(e) => setIsYoutubeCheck(e.target.checked)}
            />
            YouTube Media Stream
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onAdd}>
            Add Download
          </button>
        </div>
      </div>
    </div>
  );
}
