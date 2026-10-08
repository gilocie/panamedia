// Robust in-webview media extraction function serialized via .toString() to prevent escaping bugs
export function extractWebviewStreamScript() {
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
    // Official video thumbnail / poster from page player metadata
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
