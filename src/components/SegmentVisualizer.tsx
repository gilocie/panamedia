import React from 'react';

interface Segment {
  index: number;
  start: number;
  end: number;
  downloaded: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
}

interface SegmentVisualizerProps {
  segments: Segment[] | undefined;
}

export const SegmentVisualizer: React.FC<SegmentVisualizerProps> = ({ segments }) => {
  if (!segments || segments.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '12px' }}>
        No segment information available (Ranges not supported or single stream)
      </div>
    );
  }

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div className="detail-label">Segment Visualizer ({segments.length} Connections)</div>
      <div className="segment-container">
        {segments.map((seg) => {
          const segSize = seg.end - seg.start + 1;
          const percent = segSize > 0 ? Math.min(100, (seg.downloaded / segSize) * 100) : 0;
          
          // Style based on status and progress
          let className = `segment-block ${seg.status}`;
          let background = '';
          
          if (seg.status === 'completed') {
            background = 'var(--success)';
          } else if (seg.status === 'downloading') {
            background = `linear-gradient(to right, rgba(99, 102, 241, 0.6) 0%, rgba(99, 102, 241, 0.6) ${percent}%, rgba(255, 255, 255, 0.05) ${percent}%, rgba(255, 255, 255, 0.05) 100%)`;
          } else if (seg.status === 'failed') {
            background = 'var(--danger)';
          } else {
            background = `linear-gradient(to right, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.15) ${percent}%, rgba(255, 255, 255, 0.05) ${percent}%, rgba(255, 255, 255, 0.05) 100%)`;
          }

          return (
            <div 
              key={seg.index} 
              className={className}
              style={{ background }}
              title={`Connection #${seg.index + 1}\nProgress: ${percent.toFixed(1)}%\nDownloaded: ${formatBytes(seg.downloaded)} / ${formatBytes(segSize)}`}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                fontWeight: 'bold',
                color: '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)'
              }}>
                {seg.index + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
