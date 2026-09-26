import { Play, Trash2 } from 'lucide-react';

interface Task {
  id: string;
  url: string;
  filename: string;
  saveDir: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number;
  status: 'queued' | 'preparing' | 'downloading' | 'paused' | 'merging' | 'compressing' | 'completed' | 'failed';
  connections: number;
  headers: Record<string, string>;
  addedAt: number;
  isYoutube: boolean;
  error?: string;
  thumbnail?: string;
}

export interface QueueManagerPanelProps {
  downloads: Task[];
  maxConcurrent: number;
  onResumeDownload: (id: string) => void;
  onDeleteDownload: (id: string) => void;
}

export function QueueManagerPanel({
  downloads,
  maxConcurrent,
  onResumeDownload,
  onDeleteDownload
}: QueueManagerPanelProps) {
  const queuedTasks = downloads.filter(t => t.status === 'queued' || (t.status === 'paused' && t.downloadedBytes === 0));

  return (
    <div className="main-content">
      <div className="main-header">
        <div className="main-title-container">
          <h1>Queue Scheduler</h1>
          <p>Queued tasks download sequentially to conserve system resources</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Default Download Queue</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Currently executing maximum <strong>{maxConcurrent}</strong> files concurrently.
            </div>
          </div>
        </div>

        <div className="downloads-table-container" style={{ border: '1px solid var(--panel-border)', maxHeight: '350px' }}>
          <table className="downloads-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>URL</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queuedTasks.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No pending files in download queue
                  </td>
                </tr>
              ) : (
                queuedTasks.map(task => (
                  <tr key={task.id}>
                    <td style={{ fontWeight: '600' }}>{task.filename || 'Pending Name...'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '11px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.url}</td>
                    <td><span className="status-badge-gui queued">Queued</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => onResumeDownload(task.id)}>
                          <Play size={10} /> Start
                        </button>
                        <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => onDeleteDownload(task.id)}>
                          <Trash2 size={10} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
