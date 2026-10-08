import { useState } from 'react';
import { Download, Film } from 'lucide-react';

export interface FormatPickerContentProps {
  info: {
    id?: string;
    title: string;
    thumbnail: string;
    duration: number;
    isYoutube?: boolean;
    isDirectMedia?: boolean;
    videoFormats: Array<{ label: string, size: number, formatId: string, directUrl?: string }>;
    audioFormats: Array<{ label: string, format: string, size: number, bitrate?: number, isRaw?: boolean, formatId?: string, directUrl?: string }>;
  };
  saveDir?: string;
  onCancel: () => void;
  onDownload: (options: { filename: string, totalBytes?: number, youtubeOptions: any, directUrl?: string }) => void;
}

export function FormatPickerContent({ info, onCancel, onDownload }: FormatPickerContentProps) {
  const [activeSubTab, setActiveSubTab] = useState<'video' | 'audio'>('video');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const sanitizeFilename = (name: string) => {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return 'N/A';
    const totalSecs = Math.round(seconds);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div style={{ display: 'flex', gap: '20px', width: '100%', height: '400px' }}>
      {/* Left Column: Preview */}
      <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="glass-panel" style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '12px', position: 'relative', border: '1px solid var(--panel-border)', background: '#000' }}>
          {isPlayingPreview && info.isYoutube ? (
            <iframe
              src={`https://www.youtube.com/embed/${info.id}?autoplay=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <>
              {info.thumbnail ? (
                <img
                  src={info.thumbnail}
                  alt="thumbnail"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const parent = (e.currentTarget as HTMLImageElement).parentElement;
                    if (parent) {
                      const placeholder = parent.querySelector('.thumb-placeholder') as HTMLElement;
                      if (placeholder) placeholder.style.display = 'flex';
                    }
                  }}
                />
              ) : info.isYoutube && info.id ? (
                <img
                  src={`https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`}
                  alt="thumbnail"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (!img.src.includes('mqdefault.jpg')) {
                      img.src = `https://i.ytimg.com/vi/${info.id}/mqdefault.jpg`;
                    } else {
                      img.style.display = 'none';
                    }
                  }}
                />
              ) : null}
              <div className="thumb-placeholder" style={{
                display: info.thumbnail || (info.isYoutube && info.id) ? 'none' : 'flex',
                position: 'absolute', inset: 0,
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}>
                <Film size={36} style={{ color: 'rgba(99, 102, 241, 0.6)' }} />
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontWeight: '600', letterSpacing: '0.5px' }}>VIDEO STREAM</span>
              </div>
              {info.isYoutube && (
                <button
                  onClick={() => setIsPlayingPreview(true)}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(99, 102, 241, 0.9)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '54px',
                    height: '54px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#fff',
                    boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'; }}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
          <div style={{ fontWeight: '700', fontSize: '14px', color: '#fff', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
            {info.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '10px' }}>
            <span>Duration: {formatDuration(info.duration)}</span>
            <span>{info.isYoutube ? 'YouTube Stream' : 'Web Video Stream'}</span>
          </div>
        </div>

        <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {/* Right Column: Tabbed Selector */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', marginBottom: '12px' }}>
          <button
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubTab === 'audio' ? '2.5px solid #ec4899' : '2.5px solid transparent',
              color: activeSubTab === 'audio' ? '#fff' : 'var(--text-muted)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '13px'
            }}
            onClick={() => setActiveSubTab('audio')}
          >
            Audio (MP3)
          </button>
          <button
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubTab === 'video' ? '2.5px solid #ec4899' : '2.5px solid transparent',
              color: activeSubTab === 'video' ? '#fff' : 'var(--text-muted)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '13px'
            }}
            onClick={() => setActiveSubTab('video')}
          >
            Video (MP4)
          </button>
        </div>

        <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'rgba(10, 10, 16, 0.3)', borderBottom: '1px solid var(--panel-border)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 'bold' }}>File type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 'bold' }}>Size</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 'bold' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeSubTab === 'video' ? (
                info.videoFormats.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No MP4 formats found</td>
                  </tr>
                ) : (
                  info.videoFormats.map(fmt => {
                    const effectiveSize = fmt.size > 0 ? fmt.size : (info.duration > 0 ? Math.round((2200 * 1000 * info.duration) / 8) : 450 * 1024 * 1024);
                    return (
                      <tr key={fmt.label} style={{ borderBottom: '1px solid var(--panel-border)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: '600' }}>{fmt.label}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{formatBytes(effectiveSize)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                          <button
                            className="btn-primary"
                            style={{ background: '#10b981', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', boxShadow: 'none' }}
                            onClick={() => onDownload({
                              filename: `${sanitizeFilename(info.title)}_${fmt.label}.mp4`,
                              totalBytes: effectiveSize,
                              directUrl: fmt.directUrl,
                              youtubeOptions: {
                                format: fmt.formatId
                              }
                            })}
                          >
                            <Download size={12} /> Download
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )
              ) : (
                info.audioFormats.map(fmt => {
                  const effectiveSize = fmt.size > 0 ? fmt.size : (info.duration > 0 ? Math.round((192 * 1000 * info.duration) / 8) : 45 * 1024 * 1024);
                  return (
                    <tr key={fmt.label} style={{ borderBottom: '1px solid var(--panel-border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: '600' }}>{fmt.label}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{formatBytes(effectiveSize)}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <button
                          className="btn-primary"
                          style={{ background: '#10b981', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', boxShadow: 'none' }}
                          onClick={() => onDownload({
                            filename: `${sanitizeFilename(info.title)}.${fmt.format}`,
                            totalBytes: effectiveSize,
                            directUrl: fmt.directUrl,
                            youtubeOptions: {
                              isAudioOnly: true,
                              isRaw: fmt.isRaw || false,
                              format: fmt.formatId || 'bestaudio/best',
                              bitrate: fmt.bitrate || 128
                            }
                          })}
                        >
                          <Download size={12} /> Download
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}