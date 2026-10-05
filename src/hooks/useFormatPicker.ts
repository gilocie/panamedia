import { useCallback } from 'react';

const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

const isExtractorUrl = (url: string) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('youtube.com/') || lower.includes('youtu.be/') ||
    lower.includes('facebook.com/') || lower.includes('fb.watch/') || lower.includes('fb.com/') ||
    lower.includes('instagram.com/') || lower.includes('tiktok.com/') ||
    lower.includes('x.com/') || lower.includes('twitter.com/') ||
    lower.includes('vimeo.com/') || lower.includes('dailymotion.com/') ||
    lower.includes('reddit.com/') || lower.includes('threads.net/') ||
    lower.includes('pinterest.com/') || lower.includes('.m3u8') || lower.includes('.mpd');
};

interface FormatPickerDeps {
  setIsYoutubeCheck: (v: boolean) => void;
  setAddUrl: (v: string) => void;
  setFormatLoading: (v: boolean) => void;
  setExtractError: (v: string | null) => void;
  setExtractProgress: (v: number) => void;
  setShowFormatModal: (v: boolean) => void;
  setYoutubeInfo: (v: any) => void;
  setShowAddModal: (v: boolean) => void;
  setFormatsSource: (v: 'add_modal' | 'browser' | null) => void;
  formatsSource: 'add_modal' | 'browser' | null;
  setShowPlaylistModal: (v: boolean) => void;
  setPlaylistLoading: (v: boolean) => void;
  setPlaylistInfo: (v: any) => void;
}

