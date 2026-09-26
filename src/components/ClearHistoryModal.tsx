export interface ClearHistoryModalProps {
  onClose: () => void;
  onClearHistory: (filterType: string) => void;
  onConfirmClearAll: () => void;
}

export function ClearHistoryModal({
  onClose,
  onClearHistory,
  onConfirmClearAll
}: ClearHistoryModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-content" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Clear History</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Select which download records you want to clear from history:
          </p>

          <button
            className="btn-secondary"
            style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
            onClick={() => onClearHistory('completed')}
          >
            Clear Completed only
          </button>

          <button
            className="btn-secondary"
            style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
            onClick={() => onClearHistory('pending')}
          >
            Clear Pending / Queued only
          </button>

          <button
            className="btn-secondary"
            style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
            onClick={() => onClearHistory('paused')}
          >
            Clear Paused only
          </button>

          <button
            className="btn-secondary"
            style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
            onClick={() => onClearHistory('active')}
          >
            Clear Active / Running only
          </button>

          <button
            className="btn-primary"
            style={{ justifyContent: 'center', padding: '10px 14px', fontSize: '12px', borderRadius: '8px', background: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#fff' }}
            onClick={onConfirmClearAll}
          >
            Clear All History
          </button>
        </div>
      </div>
    </div>
  );
}
