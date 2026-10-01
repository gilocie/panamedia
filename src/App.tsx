import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Download, Pause, Play, Trash2, Plus, Settings, Folder,
  ExternalLink, Globe, CheckCircle2,
  AlertCircle, Loader2, Activity, PlayCircle,
  Search, Volume2, VolumeX, SkipForward, SkipBack,
  ChevronLeft, ChevronRight, FileText, Music, Film, Copy,
  List, PlaySquare, RefreshCw, Maximize2, Info, Send, Tv,
  HelpCircle, CloudDownload, LayoutDashboard,
  Sparkles, Flame, Heart, Star, Video, ShieldCheck,
  Eye, EyeOff, KeyRound, Lock, Unlock, ShieldAlert, Check, X
} from 'lucide-react';
import playerBg from './assets/playerbg.jpg';
import { SpeedGraph } from './components/SpeedGraph';
import { SegmentVisualizer } from './components/SegmentVisualizer';
import { PlaylistSelector } from './components/PlaylistSelector';
import { SendToFlashModal } from './components/SendToFlashModal';
import { PanamediaPlayer } from './components/panamediaPlayer';
import { DuplicatesPanel } from './components/DuplicatesPanel';
import { AddStreamSiteModal, type NewStreamSiteData } from './components/AddStreamSiteModal';
import { hashPin } from './components/panamedia/utils/pinSecurity';

// Gain access to Electron IPC Renderer safely
const electron = (window as any).electron || ((window as any).require ? (window as any).require('electron') : null);

const isExtractorUrl = (url: string) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('youtube.com/') ||
    lower.includes('youtu.be/') ||
    lower.includes('facebook.com/') ||
    lower.includes('fb.watch/') ||
    lower.includes('fb.com/') ||
    lower.includes('instagram.com/') ||
    lower.includes('tiktok.com/') ||
    lower.includes('x.com/') ||
    lower.includes('twitter.com/') ||
    lower.includes('vimeo.com/') ||
    lower.includes('dailymotion.com/') ||
    lower.includes('reddit.com/') ||
    lower.includes('threads.net/') ||
    lower.includes('pinterest.com/') ||
    lower.includes('.m3u8') ||
    lower.includes('.mpd');
};

const isSocialOrPlatformUrl = (url: string) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('facebook.com/') ||
    lower.includes('fb.watch/') ||
    lower.includes('fb.com/') ||
    lower.includes('instagram.com/') ||
    lower.includes('tiktok.com/') ||
    lower.includes('x.com/') ||
    lower.includes('twitter.com/') ||
    lower.includes('vimeo.com/') ||
    lower.includes('dailymotion.com/') ||
    lower.includes('reddit.com/') ||
    lower.includes('threads.net/') ||
    lower.includes('pinterest.com/');
};

const getParentFolderName = (filePath: string) => {
  if (!filePath) return '';
  const parts = filePath.split(/[\\/]/);
  if (parts.length > 1) {
    return parts[parts.length - 2];
  }
  return '';
};


const getNormalizedName = (filename: string) => {
  if (!filename) return '';
  const extIndex = filename.lastIndexOf('.');
  const ext = extIndex !== -1 ? filename.substring(extIndex) : '';
  const base = extIndex !== -1 ? filename.substring(0, extIndex) : filename;

  // Remove common suffixes like " (1)", " (2)", "_1", "_2", " - Copy", " (Copy)"
  const normalizedBase = base
    .replace(/\s*\(\d+\)$/g, '') // "video (1)" -> "video"
    .replace(/_\d+$/g, '')       // "video_1" -> "video"
    .replace(/\s*-\s*Copy$/gi, '') // "video - Copy" -> "video"
    .replace(/\s*\(Copy\)$/gi, '') // "video (Copy)" -> "video"
    .trim()
    .toLowerCase();

  return normalizedBase + ext.toLowerCase();
};


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

  // Custom display fields for YouTube downloads
  duration?: number;
  displayProgress?: number;
  displaySpeed?: string;
  displayEta?: string;
  displaySize?: string;

  // Array of segment trackers
  segments?: Array<{
    index: number;
    start: number;
    end: number;
    downloaded: number;
    status: 'pending' | 'downloading' | 'completed' | 'failed';
  }>;
}

interface AppSettings {
  connections: number;
  downloadDir: string;
  autoCompress: boolean;
  compressionCRF: number;
  maxConcurrent: number;
  syncedFolders: string[];
}

const getFriendlyErrorMessage = (rawError: string): string => {
  if (!rawError) return 'An unknown error occurred during installation.';
  const lower = rawError.toLowerCase();
  
  if (lower.includes('econnreset') || lower.includes('connection reset')) {
    return 'Connection was interrupted. Please check your internet connection and try again.';
  }
  if (lower.includes('econnrefused') || lower.includes('connection refused')) {
    return 'Connection refused by the server. The download server might be temporarily offline or blocked.';
  }
  if (lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('getaddrinfo')) {
    return 'Could not reach the server. Please check your internet connection.';
  }
  if (lower.includes('etimeout') || lower.includes('timed out') || lower.includes('timeout')) {
    return 'The connection timed out. Please check your internet speed and try again.';
  }
  
  return `Installation failed: ${rawError}. Please verify your connection.`;
};