export function useFormatPicker(deps: FormatPickerDeps) {
  const {
    setIsYoutubeCheck, setAddUrl, setFormatLoading, setExtractError,
    setExtractProgress, setShowFormatModal, setYoutubeInfo,
    setShowAddModal, setFormatsSource, formatsSource,
    setShowPlaylistModal, setPlaylistLoading, setPlaylistInfo,
  } = deps;

  const fetchFormats = useCallback(async (
    url: string,
    options: {
      title?: string; pageUrl?: string; headers?: Record<string, string>;
      thumbnail?: string; duration?: number; currentTime?: number;
    } = {}
  ) => {
    let targetUrl = url;
    const isYt = (url || '').toLowerCase().includes('youtube.com/') || (url || '').toLowerCase().includes('youtu.be/');
    setIsYoutubeCheck(isYt);

    if (isYt) {
      try {
        const p = new URL(url);
        if (p.hostname.includes('youtube.com') && p.searchParams.has('v')) {
          targetUrl = `https://www.youtube.com/watch?v=${p.searchParams.get('v')}`;
        } else if (p.hostname.includes('youtu.be')) {
          const v = p.pathname.replace(/^\//, '').split('/')[0];
          if (v) targetUrl = `https://www.youtube.com/watch?v=${v}`;
        }
      } catch {}
    }

    setAddUrl(targetUrl);
    setFormatLoading(true);
    setExtractError(null);
    setExtractProgress(0);
    setShowFormatModal(true);

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 4;
      if (progress >= 95) { progress = 95; clearInterval(interval); }
      setExtractProgress(progress);
    }, 100);

    try {
      const channel = isYt ? 'get-youtube-formats' : 'get-web-video-formats';
      const res = await electron.ipcRenderer.invoke(channel, targetUrl, options);
      clearInterval(interval);

      if (res.success) {
        const isAdOrGif = (src: string) => {
          if (!src || typeof src !== 'string') return true;
          const l = src.toLowerCase();
          if (l.includes('youtube.com') || l.includes('ytimg.com') || l.includes('googlevideo.com')) return false;
          return l.endsWith('.gif') || l.includes('.gif?') || l.includes('data:image/gif') ||
            l.includes('doubleclick') || l.includes('googleads') || l.includes('ad_') || l.includes('ad-') ||
            l.includes('banner') || l.includes('sponsor') || l.includes('promo') || l.includes('exclusive') ||
            l.includes('trafficjunky') || l.includes('advert');
        };

        const ytFallback = (isYt && res.info?.id) ? `https://i.ytimg.com/vi/${res.info.id}/hqdefault.jpg` : '';
        const resolvedThumb = (!isAdOrGif(options.thumbnail || '') ? options.thumbnail :
          (!isAdOrGif(res.info?.thumbnail || '') ? res.info?.thumbnail : '')) || ytFallback;

        const resolveTitle = () => {
          const isGeneric = (t?: string) => !t || /^(free\s*movies?|watch\s*(movies?|online|free)|online\s*movies?|movies?|video\s*stream|web\s*video|home|stream|player|free\s*streaming|full\s*movie|watch\s*hd|hd\s*movies?|free\s*videos?|movie\s*stream|streaming|web\s*video\s*stream)$/i.test(t.trim());
          const isOverlay = (t?: string) => !t ? false : (/previewing|unlock\s*(full\s*)?access|go\s*premium|get\s*premium/i.test(t) || /\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(t) || t.length > 100);
          const isGenericFile = (t?: string) => !t ? false : /^(local|index|master|playlist|stream|chunklist|video|media|output|hls)\.(m3u8|mp4|m4v|webm|mp3|m4a)$/i.test(t.trim());
          const isBad = (t?: string) => isGeneric(t) || isOverlay(t) || isGenericFile(t);

          if (options.title && !isBad(options.title)) return options.title;
          if (res.info?.title && !isBad(res.info.title)) return res.info.title;

          try {
            const u = new URL(targetUrl);
            const skip = ['spa', 'videoplaypage', 'movies', 'movie', 'watch', 'video', 'play', 'v', 'embed', 'stream', 'page', 'streams', 'hls', 'dash', 'media', 'content', 'api', 'public'];
            const genericFiles = /^(local|index|master|playlist|stream|chunklist|video|media|output|hls|dash|content|main|default|source|play|file|data)\.(m3u8|mp4|m4v|webm|mkv|mov|mp3|m4a)$/i;
            const parts = u.pathname.split('/').filter(Boolean);
            for (let i = parts.length - 1; i >= 0; i--) {
              const p = parts[i];
              if (skip.includes(p.toLowerCase()) || genericFiles.test(p)) continue;
              if (!/^[a-f0-9]{20,}$/i.test(p)) {
                const clean = p.replace(/\.(m3u8|mp4|m4v|webm|mkv|mov|mp3|m4a)$/i, '').replace(/[-_][a-zA-Z0-9]{6,25}$/, '').replace(/[-_]/g, ' ');
                if (clean.trim().length > 2) return clean.trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
              }
            }
            const host = u.hostname.replace(/^(www|cdn|api|media|stream|hls|vod)\d*\./i, '').split('.')[0];
            if (host && host.length > 2) return host.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) + ' Stream';
          } catch {}
          return 'Web Video';
        };

        setYoutubeInfo({
          ...res.info,
          thumbnail: resolvedThumb,
          duration: options.duration || res.info?.duration || 0,
          title: resolveTitle(),
          isYoutube: isYt,
          pageUrl: options.pageUrl || (isYt ? '' : targetUrl),
          headers: options.headers,
        });
        setExtractProgress(100);
        setTimeout(() => setFormatLoading(false), 300);
      } else {
        setExtractError(res.error);
        setFormatLoading(false);
      }
    } catch (err: any) {
      clearInterval(interval);
      setExtractError(err.message);
      setFormatLoading(false);
    }
  }, [setIsYoutubeCheck, setAddUrl, setFormatLoading, setExtractError, setExtractProgress, setShowFormatModal, setYoutubeInfo]);

  const handleCloseFormatsModal = useCallback(() => {
    setShowFormatModal(false);
    setFormatLoading(false);
    setExtractError(null);
    if (formatsSource === 'add_modal') setShowAddModal(true);
    setFormatsSource(null);
  }, [formatsSource, setShowFormatModal, setFormatLoading, setExtractError, setShowAddModal, setFormatsSource]);

  const handleDownloadPlaylist = useCallback(async (url: string) => {
    if (!electron) return;
    setPlaylistLoading(true);
    setShowPlaylistModal(true);
    try {
      const res = await electron.ipcRenderer.invoke('get-youtube-playlist', url);
      setPlaylistLoading(false);
      if (res.success) {
        setPlaylistInfo(res.info);
      } else {
        setShowPlaylistModal(false);
        alert('Failed to parse YouTube playlist: ' + res.error);
      }
    } catch (e: any) {
      setPlaylistLoading(false);
      setShowPlaylistModal(false);
      alert('Failed to parse YouTube playlist: ' + e.message);
    }
  }, [setPlaylistLoading, setShowPlaylistModal, setPlaylistInfo]);

  return { fetchFormats, handleCloseFormatsModal, handleDownloadPlaylist, isExtractorUrl };
}
