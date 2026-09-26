
interface DuplicatesModalProps {
  onClose: () => void;
}

export function DuplicatesModal({ onClose }: DuplicatesModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f0f16',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
          padding: '24px',
          minWidth: '320px',
          maxWidth: '500px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#fff', margin: 0 }}>Duplicates</h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
          >
            X
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
          Duplicate management is available in the Media Library sidebar.
        </p>
      </div>
    </div>
  );
}