// Robust in-webview media extraction function serialized via .toString() to prevent escaping bugs
function extractWebviewStreamScript() {
  try {
    let mediaUrl = '';

    const isTrashMedia = (u: any) => {
      if (!u || typeof u !== 'string') return true;
      const l = u.toLowerCase();
      if (l.includes('.gif') || l.includes('data:image/gif')) return true;
      const adWords = [
        'trafficjunky', 'tsyndicate', 'exoclick', 'juicyads', 'eroadvertising',
        'plugrush', 'adxad', 'popads', 'adsterra', 'propeller', 'doubleclick',
        'googleads', 'googlesyndication', 'adnxs', 'adform', 'adroll', 'criteo',
        'taboola', 'outbrain', 'zedo', 'adcolony', 'vungle', 'applovin', 'inmobi',
        'ironsource', 'exosrv', 'realsrv', 'twinred', 'trafficfactory', 'popcash',
        'adcash', 'hilltopads', 'clickadu', 'evadav', 'rollerads', 'yllix',
        'etahub', 'twistity', 'stripchat', 'chaturbate', 'bongacams', 'livejasmin',
        'camsoda', 'imlive', 'flirt4free', 'jerkmate', 'adservice', 'clicksor',
        'serving-sys', 'innovid', 'spotxchange', 'spotx.tv', 'springserve',
        'teads.tv', 'smartclip', 'tremorhub', 'extremereach', 'freewheel',
        'imasdk', 'flashtalking', 'sizmek', 'mediaplex', 'connatix', 'vidoomy',
        'monetag', 'galaksion', 'pushground', 'clickaine', 'admaven'
      ];
      if (adWords.some(w => l.includes(w))) return true;
      if (l.includes('/ads/') || l.includes('/ad/') ||
          l.includes('ad_') || l.includes('ad-') ||
          l.includes('banner') || l.includes('creative') ||
          l.includes('sponsor') || l.includes('promo') ||
          l.includes('exclusive') || l.includes('advert') ||
          l.includes('commercial') || l.includes('preroll') ||
          l.includes('pre-roll') || l.includes('popunder') ||
          l.includes('preview') || l.includes('teaser') ||
          l.includes('trailer') || l.includes('verify') ||
          l.includes('interstitial') || l.includes('instream') ||
          l.includes('outstream') || l.includes('video_ad') ||
          l.includes('videoad') || l.includes('ad_video') ||
          l.includes('ad_media') || l.includes('overlay_ad') ||
          l.includes('companion_ad') || l.includes('promotional')) {
        return true;
      }
      if (l.includes('ad_type=') || l.includes('adtype=') ||
          l.includes('ad_zone=') || l.includes('adzone=') ||
          l.includes('campaign_id=') || l.includes('adid=') ||
          l.includes('creative_id=') || l.includes('spot_id=')) {
        return true;
      }
      return false;
    };

    const formatMediaUrl = (u: any) => {
      if (!u) return '';
      if (u.startsWith('//')) return 'https:' + u;
      return u;
    };

    // 1. Inspect window.html5player or global player object if available
    try {
      const anyWin = window as any;
      if (anyWin.html5player) {
        if (typeof anyWin.html5player.getVideoUrlHigh === 'function') {
          const u = anyWin.html5player.getVideoUrlHigh();
          if (u && !isTrashMedia(u)) mediaUrl = formatMediaUrl(u);
        }
        if (!mediaUrl && anyWin.html5player.hlssrc && !isTrashMedia(anyWin.html5player.hlssrc)) {
          mediaUrl = formatMediaUrl(anyWin.html5player.hlssrc);
        }
        if (!mediaUrl && typeof anyWin.html5player.getVideoUrlLow === 'function') {
          const u = anyWin.html5player.getVideoUrlLow();
          if (u && !isTrashMedia(u)) mediaUrl = formatMediaUrl(u);
        }
      }
    } catch (e) {}

    // 2. Search inline <script> tags for player definitions
    if (!mediaUrl) {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const text = s.textContent || '';
        if (!text) continue;
        const mHigh = text.match(/setVideoUrlHigh\s*\(\s*['"]((?:https?:)?\/\/[^'"]+)['"]\s*\)/i);
        if (mHigh && mHigh[1] && !isTrashMedia(mHigh[1])) { mediaUrl = formatMediaUrl(mHigh[1]); break; }
        const mHls = text.match(/setVideoHLS\s*\(\s*['"]((?:https?:)?\/\/[^'"]+)['"]\s*\)/i);
        if (mHls && mHls[1] && !isTrashMedia(mHls[1])) { mediaUrl = formatMediaUrl(mHls[1]); break; }
        const mHls2 = text.match(/hlssrc\s*=\s*['"]((?:https?:)?\/\/[^'"]+)['"]/i);
        if (mHls2 && mHls2[1] && !isTrashMedia(mHls2[1])) { mediaUrl = formatMediaUrl(mHls2[1]); break; }
      }
      if (!mediaUrl) {
        for (const s of scripts) {
          const text = s.textContent || '';
          if (!text) continue;
          const mLow = text.match(/setVideoUrlLow\s*\(\s*['"]((?:https?:)?\/\/[^'"]+)['"]\s*\)/i);
          if (mLow && mLow[1] && !isTrashMedia(mLow[1])) { mediaUrl = formatMediaUrl(mLow[1]); break; }
        }
      }
    }

    // 3. Inspect direct <video> elements with intelligent scoring
    const isAdVideoEl = (v: HTMLVideoElement) => {
      if (!v) return true;
      if (v.closest('iframe, [class*="ad-"], [class*="ad_"], [class*="ads"], [id*="ad-"], [id*="ad_"], [id*="ads"], [class*="banner"], [id*="banner"], [class*="sponsor"], [class*="promo"], [class*="popup"], [id*="popup"], [class*="overlay"], [id*="overlay"], [class*="interstitial"], [class*="commercial"], [class*="preroll"], [id*="preroll"], [class*="companion"], [data-ad], [data-advertisement]')) {
        return true;
      }
      const r = v.getBoundingClientRect();
      if (r.width > 0 && r.width < 320) return true;
      if (r.height > 0 && r.height < 180) return true;
      if (r.width === 0 || r.height === 0) return true;
      if (v.loop && (!v.duration || v.duration < 120)) return true;
      if (v.muted && v.autoplay && (!v.duration || v.duration < 60)) return true;
      const vSrc = (v.currentSrc || v.src || '').toLowerCase();
      if (vSrc && isTrashMedia(vSrc)) return true;
      return false;
    };

    const allVideos = Array.from(document.querySelectorAll('video'));
    let bestVideo: HTMLVideoElement | null = null;
    let bestScore = -999999;

    for (const v of allVideos) {
      if (isAdVideoEl(v)) continue;
      let score = 0;
      if (!v.paused) score += 5000;
      if (v.currentTime > 0) score += 3000;
      if (v.duration && v.duration > 120 && isFinite(v.duration)) score += 2000;
      if (v.duration && v.duration > 30) score += 1000;
      if (v.duration && v.duration < 15) score -= 3000;
      if (v.muted && v.autoplay) score -= 800;
      const r = v.getBoundingClientRect();
      if (r.width >= 400 && r.height >= 200) score += 1500;
      if (r.width > 0 && r.height > 0) score += 500;
      if (v.matches('#html5video video, #main-player video, .video-player video, #video-player video, video.html5-main-video, #player video, #video_html5 video, .player video, .plyr video, .jwplayer video, .vjs-tech')) {
        score += 2500;
      }
      if (score > bestScore) {
        bestScore = score;
        bestVideo = v;
      }
    }

    const mainVideoEl = bestVideo || allVideos.find(v => !isAdVideoEl(v)) || allVideos[0] || null;

    if (mainVideoEl) {
      let s = mainVideoEl.currentSrc || mainVideoEl.src;
      if (!s) {
        const srcEl = mainVideoEl.querySelector('source');
        if (srcEl && srcEl.src) s = srcEl.src;
      }
      if (s && !s.startsWith('blob:') && !s.startsWith('data:') && !isTrashMedia(s)) {
        if (!mediaUrl) mediaUrl = s;
      }
    }

    if (!mediaUrl) {
      for (const v of allVideos) {
        if (isAdVideoEl(v)) continue;
        let s = v.currentSrc || v.src;
        if (!s) {
          const srcEl = v.querySelector('source');
          if (srcEl && srcEl.src) s = srcEl.src;
        }
        if (s && !s.startsWith('blob:') && !s.startsWith('data:') && !isTrashMedia(s)) {
          mediaUrl = s;
          break;
        }
      }
    }

    // 4. Inspect Resource Timing entries for full .m3u8 or .mp4 streams
    if (!mediaUrl) {
      const entries = performance.getEntriesByType('resource');
      for (let i = entries.length - 1; i >= 0; i--) {
        const n = entries[i].name || '';
        if (isTrashMedia(n)) continue;
        const clean = n.split('?')[0].toLowerCase();
        if (clean.endsWith('.m3u8') || clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.m4v')) {
          mediaUrl = n;
          break;
        }
      }
      if (!mediaUrl) {
        for (let i = entries.length - 1; i >= 0; i--) {
          const n = entries[i].name || '';
          if (isTrashMedia(n)) continue;
          if (n.includes('.m3u8') || n.includes('googotv.com') || (n.includes('/stream/') && n.includes('.ts'))) {
            mediaUrl = n;
            break;
          }
        }
      }
    }

    // 5. Fallback poster from metadata
    const isAdOrGif = (src: string | null | undefined) => {
      if (!src || typeof src !== 'string') return true;
      const l = src.toLowerCase();
      if (l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#')) return true;
      if (l.includes('doubleclick') || l.includes('googleads') || l.includes('ad_') || l.includes('ad-') ||
          l.includes('banner') || l.includes('sponsor') || l.includes('promo') || l.includes('exclusive') ||
          l.includes('trafficjunky') || l.includes('advert')) return true;
      return false;
    };

    let poster = '';
    // 5. Official video thumbnail / poster from page player metadata
    try {
      const anyWin = window as any;
      if (anyWin.html5player) {
        if (typeof anyWin.html5player.getThumbUrl169 === 'function') {
          const t = anyWin.html5player.getThumbUrl169();
          if (t && !isAdOrGif(t)) poster = t;
        }
        if (!poster && typeof anyWin.html5player.getThumbUrl === 'function') {
          const t = anyWin.html5player.getThumbUrl();
          if (t && !isAdOrGif(t)) poster = t;
        }
        if (!poster && anyWin.html5player.thumb_url && !isAdOrGif(anyWin.html5player.thumb_url)) {
          poster = anyWin.html5player.thumb_url;
        }
      }
    } catch (e) {}

    if (!poster) {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const text = s.textContent || '';
        if (!text) continue;
        const m169 = text.match(/setThumbUrl169\s*\(\s*['"]((?:https?:)?\/\/[^'"]+)['"]\s*\)/i);
        if (m169 && m169[1] && !isAdOrGif(m169[1])) { poster = m169[1]; break; }
        const mThumb = text.match(/setThumbUrl\s*\(\s*['"]((?:https?:)?\/\/[^'"]+)['"]\s*\)/i);
        if (mThumb && mThumb[1] && !isAdOrGif(mThumb[1])) { poster = mThumb[1]; break; }
      }
    }

    if (!poster) {
      const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      const twImg = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
      const vPoster = (bestVideo && (bestVideo as HTMLVideoElement).poster) || '';
      for (const cand of [ogImg, twImg, vPoster]) {
        if (cand && !isAdOrGif(cand)) {
          poster = cand;
          break;
        }
      }
    }

    // 6. Video duration
    let duration = 0;
    const allScripts = Array.from(document.querySelectorAll('script'));
    for (const s of allScripts) {
      const text = s.textContent || '';
      if (!text) continue;
      const m1 = text.match(/setVideoDuration\s*\(\s*(\d+)\s*\)/i);
      const m2 = text.match(/video_duration\s*[:=]\s*['"]?(\d+)['"]?/i);
      const m3 = text.match(/duration\s*[:=]\s*(\d{2,})/i);
      const match = m1 || m2 || m3;
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > 45) { duration = val; break; }
      }
    }

    if (!duration) {
      const metaDur = document.querySelector('meta[property="video:duration"], meta[itemprop="duration"]')?.getAttribute('content');
      if (metaDur) {
        const isoMatch = metaDur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
        if (isoMatch) {
          const h = parseInt(isoMatch[1] || '0', 10);
          const m = parseInt(isoMatch[2] || '0', 10);
          const sec = parseInt(isoMatch[3] || '0', 10);
          duration = h * 3600 + m * 60 + sec;
        } else if (!isNaN(Number(metaDur))) {
          duration = Math.round(Number(metaDur));
        }
      }
    }

    if (!duration) {
      const durTextEl = document.querySelector('.duration, .video-duration, span.time, .badge-duration') as HTMLElement | null;
      if (durTextEl) {
        const raw = (durTextEl.innerText || '').trim();
        const minMatch = raw.match(/(\d+)\s*min/i);
        const colonMatch = raw.match(/(\d+):(\d{2})(?::(\d{2}))?/);
        if (minMatch) {
          duration = parseInt(minMatch[1], 10) * 60;
        } else if (colonMatch) {
          if (colonMatch[3]) {
            duration = parseInt(colonMatch[1], 10) * 3600 + parseInt(colonMatch[2], 10) * 60 + parseInt(colonMatch[3], 10);
          } else {
            duration = parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
          }
        }
      }
    }

    if (!duration && mainVideoEl && mainVideoEl.duration && !isNaN(mainVideoEl.duration) && isFinite(mainVideoEl.duration) && mainVideoEl.duration > 1) {
      duration = Math.round(mainVideoEl.duration);
    }

    // 7. Video current playback position & in-memory canvas frame capture
    let currentTime = 0;
    if (mainVideoEl && !isNaN(mainVideoEl.currentTime) && mainVideoEl.currentTime > 0) {
      currentTime = Math.round(mainVideoEl.currentTime);
    }

    let frameData: string | null = null;
    if (mainVideoEl) {
      try {
        const vw = mainVideoEl.videoWidth || mainVideoEl.clientWidth || 640;
        const vh = mainVideoEl.videoHeight || mainVideoEl.clientHeight || 360;
        if (vw > 20 && vh > 20) {
          const c = document.createElement('canvas');
          const targetW = Math.min(vw, 640);
          const targetH = Math.round(targetW * (vh / vw));
          c.width = targetW;
          c.height = targetH;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(mainVideoEl, 0, 0, targetW, targetH);
            const dUrl = c.toDataURL('image/jpeg', 0.85);
            if (dUrl && dUrl.length > 500 && !dUrl.startsWith('data:,')) {
              frameData = dUrl;
            }
          }
        }
      } catch (e) {
        // Fallback to webview.capturePage
      }
    }

    // Video bounding rect for webview compositor frame capture
    let videoRect: { x: number; y: number; width: number; height: number } | null = null;
    if (mainVideoEl) {
      const r = mainVideoEl.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) {
        videoRect = {
          x: Math.round(r.left),
          y: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        };
      }
    }
    if (!videoRect) {
      const playerContainer = document.querySelector(
        '#video-player-bg, #html5video, #video-player, .video-player, #player, .player-container, #main-player, .video-container, #video-container, .media-player, [class*="player-wrap"], [class*="video-wrap"], .plyr, .jwplayer, .vjs-tech'
      );
      if (playerContainer) {
        const pr = playerContainer.getBoundingClientRect();
        if (pr.width > 200 && pr.height > 120) {
          videoRect = {
            x: Math.round(pr.left),
            y: Math.round(pr.top),
            width: Math.round(pr.width),
            height: Math.round(pr.height)
          };
        }
      }
    }

    // 8. Clean Page Title bypassing age-verification & generic site titles
    const isAgeBanner = (t: string) => {
      if (!t || typeof t !== 'string') return true;
      return /verify\s*(your)?\s*age|confirm\s*(your)?\s*age|age\s*verification|18\s*\+|adult\s*content|sign\s*in\s*to\s*confirm/i.test(t);
    };
    const isGenericTitle = (t: string) => {
      if (!t || typeof t !== 'string') return true;
      const trimmed = t.trim();
      return /^(free\s*movies?|watch\s*(movies?|online|free)|online\s*movies?|movies?|video\s*stream|web\s*video|home|stream|player|free\s*streaming|full\s*movie|watch\s*hd|hd\s*movies?|free\s*videos?|movie\s*stream|streaming)$/i.test(trimmed);
    };
    const isBadTitle = (t: string) => isAgeBanner(t) || isGenericTitle(t);

    const isPlayerOverlayText = (t: string) => {
      if (!t || typeof t !== 'string') return false;
      const l = t.toLowerCase();
      if (l.includes('previewing') || l.includes('unlock full access') ||
          l.includes('go premium') || l.includes('unlock access') ||
          l.includes('sign up free') || l.includes('join now') ||
          l.includes('subscribe now') || l.includes('get premium') ||
          l.includes('upgrade now') || l.includes('free trial') ||
          l.includes('start watching') || l.includes('remove ads')) return true;
      if (/\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(t)) return true;
      if (/\b(480p|720p|1080p|dualsub|english\s+off)\b/i.test(l) && l.length > 30) return true;
      if (t.length > 100) return true;
      return false;
    };

    let resolvedTitle = '';
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const twTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
    const specificTitleEl = document.querySelector(
      '.page-title, #main h2, .video-title, h2.title, .video-tags + h2, .video-detail h1, ' +
      '.movie-title, .film-title, .media-title, .content-title, ' +
      '.video-info h1, .video-info h2, .detail-title, .detail h1, ' +
      '[class*="title"][class*="movie"]'
    ) as HTMLElement | null;
    const specificTitle = specificTitleEl ? (specificTitleEl.innerText || '').trim() : '';
    const docTitle = document.title || '';
    let h1 = '';
    const allH1s = Array.from(document.querySelectorAll('h1'));
    for (const el of allH1s) {
      const txt = (el.innerText || '').trim();
      if (!txt || txt.length < 2) continue;
      if (el.closest('.video-player, #player, .player, [class*="player"], [class*="video-container"]')) continue;
      if (!isPlayerOverlayText(txt) && !isBadTitle(txt)) {
        h1 = txt;
        break;
      }
    }

    for (const cand of [specificTitle, h1, ogTitle, twTitle, docTitle]) {
      if (cand && !isBadTitle(cand) && !isPlayerOverlayText(cand)) {
        resolvedTitle = cand;
        break;
      }
    }

    if (resolvedTitle) {
      resolvedTitle = resolvedTitle
        .replace(/\s*[-–|]\s*(xvideos|pornhub|spankbang|redtube|youporn|youtube|dailymotion|vimeo|moviebox|fzmovies|mzfl|free\s*movies?).*$/i, '')
        .trim();
      if (isGenericTitle(resolvedTitle)) resolvedTitle = '';
    }

    if (!resolvedTitle || isBadTitle(resolvedTitle)) {
      try {
        const parts = window.location.pathname.split('/').filter(Boolean);
        const skipWords = ['spa', 'videoplaypage', 'movies', 'movie', 'watch', 'video', 'play', 'v', 'embed', 'stream', 'page'];
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          if (skipWords.includes(p.toLowerCase())) continue;
          if (p && p.length > 1) {
            const cleaned = decodeURIComponent(p)
              .replace(/[-_][a-zA-Z0-9]{6,25}$/, '')
              .replace(/[-_]+/g, ' ')
              .trim();
            if (cleaned.length > 1 && !/^[a-f0-9]{20,}$/i.test(cleaned)) {
              resolvedTitle = cleaned.replace(/\b\w/g, c => c.toUpperCase());
              break;
            }
          }
        }
      } catch (e) {}
    }

    return { mediaUrl, title: resolvedTitle || 'Web Video Stream', duration, currentTime, poster, videoRect, frameData };
  } catch (err) {
    return { mediaUrl: '', title: document.title || 'Web Video Stream', duration: 0, currentTime: 0, poster: '', videoRect: null, frameData: null };
  }
}

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get('mode');
  const pathParam = searchParams.get('path') || '';
  const titleParam = searchParams.get('title') || '';

  const [streamingPort, setStreamingPort] = useState(52321);
  useEffect(() => {
    if (electron) {
      electron.ipcRenderer.invoke('get-streaming-port').then((port: number) => {
        if (port) setStreamingPort(port);
      });
    }
  }, []);

  if (mode === 'player') {
    return <PanamediaPlayer filePath={pathParam} title={titleParam} />;
  }

  const [activeTab, setActiveTab] = useState<'downloads' | 'queues' | 'settings' | 'integration' | 'browser'>('downloads');
  const [settingsSubTab, setSettingsSubTab] = useState<'general' | 'folders' | 'security'>('general');
  const [settingsArchivePin, setSettingsArchivePin] = useState<string>(() => localStorage.getItem('player_archive_pin') || '');
  const [newSettingsPin, setNewSettingsPin] = useState<string>('');
  const [confirmSettingsPin, setConfirmSettingsPin] = useState<string>('');
  const [pinFeedbackMsg, setPinFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showResetPinModal, setShowResetPinModal] = useState<boolean>(false);
  const [showNewPin, setShowNewPin] = useState<boolean>(false);
  const [showConfirmPin, setShowConfirmPin] = useState<boolean>(false);
  const [newPinFocused, setNewPinFocused] = useState<boolean>(false);
  const [confirmPinFocused, setConfirmPinFocused] = useState<boolean>(false);
  const [downloads, setDownloads] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Right panel and Media library states
  const [rightPanelTab, setRightPanelTab] = useState<'details' | 'library'>('library');
  const [libraryFiles, setLibraryFiles] = useState<any[]>([]);
  const [libraryCategory, setLibraryCategory] = useState<'recent' | 'videos' | 'audios' | 'docx' | 'files' | 'duplicates'>('recent');
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySortBy, setLibrarySortBy] = useState<'name' | 'date' | 'size'>('date');
  const [librarySortOrder, setLibrarySortOrder] = useState<'asc' | 'desc'>('desc');
  const [syncingLibrary, setSyncingLibrary] = useState(false);

  // Player Archive state sync
  const [archivePaths, setArchivePaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('player_archive');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'player_archive' && e.newValue) {
        try {
          setArchivePaths(JSON.parse(e.newValue));
        } catch {}
      }
      if (e.key === 'player_archive_pin') {
        setSettingsArchivePin(e.newValue || '');
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleArchiveUpdated = (_event: any, paths: string[]) => {
      if (Array.isArray(paths)) {
        setArchivePaths(paths);
      }
    };

    const handlePinUpdated = (_event: any, pin: string) => {
      const pinStr = typeof pin === 'string' ? pin : '';
      setSettingsArchivePin(pinStr);
      if (!pinStr) {
        localStorage.removeItem('player_archive_pin');
      } else {
        localStorage.setItem('player_archive_pin', pinStr);
      }
    };

    if (electron) {
      electron.ipcRenderer.on('archive-updated', handleArchiveUpdated);
      electron.ipcRenderer.on('archive-pin-updated', handlePinUpdated);
      // Load persistent archive data from disk so files/folders are never lost on updates
      electron.ipcRenderer.invoke('load-archive-data').then((fileData: any) => {
        if (fileData?.archivePaths && Array.isArray(fileData.archivePaths)) {
          setArchivePaths(prev => {
            const set = new Set(prev.map(p => p.replace(/[\\/]/g, '/').toLowerCase()));
            for (const fp of fileData.archivePaths) {
              set.add(fp.replace(/[\\/]/g, '/').toLowerCase());
            }
            return Array.from(set);
          });
          localStorage.setItem('player_archive', JSON.stringify(fileData.archivePaths));
        }
        if (fileData && typeof fileData.archivePin === 'string') {
          setSettingsArchivePin(fileData.archivePin);
          if (fileData.archivePin) {
            localStorage.setItem('player_archive_pin', fileData.archivePin);
          } else {
            localStorage.removeItem('player_archive_pin');
          }
        }
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener('storage', handleStorage);
      if (electron) {
        electron.ipcRenderer.removeListener('archive-updated', handleArchiveUpdated);
        electron.ipcRenderer.removeListener('archive-pin-updated', handlePinUpdated);
      }
    };
  }, []);

  const isItemArchived = useCallback((filePath?: string) => {
    if (!filePath) return false;
    const target = filePath.replace(/[\\/]/g, '/').toLowerCase();
    return archivePaths.some(p => {
      const arch = p.replace(/[\\/]/g, '/').toLowerCase();
      return target === arch || target.startsWith(arch + '/');
    });
  }, [archivePaths]);

  // Browser state
  const [browserUrl] = useState('https://www.youtube.com');
  const [helpSubTab, setHelpSubTab] = useState<'guide' | 'license'>('guide');
  const APP_VERSION = '1.0.1';
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [releaseCheckStatus, setReleaseCheckStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'update-available' | 'no-internet' | 'downloading' | 'download-complete' | 'installing' | 'error'>('idle');
  const [latestReleaseVersion, setLatestReleaseVersion] = useState(APP_VERSION);
  const [releaseDownloadUrl, setReleaseDownloadUrl] = useState('https://panamedia.lovable.app/api/public/download/windows');
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0);
  const [updateDownloadedBytes, setUpdateDownloadedBytes] = useState(0);
  const [updateTotalBytes, setUpdateTotalBytes] = useState(0);
  const [updateInstallerPath, setUpdateInstallerPath] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');

  const compareVersions = (v1: string, v2: string): number => {
    const clean1 = (v1 || '').replace(/^[vV]/, '').trim();
    const clean2 = (v2 || '').replace(/^[vV]/, '').trim();
    const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);
    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  };

  // Listen for update download progress from main process
  useEffect(() => {
    if (!electron) return;
    const handler = (_event: any, data: { downloadedBytes: number; totalBytes: number; progress: number }) => {
      setUpdateDownloadedBytes(data.downloadedBytes);
      setUpdateTotalBytes(data.totalBytes);
      if (data.progress >= 0) setUpdateDownloadProgress(data.progress);
    };
    electron.ipcRenderer.on('update-download-progress', handler);
    return () => { electron.ipcRenderer.removeListener('update-download-progress', handler); };
  }, []);

  const checkReleaseUpdate = async (isManual = false) => {
    // If user clicked manually, show dialog immediately to provide instant feedback
    if (isManual) {
      setShowReleaseDialog(true);
    }
    setReleaseCheckStatus('checking');
    setUpdateError('');

    try {
      // 1. Check internet connectivity first
      let isOnline = true;
      if (electron) {
        try {
          const netCheck = await electron.ipcRenderer.invoke('check-internet');
          isOnline = !!netCheck?.online;
        } catch {
          isOnline = navigator.onLine;
        }
      } else {
        isOnline = navigator.onLine;
      }

      if (!isOnline) {
        setReleaseCheckStatus('no-internet');
        if (isManual) {
          setShowReleaseDialog(true); // Popup appears if user clicked button manually
        } else {
          setShowReleaseDialog(false); // Do not disturb user with popup if checking automatically
        }
        return;
      }

      const startTime = Date.now();
      let foundVersion = APP_VERSION;
      let dlUrl = 'https://panamedia.lovable.app/api/public/download/windows';
      let foundUpdate = false;
      let notes = '';

      // 1. Primary: Panamedia API (official update source)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const apiRes = await fetch('https://panamedia.lovable.app/api/public/latest/windows', {
          headers: { 'cache-control': 'no-cache' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData) {
            const parsed = (apiData.version || '').replace(/^[vV]/, '').trim();
            if (parsed) foundVersion = parsed;
            if (apiData.download_url) dlUrl = apiData.download_url;
            else if (apiData.url) dlUrl = apiData.url;
            else dlUrl = 'https://panamedia.lovable.app/api/public/download/windows';
            if (apiData.release_notes || apiData.notes) notes = apiData.release_notes || apiData.notes;
            if (apiData.available === true || compareVersions(foundVersion, APP_VERSION) > 0) {
              foundUpdate = true;
            }
          }
        }
      } catch (e) {
        // Panamedia API unavailable
      }

      // 2. Fallback: GitHub Releases API
      if (!foundUpdate) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const ghRes = await fetch('https://api.github.com/repos/gilocie/net-downloader/releases/latest', {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (ghRes.ok) {
            const ghData = await ghRes.json();
            if (ghData && (ghData.tag_name || ghData.name)) {
              const raw = ghData.tag_name || ghData.name || '';
              const parsed = raw.replace(/^[vV]/, '').trim();
              if (parsed) {
                foundVersion = parsed;
                dlUrl = ghData.html_url || dlUrl;
                if (ghData.body) notes = ghData.body;
                if (compareVersions(parsed, APP_VERSION) > 0) {
                  foundUpdate = true;
                }
              }
            }
          }
        } catch (e) {
          // GitHub API skipped/offline
        }
      }

      // Ensure the "Checking updates..." button activity is clearly visible to the user
      const elapsed = Date.now() - startTime;
      const minDuration = 1800;
      if (elapsed < minDuration) {
        await new Promise(r => setTimeout(r, minDuration - elapsed));
      }

      setLatestReleaseVersion(foundVersion);
      setReleaseDownloadUrl(dlUrl);
      setReleaseNotes(notes);

      const isActuallyNewer = compareVersions(foundVersion, APP_VERSION) > 0;
      if (isActuallyNewer) {
        setReleaseCheckStatus('update-available');
        // Only show dialogue automatically if there is genuinely a newer version!
        setShowReleaseDialog(true);
      } else {
        setReleaseCheckStatus('up-to-date');
        // If up to date, only keep dialogue if user manually clicked check
        if (!isManual) {
          setShowReleaseDialog(false);
        }
      }
    } catch (err) {
      console.warn('Release check error:', err);
      if (isManual) {
        setReleaseCheckStatus('no-internet');
        setShowReleaseDialog(true);
      } else {
        setReleaseCheckStatus('idle');
        setShowReleaseDialog(false);
      }
    }
  };

  // Automatically check for new releases every 5 minutes when internet connection is detected
  useEffect(() => {
    // Helper to probe internet connectivity
    const hasInternet = async (): Promise<boolean> => {
      if (!navigator.onLine) return false;
      if (electron) {
        try {
          const netCheck = await electron.ipcRenderer.invoke('check-internet');
          if (netCheck && typeof netCheck.online === 'boolean') {
            return netCheck.online;
          }
        } catch {
          // ignore
        }
      }
      return navigator.onLine;
    };

    // 1. Initial background check 3.5 seconds after startup if internet is detected
    const startupTimer = setTimeout(async () => {
      if (await hasInternet()) {
        checkReleaseUpdate(false);
      }
    }, 3500);

    // 2. Periodic background check every 5 minutes (300,000 ms) when internet connection is detected
    const intervalTimer = setInterval(async () => {
      if (await hasInternet()) {
        checkReleaseUpdate(false);
      }
    }, 5 * 60 * 1000);

    // 3. Trigger check immediately when internet connection is detected/reconnected
    const handleOnline = async () => {
      if (await hasInternet()) {
        checkReleaseUpdate(false);
      }
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(startupTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const startUpdateDownload = async () => {
    if (!electron) return;
    setReleaseCheckStatus('downloading');
    setUpdateDownloadProgress(0);
    setUpdateDownloadedBytes(0);
    setUpdateTotalBytes(0);
    setUpdateInstallerPath('');
    setUpdateError('');

    try {
      const result = await electron.ipcRenderer.invoke('download-app-update', {
        downloadUrl: releaseDownloadUrl || 'https://panamedia.lovable.app/api/public/download/windows',
        fileName: 'PanamediaSetup.exe'
      });

      if (result.success && result.installerPath) {
        setUpdateInstallerPath(result.installerPath);
        setUpdateDownloadProgress(100);
        setReleaseCheckStatus('download-complete');
      } else {
        setUpdateError(result.error || 'Download failed.');
        setReleaseCheckStatus('error');
      }
    } catch (err: any) {
      setUpdateError(err.message || 'Download failed.');
      setReleaseCheckStatus('error');
    }
  };

  const installUpdate = async () => {
    if (!electron || !updateInstallerPath) return;
    setReleaseCheckStatus('installing');
    try {
      await electron.ipcRenderer.invoke('install-app-update', { installerPath: updateInstallerPath });
    } catch (err: any) {
      setUpdateError(err.message || 'Failed to launch installer.');
      setReleaseCheckStatus('error');
    }
  };

  const [currentBrowserUrl, setCurrentBrowserUrl] = useState('https://www.youtube.com');
  const [urlInput, setUrlInput] = useState('https://www.youtube.com');
  const webviewRef = useRef<any>(null);
  const downloadsTableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrlInput(currentBrowserUrl);
  }, [currentBrowserUrl]);

  // Clean campaign/preview/interstitial links into authentic direct broadcaster streams
  const cleanStreamUrl = (rawUrl: string): string => {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
      const trimmed = rawUrl.trim();
      if (!trimmed) return rawUrl;
      const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const host = urlObj.hostname.toLowerCase();

      // 1. Chaturbate campaign / preview / interstitial links -> Original direct broadcaster room
      if (host.includes('chaturbate.com')) {
        const room = urlObj.searchParams.get('room');
        if (room && (urlObj.pathname.includes('livecampreview') || urlObj.pathname.includes('/in/') || urlObj.searchParams.has('campaign'))) {
          return `https://chaturbate.com/${encodeURIComponent(room)}/`;
        }
      }

      // 2. Stripchat campaign / embed links -> Original direct model room
      if (host.includes('stripchat.com')) {
        const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
        if (model && (urlObj.pathname.includes('/promo') || urlObj.pathname.includes('/embed') || urlObj.searchParams.has('campaign'))) {
          return `https://stripchat.com/${encodeURIComponent(model)}/`;
        }
      }

      // 3. CamSoda campaign / embed links
      if (host.includes('camsoda.com')) {
        const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
        if (model) {
          return `https://www.camsoda.com/${encodeURIComponent(model)}`;
        }
      }

      // 4. BongaCams campaign / embed links
      if (host.includes('bongacams.com')) {
        const model = urlObj.searchParams.get('model') || urlObj.searchParams.get('room');
        if (model) {
          return `https://bongacams.com/${encodeURIComponent(model)}/`;
        }
      }
    } catch (e) {}
    return rawUrl;
  };

  const tableWheelCleanupRef = useRef<(() => void) | null>(null);

  // Allow horizontal scrolling on Active Downloads:
  // 1. Hovering directly over the bottom horizontal scrollbar -> mouse wheel scrolls horizontally
  // 2. Mouse inside active download records -> Ctrl + scroll wheel (or Shift + wheel) scrolls horizontally
  const setDownloadsTableRef = useCallback((node: HTMLDivElement | null) => {
    if (tableWheelCleanupRef.current) {
      tableWheelCleanupRef.current();
      tableWheelCleanupRef.current = null;
    }

    (downloadsTableRef as any).current = node;

    if (node) {
      const handleTableWheel = (e: WheelEvent) => {
        const rect = node.getBoundingClientRect();
        // Mouse hovering over the horizontal scrollbar area at the bottom edge (within 24px)
        const isOverHorizontalScrollbar = (
          e.clientY >= rect.bottom - 24 &&
          e.clientY <= rect.bottom + 6 &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right
        );

        if (isOverHorizontalScrollbar || e.ctrlKey || e.shiftKey) {
          if (node.scrollWidth > node.clientWidth) {
            e.preventDefault();
            let delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
            if (e.deltaMode === 1) {
              delta *= 28; // DOM_DELTA_LINE
            } else if (e.deltaMode === 2) {
              delta *= node.clientWidth; // DOM_DELTA_PAGE
            }
            node.scrollLeft += delta;
          }
        }
      };

      node.addEventListener('wheel', handleTableWheel, { passive: false });
      tableWheelCleanupRef.current = () => {
        node.removeEventListener('wheel', handleTableWheel);
      };
    }
  }, []);

  // Stream sites state (Facebook & Instagram removed as requested for future integration)
  const DEFAULT_STREAM_SITES = [
    { name: 'YouTube', url: 'https://www.youtube.com', color: '#ff0000' },
    { name: 'Moviebox', url: 'https://moviebox.ph/', color: '#fbbf24' },
    { name: 'TikTok', url: 'https://www.tiktok.com', color: '#010101' }
  ];

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

  useEffect(() => {
    localStorage.setItem('stream_sites', JSON.stringify(streamSites));
  }, [streamSites]);

  const [showAddSiteModal, setShowAddSiteModal] = useState<boolean>(false);

  const navigateBrowser = (url: string) => {
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
  };

  const deleteStreamSite = (url: string) => {
    setStreamSites(prev => prev.filter(s => s.url !== url));
  };

  const getSiteIcon = (site: any) => {
    if (site.showIcon === false) return null;

    if (site.favicon) {
      return (
        <img
          src={site.favicon}
          alt=""
          style={{ width: '13px', height: '13px', borderRadius: '2px', objectFit: 'contain', flexShrink: 0 }}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      );
    }

    if (site.customIcon) {
      switch (site.customIcon) {
        case 'film': return <Film size={12} style={{ color: site.color || '#a855f7', flexShrink: 0 }} />;
        case 'tv': return <Tv size={12} style={{ color: site.color || '#3b82f6', flexShrink: 0 }} />;
        case 'play': return <PlaySquare size={12} style={{ color: site.color || '#fbbf24', flexShrink: 0 }} />;
        case 'video': return <Video size={12} style={{ color: site.color || '#06b6d4', flexShrink: 0 }} />;
        case 'music': return <Music size={12} style={{ color: site.color || '#ec4899', flexShrink: 0 }} />;
        case 'flame': return <Flame size={12} style={{ color: site.color || '#ef4444', flexShrink: 0 }} />;
        case 'sparkles': return <Sparkles size={12} style={{ color: site.color || '#f59e0b', flexShrink: 0 }} />;
        case 'heart': return <Heart size={12} style={{ color: site.color || '#f43f5e', flexShrink: 0 }} />;
        case 'star': return <Star size={12} style={{ color: site.color || '#eab308', flexShrink: 0 }} />;
        case 'globe':
        default:
          return <Globe size={12} style={{ color: site.color || 'var(--primary)', flexShrink: 0 }} />;
      }
    }

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

  const [isWebviewLoading, setIsWebviewLoading] = useState(false);
  const [isDetectingStream, setIsDetectingStream] = useState(false);

  const setWebviewRef = (el: any) => {
    if (!el || webviewRef.current === el) return;
    webviewRef.current = el;

    const handleNav = (e: any) => {
      const u = (e.url || '').toLowerCase();
      // Drop ad campaign parameter redirects so state isn't polluted
      if (u.includes('campaign=') && u.includes('click_id=')) return;
      if (u.includes('/tours/') && u.includes('campaign=')) return;
      if (u.includes('track=00e_interstitial')) return;
      setCurrentBrowserUrl(e.url || '');
    };

    const handleStartLoad = () => setIsWebviewLoading(true);
    const handleStopLoad = () => setIsWebviewLoading(false);

    const handleDomReady = () => {
      try {
        // Neutralize popups and auto-skip YouTube ads without modifying site styles
        el.executeJavaScript?.(`
          (() => {
            try {
              window.open = function() { return null; };

              // Auto-skip video ads
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
      // Silently deny all popups - never navigate away the active video player
      console.log('[Stream Browser] Suppressed new-window popup request:', e.url);
    };

    const handleWillNavigate = (e: any) => {
      const targetUrl = e.url || '';
      const lower = targetUrl.toLowerCase();

      // Block any redirect to known cam/affiliate/ad networks or campaign parameters
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
        console.log('[Stream Browser] Blocked malicious redirect hijacking to:', targetUrl);
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
  };

  // File Details Modal state
  const [selectedFileDetails, setSelectedFileDetails] = useState<any | null>(null);
  const [showFileDetailsModal, setShowFileDetailsModal] = useState<boolean>(false);

  // Bulk downloads selection state
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<string[]>([]);

  // Simulated progress bar states
  const [extractProgress, setExtractProgress] = useState(0);

  // Clear History Modal state
  const [showClearHistoryModal, setShowClearHistoryModal] = useState<boolean>(false);

  // Format source tracker
  const [formatsSource, setFormatsSource] = useState<'add_modal' | 'browser' | null>(null);

  // Custom delete confirmation modal state
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'download' | 'file' | 'bulk-tasks' | 'all-history';
    title: string;
    message: string;
    taskId?: string;
    filePath?: string;
    showDeleteFileOption?: boolean;
    taskIds?: string[];
    onConfirm: (extraData?: any) => void;
  } | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    type: 'file';
    targetPath?: string;
  }>({ x: 0, y: 0, visible: false, type: 'file' });

  // Send to Flash state
  const [flashDriveTarget, setFlashDriveTarget] = useState<string | null>(null);

  // Library view modes and accordions
  const [libraryViewMode, setLibraryViewMode] = useState<'files' | 'folders'>('files');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  // Duplicate prompt states
  const [duplicateDeletePaths, setDuplicateDeletePaths] = useState<string[]>([]);
  const [expandedDupGroups, setExpandedDupGroups] = useState<Record<string, boolean>>({});

  // Auto-mark oldest duplicates when libraryFiles changes
  useEffect(() => {
    const nameMap = new Map<string, any[]>();
    libraryFiles.forEach(f => {
      const normName = getNormalizedName(f.name);
      if (!nameMap.has(normName)) nameMap.set(normName, []);
      nameMap.get(normName)!.push(f);
    });

    const initialDeletePaths: string[] = [];
    for (const [, group] of nameMap.entries()) {
      if (group.length > 1) {
        // Sort by modification time (oldest first)
        const sorted = [...group].sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
        // Auto-mark the oldest copy for deletion
        initialDeletePaths.push(sorted[0].path);
      }
    }
    setDuplicateDeletePaths(initialDeletePaths);
  }, [libraryFiles]);

  // Mini-player state (when player window is minimized to sidebar)
  const [miniPlayerState, setMiniPlayerState] = useState<{
    filePath: string;
    filename: string;
    playing: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    minimized: boolean;
  } | null>(null);

  const [miniPlayerHovered, setMiniPlayerHovered] = useState(false);
  const [miniThumbError, setMiniThumbError] = useState(false);

  useEffect(() => {
    setMiniThumbError(false);
  }, [miniPlayerState?.filePath]);

  const miniVideoRef = useRef<HTMLVideoElement>(null);

  // Real-time OS-level network download speed
  const [netSpeed, setNetSpeed] = useState<number>(0);

  // Sync mini-player video with main player state
  useEffect(() => {
    const video = miniVideoRef.current;
    if (!video || !miniPlayerState || !miniPlayerState.minimized) return;

    // Sync play/pause state
    if (miniPlayerState.playing) {
      video.play().catch(() => { });
    } else {
      video.pause();
    }

    // Sync currentTime if it drifts by more than 1.2 seconds
    if (Math.abs(video.currentTime - miniPlayerState.currentTime) > 1.2) {
      video.currentTime = miniPlayerState.currentTime;
    }
  }, [miniPlayerState?.playing, miniPlayerState?.currentTime, miniPlayerState?.minimized]);


  // Selection for right panel media library files
  const [selectedLibraryPath, setSelectedLibraryPath] = useState<string | null>(null);

  const fetchFormats = async (url: string, options: { title?: string; pageUrl?: string; headers?: Record<string, string>; thumbnail?: string; duration?: number; currentTime?: number } = {}) => {
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
      } catch (e) {}
    }

    setAddUrl(targetUrl);
    setFormatLoading(true);
    setExtractError(null);
    setExtractProgress(0);
    setShowFormatModal(true);

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 4;
      if (progress >= 95) {
        progress = 95;
        clearInterval(interval);
      }
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
          if (l.includes('youtube.com') || l.includes('ytimg.com') || l.includes('googlevideo.com')) {
            return false;
          }
          return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
            l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
            l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
            l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
        };
        const ytFallback = (isYt && res.info?.id) ? `https://i.ytimg.com/vi/${res.info.id}/hqdefault.jpg` : '';
        const resolvedThumb = (!isAdOrGif(options.thumbnail || '') ? options.thumbnail : (!isAdOrGif(res.info?.thumbnail || '') ? res.info?.thumbnail : '')) || ytFallback;

        setYoutubeInfo({
          ...res.info,
          thumbnail: resolvedThumb,
          duration: options.duration || res.info?.duration || 0,
          title: (() => {
            const isGeneric = (t?: string) => !t || /^(free\s*movies?|watch\s*(movies?|online|free)|online\s*movies?|movies?|video\s*stream|web\s*video|home|stream|player|free\s*streaming|full\s*movie|watch\s*hd|hd\s*movies?|free\s*videos?|movie\s*stream|streaming|web\s*video\s*stream)$/i.test(t.trim());
            const isOverlay = (t?: string) => !t ? false : (/previewing|unlock\s*(full\s*)?access|go\s*premium|get\s*premium/i.test(t) || /\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(t) || t.length > 100);
            const isGenericFile = (t?: string) => !t ? false : /^(local|index|master|playlist|stream|chunklist|video|media|output|hls)\.(m3u8|mp4|m4v|webm|mp3|m4a)$/i.test(t.trim());
            const isBad = (t?: string) => isGeneric(t) || isOverlay(t) || isGenericFile(t);
            if (options.title && !isBad(options.title)) return options.title;
            if (res.info?.title && !isBad(res.info.title)) return res.info.title;
            // Extract meaningful title from URL when all candidates are bad
            try {
              const u = new URL(targetUrl);
              const skipWords = ['spa','videoplaypage','movies','movie','watch','video','play','v','embed','stream','page','streams','hls','dash','media','content','api','public'];
              const genericFiles = /^(local|index|master|playlist|stream|chunklist|video|media|output|hls|dash|content|main|default|source|play|file|data)\.(m3u8|mp4|m4v|webm|mkv|mov|mp3|m4a)$/i;
              const parts = u.pathname.split('/').filter(Boolean);
              for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i];
                if (skipWords.includes(p.toLowerCase()) || genericFiles.test(p)) continue;
                if (!/^[a-f0-9]{20,}$/i.test(p)) {
                  const clean = p.replace(/\.(m3u8|mp4|m4v|webm|mkv|mov|mp3|m4a)$/i, '').replace(/[-_][a-zA-Z0-9]{6,25}$/, '').replace(/[-_]/g, ' ');
                  if (clean.trim().length > 2) return clean.trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
                }
              }
              // Hostname fallback
              const host = u.hostname.replace(/^(www|cdn|api|media|stream|hls|vod)\d*\./i, '').split('.')[0];
              if (host && host.length > 2) return host.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) + ' Stream';
            } catch (e) {}
            return 'Web Video';
          })(),
          isYoutube: isYt,
          pageUrl: options.pageUrl || (isYt ? '' : targetUrl),
          headers: options.headers
        });
        setExtractProgress(100);
        setTimeout(() => {
          setFormatLoading(false);
        }, 300);
      } else {
        setExtractError(res.error);
        setFormatLoading(false);
      }
    } catch (err: any) {
      clearInterval(interval);
      setExtractError(err.message);
      setFormatLoading(false);
    }
  };

  const handleCloseFormatsModal = () => {
    setShowFormatModal(false);
    setFormatLoading(false);
    setExtractError(null);
    if (formatsSource === 'add_modal') {
      setShowAddModal(true);
    }
    setFormatsSource(null);
  };

  const handleToggleSelect = (taskId: string) => {
    setSelectedDownloadIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleToggleSelectAll = (filteredDownloadsList: Task[]) => {
    if (selectedDownloadIds.length === filteredDownloadsList.length) {
      setSelectedDownloadIds([]);
    } else {
      setSelectedDownloadIds(filteredDownloadsList.map(t => t.id));
    }
  };

  const handleBulkPause = async () => {
    if (!electron) return;
    for (const id of selectedDownloadIds) {
      await electron.ipcRenderer.invoke('pause-download', id);
    }
    setSelectedDownloadIds([]);
  };

  const handleBulkResume = async () => {
    if (!electron) return;
    for (const id of selectedDownloadIds) {
      await electron.ipcRenderer.invoke('resume-download', id);
    }
    setSelectedDownloadIds([]);
  };

  const handleBulkDelete = () => {
    if (selectedDownloadIds.length === 0) return;
    const hasCompleted = downloads.some(t => selectedDownloadIds.includes(t.id) && t.status === 'completed');
    setDeleteConfirmTarget({
      type: 'bulk-tasks',
      title: 'Remove Selected Downloads',
      message: `Are you sure you want to remove the ${selectedDownloadIds.length} selected tasks?`,
      taskIds: selectedDownloadIds,
      showDeleteFileOption: hasCompleted,
      onConfirm: async (deleteFilesOption) => {
        if (!electron) return;
        for (const id of selectedDownloadIds) {
          await electron.ipcRenderer.invoke('delete-download', { taskId: id, deleteFile: deleteFilesOption });
        }
        const list = await electron.ipcRenderer.invoke('get-downloads');
        setDownloads(list);
        setSelectedDownloadIds([]);
        setSelectedTaskId(null);
        syncLibrary();
      }
    });
  };

  const handleClearHistory = async (filterType: string) => {
    if (!electron) return;
    const res = await electron.ipcRenderer.invoke('clear-downloads', { filterType });
    setDownloads(res);
    setShowClearHistoryModal(false);
  };

  // Modals state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addUrl, setAddUrl] = useState<string>('');
  const [addFilename, setAddFilename] = useState<string>('');
  const [addSaveDir, setAddSaveDir] = useState<string>('');
  const [startImmediately, setStartImmediately] = useState<boolean>(true);
  const [isYoutubeCheck, setIsYoutubeCheck] = useState<boolean>(false);
  const [interceptedHeaders, setInterceptedHeaders] = useState<Record<string, string>>({});

  // YouTube Playlist modal
  const [showPlaylistModal, setShowPlaylistModal] = useState<boolean>(false);
  const [playlistLoading, setPlaylistLoading] = useState<boolean>(false);
  const [playlistInfo, setPlaylistInfo] = useState<any>(null);

  // Application Settings
  const [appSettings, setAppSettings] = useState<AppSettings>({
    connections: 8,
    downloadDir: '',
    autoCompress: false,
    compressionCRF: 23,
    maxConcurrent: 2,
    syncedFolders: []
  });

  // Binary checks (first run setup)
  const [binariesInstalled, setBinariesInstalled] = useState<boolean>(true);
  const [installingBinaries, setInstallingBinaries] = useState<boolean>(false);
  const [installProgress, setInstallProgress] = useState<{ status: string, progress: number, isPaused?: boolean, error?: string }>({ status: 'idle', progress: 0 });

  // Custom toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string, message: string }>>([]);

  // Format selector states
  const [showFormatModal, setShowFormatModal] = useState<boolean>(false);
  const [formatLoading, setFormatLoading] = useState<boolean>(false);
  const [youtubeInfo, setYoutubeInfo] = useState<any>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Ref to help load settings initially
  const loadedSettingsRef = useRef(false);

  // resolveDuplicate was removed — duplicate resolution is handled via handleResolveDuplicates (physical delete)

  const performDeleteFile = async (filePath: string) => {
    if (!electron) return { success: false, error: 'Electron not available' };

    // Find if this path matches a completed or any task in downloads
    const matchingTask = downloads.find(t => {
      const taskPath = t.saveDir + '\\' + t.filename;
      const taskPathAlt = t.saveDir + '/' + t.filename;
      return taskPath === filePath || taskPathAlt === filePath || t.filename === filePath.split(/[\\/]/).pop();
    });

    let res;
    if (matchingTask) {
      // Delete download task from history, and delete file
      const list = await electron.ipcRenderer.invoke('delete-download', { taskId: matchingTask.id, deleteFile: true });
      setDownloads(list);
      if (selectedTaskId === matchingTask.id) setSelectedTaskId(null);
      res = { success: true };
    } else {
      // Just delete the physical file
      res = await electron.ipcRenderer.invoke('delete-file', filePath);
    }

    if (selectedLibraryPath === filePath) {
      setSelectedLibraryPath(null);
    }

    syncLibrary();
    return res;
  };

  const toggleDuplicateDelete = (path: string) => {
    setDuplicateDeletePaths(prev => {
      if (prev.includes(path)) {
        return prev.filter(p => p !== path);
      } else {
        return [...prev, path];
      }
    });
  };

  const handleResolveDuplicates = async () => {
    for (const path of duplicateDeletePaths) {
      await performDeleteFile(path);
    }
    setDuplicateDeletePaths([]);
    syncLibrary();
  };



  const syncLibrary = async () => {
    if (!electron) return;
    setSyncingLibrary(true);
    try {
      const files = await electron.ipcRenderer.invoke('sync-media-library');

      // Check for duplicate filenames from different paths
      const duplicatesMap = new Map<string, any[]>();
      for (const f of files) {
        const normName = getNormalizedName(f.name);
        if (!duplicatesMap.has(normName)) {
          duplicatesMap.set(normName, []);
        }
        duplicatesMap.get(normName)!.push(f);
      }

      // Find duplicates with different paths
      const duplicateList: any[] = [];
      for (const [name, list] of duplicatesMap.entries()) {
        if (list.length > 1) {
          const paths = new Set(list.map(f => f.path));
          if (paths.size > 1) {
            duplicateList.push({ name, list });
          }
        }
      }

      if (duplicateList.length > 0) {
        // Duplicates are shown silently in the Duplicates library tab — no dialog
        // (setPendingDuplicatePrompt removed intentionally)
      }

      setLibraryFiles(files);
      if (electron) {
        electron.ipcRenderer.send('library-synced', files);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingLibrary(false);
    }
  };

  // Load state and listen to IPC events
  useEffect(() => {
    if (!electron) return;

    // Check if external binaries are ready
    electron.ipcRenderer.invoke('check-binaries').then((installed: boolean) => {
      setBinariesInstalled(installed);
    });

    // Get downloads list
    electron.ipcRenderer.invoke('get-downloads').then((list: Task[]) => {
      setDownloads(list);
    });

    // Get settings
    electron.ipcRenderer.invoke('get-settings').then((s: AppSettings) => {
      setAppSettings(s);
      setAddSaveDir(s.downloadDir);
      loadedSettingsRef.current = true;
    });

    // IPC Download list updates
    const handleDownloadsUpdated = (_event: any, list: Task[]) => {
      setDownloads(list);
      syncLibrary();
    };
    electron.ipcRenderer.on('downloads-updated', handleDownloadsUpdated);

    // IPC Browser Integration hijacked link
    const handleNativeDownloadReceived = (_event: any, data: any) => {
      setAddUrl(data.url);
      setAddFilename(data.filename || '');
      setIsYoutubeCheck(data.isYoutube || isExtractorUrl(data.url));
      setInterceptedHeaders(data.headers || {});
      setShowAddModal(true);
    };
    electron.ipcRenderer.on('native-download-received', handleNativeDownloadReceived);

    // IPC Completed download notification toast
    const handleDownloadCompletedToast = (_event: any, filename: string) => {
      const toastId = 'toast_' + Date.now();
      setToasts(prev => [...prev, { id: toastId, message: `Completed: ${filename}` }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, 5000);
    };
    electron.ipcRenderer.on('download-completed-toast', handleDownloadCompletedToast);

    // IPC Binary installation progress
    const handleBinaryInstallProgress = (_event: any, progressData: any) => {
      setInstallProgress(progressData);
    };
    electron.ipcRenderer.on('binary-install-progress', handleBinaryInstallProgress);

    // IPC Player state changes (for mini-player in sidebar)
    const handlePlayerStateChanged = (_event: any, state: any) => {
      setMiniPlayerState(state);
    };
    electron.ipcRenderer.on('player-state-changed', handlePlayerStateChanged);

    // IPC Real-time network speed
    const handleNetworkSpeed = (_event: any, speed: number) => {
      setNetSpeed(speed);
    };
    electron.ipcRenderer.on('network-speed-update', handleNetworkSpeed);
    // Also fetch the initial cached value
    electron.ipcRenderer.invoke('get-network-speed').then((speed: number) => {
      if (speed > 0) setNetSpeed(speed);
    }).catch(() => { });

    // IPC settings changes listener
    const handleSettingsChanged = (_event: any, newSettings: AppSettings) => {
      setAppSettings(newSettings);
      setAddSaveDir(newSettings.downloadDir);
      syncLibrary();
    };
    electron.ipcRenderer.on('settings-changed', handleSettingsChanged);

    electron?.ipcRenderer.invoke('get-player-state').then((state: any) => {
      if (state) setMiniPlayerState(state);
    });

    return () => {
      electron.ipcRenderer.removeListener('downloads-updated', handleDownloadsUpdated);
      electron.ipcRenderer.removeListener('native-download-received', handleNativeDownloadReceived);
      electron.ipcRenderer.removeListener('download-completed-toast', handleDownloadCompletedToast);
      electron.ipcRenderer.removeListener('binary-install-progress', handleBinaryInstallProgress);
      electron.ipcRenderer.removeListener('player-state-changed', handlePlayerStateChanged);
      electron.ipcRenderer.removeListener('network-speed-update', handleNetworkSpeed);
      electron.ipcRenderer.removeListener('settings-changed', handleSettingsChanged);
    };
  }, []);

  // Click listener to close context menu
  useEffect(() => {
    const handleCloseCtx = () => {
      setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
    };
    window.addEventListener('click', handleCloseCtx);
    return () => window.removeEventListener('click', handleCloseCtx);
  }, []);

  // Keyboard listener for 'S' key to send to flash drive
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) {
        return;
      }
      if (e.key.toLowerCase() === 's') {
        if (selectedLibraryPath) {
          e.preventDefault();
          setFlashDriveTarget(selectedLibraryPath);
        } else if (selectedTaskId) {
          const task = downloads.find(t => t.id === selectedTaskId);
          if (task && task.status === 'completed') {
            e.preventDefault();
            setFlashDriveTarget(task.saveDir + '\\' + task.filename);
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [selectedLibraryPath, selectedTaskId, downloads]);

  // Keyboard listener for Backspace/Delete key to delete file selected in library
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
          return;
        }

        if (selectedLibraryPath) {
          e.preventDefault();
          // Find file details
          const fileToDelete = libraryFiles.find(f => f.path === selectedLibraryPath) ||
            downloads
              .filter(t => t.status === 'completed')
              .map(t => ({
                name: t.filename,
                path: t.saveDir + '\\' + t.filename,
              })).find(f => f.path === selectedLibraryPath);

          if (!fileToDelete) return;

          setDeleteConfirmTarget({
            type: 'file',
            title: 'Delete File from Disk',
            message: `Are you sure you want to permanently delete "${fileToDelete.name}" from disk?`,
            filePath: fileToDelete.path,
            onConfirm: async () => {
              const res = await performDeleteFile(fileToDelete.path);
              if (res && !res.success) {
                alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
              }
            }
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLibraryPath, libraryFiles, downloads]);

  const handleContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedLibraryPath(filePath);
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true, type: 'file', targetPath: filePath });
  };

  const handleAppDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleAppDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const file = e.dataTransfer.files[0];

    // Resolve file path using multiple fallback strategies
    let filePath = '';
    try {
      if ((window as any).electronWebUtils?.getPathForFile) {
        filePath = (window as any).electronWebUtils.getPathForFile(file);
      }
    } catch (err) {}
    if (!filePath) {
      try {
        if (electron?.webUtils?.getPathForFile) {
          filePath = electron.webUtils.getPathForFile(file);
        }
      } catch (err) {}
    }
    if (!filePath) {
      filePath = (file as any).path || '';
    }
    if (!filePath) return;

    const ext = '.' + (filePath.split('.').pop()?.toLowerCase() || '');
    const isMedia = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.mpeg', '.3gp', '.wmv', '.vob', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus', '.wma'].includes(ext);
    if (isMedia) {
      electron?.ipcRenderer.invoke('open-player-window', { filePath, filename: file.name });
    }
  };

  const handleInstallBinaries = async () => {
    if (!electron) return;
    setInstallingBinaries(true);
    setInstallProgress({ status: 'Starting...', progress: 0 });
    const res = await electron.ipcRenderer.invoke('install-binaries');
    if (res.success) {
      setBinariesInstalled(true);
      setInstallingBinaries(false);
    } else {
      if (res.error === 'Aborted') {
        return;
      }
      setInstallProgress(prev => ({
        status: 'error',
        progress: prev.progress,
        error: res.error || 'Failed to install'
      }));
    }
  };

  const handlePauseBinaries = async () => {
    if (!electron) return;
    await electron.ipcRenderer.invoke('pause-binary-install');
  };

  const handleResumeBinaries = async () => {
    if (!electron) return;
    setInstallProgress(prev => ({
      status: prev.status === 'error' ? 'Resuming...' : prev.status,
      progress: prev.progress,
      isPaused: false
    }));
    await electron.ipcRenderer.invoke('resume-binary-install');
  };

  const handleCancelInstall = () => {
    setInstallingBinaries(false);
    setInstallProgress({ status: 'idle', progress: 0 });
  };

  const handleDownloadPlaylist = async (url: string) => {
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
  };

  const handleAddDownload = async () => {
    if (!electron || !addUrl) return;

    const isExtractor = isYoutubeCheck || isExtractorUrl(addUrl);

    // If it's flagged as a playlist, check it first
    if (isExtractor && (addUrl.includes('playlist?list=') || addUrl.includes('&list='))) {
      setShowAddModal(false);
      handleDownloadPlaylist(addUrl);
      return;
    }

    // Intercept single YouTube/Extractor videos to fetch formats and sizes first
    if (isExtractor) {
      setShowAddModal(false);
      setFormatsSource('add_modal');
      fetchFormats(addUrl);
      return;
    }

    // Intercept direct media URLs (.m3u8, .mp4, .webm, etc.) to show format picker
    const directMediaExts = ['.m3u8', '.mp4', '.m4v', '.webm', '.mkv', '.mov', '.mp3', '.m4a', '.wav', '.flac'];
    const cleanUrlLower = addUrl.split('?')[0].toLowerCase();
    if (directMediaExts.some(ext => cleanUrlLower.endsWith(ext))) {
      setShowAddModal(false);
      setFormatsSource('add_modal');
      fetchFormats(addUrl);
      return;
    }

    setShowAddModal(false);

    // Normal download
    await electron.ipcRenderer.invoke('add-download', {
      url: addUrl,
      filename: addFilename,
      saveDir: addSaveDir || appSettings.downloadDir,
      startImmediately,
      isYoutube: isExtractor,
      headers: interceptedHeaders
    });

    setAddUrl('');
    setAddFilename('');
    setInterceptedHeaders({});
    setActiveTab('downloads');
  };

  const handleBrowseDir = async () => {
    if (!electron) return;
    const dir = await electron.ipcRenderer.invoke('select-directory');
    if (dir) {
      setAddSaveDir(dir);
    }
  };

  const handleSettingsBrowseDir = async () => {
    if (!electron) return;
    const dir = await electron.ipcRenderer.invoke('select-directory');
    if (dir) {
      const nextSettings = { ...appSettings, downloadDir: dir };
      setAppSettings(nextSettings);
      await electron.ipcRenderer.invoke('save-settings', nextSettings);
    }
  };

  const updateSetting = async (key: keyof AppSettings, value: any) => {
    const nextSettings = { ...appSettings, [key]: value };
    setAppSettings(nextSettings);
    if (electron) {
      await electron.ipcRenderer.invoke('save-settings', nextSettings);
    }
  };

  const handleRegisterBrowserIntegration = async () => {
    if (!electron) return;
    const res = await electron.ipcRenderer.invoke('install-browser-integration');
    if (res.success) {
      alert('Browser integration registered successfully! You can now load the extension in Chrome.');
    } else {
      alert('Failed to register integration: ' + res.error);
    }
  };

  const handleConfirmPlaylist = async (items: { url: string; title: string; duration?: number }[], _options: { compress: boolean }) => {
    if (!electron) return;
    setShowPlaylistModal(false);

    // Add all playlist videos in queued state (sequential download)
    for (const item of items) {
      const sanitizedTitle = item.title.replace(/[\\/:*?"<>|]/g, '_');
      await electron.ipcRenderer.invoke('add-download', {
        url: item.url,
        filename: `${sanitizedTitle}_720p.mp4`,
        saveDir: appSettings.downloadDir,
        startImmediately: false, // Queue them
        isYoutube: true,
        duration: item.duration || 0
      });
    }
    setPlaylistInfo(null);
    setActiveTab('downloads');
  };

  const pauseDownload = (id: string) => {
    if (electron) electron.ipcRenderer.invoke('pause-download', id);
  };

  const resumeDownload = (id: string) => {
    if (electron) electron.ipcRenderer.invoke('resume-download', id);
  };

  const deleteDownload = (id: string, deleteFile = false) => {
    const task = downloads.find(t => t.id === id);
    const filename = task ? task.filename : 'this download';
    setDeleteConfirmTarget({
      type: 'download',
      title: 'Remove Download History',
      message: `Are you sure you want to remove "${filename}" from download history?`,
      taskId: id,
      showDeleteFileOption: deleteFile || (task && task.status === 'completed'),
      onConfirm: async (deleteFileFromDisk) => {
        if (electron) {
          const list = await electron.ipcRenderer.invoke('delete-download', { taskId: id, deleteFile: deleteFileFromDisk });
          setDownloads(list);
          if (selectedTaskId === id) setSelectedTaskId(null);
          syncLibrary();
        }
      }
    });
  };

  const openFile = (task: Task) => {
    if (electron) electron.ipcRenderer.invoke('open-file', { saveDir: task.saveDir, filename: task.filename });
  };

  const openFolder = (task: Task) => {
    if (electron) electron.ipcRenderer.invoke('open-folder', task.saveDir);
  };

  useEffect(() => {
    if (binariesInstalled) {
      syncLibrary();
    }
  }, [binariesInstalled, appSettings.downloadDir]);

  // When selectedTaskId changes, auto-switch to details tab in right panel
  useEffect(() => {
    if (selectedTaskId) {
      setRightPanelTab('details');
    }
  }, [selectedTaskId]);

  // Helper formatting functions
  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec <= 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatEta = (seconds: number) => {
    if (seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [
      h > 0 ? h : null,
      m < 10 ? '0' + m : m,
      s < 10 ? '0' + s : s
    ].filter(x => x !== null).join(':');
  };

  const getPercentage = (task: Task) => {
    if (task.isYoutube || (task as any).useYtDlp || task.displayProgress !== undefined) {
      return task.displayProgress !== undefined ? task.displayProgress : 0;
    }
    if (task.totalBytes <= 0) return 0;
    const raw = Math.round((task.downloadedBytes / task.totalBytes) * 100);
    // Cap at 99% while the file is still being assembled (merging/compressing)
    if ((task.status === 'merging' || task.status === 'compressing') && raw >= 100) return 99;
    return raw;
  };

  // Active download count for smart filtering (excluding archived items)
  const activeDownloadCount = downloads.filter(t => {
    const fullPath = t.saveDir ? `${t.saveDir}\\${t.filename}` : t.filename;
    return !isItemArchived(fullPath) &&
      ['downloading', 'merging', 'preparing', 'compressing'].includes(t.status);
  }).length;

  // Filter downloads: when >10 active, show only active ones; otherwise show all matching search (excluding archived items)
  const filteredDownloads = downloads.filter(t => {
    const fullPath = t.saveDir ? `${t.saveDir}\\${t.filename}` : t.filename;
    if (isItemArchived(fullPath)) return false;
    const matchesSearch = t.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.url.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeDownloadCount > 10) {
      return matchesSearch && ['downloading', 'merging', 'preparing', 'compressing'].includes(t.status);
    }
    return matchesSearch;
  });

  const selectedTask = downloads.find(t => t.id === selectedTaskId);

  // First run binary downloader screen
  if (!binariesInstalled) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundImage: `linear-gradient(rgba(7, 7, 10, 0.75), rgba(7, 7, 10, 0.75)), url(${playerBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}>
        <div className="titlebar">
          <div className="titlebar-logo" style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.1, WebkitAppRegion: 'drag' } as any}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '13px' }}>
              <img 
                src="favicon.svg" 
                style={{ width: '16px', height: '16px', objectFit: 'contain' }} 
                alt="" 
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'player.ico'; }}
              /> Panamedia
            </div>
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 'normal', paddingLeft: '22px' }}>All in One media manager</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel setup-panel">
            <div className="setup-title">System Initialization</div>
            <div className="setup-desc">
              To support fast YouTube playlist downloading and H.265/HEVC video compression, we need to configure <strong>yt-dlp.exe</strong> and <strong>ffmpeg.exe</strong>. Click below to download these static binaries automatically.
            </div>

            {!installingBinaries ? (
              <button className="btn-primary" onClick={handleInstallBinaries} style={{ padding: '12px 28px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
                <Download size={16} /> Configure Runtimes
              </button>
            ) : (
              <div className="setup-progress-container">
                {installProgress.error ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontWeight: 'bold', fontSize: '14px' }}>
                      <AlertCircle size={18} /> Setup Failed
                    </div>
                    <div style={{ fontSize: '12px', color: '#ff8888', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px 14px', borderRadius: '10px', width: '100%', maxWidth: '400px', wordBreak: 'break-all' }}>
                      {getFriendlyErrorMessage(installProgress.error)}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <button className="btn-primary" onClick={handleResumeBinaries} style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Play size={12} /> Retry / Resume
                      </button>
                      <button className="titlebar-btn" onClick={handleCancelInstall} style={{ padding: '8px 16px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', height: 'auto', width: 'auto' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span className="setup-status">
                        {installProgress.isPaused ? 'Paused' : (installProgress.status.replace('_', ' ') + '...')}
                      </span>
                      <span>{Math.round(installProgress.progress)}% of 100%</span>
                    </div>
                    <div className="progress-bar-bg" style={{ height: '8px' }}>
                      <div className="progress-bar-fill" style={{ width: `${installProgress.progress}%` }}></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {!installProgress.isPaused ? (
                          <>
                            <Loader2 size={12} className="animate-spin" /> This may take a moment depending on your bandwidth
                          </>
                        ) : (
                          <>
                            <Pause size={12} /> Download paused
                          </>
                        )}
                      </div>
                      
                      {!installProgress.isPaused ? (
                        <button onClick={handlePauseBinaries} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Pause size={10} /> Pause
                        </button>
                      ) : (
                        <button onClick={handleResumeBinaries} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Play size={10} /> Resume
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          const file = files[0];
          const filePath = (file as any).path;
          if (filePath) {
            electron?.ipcRenderer.invoke('open-player-window', { filePath, filename: file.name });
          }
        }
      }}
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundImage: `linear-gradient(rgba(7, 7, 10, 0.65), rgba(7, 7, 10, 0.65)), url(${playerBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >

      {/* Title Bar (Frameless window draggable) */}
      <div className="titlebar">
        <div className="titlebar-logo" style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.1, WebkitAppRegion: 'drag' } as any}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '13px' }}>
            <img 
              src="favicon.svg" 
              style={{ width: '16px', height: '16px', objectFit: 'contain', filter: 'drop-shadow(0 0 4px var(--primary))' }} 
              alt="" 
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'player.ico'; }}
            /> Panamedia
          </div>
          <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 'normal', paddingLeft: '22px' }}>All in One media manager</span>
        </div>
        
        {/* Help Center and New Release Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px', marginLeft: 'auto', WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => {
              setActiveTab('help' as any);
              setHelpSubTab('guide');
            }}
            className="btn-secondary"
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '600',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === ('help' as any) ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              borderColor: activeTab === ('help' as any) ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
              color: '#fff',
              cursor: 'pointer',
              height: '24px',
              boxSizing: 'border-box'
            }}
          >
            <HelpCircle size={11} />
            Help Center
          </button>
          <button
            onClick={() => {
              if (releaseCheckStatus === 'download-complete') {
                installUpdate();
              } else if (releaseCheckStatus === 'update-available' || releaseCheckStatus === 'downloading') {
                setShowReleaseDialog(true);
              } else {
                checkReleaseUpdate(true);
              }
            }}
            className="btn-primary"
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '700',
              borderRadius: '6px',
              background: releaseCheckStatus === 'update-available' || releaseCheckStatus === 'downloading'
                ? 'linear-gradient(135deg, #a855f7, #6366f1)'
                : releaseCheckStatus === 'download-complete'
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : releaseCheckStatus === 'checking'
                    ? 'linear-gradient(135deg, #059669, #10b981)'
                    : '#10b981',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              height: '24px',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: releaseCheckStatus === 'update-available' || releaseCheckStatus === 'downloading'
                ? '0 0 12px rgba(168, 85, 247, 0.4)'
                : releaseCheckStatus === 'download-complete'
                  ? '0 0 12px rgba(16, 185, 129, 0.4)'
                  : releaseCheckStatus === 'checking'
                    ? '0 0 12px rgba(16, 185, 129, 0.45)'
                    : '0 0 10px rgba(16, 185, 129, 0.3)'
            }}
            title={
              releaseCheckStatus === 'checking'
                ? 'Checking for new releases...'
                : releaseCheckStatus === 'update-available'
                  ? `Update v${latestReleaseVersion} available!`
                  : releaseCheckStatus === 'download-complete'
                    ? 'Update ready to install'
                    : 'Check for new releases'
            }
          >
            {releaseCheckStatus === 'checking' ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Checking updates...
              </>
            ) : releaseCheckStatus === 'installing' ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Installing...
              </>
            ) : releaseCheckStatus === 'downloading' ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Downloading...
              </>
            ) : releaseCheckStatus === 'update-available' ? (
              <>
                <CloudDownload size={11} />
                Update v{latestReleaseVersion}
              </>
            ) : releaseCheckStatus === 'download-complete' ? (
              <>
                <CheckCircle2 size={11} />
                Install Update
              </>
            ) : (
              <>
                <CheckCircle2 size={11} />
                New Release
              </>
            )}
          </button>
        </div>
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={() => electron?.ipcRenderer.send('window-minimize')}>
            <svg viewBox="0 0 10 1" width="10" height="1"><line x1="0" y1="0" x2="10" y2="0" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
          <button className="titlebar-btn" onClick={() => electron?.ipcRenderer.send('window-maximize')}>
            <svg viewBox="0 0 10 10" width="10" height="10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <button className="titlebar-btn close" onClick={() => electron?.ipcRenderer.send('window-close')}>
            <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1,1 L9,9 M9,1 L1,9" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="app-container" onDragOver={handleAppDragOver} onDrop={handleAppDrop}>

        {/* Sidebar Nav */}
        <div className="sidebar">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            {(() => {
              const activeCount = downloads.filter(t =>
                ['downloading', 'merging', 'preparing', 'compressing'].includes(t.status)
              ).length;
              const queuedCount = downloads.filter(t => t.status === 'queued').length;
              return (
                <>
                  <div
                    className={`sidebar-item ${activeTab === 'downloads' ? 'active' : ''}`}
                    onClick={() => setActiveTab('downloads')}
                    style={{ position: 'relative' }}
                  >
                    <LayoutDashboard /> Dashboard
                    <span style={{
                      marginLeft: 'auto',
                      background: activeCount > 0
                        ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                        : 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontSize: '9px',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      minWidth: '18px',
                      textAlign: 'center',
                      animation: activeCount > 0 ? 'pulse 1.5s ease-in-out infinite' : 'none',
                      boxShadow: activeCount > 0 ? '0 0 8px rgba(245,158,11,0.5)' : 'none',
                      transition: 'all 0.3s'
                    }}>
                      {activeCount}
                    </span>
                  </div>
                  <div
                    className={`sidebar-item ${activeTab === 'queues' ? 'active' : ''}`}
                    onClick={() => setActiveTab('queues')}
                  >
                    <PlayCircle /> Queue Manager
                    {queuedCount > 0 && (
                      <span style={{
                        marginLeft: 'auto',
                        background: 'rgba(99,102,241,0.2)',
                        color: 'var(--primary)',
                        fontSize: '9px',
                        fontWeight: '700',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        border: '1px solid rgba(99,102,241,0.3)'
                      }}>
                        {activeCount}/{activeCount + queuedCount}
                      </span>
                    )}
                  </div>
                </>
              );
            })()}

            <div
              className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings /> Settings
            </div>
            {/* Hiding Browser Integration as requested */}
            {/*
            <div
              className={`sidebar-item ${activeTab === 'integration' ? 'active' : ''}`}
              onClick={() => setActiveTab('integration')}
            >
              <Globe /> Browser Integration
            </div>
            */}
            <div
              className={`sidebar-item ${activeTab === 'browser' ? 'active' : ''}`}
              onClick={() => setActiveTab('browser')}
            >
              <Download /> Download
            </div>
          </div>

          {/* Live Network Speed Widget — always visible in sidebar footer */}
          <div className="glass-panel" style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(10, 10, 16, 0.6)',
            border: '1px solid rgba(99,102,241,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Internet Speed</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} style={{ color: netSpeed > 100 * 1024 ? '#22c55e' : netSpeed > 0 ? '#f59e0b' : 'var(--text-dark)', flexShrink: 0 }} />
              <span style={{
                fontSize: '15px',
                fontWeight: 'bold',
                fontFamily: 'var(--font-title)',
                color: netSpeed > 100 * 1024 ? '#22c55e' : netSpeed > 0 ? '#f59e0b' : 'var(--text-muted)'
              }}>
                {netSpeed > 0 ? formatSpeed(netSpeed) : '— B/s'}
              </span>
            </div>
            {downloads.some(t => t.status === 'downloading') && (
              <div style={{ fontSize: '9px', color: 'var(--primary)', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }} />
                Downloading {downloads.filter(t => t.status === 'downloading').length} file(s)
              </div>
            )}
          </div>

          {/* Mini-Player Widget (shown when player is minimized to sidebar) */}
          {miniPlayerState && miniPlayerState.minimized && (
            <div
              onMouseEnter={() => setMiniPlayerHovered(true)}
              onMouseLeave={() => setMiniPlayerHovered(false)}
              style={{
                position: 'relative',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(15, 15, 22, 0.6)',
                backdropFilter: 'blur(16px)',
                overflow: 'hidden',
                cursor: 'default',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: miniPlayerHovered ? '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(99, 102, 241, 0.2)' : '0 4px 12px rgba(0,0,0,0.3)',
                transform: miniPlayerHovered ? 'translateY(-2px)' : 'none'
              }}
            >
              {/* Media Preview Container (Clickable to Restore) */}
              <div
                onClick={() => electron?.ipcRenderer.invoke('player-restore')}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '110px',
                  background: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'pointer'
                }}
                title="Click to restore player window"
              >
                {(() => {
                  const isMiniAudioFile = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'opus', 'wma'].some(ext => miniPlayerState.filename?.toLowerCase().endsWith(ext));
                  // Try to find a thumbnail from the downloads list
                  const miniMatchedTask = downloads.find(t =>
                    t.filename === miniPlayerState.filename ||
                    (miniPlayerState.filePath && miniPlayerState.filePath.endsWith(t.filename))
                  );
                  const miniThumb = miniMatchedTask?.thumbnail ||
                    (miniPlayerState.filePath
                      ? `http://localhost:${streamingPort}/thumbnail?path=${encodeURIComponent(miniPlayerState.filePath)}`
                      : null);

                  const displayMiniThumb = (!miniThumbError && miniThumb) ? miniThumb : playerBg;

                  if (isMiniAudioFile) {
                    return (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        {/* Hidden image to track thumbnail load errors */}
                        {miniThumb && !miniThumbError && (
                          <img
                            src={miniThumb}
                            alt=""
                            style={{ display: 'none' }}
                            onError={() => setMiniThumbError(true)}
                          />
                        )}
                        {/* Blurred background art */}
                        {displayMiniThumb && (
                          <img
                            src={displayMiniThumb}
                            alt=""
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              filter: 'blur(16px) brightness(0.25) saturate(1.6)',
                              opacity: 0.9
                            }}
                          />
                        )}
                        {/* Spinning vinyl disc with cover art */}
                        <div
                          className={miniPlayerState.playing ? 'spinning' : 'spinning spinning-paused'}
                          style={{
                            position: 'relative',
                            width: '72px',
                            height: '72px',
                            borderRadius: '50%',
                            border: '3px solid rgba(255,255,255,0.12)',
                            background: `url("${displayMiniThumb}") center/cover no-repeat`,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.7), 0 0 16px rgba(168, 85, 247, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2
                          }}
                        >
                          {/* Center hole */}
                          <div style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: 'rgba(9, 9, 14, 0.92)',
                            border: '2px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {displayMiniThumb === playerBg && <Music size={8} style={{ color: 'rgba(255,255,255,0.6)' }} />}
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <video
                        ref={miniVideoRef}
                        src={`http://localhost:${streamingPort}/stream?path=${encodeURIComponent(miniPlayerState.filePath)}`}
                        muted
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    );
                  }
                })()}

              </div>

              {/* Title & Status row + Interactive Controls - ALWAYS visible */}
              <div style={{ padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flex: 1, marginRight: '6px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--primary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {miniPlayerState.playing ? '▶ Now Playing' : '⏸ Paused'}
                    </span>
                    <span style={{ fontSize: '10px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' }} title={miniPlayerState.filename}>
                      {miniPlayerState.filename}
                    </span>
                  </div>
                  {/* Close button only */}
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.send('player-control-close'); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255,255,255,0.6)',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Close Player"
                  >
                    <Trash2 size={11} style={{ color: 'var(--danger)' }} />
                  </button>
                </div>

                {/* Always-visible Mini Controls: 5 compact buttons fitting 100% of width */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '3px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: '6px',
                  width: '100%',
                  boxSizing: 'border-box'
                }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.send('player-remote-command', 'prev'); }}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
                    title="Previous"
                  >
                    <SkipBack size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.send('player-remote-command', 'toggle-play'); }}
                    style={{ background: 'var(--primary)', border: 'none', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
                    title={miniPlayerState.playing ? 'Pause' : 'Play'}
                  >
                    {miniPlayerState.playing ? <Pause size={10} /> : <Play size={10} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.send('player-remote-command', 'next'); }}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
                    title="Next"
                  >
                    <SkipForward size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.send('player-remote-command', 'mute'); }}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
                    title={miniPlayerState.volume === 0 ? 'Unmute' : 'Mute'}
                  >
                    {miniPlayerState.volume === 0 ? <VolumeX size={10} style={{ color: 'var(--danger)' }} /> : <Volume2 size={10} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); electron?.ipcRenderer.invoke('player-restore'); }}
                    style={{ background: 'rgba(99, 102, 241, 0.25)', border: '1px solid rgba(99, 102, 241, 0.4)', borderRadius: '4px', height: '22px', minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a5b4fc', padding: 0 }}
                    title="Restore Full Player"
                  >
                    <Maximize2 size={10} />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {miniPlayerState.duration > 0 && (
                <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    width: `${(miniPlayerState.currentTime / miniPlayerState.duration) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--primary), #a855f7)',
                    transition: 'width 0.1s linear'
                  }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab Workspaces */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Workspaces list */}

          {/* Downloads Tab */}
          {activeTab === 'downloads' && (
            <div className="dashboard-grid" style={{ width: '100%', display: 'flex', height: '100%', overflow: 'hidden' }}>

              {/* Central List */}
              <div className="main-content">
                {(libraryCategory as string) === 'duplicates' ? (
                  <DuplicatesPanel
                    libraryFiles={libraryFiles}
                    duplicateDeletePaths={duplicateDeletePaths}
                    toggleDuplicateDelete={toggleDuplicateDelete}
                    handleResolveDuplicates={handleResolveDuplicates}
                    onClose={() => setLibraryCategory('recent')}
                  />
                ) : (
                  <>
                    <div className="main-header">
                      <div className="main-title-container">
                        <h1>Active Downloads</h1>
                        <p>{downloads.length} files total ({downloads.filter(t => t.status === 'downloading').length} running)</p>
                      </div>
                      {/* Hiding the add URL button as requested */}
                    </div>

                {/* Filter and controls toolbar */}
                <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '280px', position: 'relative' }}>
                    <Search size={14} style={{ color: 'var(--text-muted)', position: 'absolute', left: '10px' }} />
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: '8px',
                        padding: '6px 12px 6px 30px',
                        fontSize: '12px',
                        width: '100%',
                        color: '#fff',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {selectedDownloadIds.length > 0 && (
                      <div className="glass-panel" style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 10px', borderRadius: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '11px', flexShrink: 0 }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>{selectedDownloadIds.length} selected:</span>
                        <button className="btn-secondary" style={{ padding: '2px 6px', fontSize: '10px', height: '24px' }} onClick={handleBulkPause}>Pause</button>
                        <button className="btn-primary" style={{ padding: '2px 6px', fontSize: '10px', height: '24px', background: 'var(--primary)' }} onClick={handleBulkResume}>Resume</button>
                        <button className="btn-secondary" style={{ padding: '2px 6px', fontSize: '10px', height: '24px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }} onClick={handleBulkDelete}>Delete</button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px' }}
                        onClick={() => downloads.forEach(t => t.status === 'paused' && resumeDownload(t.id))}
                      >
                        Resume All
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px' }}
                        onClick={() => downloads.forEach(t => t.status === 'downloading' && pauseDownload(t.id))}
                      >
                        Pause All
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px', borderColor: 'rgba(255,255,255,0.06)' }}
                        onClick={() => setShowClearHistoryModal(true)}
                        title="Clear records from download history"
                      >
                        Clear History
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table list */}
                <div ref={setDownloadsTableRef} className="glass-panel downloads-table-container">
                  {filteredDownloads.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: 'var(--text-muted)' }}>
                      <Download size={32} strokeWidth={1.5} />
                      <div style={{ fontSize: '14px' }}>No downloads to display</div>
                    </div>
                  ) : (
                    <table className="downloads-table">
                      <thead>
                        <tr>
                          <th style={{ width: '36px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={filteredDownloads.length > 0 && selectedDownloadIds.length === filteredDownloads.length}
                              onChange={() => handleToggleSelectAll(filteredDownloads)}
                              style={{ cursor: 'pointer' }}
                            />
                          </th>
                          <th style={{ minWidth: '220px' }}>Filename</th>
                          <th style={{ width: '80px' }}>Format</th>
                          <th style={{ width: '100px' }}>Size</th>
                          <th style={{ width: '180px' }}>Progress</th>
                          <th style={{ width: '110px' }}>Speed</th>
                          <th style={{ width: '90px' }}>Duration</th>
                          <th style={{ width: '100px' }}>Status</th>
                          <th style={{ textAlign: 'center', width: '100px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDownloads.map(task => {
                          const percentage = getPercentage(task);
                          const isSelected = selectedTaskId === task.id;
                          const isRowChecked = selectedDownloadIds.includes(task.id);

                          return (
                            <tr
                              key={task.id}
                              onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                              style={{
                                cursor: 'pointer',
                                background: isRowChecked ? 'rgba(99, 102, 241, 0.04)' : (isSelected ? 'rgba(255, 255, 255, 0.02)' : 'transparent'),
                                borderLeft: isSelected ? '3px solid var(--primary)' : 'none'
                              }}
                            >
                              <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isRowChecked}
                                  onChange={() => handleToggleSelect(task.id)}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {task.thumbnail && !task.thumbnail.toLowerCase().includes('.gif') && !task.thumbnail.toLowerCase().includes('data:image/gif') && !task.thumbnail.toLowerCase().includes('banner') && !task.thumbnail.toLowerCase().includes('sponsor') && !task.thumbnail.toLowerCase().includes('promo') && !task.thumbnail.toLowerCase().includes('exclusive') && !task.thumbnail.toLowerCase().includes('advert') ? (
                                    <img
                                      src={task.thumbnail}
                                      alt="thumb"
                                      style={{ width: '42px', height: '24px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.06)' }}
                                    />
                                  ) : (
                                    <div style={{ width: '42px', height: '24px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
                                      <Globe size={12} style={{ color: 'var(--text-dark)' }} />
                                    </div>
                                  )}
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {task.filename || (task.isYoutube ? 'Resolving YouTube Video...' : 'Fetching metadata...')}
                                  </span>
                                </div>
                              </td>
                              <td>
                                {(() => {
                                  const ext = task.filename.split('.').pop()?.toUpperCase();
                                  const displayExt = ext && ext.length <= 4 && ext !== 'PARTS' ? ext : (task.isYoutube ? 'MP4' : 'URL');

                                  let badgeColor = 'rgba(255, 255, 255, 0.08)';
                                  let textColor = '#fff';
                                  if (['MP4', 'MKV', 'WEBM', 'AVI', 'MOV'].includes(displayExt)) {
                                    badgeColor = 'rgba(129, 140, 248, 0.15)';
                                    textColor = '#818cf8';
                                  } else if (['MP3', 'M4A', 'WAV', 'FLAC'].includes(displayExt)) {
                                    badgeColor = 'rgba(236, 72, 153, 0.15)';
                                    textColor = '#ec4899';
                                  } else if (['PDF', 'DOCX', 'TXT', 'ZIP', 'RAR'].includes(displayExt)) {
                                    badgeColor = 'rgba(59, 130, 246, 0.15)';
                                    textColor = '#3b82f6';
                                  }

                                  return (
                                    <span style={{
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      background: badgeColor,
                                      color: textColor,
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      border: `1px solid ${badgeColor}`
                                    }}>
                                      {displayExt}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td>
                                {task.status === 'completed'
                                  ? (task.totalBytes > 0 ? formatBytes(task.totalBytes) : '—')
                                  : (task.totalBytes > 0
                                    ? <><span style={{ color: 'var(--primary)', fontWeight: '600' }}>{formatBytes(task.downloadedBytes)}</span><span style={{ color: 'var(--text-muted)', fontSize: '10px' }}> / {formatBytes(task.totalBytes)}</span></>
                                    : (task.isYoutube && task.displaySize ? task.displaySize : '—'))
                                }
                              </td>
                              <td style={{ width: '160px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', fontSize: '11px' }}>
                                    <span>{percentage}%</span>
                                    <span>{task.isYoutube ? '' : formatBytes(task.downloadedBytes)}</span>
                                  </div>
                                  <div className="progress-bar-bg">
                                    <div
                                      className={`progress-bar-fill ${task.status}`}
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ fontFamily: 'var(--font-title)' }}>
                                {task.isYoutube && task.displaySpeed ? task.displaySpeed : (task.status === 'downloading' ? formatSpeed(task.speed) : '—')}
                              </td>
                              <td>
                                {task.duration && task.duration > 0
                                  ? (() => {
                                    const m = Math.floor(task.duration / 60);
                                    const s = Math.floor(task.duration % 60);
                                    return `${m}:${s < 10 ? '0' : ''}${s}`;
                                  })()
                                  : (task.isYoutube && task.displayEta ? task.displayEta : (task.status === 'downloading' ? formatEta(task.eta) : '—'))
                                }
                              </td>
                              <td>
                                <span className={`status-badge-gui ${task.status}`}>
                                  {task.status}
                                </span>
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                  {task.status === 'downloading' || task.status === 'preparing' ? (
                                    <button
                                      className="btn-secondary"
                                      style={{ padding: '4px 6px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                      title="Pause"
                                      onClick={() => pauseDownload(task.id)}
                                    >
                                      <Pause size={11} />
                                    </button>
                                  ) : task.status === 'completed' ? (
                                    <button
                                      className="btn-primary"
                                      style={{ padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#22c55e' }}
                                      title="Play Media"
                                      onClick={() => {
                                        const filePath = task.saveDir + '/' + task.filename;
                                        electron?.ipcRenderer.invoke('open-player-window', { filePath, filename: task.filename });
                                      }}
                                    >
                                      <Play size={11} fill="currentColor" />
                                    </button>
                                  ) : task.status !== 'merging' && task.status !== 'compressing' ? (
                                    <button
                                      className="btn-primary"
                                      style={{ padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--primary)' }}
                                      title="Resume"
                                      onClick={() => resumeDownload(task.id)}
                                    >
                                      <Play size={11} fill="currentColor" />
                                    </button>
                                  ) : null}
                                  <button
                                    className="btn-secondary"
                                    style={{ padding: '4px 6px', borderRadius: '6px', border: 'none', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer' }}
                                    title="Delete"
                                    onClick={() => deleteDownload(task.id, false)}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>

              {/* Right Panel Drawer: Details & Media Library */}
              {(libraryCategory as string) !== 'duplicates' && (
                <div className="detail-drawer" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '330px', flexShrink: 0, borderLeft: '1px solid var(--panel-border)', background: 'rgba(10, 10, 16, 0.5)', padding: '16px', minHeight: 0 }}>
                  {/* Header Switcher */}
                  <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => setRightPanelTab('details')}
                    disabled={!selectedTask}
                    className={`btn-secondary ${rightPanelTab === 'details' ? 'active' : ''}`}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      fontSize: '11px',
                      borderRadius: '8px',
                      opacity: selectedTask ? 1 : 0.4,
                      background: rightPanelTab === 'details' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                      borderColor: rightPanelTab === 'details' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    Active Details
                  </button>
                  <button
                    onClick={() => setRightPanelTab('library')}
                    className={`btn-secondary ${rightPanelTab === 'library' ? 'active' : ''}`}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      fontSize: '11px',
                      borderRadius: '8px',
                      background: rightPanelTab === 'library' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                      borderColor: rightPanelTab === 'library' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    Media Library
                  </button>
                </div>

                {/* DETAILS TAB CONTENT */}
                {rightPanelTab === 'details' && selectedTask ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, overflowY: 'auto', marginTop: '14px', paddingRight: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 'bold' }}>Download Details</h3>
                      <button className="modal-close-btn" style={{ fontSize: '12px' }} onClick={() => setSelectedTaskId(null)}>✕</button>
                    </div>

                    <div className="detail-row">
                      <div className="detail-label">File Name</div>
                      <div className="detail-value" style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', wordBreak: 'break-all' }}>{selectedTask.filename}</div>
                    </div>

                    <div className="detail-row">
                      <div className="detail-label">Source URL</div>
                      <div className="detail-value" style={{ fontSize: '10px', color: 'var(--primary)', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedTask.url}>{selectedTask.url}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="detail-row">
                        <div className="detail-label">Status</div>
                        <div className="detail-value">
                          <span className={`status-badge-gui ${selectedTask.status}`} style={{ marginTop: '4px' }}>
                            {selectedTask.status}
                          </span>
                        </div>
                      </div>
                      <div className="detail-row">
                        <div className="detail-label">Size</div>
                        <div className="detail-value">{selectedTask.isYoutube && selectedTask.displaySize ? selectedTask.displaySize : (selectedTask.totalBytes > 0 ? formatBytes(selectedTask.totalBytes) : 'Unknown')}</div>
                      </div>
                    </div>

                    <div className="detail-row">
                      <div className="detail-label">Save Directory</div>
                      <div className="detail-value" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{selectedTask.saveDir}</div>
                    </div>

                    {/* Actions Bar inside Drawer */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {selectedTask.status === 'downloading' || selectedTask.status === 'preparing' ? (
                        <button className="btn-secondary" style={{ flex: 1, padding: '8px 0', fontSize: '12px', justifyContent: 'center' }} onClick={() => pauseDownload(selectedTask.id)}>
                          <Pause size={14} /> Pause
                        </button>
                      ) : selectedTask.status !== 'completed' && selectedTask.status !== 'merging' && selectedTask.status !== 'compressing' ? (
                        <button className="btn-primary" style={{ flex: 1, padding: '8px 0', fontSize: '12px', justifyContent: 'center' }} onClick={() => resumeDownload(selectedTask.id)}>
                          <Play size={14} /> Resume
                        </button>
                      ) : null}

                      {selectedTask.status === 'completed' && (
                        <>
                          {!['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm4v', 'mpg', 'mpeg', 'mp3', 'm4a', 'flac', 'wav'].includes(selectedTask.filename.split('.').pop()?.toLowerCase() || '') ? (
                            <button className="btn-primary" style={{ flex: 1, padding: '8px 0', fontSize: '12px', justifyContent: 'center' }} onClick={() => openFile(selectedTask)}>
                              <ExternalLink size={14} /> Open
                            </button>
                          ) : null}
                          <button 
                            className="btn-secondary" 
                            style={{ 
                              padding: '8px 12px', 
                              flex: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm4v', 'mpg', 'mpeg', 'mp3', 'm4a', 'flac', 'wav'].includes(selectedTask.filename.split('.').pop()?.toLowerCase() || '') ? 1 : undefined,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }} 
                            onClick={() => openFolder(selectedTask)}
                            title="Open in File Explorer"
                          >
                            <Folder size={14} /> Open Folder
                          </button>
                        </>
                      )}

                      <button
                        className="btn-secondary"
                        style={{ padding: '8px 12px', borderColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)' }}
                        onClick={() => deleteDownload(selectedTask.id, selectedTask.status === 'completed')}
                        title="Delete Download"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {selectedTask.error && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '10px', display: 'flex', gap: '8px', color: '#f87171', fontSize: '12px' }}>
                        <AlertCircle size={16} style={{ flexShrink: 0 }} />
                        <div>{selectedTask.error}</div>
                      </div>
                    )}

                    {/* Real-time Graph in Drawer */}
                    {selectedTask.status === 'downloading' && (
                      <SpeedGraph currentSpeed={selectedTask.speed} isActive={true} />
                    )}

                    {/* Segment block progress indicator */}
                    {!selectedTask.isYoutube && selectedTask.status !== 'completed' && (
                      <SegmentVisualizer segments={selectedTask.segments} />
                    )}

                    {selectedTask.status === 'completed' && ['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm4v', 'mpg', 'mpeg', 'mp3', 'm4a', 'flac', 'wav'].includes(selectedTask.filename.split('.').pop()?.toLowerCase() || '') && (
                      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="detail-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <PlayCircle size={12} style={{ color: 'var(--primary)' }} /> Panamedia Player
                        </div>
                        <div
                          onClick={() => {
                            const fullPath = selectedTask.saveDir + (selectedTask.saveDir.endsWith('\\') || selectedTask.saveDir.endsWith('/') ? '' : '\\') + selectedTask.filename;
                            electron?.ipcRenderer.invoke('open-player-window', { filePath: fullPath, filename: selectedTask.filename });
                          }}
                          style={{
                            position: 'relative',
                            width: '100%',
                            height: '145px',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            border: '1px solid var(--panel-border)',
                            background: '#09090e',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 25px rgba(0,0,0,0.5)'
                          }}
                        >
                          <img
                            src={`http://localhost:${streamingPort}/thumbnail?path=${encodeURIComponent(selectedTask.saveDir + '\\' + selectedTask.filename)}`}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              opacity: 0.75
                            }}
                            alt=""
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = playerBg;
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to top, rgba(7, 7, 12, 0.92) 0%, rgba(7, 7, 12, 0.3) 60%, rgba(7, 7, 12, 0.5) 100%)'
                          }} />
                          <div style={{
                            position: 'relative',
                            zIndex: 2,
                            width: '46px',
                            height: '46px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 25px rgba(99, 102, 241, 0.6)'
                          }}>
                            <Play size={20} color="#fff" style={{ marginLeft: '3px' }} />
                          </div>
                          <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '12px',
                            right: '12px',
                            zIndex: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '11px',
                            color: '#fff'
                          }}>
                            <span style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Play in Panamedia
                            </span>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
                              {selectedTask.filename.split('.').pop()?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* LIBRARY TAB CONTENT */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, marginTop: '12px' }}>

                    {/* ── Category icon+text tabs (Primary, Videos, Audios, Docx, Files) ── */}
                    <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.02)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      {([
                        { id: 'recent' as const,  label: 'Primary', icon: <Activity size={11} /> },
                        { id: 'videos' as const,  label: 'Videos',  icon: <Film size={11} /> },
                        { id: 'audios' as const,  label: 'Audios',  icon: <Music size={11} /> },
                        { id: 'docx'  as const,   label: 'Docx',    icon: <FileText size={11} /> },
                        { id: 'files' as const,   label: 'Files',   icon: <Folder size={11} /> },
                      ]).map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setLibraryCategory(tab.id)}
                          style={{
                            flex: 1,
                            padding: '7px 2px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '9px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            background: libraryCategory === tab.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                            color: libraryCategory === tab.id ? '#fff' : 'var(--text-muted)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {tab.icon}
                          <span>{tab.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* ── Find & Remove Duplicates button ── */}
                    {(() => {
                      const dupCount = (() => {
                        const m = new Map<string, number>();
                        libraryFiles.forEach(f => {
                          const key = getNormalizedName(f.name);
                          m.set(key, (m.get(key) || 0) + 1);
                        });
                        return Array.from(m.values()).filter(c => c > 1).reduce((acc, c) => acc + c, 0);
                      })();
                      return (
                        <button
                          onClick={() => setLibraryCategory('duplicates')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: (libraryCategory as string) === 'duplicates'
                              ? '1px solid rgba(239,68,68,0.4)'
                              : '1px solid rgba(239,68,68,0.15)',
                            background: (libraryCategory as string) === 'duplicates'
                              ? 'rgba(239,68,68,0.12)'
                              : 'rgba(239,68,68,0.05)',
                            color: '#f87171',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'all 0.15s',
                          }}
                        >
                          <Copy size={12} />
                          Find {'&'} Remove Duplicates
                          {dupCount > 0 && (
                            <span style={{
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: '9px',
                              fontWeight: 'bold',
                              borderRadius: '10px',
                              padding: '1px 6px',
                              lineHeight: '14px',
                            }}>
                              {dupCount.toLocaleString()}
                            </span>
                          )}
                        </button>
                      );
                    })()}

                    {/* Search and sync controls */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div className="search-bar" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <Search size={12} style={{ color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          placeholder="Search library..."
                          value={librarySearch}
                          onChange={(e) => setLibrarySearch(e.target.value)}
                          style={{ background: 'transparent', border: 'none', fontSize: '11px', color: '#fff', outline: 'none', width: '100%' }}
                        />
                      </div>
                      <button
                        onClick={syncLibrary}
                        disabled={syncingLibrary}
                        className="btn-secondary"
                        style={{ padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)', color: syncingLibrary ? 'var(--primary)' : '#fff' }}
                        title="Sync Downloads folder"
                      >
                        <RefreshCw size={12} className={syncingLibrary ? 'animate-spin' : ''} />
                      </button>
                    </div>

                    {/* Sorting & View Controls (Same row, compact size) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--text-muted)' }}>
                        <span>Sort:</span>
                        <select
                          value={librarySortBy}
                          onChange={(e) => setLibrarySortBy(e.target.value as any)}
                          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '10px', fontWeight: 'bold', outline: 'none', cursor: 'pointer', paddingRight: '2px' }}
                        >
                          <option value="date" style={{ background: '#0f0f16' }}>Date</option>
                          <option value="name" style={{ background: '#0f0f16' }}>Name</option>
                          <option value="size" style={{ background: '#0f0f16' }}>Size</option>
                        </select>
                        <button
                          onClick={() => setLibrarySortOrder(librarySortOrder === 'asc' ? 'desc' : 'asc')}
                          style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', padding: '0 2px' }}
                          title={librarySortOrder === 'asc' ? 'Ascending' : 'Descending'}
                        >
                          {librarySortOrder === 'asc' ? '▲' : '▼'}
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                        <span>View:</span>
                        <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.04)', borderRadius: '5px', padding: '1px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <button
                            onClick={() => setLibraryViewMode('files')}
                            style={{
                              background: libraryViewMode === 'files' ? 'var(--primary)' : 'transparent',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '2px 7px',
                              fontSize: '9.5px',
                              lineHeight: '13px',
                              cursor: 'pointer',
                              fontWeight: libraryViewMode === 'files' ? '600' : 'normal',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Files List
                          </button>
                          <button
                            onClick={() => setLibraryViewMode('folders')}
                            style={{
                              background: libraryViewMode === 'folders' ? 'var(--primary)' : 'transparent',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '2px 7px',
                              fontSize: '9.5px',
                              lineHeight: '13px',
                              cursor: 'pointer',
                              fontWeight: libraryViewMode === 'folders' ? '600' : 'normal',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Folder View
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sync Items List */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>

                      {/* ── Duplicates Tab ── */}
                      {(libraryCategory as string) === 'duplicates' ? (() => {
                        // Build duplicate groups from libraryFiles using normalized name
                        const nameMap = new Map<string, any[]>();
                        libraryFiles.filter(f => !isItemArchived(f.path)).forEach(f => {
                          const normName = getNormalizedName(f.name);
                          if (!nameMap.has(normName)) nameMap.set(normName, []);
                          nameMap.get(normName)!.push(f);
                        });
                        const dupGroups = Array.from(nameMap.entries())
                          .filter(([, files]) => files.length > 1)
                          .sort(([a], [b]) => a.localeCompare(b));

                        if (dupGroups.length === 0) {
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>
                              <Copy size={24} strokeWidth={1.5} />
                              <span style={{ fontSize: '11px' }}>No duplicate filenames found across synced folders.</span>
                            </div>
                          );
                        }

                        return (
                          <>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 2px', marginBottom: '4px' }}>
                              {dupGroups.length} duplicate groups found.
                              <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: '4px' }}>Click a group header to collapse/expand.</span>
                            </div>
                            {dupGroups.map(([normName, files]) => {
                              const sorted = [...files].sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
                              const groupTitle = files[0]?.name || normName;
                              const isExpanded = expandedDupGroups[normName] !== false; // expanded by default
                              const markedInGroup = sorted.filter(f => duplicateDeletePaths.includes(f.path)).length;
                              return (
                                <div key={normName} style={{ borderRadius: '8px', border: `1px solid ${isExpanded ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.1)'}`, background: isExpanded ? 'rgba(239,68,68,0.04)' : 'transparent', overflow: 'hidden', marginBottom: '4px', transition: 'all 0.15s' }}>
                                  {/* Clickable group header */}
                                  <div
                                    onClick={() => setExpandedDupGroups(prev => ({ ...prev, [normName]: !isExpanded }))}
                                    style={{ padding: '7px 10px', background: 'rgba(239,68,68,0.06)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                                  >
                                    <span style={{ fontSize: '9px', color: isExpanded ? '#ef4444' : 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                                    <Copy size={10} style={{ color: '#ef4444', flexShrink: 0 }} />
                                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={groupTitle}>{groupTitle}</span>
                                    {markedInGroup > 0 && <span style={{ fontSize: '9px', color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>🗑 {markedInGroup}</span>}
                                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>{files.length} copies</span>
                                  </div>
                                  {/* Expanded file list */}
                                  {isExpanded && sorted.map((f: any, idx: number) => {
                                    const checked = duplicateDeletePaths.includes(f.path);
                                    const isOldest = idx === 0;
                                    return (
                                      <div key={`${f.path}-${idx}`} style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.04)', background: checked ? 'rgba(239,68,68,0.06)' : 'transparent', transition: 'background 0.15s' }}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleDuplicateDelete(f.path)}
                                          style={{ cursor: 'pointer', accentColor: '#ef4444', flexShrink: 0 }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: '9px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.path}>{f.path}</div>
                                          <div style={{ display: 'flex', gap: '6px', fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginTop: '2px', flexWrap: 'wrap' }}>
                                            <span>{formatBytes(f.size)}</span>
                                            <span>•</span>
                                            <span>{f.mtime ? new Date(f.mtime).toLocaleDateString() : '?'}</span>
                                            {isOldest && <span style={{ color: '#f59e0b', fontWeight: '700' }}>oldest</span>}
                                          </div>
                                        </div>
                                        <span style={{ fontSize: '9px', color: checked ? '#ef4444' : '#4ade80', fontWeight: '700', flexShrink: 0 }}>
                                          {checked ? '✕ Del' : '✓ Keep'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                            {duplicateDeletePaths.length > 0 && (
                              <button
                                onClick={handleResolveDuplicates}
                                style={{ margin: '8px 0', padding: '8px 14px', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', width: '100%' }}
                              >
                                <Trash2 size={12} /> Delete {duplicateDeletePaths.length} marked file{duplicateDeletePaths.length !== 1 ? 's' : ''} from disk
                              </button>
                            )}
                          </>
                        );
                      })() : (
                        <>{/* ── Normal Categories ── */}
                          {(() => {
                            const rawItems = libraryCategory === 'recent'
                              ? downloads
                                .filter(t => {
                                  const fullPath = t.saveDir ? `${t.saveDir}\\${t.filename}` : t.filename;
                                  return t.status === 'completed' && !isItemArchived(fullPath);
                                })
                                .map(t => {
                                  const ext = '.' + (t.filename.split('.').pop() || '').toLowerCase();
                                  return {
                                    name: t.filename,
                                    path: t.saveDir + '\\' + t.filename,
                                    size: t.totalBytes,
                                    displaySize: t.isYoutube && t.displaySize ? t.displaySize : null,
                                    mtime: t.addedAt || Date.now(),
                                    category: 'recent',
                                    ext: ext
                                  };
                                })
                              : libraryFiles.filter(f => {
                                  if (isItemArchived(f.path)) return false;
                                  if (f.category !== libraryCategory) return false;
                                  if (libraryCategory === 'videos' || libraryCategory === 'audios') {
                                    if (appSettings.downloadDir) {
                                      const itemDir = (f.path.substring(0, f.path.lastIndexOf('\\')) || f.path.substring(0, f.path.lastIndexOf('/'))).replace(/[\\/]/g, '/').toLowerCase();
                                      const primaryDir = appSettings.downloadDir.replace(/[\\/]/g, '/').toLowerCase();
                                      if (itemDir === primaryDir) return false;
                                    }
                                  }
                                  return true;
                                });

                            const itemsToDisplay = rawItems;

                            const filteredItems = itemsToDisplay
                              .filter(f => f.name.toLowerCase().includes(librarySearch.toLowerCase()))
                              .sort((a, b) => {
                                let comp = 0;
                                if (librarySortBy === 'name') comp = a.name.localeCompare(b.name);
                                else if (librarySortBy === 'date') comp = (a.mtime || 0) - (b.mtime || 0);
                                else if (librarySortBy === 'size') comp = (a.size || 0) - (b.size || 0);
                                return librarySortOrder === 'asc' ? comp : -comp;
                              });

                            if (filteredItems.length === 0) {
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                  <Folder size={24} strokeWidth={1.5} />
                                  <span style={{ fontSize: '11px' }}>No files found in {libraryCategory} category.</span>
                                </div>
                              );
                            }

                            if (libraryViewMode === 'folders') {
                              // Group filteredItems by parentPath
                              const groups: Record<string, typeof filteredItems> = {};
                              filteredItems.forEach(file => {
                                const parentPath = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/')) || 'Default';
                                if (!groups[parentPath]) {
                                  groups[parentPath] = [];
                                }
                                groups[parentPath].push(file);
                              });

                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {Object.entries(groups).map(([folderPath, files]) => {
                                    const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
                                    const isExpanded = !!expandedFolders[folderPath];
                                    return (
                                      <div key={folderPath} className="glass-panel" style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
                                        {/* Folder Header */}
                                        <div
                                          onClick={() => setExpandedFolders(prev => ({ ...prev, [folderPath]: !isExpanded }))}
                                          style={{
                                            padding: '8px 10px',
                                            background: 'rgba(255,255,255,0.02)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer',
                                            userSelect: 'none'
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                            <Folder size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={folderPath}>{folderName}</span>
                                            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>({files.length})</span>
                                          </div>
                                          <ChevronRight size={12} style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: 'var(--text-muted)' }} />
                                        </div>

                                        {/* Folder Files List */}
                                        {isExpanded && (
                                          <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.15)' }}>
                                            {libraryCategory === 'recent' ? (() => {
                                              const vids = files.filter(f => !['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(f.ext.toLowerCase()));
                                              const auds = files.filter(f => ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(f.ext.toLowerCase()));
                                              const renderSubFile = (file: any, idx2: number) => {
                                                const taskMatch = downloads.find(t => t.filename === file.name);
                                                const thumbUrl = taskMatch?.thumbnail;
                                                const isSelected = file.path === selectedLibraryPath;
                                                return (
                                                  <div
                                                    key={`${file.path}-${idx2}`}
                                                    style={{
                                                      padding: '6px 8px',
                                                      borderRadius: '6px',
                                                      display: 'flex',
                                                      gap: '6px',
                                                      alignItems: 'center',
                                                      background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                                      border: isSelected ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid transparent',
                                                      cursor: 'pointer'
                                                    }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedLibraryPath(file.path);
                                                    }}
                                                    onContextMenu={(e) => handleContextMenu(e, file.path)}
                                                    onDoubleClick={() => {
                                                      if (file.category === 'videos' || file.category === 'audios' || (file.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(file.ext))) {
                                                        electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                                      } else {
                                                        const parentDir = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/'));
                                                        electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: file.name });
                                                      }
                                                    }}
                                                  >
                                                    {(() => {
                                                      const localThumb = `http://localhost:${streamingPort}/thumbnail?path=${encodeURIComponent(file.path)}`;
                                                      const displayThumb = thumbUrl || (['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv'].includes(file.ext.toLowerCase()) ? localThumb : null);
                                                      const hasError = imgErrors[file.path];

                                                      if (displayThumb && !hasError) {
                                                        return (
                                                          <img
                                                            src={displayThumb}
                                                            alt="thumb"
                                                            style={{ width: '36px', height: '22px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}
                                                            onError={() => setImgErrors(prev => ({ ...prev, [file.path]: true }))}
                                                          />
                                                        );
                                                      }

                                                      const isAudioFile = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(file.ext.toLowerCase());
                                                      return (
                                                        <div style={{ width: '36px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.03)', flexShrink: 0 }}>
                                                          {isAudioFile ? <Music size={10} style={{ color: '#ec4899' }} /> : <FileText size={10} style={{ color: '#3b82f6' }} />}
                                                        </div>
                                                      );
                                                    })()}

                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                      <div style={{ fontSize: '10px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</div>
                                                      <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{file.displaySize ? file.displaySize : formatBytes(file.size)}</div>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
                                                      <button
                                                        onClick={() => {
                                                          electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '2px' }}
                                                        title="Play"
                                                      >
                                                        <Play size={10} fill="currentColor" />
                                                      </button>
                                                      <button
                                                        onClick={() => {
                                                          setSelectedFileDetails(file);
                                                          setShowFileDetailsModal(true);
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }}
                                                        title="Details"
                                                      >
                                                        <Info size={10} />
                                                      </button>
                                                      <button
                                                        onClick={() => {
                                                          setDeleteConfirmTarget({
                                                            type: 'file',
                                                            title: 'Delete File from Disk',
                                                            message: `Are you sure you want to permanently delete "${file.name}" from disk?`,
                                                            filePath: file.path,
                                                            onConfirm: async () => {
                                                              const res = await performDeleteFile(file.path);
                                                              if (res && !res.success) {
                                                                alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
                                                              }
                                                            }
                                                          });
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                                                        title="Delete"
                                                      >
                                                        <Trash2 size={10} />
                                                      </button>
                                                    </div>
                                                  </div>
                                                );
                                              };
                                              return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                  {vids.length > 0 && (
                                                    <div>
                                                      <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#a855f7', paddingLeft: '4px', marginBottom: '4px', textTransform: 'uppercase' }}>Videos ({vids.length})</div>
                                                      {vids.map((f, i) => renderSubFile(f, i))}
                                                    </div>
                                                  )}
                                                  {auds.length > 0 && (
                                                    <div>
                                                      <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#ec4899', paddingLeft: '4px', marginBottom: '4px', textTransform: 'uppercase' }}>Mp3 ({auds.length})</div>
                                                      {auds.map((f, i) => renderSubFile(f, i))}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })() : (
                                              files.map((file, idx) => {
                                                const taskMatch = downloads.find(t => t.filename === file.name);
                                                const thumbUrl = taskMatch?.thumbnail;
                                                const isSelected = file.path === selectedLibraryPath;

                                                return (
                                                  <div
                                                    key={`${file.path}-${idx}`}
                                                    style={{
                                                      padding: '6px 8px',
                                                      borderRadius: '6px',
                                                      display: 'flex',
                                                      gap: '6px',
                                                      alignItems: 'center',
                                                      background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                                      border: isSelected ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid transparent',
                                                      cursor: 'pointer'
                                                    }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedLibraryPath(file.path);
                                                    }}
                                                    onContextMenu={(e) => handleContextMenu(e, file.path)}
                                                    onDoubleClick={() => {
                                                      if (file.category === 'videos' || file.category === 'audios' || (file.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(file.ext))) {
                                                        electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                                      } else {
                                                        const parentDir = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/'));
                                                        electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: file.name });
                                                      }
                                                    }}
                                                  >
                                                  {(() => {
                                                    const localThumb = `http://localhost:${streamingPort}/thumbnail?path=${encodeURIComponent(file.path)}`;
                                                    const displayThumb = thumbUrl || ((file.category === 'videos' || file.category === 'audios') ? localThumb : null);
                                                    const hasError = imgErrors[file.path];

                                                    if (displayThumb && !hasError) {
                                                      return (
                                                        <img
                                                          src={displayThumb}
                                                          alt="thumb"
                                                          style={{ width: '36px', height: '22px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}
                                                          onError={() => setImgErrors(prev => ({ ...prev, [file.path]: true }))}
                                                        />
                                                      );
                                                    }

                                                    return (
                                                      <div style={{ width: '36px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.03)', flexShrink: 0 }}>
                                                        {file.category === 'audios' ? <Music size={10} style={{ color: '#ec4899' }} /> : <FileText size={10} style={{ color: '#3b82f6' }} />}
                                                      </div>
                                                    );
                                                  })()}

                                                  <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '10px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>{file.name}</div>
                                                    <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{file.displaySize ? file.displaySize : formatBytes(file.size)}</div>
                                                  </div>

                                                  <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
                                                    {(() => {
                                                      const isStillDownloading = downloads.some(t => (t.filename === file.name || (t.saveDir + '\\' + t.filename) === file.path || (t.saveDir + '/' + t.filename) === file.path) && t.status !== 'completed');
                                                      return (
                                                        <button
                                                          onClick={isStillDownloading ? undefined : () => {
                                                            if (file.category === 'videos' || file.category === 'audios' || (file.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(file.ext))) {
                                                              electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                                            } else {
                                                              const parentDir = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/'));
                                                              electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: file.name });
                                                            }
                                                          }}
                                                          disabled={isStillDownloading}
                                                          style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: isStillDownloading ? 'default' : 'pointer', padding: '2px', opacity: isStillDownloading ? 0.4 : 1 }}
                                                          title={isStillDownloading ? 'Downloading file...' : 'Play'}
                                                        >
                                                          <Play size={10} fill="currentColor" />
                                                        </button>
                                                      );
                                                    })()}
                                                    <button
                                                      onClick={() => {
                                                        setSelectedFileDetails(file);
                                                        setShowFileDetailsModal(true);
                                                      }}
                                                      style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }}
                                                      title="Details"
                                                    >
                                                      <Info size={10} />
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setDeleteConfirmTarget({
                                                          type: 'file',
                                                          title: 'Delete File from Disk',
                                                          message: `Are you sure you want to permanently delete "${file.name}" from disk?`,
                                                          filePath: file.path,
                                                          onConfirm: async () => {
                                                            const res = await performDeleteFile(file.path);
                                                            if (res && !res.success) {
                                                              alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
                                                            }
                                                          }
                                                        });
                                                      }}
                                                      style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                                                      title="Delete"
                                                    >
                                                      <Trash2 size={10} />
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            }))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            } else {
                              return filteredItems.map((file, idx) => {
                                // Find thumbnail from downloads list matching task filename
                                const taskMatch = downloads.find(t => t.filename === file.name);
                                const thumbUrl = taskMatch?.thumbnail;

                                const getFallbackIcon = () => {
                                  if (file.category === 'recent') return <Activity size={14} style={{ color: 'var(--primary)' }} />;
                                  if (file.category === 'videos') return <Film size={14} style={{ color: '#818cf8' }} />;
                                  if (file.category === 'audios') return <Music size={14} style={{ color: '#ec4899' }} />;
                                  if (file.category === 'docx') return <FileText size={14} style={{ color: '#3b82f6' }} />;
                                  return <Folder size={14} style={{ color: '#9ca3af' }} />;
                                };

                                const handlePlayFile = () => {
                                  if (file.category === 'videos' || file.category === 'audios' || (file.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(file.ext))) {
                                    electron?.ipcRenderer.invoke('open-player-window', { filePath: file.path, filename: file.name });
                                  } else {
                                    const parentDir = file.path.substring(0, file.path.lastIndexOf('\\')) || file.path.substring(0, file.path.lastIndexOf('/'));
                                    electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: file.name });
                                  }
                                };

                                const isSelected = file.path === selectedLibraryPath;

                                return (
                                  <div
                                    key={`${file.path}-${idx}`}
                                    className="glass-panel"
                                    style={{
                                      padding: '8px',
                                      borderRadius: '10px',
                                      display: 'flex',
                                      gap: '8px',
                                      alignItems: 'center',
                                      background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255,255,255,0.02)',
                                      border: isSelected ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(255,255,255,0.04)',
                                      position: 'relative',
                                      cursor: 'pointer'
                                    }}
                                    onClick={() => {
                                      setSelectedLibraryPath(file.path);
                                    }}
                                    onDoubleClick={handlePlayFile}
                                    onContextMenu={(e) => handleContextMenu(e, file.path)}
                                  >
                                    {/* Thumbnail or icon */}
                                    {(() => {
                                      const isAdOrGif = (src?: string | null) => {
                                        if (!src || typeof src !== 'string') return true;
                                        const l = src.toLowerCase();
                                        if (l.includes('youtube.com') || l.includes('ytimg.com') || l.includes('googlevideo.com')) {
                                          return false;
                                        }
                                        return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
                                          l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
                                          l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
                                          l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
                                      };
                                      const localThumb = `http://localhost:${streamingPort}/thumbnail?path=${encodeURIComponent(file.path)}`;
                                      const cleanThumb = (thumbUrl && !isAdOrGif(thumbUrl)) ? thumbUrl : null;
                                      const displayThumb = cleanThumb || ((file.category === 'videos' || file.category === 'audios') ? localThumb : null);
                                      const hasError = imgErrors[file.path];

                                      if (displayThumb && !hasError) {
                                        return (
                                          <div style={{ width: '46px', height: '30px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, position: 'relative', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <img
                                              src={displayThumb}
                                              alt="thumb"
                                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                              onError={() => setImgErrors(prev => ({ ...prev, [file.path]: true }))}
                                            />
                                          </div>
                                        );
                                      }

                                      return (
                                        <div style={{ width: '46px', height: '30px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.03)' }}>
                                          {getFallbackIcon()}
                                        </div>
                                      );
                                    })()}

                                    {/* File info */}
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div
                                        style={{ fontSize: '11px', fontWeight: '600', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={file.name}
                                      >
                                        {file.name}
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                        <span>{file.displaySize ? file.displaySize : formatBytes(file.size)}</span>
                                        <span>•</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: 'rgba(255,255,255,0.04)', padding: '1px 4px', borderRadius: '4px', color: '#a855f7' }}>
                                          <Folder size={8} /> {getParentFolderName(file.path)}
                                        </span>
                                        <span>•</span>
                                        <span>{new Date(file.mtime).toLocaleDateString()}</span>
                                        <span>•</span>
                                        <span style={{ textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 'bold' }}>{file.ext.replace('.', '')}</span>
                                      </div>
                                    </div>

                                    {/* Play/Open/Delete Action */}
                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                      {(() => {
                                        const isStillDownloading = downloads.some(t => (t.filename === file.name || (t.saveDir + '\\' + t.filename) === file.path || (t.saveDir + '/' + t.filename) === file.path) && t.status !== 'completed');
                                        return (
                                          <button
                                            onClick={isStillDownloading ? undefined : handlePlayFile}
                                            disabled={isStillDownloading}
                                            className="btn-secondary"
                                            style={{
                                              padding: '4px 6px',
                                              borderRadius: '6px',
                                              border: 'none',
                                              background: (file.category === 'videos' || file.category === 'audios' || file.category === 'recent') ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                                              color: (file.category === 'videos' || file.category === 'audios' || file.category === 'recent') ? 'var(--primary)' : '#fff',
                                              cursor: isStillDownloading ? 'default' : 'pointer',
                                              opacity: isStillDownloading ? 0.4 : 1
                                            }}
                                            title={isStillDownloading ? 'Downloading file...' : ((file.category === 'videos' || file.category === 'audios' || file.category === 'recent') ? 'Play in Player Window' : 'Open in App')}
                                          >
                                            {(file.category === 'videos' || file.category === 'audios' || file.category === 'recent') ? <Play size={10} fill="currentColor" /> : <ExternalLink size={10} />}
                                          </button>
                                        );
                                      })()}

                                      <button
                                        onClick={() => {
                                          setSelectedFileDetails(file);
                                          setShowFileDetailsModal(true);
                                        }}
                                        className="btn-secondary"
                                        style={{
                                          padding: '4px 6px',
                                          borderRadius: '6px',
                                          border: 'none',
                                          background: 'rgba(255,255,255,0.05)',
                                          color: '#fff',
                                          cursor: 'pointer'
                                        }}
                                        title="View Details"
                                      >
                                        <Info size={10} />
                                      </button>

                                      <button
                                        onClick={() => {
                                          setDeleteConfirmTarget({
                                            type: 'file',
                                            title: 'Delete File from Disk',
                                            message: `Are you sure you want to permanently delete "${file.name}" from disk?`,
                                            filePath: file.path,
                                            onConfirm: async () => {
                                              const res = await performDeleteFile(file.path);
                                              if (res && !res.success) {
                                                alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
                                              }
                                            }
                                          });
                                        }}
                                        className="btn-secondary"
                                        style={{
                                          padding: '4px 6px',
                                          borderRadius: '6px',
                                          border: 'none',
                                          background: 'rgba(239, 68, 68, 0.1)',
                                          color: 'var(--danger)',
                                          cursor: 'pointer'
                                        }}
                                        title="Delete from Disk"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              });
                            }
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* Queue Tab */}
          {activeTab === 'queues' && (
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
                      Currently executing maximum <strong>{appSettings.maxConcurrent}</strong> files concurrently.
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
                      {downloads.filter(t => t.status === 'queued' || t.status === 'paused' && t.downloadedBytes === 0).length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                            No pending files in download queue
                          </td>
                        </tr>
                      ) : (
                        downloads.filter(t => t.status === 'queued' || t.status === 'paused' && t.downloadedBytes === 0).map(task => (
                          <tr key={task.id}>
                            <td style={{ fontWeight: '600' }}>{task.filename || 'Pending Name...'}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '11px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.url}</td>
                            <td><span className="status-badge-gui queued">Queued</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => resumeDownload(task.id)}>
                                  <Play size={10} /> Start
                                </button>
                                <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => deleteDownload(task.id)}>
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
          )}

          {/* Help Center Tab */}
          {(activeTab as string) === 'help' && (
            <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div className="main-header" style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div className="main-title-container">
                  <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <HelpCircle size={20} style={{ color: 'var(--primary)' }} /> Help & Documentation Center
                  </h1>
                  <p>Get help using Panamedia Player & Downloader, view licenses, or contact support.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setHelpSubTab('guide')}
                    className={`btn-secondary ${helpSubTab === 'guide' ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: helpSubTab === 'guide' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: helpSubTab === 'guide' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    Usage Guide
                  </button>
                  <button
                    onClick={() => setHelpSubTab('license')}
                    className={`btn-secondary ${helpSubTab === 'license' ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: helpSubTab === 'license' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: helpSubTab === 'license' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    License Agreement
                  </button>
                </div>
              </div>

              {helpSubTab === 'guide' ? (
                <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden', padding: '4px' }}>
                  {/* Left Column */}
                  <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '6px' }}>
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                      <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>The Problem It Solves</h3>
                      <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.8)' }}>
                        Historically, media workflows were fractured. Users had to download streams using clunky browser extensions, find where the file saved on disk, and then open it with separate player software. Additionally, legacy player tools often lacked H.265/HEVC decoding runtimes, visualizers, or robust equalizers.
                      </p>
                      <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.8)', marginTop: '10px' }}>
                        <strong>Panamedia</strong> bridges this gap by unifying a multi-threaded background downloader, an automatic local folder synchronizer, and a full-featured, hardware-accelerated media player into a single workspace.
                      </p>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                      <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>How to use the player</h3>
                      <ul style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', paddingLeft: '0px', listStyleType: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <li style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--primary)', fontSize: '14px', lineHeight: '1' }}>•</span>
                          <div>
                            <strong>Direct Playback:</strong> Double-click any finished task in the Downloads tab, or drag and drop any local file directly into the player screen.
                          </div>
                        </li>
                        <li style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--primary)', fontSize: '14px', lineHeight: '1' }}>•</span>
                          <div>
                            <strong>Syncing Folders:</strong> Configure download folders in Settings, then click the sync icon in the player sidebar to populate your music/video libraries instantly.
                          </div>
                        </li>
                        <li style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--primary)', fontSize: '14px', lineHeight: '1' }}>•</span>
                          <div>
                            <strong>USB Sendtray:</strong> Plug in a USB flash drive, press <span style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px' }}>S</span> over a playing file or click Sendtray in player sidebar, to copy media files to your drive instantly.
                          </div>
                        </li>
                        <li style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--primary)', fontSize: '14px', lineHeight: '1' }}>•</span>
                          <div>
                            <strong>Audio EQ pipeline:</strong> Toggle the 5-band equalizer tab (Bass, Mid-Bass, Mid, Mid-Treble, Treble) with presets (Bass Boost, Vocal, Flat) to adjust sound filters in real-time.
                          </div>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
                    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 'bold' }}>Developer Contact Center</h3>
                      
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px' }}><Info size={16} /></div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Developed By</div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Gift Ilocie</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px' }}><Tv size={16} /></div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Phone Contacts</div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>+265 991 972 336 | +265 888 333 673</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '8px' }}><Send size={16} /></div>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Support Emails</div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', wordBreak: 'break-all' }}>gilocie@gmail.com<br/>gosavesite@gamil.com</div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (electron) electron.shell.openExternal('https://wa.me/265991972336');
                        }}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '8px',
                          background: '#25d366',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 15px rgba(37, 211, 102, 0.2)'
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.333 4.99L2 22l5.23-1.371a9.936 9.936 0 004.78 1.23h.005c5.502 0 9.985-4.479 9.986-9.987-.001-2.67-1.041-5.18-2.932-7.071C17.18 3.036 14.67 2.001 12.012 2zm6.066 14.075c-.266.75-1.543 1.375-2.11 1.438-.567.062-1.112.28-3.609-.75-3.195-1.317-5.234-4.578-5.395-4.793-.16-.215-1.293-1.72-1.293-3.284 0-1.564.82-2.33 1.113-2.637.293-.307.64-.383.856-.383.215 0 .43.003.618.012.196.009.46-.075.72.568.266.643.91 2.22 1.026 2.453.117.233.096.502-.07.712-.167.21-.363.38-.53.58-.168.196-.347.41-.15.75.195.336.87 1.428 1.865 2.316.994.888 1.83 1.164 2.188 1.343.358.179.566.149.78-.098.214-.247.91-1.055 1.152-1.417.24-.362.48-.302.81-.179.33.123 2.085 1.028 2.448 1.21.363.18.604.269.67.382.067.114.067.66-.2 1.41z"/></svg>
                        Chat on WhatsApp (+265 991 972 336) ↗
                      </button>
                    </div>

                    <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px', borderLeft: '4px solid var(--primary)', background: 'rgba(99, 102, 241, 0.03)' }}>
                      <p style={{ fontSize: '12px', lineHeight: '1.5', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                        <strong>💡 Pro Tip:</strong> Double-clicking the video screen toggles Fullscreen mode. Scroll your mouse wheel over the video area to quickly change volume levels.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>End User License Agreement (EULA)</h3>
                  <div style={{ flex: 1, overflowY: 'auto', fontSize: '12px', lineHeight: '1.7', color: 'rgba(255,255,255,0.75)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', paddingRight: '10px' }}>
                    {`PANAMEDIA END USER LICENSE AGREEMENT (EULA)

Please read this End User License Agreement ("Agreement") carefully before installing or using Panamedia ("Software").

1. LICENSE GRANT
Gift Ilocie hereby grants you a personal, non-transferable, non-exclusive license to use the Software on your devices in accordance with the terms of this Agreement.

2. RESTRICTIONS
You are not permitted to:
- Edit, alter, modify, adapt, translate or otherwise change the whole or any part of the Software.
- Decompile, disassemble or reverse engineer the Software.
- Reproduce, copy, distribute or resell the Software for commercial purposes without prior permission.

3. COPYRIGHT & OWNERSHIP
Gift Ilocie retains ownership of the Software as originally downloaded and all subsequent downloads. The Software is protected by copyright and other intellectual property laws.

4. NO WARRANTY
The Software is provided "as is", without warranty of any kind, express or implied. In no event shall the authors or copyright holders be liable for any claim, damages or other liability.

Developed By Gift Ilocie.
Contact: Phone +265 991 972 336 | +265 888 333 673
Email: gilocie@gmail.com | gosavesite@gamil.com`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div className="main-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div className="main-title-container">
                  <h1>Application Settings</h1>
                  <p>Configure downloading profiles and directory folders</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setSettingsSubTab('general')}
                    className={`btn-secondary ${settingsSubTab === 'general' ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: settingsSubTab === 'general' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: settingsSubTab === 'general' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    General Settings
                  </button>
                  <button
                    onClick={() => setSettingsSubTab('folders')}
                    className={`btn-secondary ${settingsSubTab === 'folders' ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: settingsSubTab === 'folders' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: settingsSubTab === 'folders' ? 'var(--primary)' : 'rgba(255,255,255,0.06)'
                    }}
                  >
                    Media Sync Folders
                  </button>
                  <button
                    onClick={() => {
                      setSettingsSubTab('security');
                      setSettingsArchivePin(localStorage.getItem('player_archive_pin') || '');
                      setPinFeedbackMsg(null);
                    }}
                    className={`btn-secondary ${settingsSubTab === 'security' ? 'active' : ''}`}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      background: settingsSubTab === 'security' ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
                      borderColor: settingsSubTab === 'security' ? '#eab308' : 'rgba(255,255,255,0.06)',
                      color: settingsSubTab === 'security' ? '#fde047' : 'inherit'
                    }}
                  >
                    Archive PIN & Privacy
                  </button>
                </div>
              </div>

              {settingsSubTab === 'general' && (
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="form-group">
                    <label>Primary Folder (Downloads)</label>
                    <div className="form-input-container">
                      <input type="text" className="text-input" readOnly value={appSettings.downloadDir} style={{ flex: 1 }} />
                      <button className="btn-secondary" onClick={handleSettingsBrowseDir}>
                        Browse...
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                      <label>Parallel Connections (per download)</label>
                      <select
                        value={appSettings.connections}
                        onChange={(e) => updateSetting('connections', parseInt(e.target.value))}
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
                        onChange={(e) => updateSetting('maxConcurrent', parseInt(e.target.value))}
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
                          onChange={(e) => updateSetting('autoCompress', e.target.checked)}
                        />
                        <span className="slider autocompress-slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {settingsSubTab === 'folders' && (
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                      onClick={async () => {
                        if (!electron) return;
                        const dir = await electron.ipcRenderer.invoke('select-directory');
                        if (dir && !appSettings.syncedFolders.includes(dir)) {
                          const nextFolders = [...appSettings.syncedFolders, dir];
                          updateSetting('syncedFolders', nextFolders);
                          electron.ipcRenderer.send('synced-folders-updated', nextFolders);
                        }
                      }}
                    >
                      <Plus size={14} /> Add Folder
                    </button>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '8px', 
                    marginTop: '4px',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    paddingRight: '6px'
                  }}>
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
                          onClick={() => {
                            const nextFolders = appSettings.syncedFolders.filter(f => f !== folder);
                            updateSetting('syncedFolders', nextFolders);
                            // Release OS-level lock / attributes so folder is restored to original visibility
                            if (electron) {
                              electron.ipcRenderer.invoke('archive-set-os-lock', {
                                path: folder,
                                shouldLock: false,
                                isFolder: true
                              }).catch(() => {});
                              electron.ipcRenderer.send('synced-folders-updated', nextFolders);
                            }
                            // Also unarchive from archivePaths if it was archived
                            setArchivePaths(prev => {
                              const normF = folder.replace(/[\\/]/g, '/').toLowerCase();
                              const updated = prev.filter(p => {
                                const normP = p.replace(/[\\/]/g, '/').toLowerCase();
                                return normP !== normF && !normP.startsWith(normF + '/');
                              });
                              if (updated.length !== prev.length) {
                                localStorage.setItem('player_archive', JSON.stringify(updated));
                                if (electron) electron.ipcRenderer.send('archive-updated', updated);
                              }
                              return updated;
                            });
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                          title="Remove from sync list and restore visibility"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {settingsSubTab === 'security' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                  {/* ── Main Two-Column Layout ── */}
                  <div className="glass-panel" style={{
                    padding: '0',
                    display: 'grid',
                    gridTemplateColumns: '280px 1fr',
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>

                    {/* ── LEFT: Status & Info Panel ── */}
                    <div style={{
                      padding: '28px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px',
                      background: 'rgba(255,255,255,0.015)',
                      borderRight: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      {/* Status Icon */}
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '14px',
                        background: settingsArchivePin
                          ? 'linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(234,179,8,0.06) 100%)'
                          : 'rgba(255,255,255,0.04)',
                        border: settingsArchivePin
                          ? '1px solid rgba(234,179,8,0.35)'
                          : '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {settingsArchivePin
                          ? <ShieldCheck size={26} style={{ color: '#eab308' }} />
                          : <ShieldAlert size={26} style={{ color: 'rgba(255,255,255,0.3)' }} />}
                      </div>

                      {/* Title & Status Badge */}
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                          Archive PIN & Access Control
                        </div>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '20px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.6px',
                          background: settingsArchivePin
                            ? 'rgba(34,197,94,0.14)'
                            : 'rgba(239,68,68,0.14)',
                          color: settingsArchivePin ? '#4ade80' : '#f87171',
                          border: settingsArchivePin
                            ? '1px solid rgba(34,197,94,0.3)'
                            : '1px solid rgba(239,68,68,0.3)'
                        }}>
                          {settingsArchivePin ? '● Protected' : '○ Unprotected'}
                        </span>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                        {settingsArchivePin
                          ? 'Your archive is secured with an encrypted PIN. Player and settings stay synchronized in real time.'
                          : 'No PIN is currently configured. Anyone can open and browse the archive freely.'}
                      </div>

                      {/* Spacer */}
                      <div style={{ flex: 1 }} />

                      {/* Reset Button (only visible when PIN is active) */}
                      {settingsArchivePin && (
                        <button
                          type="button"
                          onClick={() => setShowResetPinModal(true)}
                          style={{
                            padding: '10px 0',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '7px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#f87171',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            width: '100%'
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.16)';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239, 68, 68, 0.45)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239, 68, 68, 0.08)';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239, 68, 68, 0.25)';
                          }}
                        >
                          <Unlock size={14} /> Reset / Remove PIN
                        </button>
                      )}
                    </div>

                    {/* ── RIGHT: PIN Entry Form ── */}
                    <div style={{
                      padding: '28px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px'
                    }}>
                      {/* Form Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, rgba(234,179,8,0.15) 0%, rgba(234,179,8,0.05) 100%)',
                            border: '1px solid rgba(234,179,8,0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <KeyRound size={15} style={{ color: '#eab308' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                              {settingsArchivePin ? 'Change Archive PIN' : 'Set New Archive PIN'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                              4–8 digit numeric passcode
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* PIN Input Grid - Side by Side */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* New PIN Field */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
                              New PIN
                            </label>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              color: newSettingsPin.length >= 4 ? '#eab308' : 'var(--text-muted)',
                              transition: 'color 0.2s'
                            }}>
                              {newSettingsPin.length}/8
                            </span>
                          </div>
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            background: newPinFocused
                              ? 'rgba(234, 179, 8, 0.05)'
                              : 'rgba(255,255,255,0.025)',
                            border: newPinFocused
                              ? '1.5px solid rgba(234,179,8,0.6)'
                              : '1px solid rgba(255,255,255,0.08)',
                            boxShadow: newPinFocused
                              ? '0 0 16px rgba(234, 179, 8, 0.12)'
                              : 'none',
                            borderRadius: '10px',
                            padding: '5px 10px 6px',
                            transition: 'all 0.25s ease',
                            cursor: 'text'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Lock size={14} style={{
                                color: newPinFocused ? '#eab308' : 'rgba(255,255,255,0.3)',
                                marginRight: '6px',
                                flexShrink: 0,
                                transition: 'color 0.2s'
                              }} />
                              <input
                                type={showNewPin ? 'text' : 'password'}
                                inputMode="numeric"
                                placeholder="••••"
                                maxLength={8}
                                value={newSettingsPin}
                                onFocus={() => setNewPinFocused(true)}
                                onBlur={() => setNewPinFocused(false)}
                                onChange={(e) => setNewSettingsPin(e.target.value.replace(/\D/g, ''))}
                                style={{
                                  flex: 1,
                                  background: 'transparent',
                                  border: 'none',
                                  outline: 'none',
                                  color: '#fff',
                                  fontSize: '15px',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  letterSpacing: showNewPin ? '3px' : '6px',
                                  padding: '3px 4px'
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setShowNewPin(!showNewPin)}
                                title={showNewPin ? 'Hide PIN' : 'Show PIN'}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: showNewPin ? '#eab308' : 'rgba(255,255,255,0.35)',
                                  cursor: 'pointer',
                                  padding: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s'
                                }}
                              >
                                {showNewPin ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Confirm PIN Field */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
                              Confirm PIN
                            </label>
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              color: confirmSettingsPin.length >= 4 ? '#eab308' : 'var(--text-muted)',
                              transition: 'color 0.2s'
                            }}>
                              {confirmSettingsPin.length}/8
                            </span>
                          </div>
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            background: confirmPinFocused
                              ? 'rgba(234, 179, 8, 0.05)'
                              : 'rgba(255,255,255,0.025)',
                            border: confirmPinFocused
                              ? '1.5px solid rgba(234,179,8,0.6)'
                              : '1px solid rgba(255,255,255,0.08)',
                            boxShadow: confirmPinFocused
                              ? '0 0 16px rgba(234, 179, 8, 0.12)'
                              : 'none',
                            borderRadius: '10px',
                            padding: '5px 10px 6px',
                            transition: 'all 0.25s ease',
                            cursor: 'text'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <Lock size={14} style={{
                                color: confirmPinFocused ? '#eab308' : 'rgba(255,255,255,0.3)',
                                marginRight: '6px',
                                flexShrink: 0,
                                transition: 'color 0.2s'
                              }} />
                              <input
                                type={showConfirmPin ? 'text' : 'password'}
                                inputMode="numeric"
                                placeholder="••••"
                                maxLength={8}
                                value={confirmSettingsPin}
                                onFocus={() => setConfirmPinFocused(true)}
                                onBlur={() => setConfirmPinFocused(false)}
                                onChange={(e) => setConfirmSettingsPin(e.target.value.replace(/\D/g, ''))}
                                style={{
                                  flex: 1,
                                  background: 'transparent',
                                  border: 'none',
                                  outline: 'none',
                                  color: '#fff',
                                  fontSize: '15px',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  letterSpacing: showConfirmPin ? '3px' : '6px',
                                  padding: '3px 4px'
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPin(!showConfirmPin)}
                                title={showConfirmPin ? 'Hide PIN' : 'Show PIN'}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: showConfirmPin ? '#eab308' : 'rgba(255,255,255,0.35)',
                                  cursor: 'pointer',
                                  padding: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'color 0.2s'
                                }}
                              >
                                {showConfirmPin ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Footer Row: Match Feedback + Save Button aligned */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        paddingTop: '4px'
                      }}>
                        {/* Match Feedback (left side) */}
                        <div style={{ flex: 1 }}>
                          {confirmSettingsPin.length > 0 && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: newSettingsPin === confirmSettingsPin && newSettingsPin.length >= 4
                                ? 'rgba(34,197,94,0.08)'
                                : 'rgba(245,158,11,0.08)',
                              border: newSettingsPin === confirmSettingsPin && newSettingsPin.length >= 4
                                ? '1px solid rgba(34,197,94,0.2)'
                                : '1px solid rgba(245,158,11,0.2)',
                              transition: 'all 0.25s ease'
                            }}>
                              {newSettingsPin === confirmSettingsPin && newSettingsPin.length >= 4 ? (
                                <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <Check size={13} /> PINs match — ready to save
                                </span>
                              ) : (
                                <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <X size={13} /> PINs do not match
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Save/Update Button (right side) */}
                        <button
                          type="button"
                          disabled={!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin}
                          onClick={async () => {
                            setPinFeedbackMsg(null);
                            if (!newSettingsPin || newSettingsPin.length < 4) {
                              setPinFeedbackMsg({ type: 'error', text: 'PIN must be at least 4 digits.' });
                              return;
                            }
                            if (newSettingsPin !== confirmSettingsPin) {
                              setPinFeedbackMsg({ type: 'error', text: 'PINs do not match. Please re-enter.' });
                              return;
                            }
                            try {
                              const hashedPin = await hashPin(newSettingsPin);
                              localStorage.setItem('player_archive_pin', hashedPin);
                              setSettingsArchivePin(hashedPin);
                              setNewSettingsPin('');
                              setConfirmSettingsPin('');
                              if (electron) {
                                electron.ipcRenderer.send('archive-pin-updated', hashedPin);
                                electron.ipcRenderer.invoke('save-archive-data', { archivePin: hashedPin }).catch(() => {});
                              }
                              setPinFeedbackMsg({ type: 'success', text: 'Archive PIN updated and synchronized with Player!' });
                            } catch {
                              setPinFeedbackMsg({ type: 'error', text: 'Failed to securely hash PIN.' });
                            }
                          }}
                          style={{
                            padding: '9px 22px',
                            borderRadius: '10px',
                            fontSize: '12.5px',
                            background: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin)
                              ? 'rgba(255,255,255,0.05)'
                              : 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                            color: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin)
                              ? 'rgba(255,255,255,0.25)'
                              : '#000',
                            fontWeight: 700,
                            cursor: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin) ? 'not-allowed' : 'pointer',
                            boxShadow: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin)
                              ? 'none'
                              : '0 4px 16px rgba(234, 179, 8, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            border: (!newSettingsPin || newSettingsPin.length < 4 || newSettingsPin !== confirmSettingsPin)
                              ? '1px solid rgba(255,255,255,0.06)'
                              : 'none',
                            transition: 'all 0.3s ease',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}
                        >
                          <Lock size={13} />
                          {settingsArchivePin ? 'Update PIN' : 'Save PIN'}
                        </button>
                      </div>

                      {/* Feedback Message (full width below) */}
                      {pinFeedbackMsg && (
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: pinFeedbackMsg.type === 'success' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          color: pinFeedbackMsg.type === 'success' ? '#4ade80' : '#f87171',
                          border: '1px solid ' + (pinFeedbackMsg.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                          fontWeight: 500
                        }}>
                          {pinFeedbackMsg.type === 'success' ? <CheckCircle2 size={15} /> : <ShieldAlert size={15} />}
                          <span>{pinFeedbackMsg.text}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Reset PIN Confirmation Modal ── */}
                  {showResetPinModal && (
                    <div
                      style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 99999,
                        background: 'rgba(0, 0, 0, 0.8)',
                        backdropFilter: 'blur(12px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        animation: 'fadeIn 0.2s ease'
                      }}
                      onClick={() => setShowResetPinModal(false)}
                    >
                      <div
                        style={{
                          background: 'linear-gradient(155deg, #1a1a2e 0%, #0d0d18 100%)',
                          border: '1px solid rgba(234, 179, 8, 0.25)',
                          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.9), 0 0 40px rgba(234, 179, 8, 0.08)',
                          borderRadius: '20px',
                          padding: '32px',
                          maxWidth: '480px',
                          width: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '20px',
                          position: 'relative',
                          animation: 'slideUp 0.3s ease'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '14px',
                              background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#f87171'
                            }}>
                              <ShieldAlert size={24} />
                            </div>
                            <div>
                              <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
                                Reset Archive PIN?
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                This action cannot be undone
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowResetPinModal(false)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '9px',
                              color: 'rgba(255, 255, 255, 0.5)',
                              cursor: 'pointer',
                              padding: '7px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
                              (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
                            }}
                          >
                            <X size={15} />
                          </button>
                        </div>

                        {/* Modal Body */}
                        <p style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.6, margin: 0 }}>
                          Removing your Archive PIN will immediately unlock the protected media archive. Anyone with access to this device will be able to open and browse the archive without a passcode.
                        </p>

                        {/* Info Banner */}
                        <div style={{
                          background: 'rgba(234, 179, 8, 0.06)',
                          border: '1px solid rgba(234, 179, 8, 0.18)',
                          borderRadius: '12px',
                          padding: '14px 16px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          fontSize: '12.5px',
                          color: 'rgba(250, 204, 21, 0.9)',
                          lineHeight: 1.5
                        }}>
                          <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                          <span>The Archive Player will receive this update instantly and unlock the secure playlist without requiring a restart.</span>
                        </div>

                        {/* Modal Actions */}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setShowResetPinModal(false)}
                            style={{
                              padding: '10px 20px',
                              borderRadius: '10px',
                              fontSize: '13px',
                              fontWeight: 600,
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'rgba(255,255,255,0.7)',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                            }}
                          >
                            Keep Current PIN
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.removeItem('player_archive_pin');
                              setSettingsArchivePin('');
                              setNewSettingsPin('');
                              setConfirmSettingsPin('');
                              if (electron) {
                                electron.ipcRenderer.send('archive-pin-updated', '');
                                electron.ipcRenderer.invoke('save-archive-data', { archivePin: '' }).catch(() => {});
                              }
                              setShowResetPinModal(false);
                              setPinFeedbackMsg({ type: 'success', text: 'Archive PIN removed. Archive is now unlocked across player and app.' });
                            }}
                            style={{
                              padding: '10px 22px',
                              borderRadius: '10px',
                              fontSize: '13px',
                              fontWeight: 700,
                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '7px',
                              boxShadow: '0 4px 18px rgba(239, 68, 68, 0.4)',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 24px rgba(239, 68, 68, 0.55)';
                              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 18px rgba(239, 68, 68, 0.4)';
                              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                            }}
                          >
                            <Unlock size={14} /> Yes, Reset & Unlock
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Browser Integration Tab */}
          {activeTab === 'integration' && (
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
                  <button className="btn-primary" onClick={handleRegisterBrowserIntegration}>
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
          )}

          {/* Stream Tab (Persistent) */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)', overflowX: 'auto', maxWidth: 'calc(100vw - 420px)' }}>
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
                          onClick={() => navigateBrowser(site.url)}
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
                        {!DEFAULT_STREAM_SITES.some(ds => ds.url === site.url) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteStreamSite(site.url);
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
                  onClick={() => setShowAddSiteModal(true)}
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
                onClick={() => webviewRef.current?.goBack()}
                className="btn-secondary"
                style={{ padding: '6px 8px', borderRadius: '8px' }}
                title="Go Back"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => webviewRef.current?.goForward()}
                className="btn-secondary"
                style={{ padding: '6px 8px', borderRadius: '8px' }}
                title="Go Forward"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => {
                  setIsWebviewLoading(true);
                  webviewRef.current?.reload();
                }}
                className="btn-secondary"
                style={{ padding: '6px 8px', borderRadius: '8px' }}
                title="Reload"
              >
                <RefreshCw size={14} className={isWebviewLoading ? "animate-spin" : ""} />
              </button>

              {/* Interactive Address Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  navigateBrowser(urlInput);
                }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}
              >
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <Globe size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Enter URL or stream link..."
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      minWidth: 0
                    }}
                  />
                  {cleanStreamUrl(currentBrowserUrl) !== currentBrowserUrl && (
                    <button
                      type="button"
                      onClick={() => navigateBrowser(cleanStreamUrl(currentBrowserUrl))}
                      style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                      }}
                      title={`Switch to direct video room: ${cleanStreamUrl(currentBrowserUrl)}`}
                    >
                      <Sparkles size={11} /> Open Original Room
                    </button>
                  )}
                </div>
              </form>

              {/* Capture Download Button */}
              {(() => {
                const canDownload = currentBrowserUrl.startsWith('http://') || currentBrowserUrl.startsWith('https://');
                const isYtPlaylist = currentBrowserUrl.includes('list=') || currentBrowserUrl.includes('playlist?list=');
                return (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isYtPlaylist && (
                      <button
                        onClick={async () => {
                          if (!electron) return;
                          setAddUrl(currentBrowserUrl);
                          setIsYoutubeCheck(true);
                          handleDownloadPlaylist(currentBrowserUrl);
                        }}
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
                      onClick={async () => {
                        if (!electron || isDetectingStream) return;
                        setIsDetectingStream(true);
                        try {
                          const isYt = currentBrowserUrl.includes('youtube.com/') || currentBrowserUrl.includes('youtu.be/');
                          const isSocial = isSocialOrPlatformUrl(currentBrowserUrl);
                          setIsYoutubeCheck(isYt || isSocial);

                          if (isYt || isSocial) {
                            setAddUrl(currentBrowserUrl);
                            let pageCookies = '';
                            try {
                              pageCookies = await electron.ipcRenderer.invoke('get-page-cookies', currentBrowserUrl);
                            } catch (e) {}

                            fetchFormats(currentBrowserUrl, {
                              pageUrl: currentBrowserUrl,
                              headers: {
                                Cookie: pageCookies,
                                Referer: currentBrowserUrl
                              }
                            });
                            return;
                          }

                          // For custom streaming sites:
                          let targetMediaUrl = '';
                          let pageTitle = '';
                          let detectedDuration = 0;
                          let liveThumbnail = '';
                          let detectedCurrentTime = 0;

                          try {
                            if (webviewRef.current) {
                              const scriptToRun = `(${extractWebviewStreamScript.toString()})()`;
                              const detected = await webviewRef.current.executeJavaScript(scriptToRun);
                              if (detected) {
                                if (detected.mediaUrl) targetMediaUrl = detected.mediaUrl;
                                if (detected.title) pageTitle = detected.title;
                                if (detected.duration) detectedDuration = detected.duration;
                                if (detected.currentTime) detectedCurrentTime = detected.currentTime;

                                // 1. Official studio video poster from player metadata
                                if (detected.poster) {
                                  const isAdOrGif = (src: string) => {
                                    if (!src || typeof src !== 'string') return true;
                                    const l = src.toLowerCase();
                                    return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
                                      l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
                                      l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
                                      l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
                                  };
                                  if (!isAdOrGif(detected.poster)) {
                                    liveThumbnail = detected.poster;
                                  }
                                }

                                // 2. Direct canvas snapshot of active playing video frame
                                if (!liveThumbnail && detected.frameData) {
                                  liveThumbnail = detected.frameData;
                                }

                                // 3. Capture live frame strictly within the video player rectangle
                                if (!liveThumbnail && detected.videoRect && typeof (webviewRef.current as any)?.capturePage === 'function') {
                                  try {
                                    const nativeImg = await (webviewRef.current as any).capturePage(detected.videoRect);
                                    if (nativeImg && !nativeImg.isEmpty()) {
                                      liveThumbnail = nativeImg.toDataURL();
                                    }
                                  } catch (err) {
                                    console.warn('[Capture Frame] webview.capturePage error:', err);
                                  }
                                }
                              }
                            }
                          } catch (e) {
                            console.warn('[Stream Detect] Webview inspection error:', e);
                          }

                          // 2. If not found in DOM, check Electron network sniffer
                          if (!targetMediaUrl) {
                            try {
                              const captured = await electron.ipcRenderer.invoke('get-captured-web-media', { pageUrl: currentBrowserUrl });
                              if (captured && captured.success && captured.stream?.mediaUrl) {
                                const isTrash = (u: string) => {
                                  if (!u) return true;
                                  const l = u.toLowerCase();
                                  const adNetworks = [
                                    'trafficjunky', 'exoclick', 'doubleclick', 'googleads', 'googlesyndication',
                                    'tsyndicate', 'adsterra', 'popads', 'juicyads', 'adnxs', 'exosrv', 'realsrv',
                                    'serving-sys', 'innovid', 'spotxchange', 'springserve', 'imasdk',
                                    'flashtalking', 'sizmek', 'connatix', 'vidoomy', 'monetag', 'admaven'
                                  ];
                                  if (adNetworks.some(d => l.includes(d))) return true;
                                  return l.includes('.gif') || l.includes('banner') ||
                                         l.includes('creative') || l.includes('advert') || l.includes('sponsor') ||
                                         l.includes('promo') || l.includes('exclusive') || l.includes('teaser') ||
                                         l.includes('preview') || l.includes('/ads/') || l.includes('/ad/') ||
                                         l.includes('preroll') || l.includes('interstitial') ||
                                         l.includes('video_ad') || l.includes('videoad') || l.includes('ad_video') ||
                                         l.includes('commercial') || l.includes('overlay') ||
                                         l.includes('ad_type=') || l.includes('campaign_id=') || l.includes('creative_id=');
                                };
                                if (!isTrash(captured.stream.mediaUrl)) {
                                  targetMediaUrl = captured.stream.mediaUrl;
                                }
                              }
                            } catch (e) {}
                          }

                          // Fetch cookies from the active session to bypass age verification & CDN token blocks
                          let pageCookies = '';
                          try {
                            pageCookies = await electron.ipcRenderer.invoke('get-page-cookies', currentBrowserUrl);
                          } catch (e) {}

                          const isAdOrGif = (src: string) => {
                            if (!src || typeof src !== 'string') return true;
                            const l = src.toLowerCase();
                            return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
                              l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
                              l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
                              l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
                          };
                          const cleanLiveThumb = isAdOrGif(liveThumbnail) ? '' : liveThumbnail;

                          const effectivePageUrl = cleanStreamUrl(currentBrowserUrl);
                          const resolvedUrl = targetMediaUrl || effectivePageUrl;
                          setAddUrl(resolvedUrl);
                          fetchFormats(resolvedUrl, {
                            title: pageTitle,
                            pageUrl: effectivePageUrl,
                            thumbnail: cleanLiveThumb,
                            duration: detectedDuration,
                            currentTime: detectedCurrentTime,
                            headers: {
                              Cookie: pageCookies,
                              Referer: effectivePageUrl
                            }
                          });
                        } finally {
                          setIsDetectingStream(false);
                        }
                      }}
                      disabled={!canDownload || isDetectingStream}
                      className="btn-primary"
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: (canDownload && !isDetectingStream) ? 1 : 0.6,
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        boxShadow: canDownload ? '0 2px 10px rgba(99, 102, 241, 0.2)' : 'none'
                      }}
                    >
                      {isDetectingStream ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Detecting Stream...</span>
                        </>
                      ) : (
                        <>
                          <Download size={12} />
                          <span>Download Video</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* WebView Frame with Dark Background & Loading Overlay */}
            <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--panel-border)', background: '#09090e', position: 'relative', minHeight: 0 }}>
              {isWebviewLoading && (
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
                    fontFamily: "'Outfit', 'Inter', sans-serif",
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
                ref={setWebviewRef}
                partition="persist:panamedia_stream"
                src={browserUrl}
                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                webpreferences="allowRunningInsecureContent=yes, javascript=yes"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  visibility: (showFormatModal || showAddModal || showClearHistoryModal || showFileDetailsModal || showReleaseDialog || Boolean(deleteConfirmTarget)) ? 'hidden' : 'visible'
                }}
              />
            </div>
          </div>

        </div>

      </div>

      {/* Add Download Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Download</h2>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <div className="form-group">
              <label>Source URL</label>
              <input
                type="text"
                placeholder="Paste HTTP, HTTPS, or YouTube link..."
                value={addUrl}
                onChange={(e) => {
                  setAddUrl(e.target.value);
                  setIsYoutubeCheck(e.target.value.includes('youtube.com/') || e.target.value.includes('youtu.be/'));
                }}
              />
            </div>

            <div className="form-group">
              <label>Rename File (Optional)</label>
              <input
                type="text"
                placeholder="e.g. video.mp4 (leave empty for original name)"
                value={addFilename}
                onChange={(e) => setAddFilename(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Save Folder</label>
              <div className="form-input-container">
                <input type="text" readOnly value={addSaveDir} />
                <button className="btn-secondary" onClick={handleBrowseDir}>
                  Browse...
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={startImmediately}
                  onChange={(e) => setStartImmediately(e.target.checked)}
                />
                Start downloading immediately
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isYoutubeCheck}
                  onChange={(e) => setIsYoutubeCheck(e.target.checked)}
                />
                {addUrl && (addUrl.toLowerCase().includes('youtube.com/') || addUrl.toLowerCase().includes('youtu.be/'))
                  ? 'YouTube Media Stream'
                  : 'Web Video Stream (Auto Extract)'}
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAddDownload}>
                Add Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stream Site Modal */}
      {showAddSiteModal && (
        <AddStreamSiteModal
          onClose={() => setShowAddSiteModal(false)}
          onAddSite={(siteData: NewStreamSiteData) => {
            setStreamSites((prev: any[]) => {
              const next = [...prev.filter(s => s.url !== siteData.url), siteData];
              try { localStorage.setItem('stream_sites', JSON.stringify(next)); } catch (e) {}
              return next;
            });
            setShowAddSiteModal(false);
            navigateBrowser(siteData.url);
          }}
        />
      )}

      {/* YouTube Playlist Modal */}
      {showPlaylistModal && (
        <div className="modal-backdrop" onClick={() => setShowPlaylistModal(false)}>
          <div className="glass-panel modal-content" style={{ width: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>YouTube Playlist Analyzer</h2>
              <button className="modal-close-btn" onClick={() => { setShowPlaylistModal(false); setPlaylistInfo(null); }}>✕</button>
            </div>

            {playlistLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
                <div style={{ fontSize: '14px', fontWeight: '500' }}>Analyzing playlist entries...</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>This queries yt-dlp to extract video metadata.</div>
              </div>
            ) : playlistInfo ? (
              <PlaylistSelector
                playlistInfo={playlistInfo}
                onCancel={() => { setShowPlaylistModal(false); setPlaylistInfo(null); }}
                onConfirm={handleConfirmPlaylist}
              />
            ) : (
              <div style={{ color: 'var(--danger)', display: 'flex', gap: '8px', fontSize: '13px' }}>
                <AlertCircle size={16} /> Failed to load playlist details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* YouTube Video Format Modal */}
      {showFormatModal && (
        <div className="modal-backdrop" onClick={handleCloseFormatsModal}>
          <div className="glass-panel modal-content" style={{ width: '680px', maxWidth: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Select Media Format</h2>
              <button className="modal-close-btn" onClick={handleCloseFormatsModal}>✕</button>
            </div>

            {formatLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px', width: '100%' }}>
                <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', width: '100%', maxWidth: '400px', fontSize: '13px', fontWeight: 'bold' }}>
                  <span>Extracting media formats...</span>
                  <span>{extractProgress}%</span>
                </div>
                <div className="progress-bar-bg" style={{ height: '8px', width: '100%', maxWidth: '400px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${extractProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)'
                    }}
                  ></div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={12} className="animate-spin" /> {isYoutubeCheck ? 'Querying YouTube streams and calculating sizes...' : 'Extracting web video streams and calculating sizes...'}
                </div>
              </div>
            ) : extractError ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '20px', width: '100%', textAlign: 'center' }}>
                <AlertCircle size={44} style={{ color: 'var(--danger)' }} />
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '6px' }}>Failed to extract formats</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '400px', lineHeight: '1.5' }}>{extractError}</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button className="btn-primary" onClick={() => fetchFormats(addUrl)} style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '8px', fontWeight: '600' }}>Retry</button>
                  <button className="btn-secondary" onClick={handleCloseFormatsModal} style={{ fontSize: '13px', padding: '8px 18px', borderRadius: '8px', fontWeight: '600' }}>Cancel</button>
                </div>
              </div>
            ) : youtubeInfo ? (
              <FormatPickerContent
                info={youtubeInfo}
                saveDir={addSaveDir || appSettings.downloadDir}
                onCancel={handleCloseFormatsModal}
                onDownload={async (downloadOptions: { filename: string; totalBytes?: number; youtubeOptions: any; directUrl?: string }) => {
                  setShowFormatModal(false);
                  const isYt = Boolean(youtubeInfo?.isYoutube);
                  const isSocial = isSocialOrPlatformUrl(youtubeInfo?.pageUrl || addUrl);
                  const requiresYtDlp = isYt || isSocial || Boolean(youtubeInfo?.useYtDlp) || Boolean(downloadOptions.youtubeOptions?.useYtDlp);
                  const refererUrl = youtubeInfo?.pageUrl || (!isYt ? addUrl : '');
                  const pageUrl = youtubeInfo?.pageUrl || addUrl;
                  const isAdOrGif = (src?: string | null) => {
                    if (!src || typeof src !== 'string') return true;
                    const l = src.toLowerCase();
                    if (l.includes('youtube.com') || l.includes('ytimg.com') || l.includes('googlevideo.com')) {
                      return false;
                    }
                    return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
                      l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
                      l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
                      l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
                  };
                  const ytFallback = (isYt && youtubeInfo?.id) ? `https://i.ytimg.com/vi/${youtubeInfo.id}/hqdefault.jpg` : '';
                  const cleanThumb = (isAdOrGif(youtubeInfo?.thumbnail) ? '' : (youtubeInfo?.thumbnail || '')) || ytFallback;
                  const finalDownloadUrl = requiresYtDlp ? pageUrl : ((!isYt && downloadOptions.directUrl) ? downloadOptions.directUrl : addUrl);
                  if (electron) {
                    await electron.ipcRenderer.invoke('add-download', {
                      url: finalDownloadUrl,
                      pageUrl: pageUrl,
                      filename: downloadOptions.filename,
                      saveDir: addSaveDir || appSettings.downloadDir,
                      startImmediately: true,
                      isYoutube: isYt,
                      isWebExtractor: !isYt,
                      useYtDlp: requiresYtDlp,
                      thumbnail: cleanThumb,
                      totalBytes: downloadOptions.totalBytes || -1,
                      youtubeOptions: {
                        ...downloadOptions.youtubeOptions,
                        useYtDlp: requiresYtDlp
                      },
                      duration: youtubeInfo.duration || 0,
                      headers: {
                        ...(youtubeInfo?.headers || {}),
                        ...(refererUrl ? { Referer: refererUrl } : {})
                      }
                    });
                  }
                  setAddUrl('');
                  setAddFilename('');
                  setActiveTab('downloads');
                }}
              />
            ) : (
              <div style={{ color: 'var(--danger)', display: 'flex', gap: '8px', fontSize: '14px', padding: '20px', alignItems: 'center' }}>
                <AlertCircle size={20} /> Failed to extract video stream formats. Make sure the URL is valid.
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Details Modal */}
      {showFileDetailsModal && selectedFileDetails && (
        <div className="modal-backdrop" onClick={() => setShowFileDetailsModal(false)}>
          <div className="glass-panel modal-content" style={{ width: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>File Details</h2>
              <button className="modal-close-btn" onClick={() => setShowFileDetailsModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
              <div className="detail-row">
                <div className="detail-label">File Name</div>
                <div className="detail-value" style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', wordBreak: 'break-all' }}>
                  {selectedFileDetails.name}
                </div>
              </div>

              <div className="detail-row">
                <div className="detail-label">Full Path</div>
                <div className="detail-value" style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  {selectedFileDetails.path}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="detail-row">
                  <div className="detail-label">File Size</div>
                  <div className="detail-value">{selectedFileDetails.displaySize ? selectedFileDetails.displaySize : formatBytes(selectedFileDetails.size)}</div>
                </div>
                <div className="detail-row">
                  <div className="detail-label">Category</div>
                  <div className="detail-value" style={{ textTransform: 'capitalize' }}>{selectedFileDetails.category}</div>
                </div>
              </div>

              <div className="detail-row">
                <div className="detail-label">Last Modified</div>
                <div className="detail-value">
                  {new Date(selectedFileDetails.mtime).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => {
                    setShowFileDetailsModal(false);
                    if (selectedFileDetails.category === 'videos' || selectedFileDetails.category === 'audios' || (selectedFileDetails.category === 'recent' && ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.flv', '.mpg', '.3gp', '.wmv', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg'].includes(selectedFileDetails.ext))) {
                      electron?.ipcRenderer.invoke('open-player-window', { filePath: selectedFileDetails.path, filename: selectedFileDetails.name });
                    } else {
                      const parentDir = selectedFileDetails.path.substring(0, selectedFileDetails.path.lastIndexOf('\\')) || selectedFileDetails.path.substring(0, selectedFileDetails.path.lastIndexOf('/'));
                      electron?.ipcRenderer.invoke('open-file', { saveDir: parentDir, filename: selectedFileDetails.name });
                    }
                  }}
                >
                  <Play size={14} fill="currentColor" style={{ marginRight: '6px' }} /> Play / Open
                </button>

                <button
                  className="btn-secondary"
                  style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.05)', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => {
                    setDeleteConfirmTarget({
                      type: 'file',
                      title: 'Delete File from Disk',
                      message: `Are you sure you want to permanently delete "${selectedFileDetails.name}" from disk?`,
                      filePath: selectedFileDetails.path,
                      onConfirm: async () => {
                        const res = await performDeleteFile(selectedFileDetails.path);
                        if (res && res.success) {
                          setShowFileDetailsModal(false);
                          setSelectedFileDetails(null);
                        } else {
                          alert('Failed to delete file: ' + (res?.error || 'Unknown error'));
                        }
                      }
                    });
                  }}
                >
                  <Trash2 size={14} /> Delete from Disk
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Choice Modal */}
      {showClearHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowClearHistoryModal(false)}>
          <div className="glass-panel modal-content" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Clear History</h2>
              <button className="modal-close-btn" onClick={() => setShowClearHistoryModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Select which download records you want to clear from history:
              </p>

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
                onClick={() => handleClearHistory('completed')}
              >
                Clear Completed only
              </button>

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
                onClick={() => handleClearHistory('pending')}
              >
                Clear Pending / Queued only
              </button>

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
                onClick={() => handleClearHistory('paused')}
              >
                Clear Paused only
              </button>

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '12px', borderRadius: '8px' }}
                onClick={() => handleClearHistory('active')}
              >
                Clear Active / Running only
              </button>

              <button
                className="btn-primary"
                style={{ justifyContent: 'center', padding: '10px 14px', fontSize: '12px', borderRadius: '8px', background: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#fff' }}
                onClick={() => {
                  setShowClearHistoryModal(false);
                  setDeleteConfirmTarget({
                    type: 'all-history',
                    title: 'Clear All History',
                    message: 'Are you sure you want to clear ALL download history? This will stop any running downloads.',
                    onConfirm: () => {
                      handleClearHistory('all');
                    }
                  });
                }}
              >
                Clear All History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="modal-backdrop" style={{ zIndex: 11000 }}>
          <div className="glass-panel modal-content" style={{ width: '400px' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
                {deleteConfirmTarget.title}
              </h2>
            </div>

            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {deleteConfirmTarget.message}
              </p>

              {deleteConfirmTarget.showDeleteFileOption && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    id="custom-delete-disk-option"
                    defaultChecked={false}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Also delete downloaded files from disk</span>
                </label>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setDeleteConfirmTarget(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#fff' }}
                  onClick={() => {
                    const chk = document.getElementById('custom-delete-disk-option') as HTMLInputElement | null;
                    const deleteFromDisk = chk ? chk.checked : false;
                    deleteConfirmTarget.onConfirm(deleteFromDisk);
                    setDeleteConfirmTarget(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right-click Context Menu */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 15000,
            background: 'rgba(12,12,20,0.97)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '6px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            minWidth: '160px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: '9px',
              padding: '8px 12px', background: 'transparent', border: 'none',
              borderRadius: '6px', color: '#bbb', fontSize: '12px', cursor: 'pointer',
              textAlign: 'left', width: '100%', transition: 'all 0.1s'
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.12)'; (e.currentTarget as HTMLElement).style.color = '#a5b4fc'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#bbb'; }}
            onClick={() => {
              if (contextMenu.targetPath) setFlashDriveTarget(contextMenu.targetPath);
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
          >
            <Send size={13} /> Send
          </button>
        </div>
      )}

      {/* Send Modal */}
      {flashDriveTarget && (
        <SendToFlashModal filePath={flashDriveTarget} onClose={() => setFlashDriveTarget(null)} />
      )}

      {/* Bottom Toasts container */}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} className="glass-panel" style={{ padding: '12px 18px', background: 'rgba(10, 10, 16, 0.9)', borderLeft: '4px solid var(--success)', display: 'flex', alignItems: 'center', gap: '10px', animation: 'slide-in 0.3s ease' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{t.message}</div>
          </div>
        ))}
      </div>

      {showReleaseDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '420px',
            borderRadius: '20px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            position: 'relative',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
            overflow: 'hidden'
          }}>
            {/* Ambient Background Glow */}
            <div style={{
              position: 'absolute',
              top: '-40px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: releaseCheckStatus === 'update-available' || releaseCheckStatus === 'downloading'
                ? 'rgba(168, 85, 247, 0.2)'
                : releaseCheckStatus === 'download-complete'
                  ? 'rgba(16, 185, 129, 0.2)'
                  : releaseCheckStatus === 'no-internet' || releaseCheckStatus === 'error'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : releaseCheckStatus === 'checking' || releaseCheckStatus === 'installing'
                      ? 'rgba(99, 102, 241, 0.18)'
                      : 'rgba(16, 185, 129, 0.18)',
              filter: 'blur(35px)',
              pointerEvents: 'none',
              zIndex: 0
            }} />

            {/* Close button */}
            <button
              onClick={() => setShowReleaseDialog(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s',
                zIndex: 2
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              ✕
            </button>

            {/* 1. CHECKING STATE */}
            {releaseCheckStatus === 'checking' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px dashed rgba(99, 102, 241, 0.35)', boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)'
                }}>
                  <Loader2 size={32} style={{ color: 'var(--primary)' }} className="animate-spin" />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Checking for Updates...</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px', maxWidth: '300px' }}>
                  Connecting to update servers to check for a newer version of Panamedia.
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Installed Version:</span>
                  <strong style={{ color: '#fff' }}>v{APP_VERSION}</strong>
                </div>
                <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ padding: '8px 24px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                  Cancel
                </button>
              </div>
            )}

            {/* 2. NO INTERNET STATE */}
            {releaseCheckStatus === 'no-internet' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(239, 68, 68, 0.25)', boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)'
                }}>
                  <AlertCircle size={34} style={{ color: '#f87171' }} />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>No Internet Connection</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '24px', maxWidth: '300px' }}>
                  Unable to check for updates. Please verify your internet connection and try again.
                </p>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                    Close
                  </button>
                  <button onClick={() => checkReleaseUpdate(true)} className="btn-primary" style={{
                    flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    background: 'linear-gradient(135deg, var(--primary), #a855f7)', boxShadow: '0 4px 15px rgba(99,102,241,0.3)'
                  }}>
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* 3. UPDATE AVAILABLE STATE */}
            {releaseCheckStatus === 'update-available' && (
              compareVersions(latestReleaseVersion, APP_VERSION) > 0 ? (
                <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{
                    width: '68px', height: '68px', borderRadius: '50%',
                    background: 'rgba(168, 85, 247, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '18px', border: '1px solid rgba(168, 85, 247, 0.3)', boxShadow: '0 0 25px rgba(168, 85, 247, 0.25)'
                  }}>
                    <CloudDownload size={34} style={{ color: '#c084fc' }} />
                  </div>
                  <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>New Version Available!</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px' }}>
                    A new release of Panamedia is available. Download and install the update to get the latest features and improvements.
                  </p>
                  {releaseNotes && (
                    <p style={{ fontSize: '11px', color: 'rgba(192,132,252,0.7)', lineHeight: '1.4', marginBottom: '12px', maxWidth: '340px', fontStyle: 'italic' }}>
                      {releaseNotes.length > 150 ? releaseNotes.substring(0, 150) + '...' : releaseNotes}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.04)', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Current:</span>
                      <strong style={{ color: '#fff' }}>v{APP_VERSION}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(168, 85, 247, 0.12)', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                      <span style={{ color: '#c084fc' }}>Latest:</span>
                      <strong style={{ color: '#e9d5ff' }}>v{latestReleaseVersion}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                      Later
                    </button>
                    <button
                      onClick={startUpdateDownload}
                      className="btn-primary"
                      style={{
                        flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                        background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}
                    >
                      <CloudDownload size={14} /> Download Update
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{
                    width: '68px', height: '68px', borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '18px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)'
                  }}>
                    <CheckCircle2 size={36} style={{ color: '#10b981' }} />
                  </div>
                  <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>You're Up to Date!</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px', maxWidth: '320px' }}>
                    You have the latest version of Panamedia installed. No new version is required.
                  </p>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.22)',
                    borderRadius: '10px', padding: '6px 14px', marginBottom: '24px'
                  }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Installed Version:</span>
                    <strong style={{ fontSize: '13px', color: '#fff' }}>v{APP_VERSION}</strong>
                    <span style={{
                      fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399',
                      padding: '2px 7px', borderRadius: '5px', fontWeight: '700', letterSpacing: '0.3px',
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                      Latest
                    </span>
                  </div>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ padding: '10px 24px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', width: '100%' }}>
                    Close
                  </button>
                </div>
              )
            )}

            {/* IDLE / DEFAULT STATE */}
            {releaseCheckStatus === 'idle' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(99, 102, 241, 0.3)', boxShadow: '0 0 25px rgba(99, 102, 241, 0.2)'
                }}>
                  <CloudDownload size={34} style={{ color: '#818cf8' }} />
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Panamedia Updates</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px' }}>
                  Check if a newer release of Panamedia is available for download.
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Installed Version:</span>
                  <strong style={{ color: '#fff' }}>v{APP_VERSION}</strong>
                </div>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                    Close
                  </button>
                  <button onClick={() => checkReleaseUpdate(true)} className="btn-primary" style={{
                    flex: 1.3, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                    background: 'linear-gradient(135deg, var(--primary), #a855f7)', boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}>
                    <RefreshCw size={13} /> Check Now
                  </button>
                </div>
              </div>
            )}

            {/* 4. DOWNLOADING STATE */}
            {releaseCheckStatus === 'downloading' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(168, 85, 247, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(168, 85, 247, 0.3)', boxShadow: '0 0 25px rgba(168, 85, 247, 0.2)'
                }}>
                  <Loader2 size={32} style={{ color: '#c084fc' }} className="animate-spin" />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Downloading Update...</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '16px' }}>
                  Downloading Panamedia v{latestReleaseVersion}. Please wait...
                </p>

                {/* Progress Bar */}
                <div style={{ width: '100%', marginBottom: '10px' }}>
                  <div style={{
                    width: '100%', height: '8px', borderRadius: '4px',
                    background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${updateDownloadProgress}%`,
                      borderRadius: '4px',
                      background: 'linear-gradient(90deg, #6366f1, #a855f7, #c084fc)',
                      transition: 'width 0.3s ease',
                      boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)'
                    }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  <span>{updateDownloadProgress > 0 ? `${updateDownloadProgress}%` : 'Starting...'}</span>
                  <span>
                    {updateTotalBytes > 0
                      ? `${(updateDownloadedBytes / 1024 / 1024).toFixed(1)} / ${(updateTotalBytes / 1024 / 1024).toFixed(1)} MB`
                      : updateDownloadedBytes > 0 ? `${(updateDownloadedBytes / 1024 / 1024).toFixed(1)} MB downloaded` : ''}
                  </span>
                </div>

                <button
                  onClick={() => {
                    if (electron) electron.ipcRenderer.invoke('cancel-app-update-download');
                    setReleaseCheckStatus('update-available');
                  }}
                  className="btn-secondary"
                  style={{ padding: '8px 24px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}
                >
                  Cancel Download
                </button>
              </div>
            )}

            {/* 5. DOWNLOAD COMPLETE STATE — Install Button */}
            {releaseCheckStatus === 'download-complete' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)'
                }}>
                  <CheckCircle2 size={36} style={{ color: '#10b981' }} />
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Download Complete!</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px', maxWidth: '320px' }}>
                  Panamedia v{latestReleaseVersion} has been downloaded successfully. Click "Install & Restart" to apply the update.
                </p>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px',
                  padding: '5px 12px', fontSize: '11px', color: '#34d399', marginBottom: '24px'
                }}>
                  <CheckCircle2 size={12} /> Ready to install
                </div>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                    Install Later
                  </button>
                  <button
                    onClick={installUpdate}
                    className="btn-primary"
                    style={{
                      flex: 1.3, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                  >
                    <CloudDownload size={14} /> Install & Restart
                  </button>
                </div>
              </div>
            )}

            {/* 6. INSTALLING STATE */}
            {releaseCheckStatus === 'installing' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px dashed rgba(99, 102, 241, 0.35)', boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)'
                }}>
                  <Loader2 size={32} style={{ color: 'var(--primary)' }} className="animate-spin" />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Installing Update...</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
                  Launching installer. The app will close shortly...
                </p>
              </div>
            )}

            {/* 7. ERROR STATE */}
            {releaseCheckStatus === 'error' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(239, 68, 68, 0.25)', boxShadow: '0 0 20px rgba(239, 68, 68, 0.15)'
                }}>
                  <AlertCircle size={34} style={{ color: '#f87171' }} />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Update Failed</h2>
                <p style={{ fontSize: '12px', color: '#f87171', lineHeight: '1.5', marginBottom: '8px' }}>
                  {updateError || 'An unexpected error occurred.'}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  Please check your connection and try again.
                </p>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={() => setShowReleaseDialog(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                    Close
                  </button>
                  <button
                    onClick={() => checkReleaseUpdate(true)}
                    className="btn-primary"
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      background: 'linear-gradient(135deg, var(--primary), #a855f7)', boxShadow: '0 4px 15px rgba(99,102,241,0.3)'
                    }}
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* 8. UP TO DATE STATE */}
            {releaseCheckStatus === 'up-to-date' && (
              <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <div style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)'
                }}>
                  <CheckCircle2 size={36} style={{ color: '#10b981' }} />
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>You're Up to Date!</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px', maxWidth: '320px' }}>
                  You are using the latest version of Panamedia. All the newest features, video format support, and optimizations are already installed.
                </p>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.22)',
                  borderRadius: '10px', padding: '6px 14px', marginBottom: '24px'
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Current Version:</span>
                  <strong style={{ fontSize: '13px', color: '#fff' }}>v{APP_VERSION}</strong>
                  <span style={{
                    fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399',
                    padding: '2px 7px', borderRadius: '5px', fontWeight: '700', letterSpacing: '0.3px',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    Latest
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button
                    onClick={startUpdateDownload}
                    className="btn-primary"
                    style={{
                      flex: 1.3, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold',
                      background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                      boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                    title="Download the latest Panamedia installer directly to your PC"
                  >
                    <CloudDownload size={13} /> Download Setup (v{latestReleaseVersion})
                  </button>
                  <button
                    onClick={() => setShowReleaseDialog(false)}
                    className="btn-secondary"
                    style={{ flex: 0.7, padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

interface FormatPickerContentProps {
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
  saveDir: string;
  onCancel: () => void;
  onDownload: (options: { filename: string, totalBytes?: number, youtubeOptions: any, directUrl?: string }) => void;
}

function FormatPickerContent({ info, onCancel, onDownload }: FormatPickerContentProps) {
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
                    // Hide broken image and show placeholder
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
              {/* Clean video placeholder when no thumbnail */}
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
        {/* Tabs switcher */}
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

        {/* Formats table */}
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

