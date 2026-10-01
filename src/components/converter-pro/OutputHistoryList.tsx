import React from 'react';
import { Film, Music, Play, CheckCircle2, Send, FolderEdit, FolderOpen } from 'lucide-react';
import { electron } from '../panamedia/types';

interface OutputItem {
  name: string;
  path: string;
  size?: string;
  format: string;
  resolutionOrBitrate?: string;
  date: string;
}

interface OutputHistoryListProps {
  type: 'video' | 'audio';
  items: OutputItem[];
  outputPath?: string;
  onChangeOutputPath?: () => void;
  onDirectSend?: (files: string[]) => void;
  onPlayMedia?: (path: string) => void;
}

export const OutputHistoryList: React.FC<OutputHistoryListProps> = ({
  type,
  items,
  outputPath,
  onChangeOutputPath,
  onDirectSend,
  onPlayMedia
}) => {
  const isVideo = type === 'video';

  const handleOpenLocation = (filePath: string) => {
    if (!electron || !filePath) return;
    electron.ipcRenderer.send('open-file-location', filePath);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '16px' }}>
      {/* Top Header Row with Title and Tab-Specific Send Button (matching user layout) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isVideo ? (
            <Film size={16} style={{ color: '#818cf8' }} />
          ) : (
            <Music size={16} style={{ color: '#ec4899' }} />
          )}
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
            {isVideo ? 'Converted Video Outputs' : 'Extracted Audio Outputs'}
          </span>
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            padding: '1px 6px',
            borderRadius: '10px',
            background: isVideo ? 'rgba(99, 102, 241, 0.25)' : 'rgba(236, 72, 153, 0.25)',
            color: isVideo ? '#c7d2fe' : '#fbcfe8'
          }}>
            {items.length} file{items.length === 1 ? '' : 's'}
          </span>

          {/* Change Location Button (styled tiny matching the 1 media item queued header badge) */}
          {onChangeOutputPath && (
            <button
              type="button"
              onClick={onChangeOutputPath}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 9px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-muted, rgba(255, 255, 255, 0.65))',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.color = 'var(--text-muted, rgba(255, 255, 255, 0.65))';
              }}
              title={`Output Folder: ${outputPath || (isVideo ? 'Documents\\Panamedia\\Video Output' : 'Documents\\Panamedia\\Audio Output')}. Click to change location.`}
            >
              <FolderEdit size={11} style={{ opacity: 0.8 }} />
              <span>Change Location</span>
            </button>
          )}
        </div>

        {/* Send Button inside Output Tab: Active only when items exist */}
        {onDirectSend && (
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => {
              if (items.length > 0) {
                onDirectSend(items.map(it => it.path));
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: items.length > 0 
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(217, 119, 6, 0.12) 100%)' 
                : 'rgba(255, 255, 255, 0.03)',
              border: items.length > 0 
                ? '1.5px solid rgba(245, 158, 11, 0.5)' 
                : '1px solid rgba(255, 255, 255, 0.08)',
              color: items.length > 0 ? '#fef08a' : 'rgba(255, 255, 255, 0.3)',
              fontSize: '12px',
              fontWeight: 800,
              cursor: items.length > 0 ? 'pointer' : 'not-allowed',
              opacity: items.length > 0 ? 1 : 0.45,
              boxShadow: items.length > 0 ? '0 2px 10px rgba(245, 158, 11, 0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
            title={items.length > 0 ? `Send ${items.length} converted file${items.length === 1 ? '' : 's'}` : 'No files in output folder to send'}
          >
            <Send size={13} style={{ color: items.length > 0 ? '#f59e0b' : 'rgba(255, 255, 255, 0.3)' }} />
            <span>Direct Send</span>
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '240px',
            color: 'rgba(255, 255, 255, 0.4)',
            gap: '10px'
          }}>
            {isVideo ? <Film size={36} style={{ opacity: 0.3 }} /> : <Music size={36} style={{ opacity: 0.3 }} />}
            <div style={{ fontSize: '13px', fontWeight: 600 }}>
              No {isVideo ? 'videos' : 'audios'} converted yet
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.3)' }}>
              Completed conversions will automatically appear in this tab
            </div>
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={`${item.path}-${idx}`}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '7px',
                  background: isVideo ? 'rgba(99, 102, 241, 0.2)' : 'rgba(236, 72, 153, 0.2)',
                  border: isVideo ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(236, 72, 153, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isVideo ? '#818cf8' : '#ec4899',
                  flexShrink: 0
                }}>
                  <CheckCircle2 size={16} />
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {item.name}
                  </div>
                  <div style={{
                    fontSize: '10.5px',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px'
                  }}>
                    {item.path}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#e2e8f0'
                  }}>
                    {item.format.toUpperCase()}
                  </span>
                  {item.resolutionOrBitrate && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-muted)'
                    }}>
                      {item.resolutionOrBitrate}
                    </span>
                  )}
                  {item.size && (
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>
                      {item.size}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {onPlayMedia && (
                  <button
                    type="button"
                    onClick={() => onPlayMedia(item.path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      color: '#c7d2fe',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Play in Panamedia Player"
                  >
                    <Play size={12} fill="#c7d2fe" /> Play
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenLocation(item.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Open in Windows File Explorer"
                >
                  <FolderOpen size={12} /> Open Folder
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
