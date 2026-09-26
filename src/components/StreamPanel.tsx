import { useState, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, RefreshCw, Globe, List, Download, PlaySquare } from 'lucide-react';

export interface StreamPanelProps {
  activeTab: string;
  browserUrl: string;
  currentBrowserUrl: string;
  setWebviewRef: (el: any) => void;
  streamSites: any[];
  onNavigateBrowser: (url: string) => void;
  onDeleteStreamSite: (url: string) => void;
  onShowAddSiteModal: () => void;
  onDownloadVideo: () => void;
  onDownloadPlaylist: () => void;
}

const DEFAULT_STREAM_SITES_URLS = [
  'https://www.youtube.com',
  'https://moviebox.ph/',
  'https://www.tiktok.com'
];

export function StreamPanel({
  activeTab,
  browserUrl,
  currentBrowserUrl,
  setWebviewRef,
  streamSites,
  onNavigateBrowser,
  onDeleteStreamSite,
  onShowAddSiteModal,
  onDownloadVideo,
  onDownloadPlaylist
}: StreamPanelProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const webviewRef = useRef<any>(null);
  const getSiteIcon = (site: any) => {
    const name = site.name.toLowerCase();
    if (name.includes('youtube')) {
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill={site.color || '#ff0000'} style={{ flexShrink: 0 }}>
          <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.002 3.002 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    }
    if (name.includes('facebook')) {
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill={site.color || '#1877f2'} style={{ flexShrink: 0 }}>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    }
    if (name.includes('tiktok')) {
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="#fff" style={{ flexShrink: 0, background: '#000', borderRadius: '2px', padding: '1px' }}>
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.97v7.57c0 2.21-.73 4.41-2.22 6.02-1.89 2.05-4.78 2.87-7.46 2.2-2.74-.68-4.99-2.79-5.74-5.52-.89-3.21.36-6.84 3.08-8.62 1.62-1.07 3.63-1.46 5.53-1.09v4.08c-1.2-.38-2.58-.2-3.62.53-1.12.78-1.68 2.21-1.39 3.56.27 1.31 1.41 2.37 2.74 2.53 1.75.21 3.51-.83 3.96-2.53.1-.38.13-.77.13-1.16V0z" />
        </svg>
      );
    }
    if (name.includes('instagram')) {
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill={site.color || '#e1306c'} style={{ flexShrink: 0 }}>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051C.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      );
    }
    if (name.includes('moviebox')) {
      return <PlaySquare size={12} style={{ color: site.color || '#fbbf24', flexShrink: 0 }} />;
    }
    return <Globe size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />;
  };

  const canDownload = currentBrowserUrl.startsWith('http://') || currentBrowserUrl.startsWith('https://');
  const isYtPlaylist = currentBrowserUrl.includes('list=') || currentBrowserUrl.includes('playlist?list=');

  return (
    <div
      className="main-content"
      style={{
        display: activeTab === 'browser' ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '20px',
        minHeight: 0
      }}
    >
      <div className="main-header" style={{ flexShrink: 0, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="main-title-container">
          <h1>Stream</h1>
          <p>Browse video sites and download streams locally</p>
        </div>

        {/* Streaming Sites Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
            {streamSites.map((site: any, idx: number) => {
              let hostname = '';
              try {
                hostname = new URL(site.url).hostname.replace('www.', '').toLowerCase();
              } catch (e) {
                hostname = site.name.toLowerCase();
              }
              const isCurrent = currentBrowserUrl.toLowerCase().includes(hostname);
              return (
                <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={() => onNavigateBrowser(site.url)}
                    className="btn-secondary"
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      background: isCurrent ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: isCurrent ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                      color: isCurrent ? '#fff' : 'var(--text-muted)'
                    }}
                    title={`Navigate to ${site.name}`}
                  >
                    {getSiteIcon(site)}
                    <span>{site.name}</span>
                  </button>

                  {/* Delete button for custom sites */}
                  {!DEFAULT_STREAM_SITES_URLS.some(url => site.url === url) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteStreamSite(site.url);
                      }}
                      style={{
                        position: 'absolute',
                        top: '-5px',
                        right: '-5px',
                        background: '#ef4444',
                        color: '#ffffff',
                        border: '1px solid rgba(255, 255, 255, 0.4)',
                        borderRadius: '50%',
                        width: '13px',
                        height: '13px',
                        minWidth: '13px',
                        minHeight: '13px',
                        maxWidth: '13px',
                        maxHeight: '13px',
                        padding: 0,
                        margin: 0,
                        lineHeight: '1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        zIndex: 10,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.6)'
                      }}
                      title="Remove Site"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={onShowAddSiteModal}
            className="btn-primary"
            style={{
              padding: '8px 12px',
              fontSize: '11px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'
            }}
          >
            <Plus size={12} /> Add Site
          </button>
        </div>
      </div>

      {/* Browser Toolbar Controls */}
      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--panel-border)', marginBottom: '12px', flexShrink: 0 }}>
        {/* Navigation Buttons */}
        <button
          onClick={() => {
            const webview = document.querySelector('webview') as any;
            webview?.goBack();
          }}
          className="btn-secondary"
          style={{ padding: '6px 8px', borderRadius: '8px' }}
          title="Go Back"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => {
            const webview = document.querySelector('webview') as any;
            webview?.goForward();
          }}
          className="btn-secondary"
          style={{ padding: '6px 8px', borderRadius: '8px' }}
          title="Go Forward"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => {
            setIsLoading(true);
            const webview = document.querySelector('webview') as any;
            webview?.reload();
          }}
          className="btn-secondary"
          style={{ padding: '6px 8px', borderRadius: '8px' }}
          title="Reload"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>

        {/* Read-only URL Bar Indicator */}
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', padding: '6px 12px', display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Globe size={12} style={{ color: 'var(--text-muted)', marginRight: '8px', flexShrink: 0 }} />
          <span style={{ color: '#fff', fontSize: '12px', userSelect: 'all', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentBrowserUrl}
          </span>
        </div>

        {/* Capture Download Button */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {isYtPlaylist && (
            <button
              onClick={onDownloadPlaylist}
              className="btn-primary"
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.2)'
              }}
            >
              <List size={12} />
              <span>Download Playlist</span>
            </button>
          )}
          <button
            onClick={onDownloadVideo}
            disabled={!canDownload}
            className="btn-primary"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: canDownload ? 1 : 0.4,
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              boxShadow: canDownload ? '0 2px 10px rgba(99, 102, 241, 0.2)' : 'none'
            }}
          >
            <Download size={12} />
            <span>Download Video</span>
          </button>
        </div>
      </div>

      {/* WebView Frame with Dark Background & Loading Overlay */}
      <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--panel-border)', background: '#09090e', position: 'relative', minHeight: 0 }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 25,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(9, 9, 14, 0.88)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            gap: '16px',
            pointerEvents: 'none'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              border: '3.5px solid rgba(255, 255, 255, 0.08)',
              borderTopColor: '#6366f1',
              borderRightColor: '#a855f7',
              animation: 'spin 0.85s cubic-bezier(0.4, 0, 0.2, 1) infinite',
              filter: 'drop-shadow(0 0 16px rgba(168, 85, 247, 0.45))'
            }} />
            <span style={{
              fontSize: '13px',
              fontWeight: '600',
              color: 'rgba(255, 255, 255, 0.8)',
              letterSpacing: '0.4px'
            }}>
              Loading web stream...
            </span>
          </div>
        )}
        <webview
          partition="persist:panamedia_stream"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          allowpopups
          webpreferences="allowRunningInsecureContent=yes, javascript=yes"
          ref={(el: any) => {
            setWebviewRef(el);
            if (el && el !== webviewRef.current) {
              webviewRef.current = el;
              el.addEventListener('did-start-loading', () => setIsLoading(true));
              el.addEventListener('did-stop-loading', () => setIsLoading(false));
              el.addEventListener('did-fail-load', () => setIsLoading(false));
            }
          }}
          src={browserUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
}
