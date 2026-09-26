export function HelpCenterPanel() {
  return (
    <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', color: '#fff' }}>
      <h2 style={{ marginBottom: '12px', fontSize: '18px', fontWeight: 'bold' }}>Help Center</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
        Welcome to the Help Center. If you need assistance with downloading, conversions, or playing media, please refer to the documentation or use the available keyboard shortcuts.
      </p>
    </div>
  );
}