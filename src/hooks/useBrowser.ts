import { useState, useCallback, useRef, useEffect } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

const DEFAULT_STREAM_SITES = [
  { name: 'YouTube', url: 'https://www.youtube.com', color: '#ff0000' },
  { name: 'Moviebox', url: 'https://moviebox.ph/', color: '#fbbf24' },
  { name: 'TikTok', url: 'https://www.tiktok.com', color: '#010101' }
];

export function useBrowser() {
  const [currentBrowserUrl, setCurrentBrowserUrl] = useState('https://www.youtube.com');
  const [urlInput, setUrlInput] = useState('https://www.youtube.com');
  const [isWebviewLoading, setIsWebviewLoading] = useState(false);
  const [isDetectingStream, setIsDetectingStream] = useState(false);
  const [streamSites, setStreamSites] = useState<any[]>(() => {
    const saved = localStorage.getItem('stream_sites');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(s => {
            const n = (s?.name || '').toLowerCase();
            const u = (s?.url || '').toLowerCase();
            return !n.includes('facebook') && !n.includes('instagram') && !u.includes('facebook.com') && !u.includes('instagram.com');
          });
        }
      } catch (e) { }
    }
    return DEFAULT_STREAM_SITES;
  });

  const webviewRef = useRef<any>(null);

  useEffect(() => {
    setUrlInput(currentBrowserUrl);
  }, [currentBrowserUrl]);

  useEffect(() => {
    localStorage.setItem('stream_sites', JSON.stringify(streamSites));
  }, [streamSites]);

  const cleanStreamUrl = useCallback((rawUrl: string): string => {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
      const trimmed = rawUrl.trim();
      if (!trimmed) return rawUrl;
      const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const host = urlObj.hostname.toLowerCase();

      if (host.includes('chaturbate.com')) {
        const room = urlObj.searchParams.get('room');
        if (room && (urlObj.pathname.includes('livecampreview') || urlObj.pathname.includes('/in/') || urlObj.searchParams.has('campaign'))) {
          return `https://chaturbate.com/${encodeURIComponent(room)}/`;
        }
      }
      if (host.includes('stripchat.com')) {
        const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
        if (model && (urlObj.pathname.includes('/promo') || urlObj.pathname.includes('/embed') || urlObj.searchParams.has('campaign'))) {
          return `https://stripchat.com/${encodeURIComponent(model)}/`;
        }
      }
      if (host.includes('camsoda.com')) {
        const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
        if (model) return `https://www.camsoda.com/${encodeURIComponent(model)}`;
      }
      if (host.includes('bongacams.com')) {
        const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
        if (model) return `https://bongacams.com/${encodeURIComponent(model)}/`;
      }
    } catch (e) {}
    return rawUrl;
  }, []);

  const navigateBrowser = useCallback((url: string) => {
    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }
    formattedUrl = cleanStreamUrl(formattedUrl);
    if (webviewRef.current) {
      try {
        if (typeof webviewRef.current.loadURL === 'function') {
          webviewRef.current.loadURL(formattedUrl).catch(() => {});
        } else {
          webviewRef.current.src = formattedUrl;
        }
        setCurrentBrowserUrl(formattedUrl);
        if (electron?.ipcRenderer) {
          electron.ipcRenderer.send('set-intended-stream-url', formattedUrl);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [cleanStreamUrl]);

  const deleteStreamSite = useCallback((url: string) => {
    setStreamSites(prev => prev.filter(s => s.url !== url));
  }, []);

  const setWebviewRef = useCallback((el: any) => {
    if (!el || webviewRef.current === el) return;
    webviewRef.current = el;

    const handleNav = (e: any) => {
      const u = (e.url || '').toLowerCase();
      if (u.includes('campaign=') && u.includes('click_id=')) return;
      if (u.includes('/tours/') && u.includes('campaign=')) return;
      if (u.includes('track=00e_interstitial')) return;
      setCurrentBrowserUrl(e.url || '');
    };

    const handleStartLoad = () => setIsWebviewLoading(true);
    const handleStopLoad = () => setIsWebviewLoading(false);

    const handleDomReady = () => {
      try {
        el.executeJavaScript?.(`
          (() => {
            try {
              window.open = function() { return null; };
              const skipVideoAds = () => {
                const skipBtns = document.querySelectorAll(
                  '.ytp-ad-skip-button, .ytp-skip-ad-button, .videoAdUiSkipButton, .ytp-ad-skip-button-modern'
                );
                skipBtns.forEach(b => { try { b.click(); } catch(e) {} });
              };
              setInterval(skipVideoAds, 1000);
            } catch (e) {}
          })();
        `)?.catch?.(() => {});
      } catch {}
    };

    const handleNewWindow = (e: any) => {
      e.preventDefault?.();
    };

    const handleWillNavigate = (e: any) => {
      const targetUrl = e.url || '';
      const lower = targetUrl.toLowerCase();
      const isAdOrCampaign = lower.includes('/tours/') ||
                             lower.includes('/in/?') ||
                             lower.includes('campaign=') ||
                             lower.includes('click_id=') ||
                             lower.includes('track=00e') ||
                             lower.includes('popunder') ||
                             lower.includes('trafficjunky') ||
                             lower.includes('exoclick') ||
                             lower.includes('juicyads') ||
                             lower.includes('chaturbate') ||
                             lower.includes('stripchat') ||
                             lower.includes('camsoda') ||
                             lower.includes('bongacams') ||
                             lower.includes('livecampreview');
      if (isAdOrCampaign) {
        e.preventDefault?.();
        return;
      }
    };

    el.addEventListener('did-navigate', handleNav);
    el.addEventListener('did-navigate-in-page', handleNav);
    el.addEventListener('will-navigate', handleWillNavigate);
    el.addEventListener('did-start-loading', handleStartLoad);
    el.addEventListener('did-stop-loading', handleStopLoad);
    el.addEventListener('did-fail-load', handleStopLoad);
    el.addEventListener('dom-ready', handleDomReady);
    el.addEventListener('new-window', handleNewWindow);
  }, []);

  return {
    currentBrowserUrl, setCurrentBrowserUrl,
    urlInput, setUrlInput,
    isWebviewLoading, setIsWebviewLoading,
    isDetectingStream, setIsDetectingStream,
    streamSites, setStreamSites,
    webviewRef,
    navigateBrowser,
    deleteStreamSite,
    setWebviewRef,
  };
}
