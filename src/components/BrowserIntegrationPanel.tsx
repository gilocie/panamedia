import { memo } from 'react';

export interface BrowserIntegrationPanelProps {
  onRegister: () => void;
}

export const BrowserIntegrationPanel = memo(function BrowserIntegrationPanel({ onRegister }: BrowserIntegrationPanelProps) {
  return (
    <div className="main-content">
      <div className="main-header">
        <div className="main-title-container">
          <h1>Browser Integration</h1>
          <p>Hook net-downloader directly into Chrome, Edge, and other browsers</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Windows Native Messaging Host</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Register the registry hooks so standard browsers can delegate downloads to net-downloader.
            </div>
          </div>
          <button className="btn-primary" onClick={onRegister}>
            Register Integration
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>How to Install Chrome Extension:</div>
          <ol style={{ fontSize: '13px', color: 'var(--text-muted)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>Open <strong>Google Chrome</strong> (or Microsoft Edge).</li>
            <li>Type <strong style={{ color: '#fff' }}>chrome://extensions/</strong> in the address bar and press Enter.</li>
            <li>In the top-right corner of the Extensions page, enable <strong>Developer Mode</strong>.</li>
            <li>Click the <strong>Load unpacked</strong> button in the top-left.</li>
            <li>Browse and select the folder: <br />
              <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px', color: '#fff', fontSize: '11px' }}>
                e:\MY SOFTWARES\net-downloader\extension
              </code>
            </li>
            <li>The extension will load! Look for the NetDownloader logo in your toolbar. It will now automatically grab downloads!</li>
          </ol>
        </div>
      </div>
    </div>
  );
});
