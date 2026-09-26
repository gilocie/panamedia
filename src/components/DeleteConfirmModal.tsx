import { AlertCircle } from 'lucide-react';

export interface DeleteConfirmModalProps {
  target: {
    title: string;
    message: string;
    showDeleteFileOption?: boolean;
    onConfirm: (deleteFromDisk: boolean) => void;
  };
  onClose: () => void;
}

export function DeleteConfirmModal({ target, onClose }: DeleteConfirmModalProps) {
  return (
    <div className="modal-backdrop" style={{ zIndex: 11000 }} onClick={onClose}>
      <div className="glass-panel modal-content" style={{ width: '400px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
            {target.title}
          </h2>
        </div>

        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            {target.message}
          </p>

          {target.showDeleteFileOption && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}>
              <input
                type="checkbox"
                id="custom-delete-disk-option"
                defaultChecked={false}
                style={{ cursor: 'pointer' }}
              />
              <span>Also delete downloaded files from disk</span>
            </label>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#fff' }}
              onClick={() => {
                const chk = document.getElementById('custom-delete-disk-option') as HTMLInputElement | null;
                const deleteFromDisk = chk ? chk.checked : false;
                target.onConfirm(deleteFromDisk);
                onClose();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
