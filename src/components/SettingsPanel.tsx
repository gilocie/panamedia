import { Folder, Plus, Trash2 } from 'lucide-react';

export interface AppSettings {
  connections: number;
  downloadDir: string;
  autoCompress: boolean;
  compressionCRF: number;
  maxConcurrent: number;
  syncedFolders: string[];
}

export interface SettingsPanelProps {
  appSettings: AppSettings;
  onBrowseDir: () => void;
  onUpdateSetting: (key: keyof AppSettings, value: any) => void;
  onAddSyncedFolder: () => void;
  onRemoveSyncedFolder: (folder: string) => void;
}

export function SettingsPanel({
  appSettings,
  onBrowseDir,
  onUpdateSetting,
  onAddSyncedFolder,
  onRemoveSyncedFolder
}: SettingsPanelProps) {
  return (
    <div className="main-content">
      <div className="main-header">
        <div className="main-title-container">
          <h1>Application Settings</h1>
          <p>Configure downloading profiles and directory folders</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="form-group">
          <label>Primary Folder (Downloads)</label>
          <div className="form-input-container">
            <input type="text" className="text-input" readOnly value={appSettings.downloadDir} style={{ flex: 1 }} />
            <button className="btn-secondary" onClick={onBrowseDir}>
              Browse...
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="form-group">
            <label>Parallel Connections (per download)</label>
            <select
              value={appSettings.connections}
              onChange={(e) => onUpdateSetting('connections', parseInt(e.target.value))}
            >
              <option style={{ background: '#0f0f18', color: '#fff' }} value="2">2 Connections</option>
              <option style={{ background: '#0f0f18', color: '#fff' }} value="4">4 Connections</option>
              <option style={{ background: '#0f0f18', color: '#fff' }} value="8">8 Connections (Default)</option>
              <option style={{ background: '#0f0f18', color: '#fff' }} value="16">16 Connections (Fast)</option>
              <option style={{ background: '#0f0f18', color: '#fff' }} value="32">32 Connections (Maximum)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Maximum Concurrent Downloads</label>
            <select
              value={appSettings.maxConcurrent}
              onChange={(e) => onUpdateSetting('maxConcurrent', parseInt(e.target.value))}
            >
              <option style={{ background: '#0f0f18', color: '#fff' }} value="1">1 Download at a time</option>
              <option style={{ background: '#0f0f18', color: '#fff' }} value="2">2 Downloads at a time (Recommended)</option>
              <option style={{ background: '#0f0f18', color: '#fff' }} value="3">3 Downloads at a time</option>
              <option style={{ background: '#0f0f18', color: '#fff' }} value="4">4 Downloads at a time</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Auto-Compress Video Streams</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Transcode finished YouTube video streams to H.265 (HEVC) CRF {appSettings.compressionCRF} automatically.
              </div>
            </div>
            <label className="switch autocompress-switch">
              <input
                type="checkbox"
                checked={appSettings.autoCompress}
                onChange={(e) => onUpdateSetting('autoCompress', e.target.checked)}
              />
              <span className="slider autocompress-slider"></span>
            </label>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Media Library Sync Folders</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Add folders and drives that net-downloader should scan recursively for media files.
              </div>
            </div>
            <button
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
              onClick={onAddSyncedFolder}
            >
              <Plus size={14} /> Add Folder
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {/* Default download dir is always synced */}
            <div className="glass-panel" style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={14} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '12px' }}>{appSettings.downloadDir} <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>(Default Downloads)</span></span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold' }}>Primary</span>
            </div>

            {/* Custom synced folders */}
            {appSettings.syncedFolders.filter(f => f !== appSettings.downloadDir).map(folder => (
              <div key={folder} className="glass-panel" style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Folder size={14} style={{ color: '#a855f7' }} />
                  <span style={{ fontSize: '12px' }}>{folder}</span>
                </div>
                <button
                  onClick={() => onRemoveSyncedFolder(folder)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                  title="Remove from sync list"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
