const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { resolveFinalMediaUrl, downloadWebStream } = require('./webStreamDownloader.cjs');

/**
 * Universal Web Media Extractor
 * Dedicated module for extracting and downloading public videos from any website visited.
 * Kept strictly isolated in its own folder to keep YouTube logic untouched.
 */

const userDataPath = app ? app.getPath('userData') : process.cwd();
const binDir = path.join(userDataPath, 'bin');

function resolveBinary(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const directPath = path.join(binDir, exe);
  if (fs.existsSync(directPath)) return directPath;

  const appData = process.env.APPDATA || '';
  const candidates = [
    directPath,
    path.join(appData, 'panamedia', 'bin', exe),
    path.join(appData, 'net-downloader', 'bin', exe),
    path.join(appData, 'Electron', 'bin', exe),
    path.join(process.cwd(), 'bin', exe),
    path.join(__dirname, '..', 'bin', exe),
    path.join(__dirname, '..', '..', 'bin', exe)
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return directPath;
}

const ffmpegPath = resolveBinary('ffmpeg');
const ytdlpPath = resolveBinary('yt-dlp');

const progressRegex = /\[download\]\s+(\d+\.\d+)%\s+of\s+(~\s*)?([0-9.]+[a-zA-Z\/]+)\s+at\s+([0-9.]+[a-zA-Z\/s]+)\s+ETA\s+([0-9:]+)/;

function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/^([0-9.]+)\s*([a-zA-Z]+)/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('g')) return Math.round(val * 1024 * 1024 * 1024);
  if (unit.startsWith('m')) return Math.round(val * 1024 * 1024);
  if (unit.startsWith('k')) return Math.round(val * 1024);
  return Math.round(val);
}

/**
 * Executes yt-dlp with generic extractors for any visited website.
 */
function runGenericYtdlp(args, pageUrl = '', cookies = '') {
  return new Promise((resolve, reject) => {
    let extraArgs = [
      '--no-update',
      '--no-warnings',
      '--no-check-certificates',
      '--force-ipv4',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    ];
    if (cookies) {
      extraArgs.push('--add-header', `Cookie:${cookies}`);
    }
    if (pageUrl) {
      try {
        const origin = new URL(pageUrl).origin;
        if (origin && origin !== 'null') {
          extraArgs.push('--referer', origin);
        }
      } catch (e) {}
    }
    const finalArgs = [...extraArgs, ...args];
    const proc = spawn(ytdlpPath, finalArgs, { windowsHide: true });
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Media extraction timed out after 60 seconds'));
    }, 60000);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => stdout += d.toString());
    proc.stderr.on('data', (d) => stderr += d.toString());

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        const cleanErr = stderr.trim() || `Extraction exited with code ${code}`;
        reject(new Error(cleanErr));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Helper to fetch webpage HTML with Chrome User-Agent and Referer.
 */
function fetchPageHtml(pageUrl) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(pageUrl);
      const mod = u.protocol === 'http:' ? http : https;
      const req = mod.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': u.origin + '/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchPageHtml(res.headers.location).then(resolve).catch(reject);
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Page request timeout')); });
    } catch (e) {
      reject(e);
    }
  });
}

const ffprobePath = resolveBinary('ffprobe');

/**
 * Normalizes movie/episode titles from page URLs or raw file hashes.
 */
function cleanMediaTitle(rawTitle, pageUrl) {
  if (rawTitle && typeof rawTitle === 'string') {
    const trimmed = rawTitle.trim();
    const isGeneric = /^(free\s*movies?|watch\s*(movies?|online|free)|online\s*movies?|movies?|video\s*stream|web\s*video|home|stream|player|free\s*streaming|full\s*movie|watch\s*hd|hd\s*movies?|free\s*videos?|movie\s*stream|streaming)$/i.test(trimmed);
    const isAgeGate = /verify\s*(your)?\s*age|confirm\s*(your)?\s*age|age\s*verification|18\s*\+|adult\s*content|sign\s*in\s*to\s*confirm/i.test(trimmed);
    // Detect player overlay / ad popup text (e.g., "04:45 Previewing Unlock Full Access Go Premium 0 00:15 / 01:41:26")
    const isOverlayText = /previewing|unlock\s*(full\s*)?access|go\s*premium|get\s*premium|subscribe\s*now|upgrade\s*now|free\s*trial|remove\s*ads/i.test(trimmed) ||
      /\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/.test(trimmed) ||
      (/\b(480p|720p|1080p|dualsub|english\s+off)\b/i.test(trimmed) && trimmed.length > 30) ||
      trimmed.length > 100;
    if (!isAgeGate && !isGeneric && !isOverlayText) {
      // If it's a 20+ hex character string (e.g. 435ebbef2db3d10b1297247c67f86b85.mp4), it's a hash, not a title
      const isHash = /^[a-f0-9]{20,}(\.[a-z0-9]+)?$/i.test(trimmed);
      if (!isHash && trimmed.length > 1) {
        return trimmed
          .replace(/\s*[-–|]\s*(Moviebox|XVIDEOS\.COM|Pornhub|SpankBang|RedTube|YouTube|YouPorn|Dailymotion|Vimeo|Free Movies|FZMovies|mzfl).*$/i, '')
          .trim();
      }
    }
  }
  if (pageUrl) {
    try {
      const u = new URL(pageUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      const skipWords = ['spa', 'videoplaypage', 'movies', 'movie', 'watch', 'video', 'play', 'v', 'embed', 'stream', 'page', 'streams', 'hls', 'dash', 'media', 'content', 'api', 'public'];
      const genericMediaFiles = /^(local|index|master|playlist|stream|chunklist|video|media|output|hls|dash|content|main|default|source|play|file|data)\.(m3u8|mp4|m4v|webm|mkv|mov|mp3|m4a|wav|flac|ts)$/i;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (skipWords.includes(p.toLowerCase())) continue;
        // Skip generic media filenames
        if (genericMediaFiles.test(p)) continue;
        if (p && !/^[a-f0-9]{20,}$/i.test(p)) {
          // Strip file extension if present
          const withoutExt = p.replace(/\.(m3u8|mp4|m4v|webm|mkv|mov|mp3|m4a|wav|flac|ts)$/i, '');
          // Strip random hash suffixes (e.g., rambo-iii-OZUYHkTCTz3 → rambo-iii)
          const cleanSlug = withoutExt.replace(/[-_][a-zA-Z0-9]{6,25}$/, '').replace(/[-_]/g, ' ');
          if (cleanSlug.trim().length > 2) {
            return cleanSlug.trim().replace(/\b\w/g, c => c.toUpperCase());
          }
        }
      }
      // Fallback: use hostname as title (e.g., cdn.example.com → Example Stream)
      const hostParts = u.hostname.replace(/^(www|cdn|api|media|stream|hls|vod)\d*\./i, '').split('.');
      if (hostParts.length >= 2) {
        const domainName = hostParts[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (domainName.length > 2) return domainName + ' Stream';
      }
    } catch (e) {}
  }
  return 'Web Video Stream';
}

/**
 * Queries remote server for true video Content-Length in bytes using HEAD / Range requests with redirect support.
 */
async function getRemoteMediaSize(mediaUrl, customHeaders = {}) {
  try {
    const res = await resolveFinalMediaUrl(mediaUrl, customHeaders);
    if (res && res.totalBytes > 0) return res.totalBytes;
  } catch (e) {}
  return 0;
}

/**
 * Probes remote video stream duration using ffprobe.
 */
function getRemoteMediaDuration(videoUrl, options = {}) {
  return new Promise((resolve) => {
    try {
      const ref = options.pageUrl || options.headers?.Referer || options.headers?.referer;
      const cookie = options.headers?.Cookie || options.headers?.cookie || '';
      let headerStr = '';
      if (ref) headerStr += `Referer: ${ref}\r\n`;
      if (cookie) headerStr += `Cookie: ${cookie}\r\n`;
      headerStr += `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n`;

      const args = [
        '-v', 'error',
        '-allowed_extensions', 'ALL',
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,data',
        '-headers', headerStr,
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoUrl
      ];

      const proc = spawn(ffprobePath, args, { windowsHide: true });
      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
        resolve(0);
      }, 7000);

      let stdout = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.on('close', () => {
        clearTimeout(timer);
        const dur = parseFloat(stdout.trim());
        resolve(!isNaN(dur) && dur > 0 ? Math.round(dur) : 0);
      });
      proc.on('error', () => {
        clearTimeout(timer);
        resolve(0);
      });
    } catch (e) {
      resolve(0);
    }
  });
}

function isAdOrGifThumbnail(thumb) {
  if (!thumb || typeof thumb !== 'string') return true;
  const l = thumb.toLowerCase();
  if (l.includes('youtube.com') || l.includes('ytimg.com') || l.includes('googlevideo.com')) {
    return false;
  }
  return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
    l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
    l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
    l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert') ||
    l.includes('pop') || l.includes('affiliate') || l.includes('sofun') || l.includes('game') ||
    l.includes('playnow') || l.includes('play-now') || l.includes('300+') || l.includes('casino') ||
    l.includes('betting') || l.includes('bonus') || l.includes('creative') ||
    l.includes('serving-sys') || l.includes('innovid') || l.includes('spotxchange') ||
    l.includes('springserve') || l.includes('imasdk') || l.includes('flashtalking') ||
    l.includes('sizmek') || l.includes('connatix') || l.includes('vidoomy') ||
    l.includes('interstitial') || l.includes('preroll') || l.includes('commercial') ||
    l.includes('overlay') || l.includes('companion') || l.includes('promotional') ||
    l.includes('ad_type=') || l.includes('campaign_id=') || l.includes('creative_id=');
}

/**
 * Generates an actual video thumbnail frame from the stream using FFmpeg.
 */
function generateRemoteVideoThumbnail(videoUrl, options = {}) {
  return new Promise(async (resolve) => {
    try {
      const thumbDir = path.join(userDataPath, 'thumbnails');
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
      const thumbPath = path.join(thumbDir, `thumb_${Date.now()}_${Math.round(Math.random() * 1000)}.jpg`);

      const ref = options.pageUrl || options.headers?.Referer || options.headers?.referer;
      const cookie = options.headers?.Cookie || options.headers?.cookie || '';
      let headerStr = '';
      if (ref) headerStr += `Referer: ${ref}\r\n`;
      if (cookie) headerStr += `Cookie: ${cookie}\r\n`;
      headerStr += `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n`;

      const isHls = videoUrl.toLowerCase().includes('.m3u8');
      let targetStreamUrl = videoUrl;
      if (isHls) {
        try {
          const { resolveMaxQualityHlsVariant } = require('./webStreamDownloader.cjs');
          const resolved = await resolveMaxQualityHlsVariant(videoUrl, { Referer: ref, Cookie: cookie });
          if (resolved && resolved.videoUrl) targetStreamUrl = resolved.videoUrl;
        } catch (e) {}
      }

      const runFfmpegThumb = (seekStr) => {
        return new Promise((res) => {
          const args = ['-y', '-headers', headerStr];
          if (seekStr) args.push('-ss', seekStr);
          args.push('-allowed_extensions', 'ALL', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,data');
          args.push('-i', targetStreamUrl);
          args.push('-vframes', '1', '-q:v', '2', thumbPath);

          const proc = spawn(ffmpegPath, args, { windowsHide: true });
          const timeout = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch (e) {}
            res('');
          }, isHls ? 12000 : 6000);

          proc.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0 && fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 500) {
              const b64 = fs.readFileSync(thumbPath).toString('base64');
              try { fs.unlinkSync(thumbPath); } catch (e) {}
              res(`data:image/jpeg;base64,${b64}`);
            } else {
              res('');
            }
          });
          proc.on('error', () => {
            clearTimeout(timeout);
            res('');
          });
        });
      };

      // Seek to current position of clip if provided, otherwise 2s
      const seekSec = options.currentTime || options.seekTime || 0;
      let seekStr = '00:00:02';
      if (seekSec > 0) {
        const h = Math.floor(seekSec / 3600);
        const m = Math.floor((seekSec % 3600) / 60);
        const s = Math.floor(seekSec % 60);
        seekStr = `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
      }

      let thumb = await runFfmpegThumb(seekStr);
      // If that failed and we attempted a custom seek, fallback to 2s
      if (!thumb && seekSec > 0) {
        thumb = await runFfmpegThumb('00:00:02');
      }
      // If that failed or stream is not seekable, try frame 0 (no seek)
      if (!thumb) {
        thumb = await runFfmpegThumb(null);
      }

      if (thumb) {
        return resolve(thumb);
      }

      // Elegant SVG thumbnail fallback when remote thumbnail extraction cannot complete
      const title = (options.title || 'Web Video Stream').slice(0, 36);
      const cleanTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="50%" stop-color="#1e1b4b" />
            <stop offset="100%" stop-color="#31104b" />
          </linearGradient>
          <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="100%" stop-color="#a855f7" />
          </linearGradient>
        </defs>
        <rect width="640" height="360" fill="url(#bg)" />
        <circle cx="320" cy="150" r="48" fill="url(#accent)" opacity="0.85" />
        <polygon points="310,130 310,170 342,150" fill="#ffffff" />
        <text x="320" y="240" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#ffffff" text-anchor="middle">${cleanTitle}</text>
        <text x="320" y="270" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.45)" letter-spacing="2" text-anchor="middle">PANAMEDIA STREAM</text>
      </svg>`;
      const b64Svg = Buffer.from(svg).toString('base64');
      resolve(`data:image/svg+xml;base64,${b64Svg}`);
    } catch (e) {
      resolve('');
    }
  });
}

/**
 * Fetches playlist raw text over HTTP/HTTPS with redirect support and auth headers.
 */
function fetchPlaylistText(url, headers = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const mod = u.protocol === 'http:' ? http : https;
      const reqHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': headers.Referer || headers.referer || (u.origin + '/'),
        ...(headers.Cookie ? { 'Cookie': headers.Cookie } : {}),
        'Accept': '*/*'
      };

      const req = mod.request(url, { method: 'GET', headers: reqHeaders, timeout: 8000 }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = new URL(res.headers.location, url).href;
          return fetchPlaylistText(next, headers).then(resolve);
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
      req.end();
    } catch (e) {
      resolve('');
    }
  });
}

/**
 * Parses HLS M3U8 master playlist text to extract all quality variants (1080p, 720p, 480p, 360p) with real calculated sizes.
 */
async function parseM3u8Playlist(m3u8Url, headers = {}, duration = 0) {
  try {
    const text = await fetchPlaylistText(m3u8Url, headers);
    if (!text || !text.includes('#EXTM3U')) return null;

    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const variants = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const inf = line.substring('#EXT-X-STREAM-INF:'.length);
          const resMatch = inf.match(/RESOLUTION=(\d+)x(\d+)/i);
          const width = resMatch ? parseInt(resMatch[1], 10) : 0;
          const height = resMatch ? parseInt(resMatch[2], 10) : 0;

          const bwMatch = inf.match(/BANDWIDTH=(\d+)/i);
          const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;

          let uri = '';
          for (let j = i + 1; j < lines.length; j++) {
            if (!lines[j].startsWith('#')) {
              uri = lines[j];
              break;
            }
          }

          if (uri) {
            let effHeight = height;
            if (!effHeight) {
              if (/1080|1920|fhd/i.test(uri)) effHeight = 1080;
              else if (/720|1280|hd/i.test(uri)) effHeight = 720;
              else if (/2160|3840|4k/i.test(uri)) effHeight = 2160;
              else if (bandwidth > 3000000) effHeight = 1080;
              else if (bandwidth > 1500000) effHeight = 720;
              else effHeight = 480;
            }
            const absoluteUrl = new URL(uri, m3u8Url).href;
            variants.push({
              height: effHeight,
              width,
              bandwidth: bandwidth || (effHeight >= 1080 ? 4000000 : (effHeight >= 720 ? 2500000 : 1200000)),
              url: absoluteUrl
            });
          }
        }
      }

      if (variants.length > 0) {
        variants.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0));

        const seen = new Set();
        const formats = [];

        for (const v of variants) {
          const h = v.height || 720;
          const key = `${h}p`;
          if (seen.has(key)) continue;
          seen.add(key);

          const label = h >= 1080 ? `${h}p (Full HD)` : (h >= 720 ? `${h}p (HD)` : `${h}p`);
          const estSize = duration > 0
            ? Math.round((v.bandwidth * duration) / 8)
            : Math.round(((h >= 1080 ? 3500 : (h >= 720 ? 2000 : 1000)) * 1000 * 3600) / 8);

          formats.push({
            label,
            height: h,
            formatId: key,
            size: estSize,
            ext: 'mp4',
            directUrl: v.url
          });
        }

        return formats;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Extracts public video streams and formats from any arbitrary web URL.
 */
async function getUniversalWebFormats(url, options = {}) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('Invalid website URL');
  }

  // Check if target is a major social/video platform that uses segmented DASH/MSE chunks
  const isSocialPlatform = (u) => {
    if (!u || typeof u !== 'string') return false;
    const l = u.toLowerCase();
    return l.includes('facebook.com') || l.includes('fb.watch') || l.includes('fb.com') ||
      l.includes('instagram.com') || l.includes('tiktok.com') || l.includes('x.com') ||
      l.includes('twitter.com') || l.includes('reddit.com') || l.includes('threads.net') ||
      l.includes('pinterest.com') || l.includes('vimeo.com') || l.includes('dailymotion.com') ||
      l.includes('fbcdn.net') || l.includes('cdninstagram.com') || l.includes('tiktokcdn.com') ||
      l.includes('twimg.com');
  };
  const isSocial = isSocialPlatform(url) || isSocialPlatform(options.pageUrl);

  // 1. Direct media file check (.m3u8, .mp4, etc.) - only for regular web downloads, never social platforms
  const cleanUrl = url.split('?')[0].toLowerCase();
  const directExtensions = ['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.mp3', '.m4a', '.wav', '.flac', '.m3u8'];
  const matchedExt = directExtensions.find(ext => cleanUrl.endsWith(ext));

  if (matchedExt && !isSocial) {
    const rawName = path.basename(url.split('?')[0]) || ('downloaded_media' + matchedExt);
    const decodedRawName = decodeURIComponent(rawName);
    
    // Check if the filename is generic/uninformative (e.g. local.m3u8, index.m3u8, master.m3u8, stream.mp4)
    const genericFileNames = /^(local|index|master|playlist|stream|chunklist|video|media|output|hls|dash|content|main|default|source|play|file|data)\.(m3u8|mp4|m4v|webm|mkv|mov|mp3|m4a)$/i;
    const isGenericFile = genericFileNames.test(decodedRawName);
    
    let resolvedTitle;
    if (options.title) {
      resolvedTitle = cleanMediaTitle(options.title, options.pageUrl || url);
    } else if (!isGenericFile) {
      resolvedTitle = cleanMediaTitle(decodedRawName, options.pageUrl || url);
    } else {
      // Extract a meaningful title from the URL path or hostname
      resolvedTitle = cleanMediaTitle('', url); // Let cleanMediaTitle extract from the URL
    }
    const isAudio = ['.mp3', '.m4a', '.wav', '.flac'].includes(matchedExt);

    // Resolve duration
    let duration = options.duration || 0;
    if (!duration) {
      duration = await getRemoteMediaDuration(url, options);
    }

    // Resolve thumbnail: use captured webview frame if provided (and not a gif/ad), otherwise generate frame with FFmpeg
    let thumbnail = options.thumbnail || '';
    if (isAdOrGifThumbnail(thumbnail)) {
      thumbnail = '';
    }
    if (!thumbnail && !isAudio) {
      thumbnail = await generateRemoteVideoThumbnail(url, { ...options, duration });
    }

    // Resolve true file size
    let directSize = await getRemoteMediaSize(url, options.headers || { Referer: options.pageUrl });
    if (!directSize && duration > 0) {
      directSize = Math.round((2200 * 1000 * duration) / 8); // Estimated ~2.2 Mbps video size
    } else if (!directSize) {
      directSize = 450 * 1024 * 1024; // Fallback ~450MB
    }

    // Check if this direct media is actually an ad, GIF video ad, or tiny preview/teaser clip
    const urlLower = url.toLowerCase();
    const isAdOrTrash = isAdOrGifThumbnail(url) ||
      urlLower.includes('.gif') ||
      urlLower.includes('trafficjunky') ||
      urlLower.includes('banner') ||
      urlLower.includes('creative') ||
      urlLower.includes('sponsor') ||
      urlLower.includes('advert') ||
      urlLower.includes('teaser') ||
      urlLower.includes('preview') ||
      urlLower.includes('interstitial') ||
      urlLower.includes('preroll') ||
      urlLower.includes('video_ad') ||
      urlLower.includes('videoad') ||
      urlLower.includes('ad_video') ||
      urlLower.includes('commercial') ||
      urlLower.includes('overlay') ||
      urlLower.includes('promotional') ||
      urlLower.includes('ad_type=') ||
      urlLower.includes('campaign_id=') ||
      urlLower.includes('creative_id=') ||
      (!isAudio && directSize > 0 && directSize < 5 * 1024 * 1024 && (duration > 60 || urlLower.includes('short')));

    if (isAdOrTrash && options.pageUrl && options.pageUrl !== url) {
      console.log(`[WebExtractor] Discarding ad/preview stream (${url}), extracting full video from ${options.pageUrl}`);
    } else {
      // If it's an M3U8 HLS stream, parse variants directly
      if (matchedExt === '.m3u8') {
        try {
          const parsedVariants = await parseM3u8Playlist(url, options.headers || { Referer: options.pageUrl }, duration);
          if (parsedVariants && parsedVariants.length > 0) {
            return {
              title: resolvedTitle,
              thumbnail: thumbnail || '',
              duration: duration || 0,
              isDirectMedia: true,
              videoFormats: parsedVariants,
              audioFormats: [{
                label: 'Audio Stream (MP3)',
                format: 'mp3',
                size: duration > 0 ? Math.round((192000 * duration) / 8) : 45 * 1024 * 1024,
                bitrate: 192,
                formatId: 'bestaudio/best',
                directUrl: parsedVariants[0].directUrl
              }]
            };
          }
        } catch (err) {
          console.warn('[WebExtractor] M3U8 playlist parse fallback:', err);
        }
        // Single M3U8 stream fallback - calculate true HD size
        directSize = duration > 0 ? Math.round((2500 * 1000 * duration) / 8) : 550 * 1024 * 1024;
      }

      return {
        title: resolvedTitle,
        thumbnail: thumbnail || '',
        duration: duration || 0,
        isDirectMedia: true,
        videoFormats: !isAudio ? [{
          label: 'Direct Stream (' + matchedExt.replace('.', '').toUpperCase() + ')',
          quality: 'Original',
          height: 1080,
          formatId: 'best',
          size: directSize,
          directUrl: url
        }] : [],
        audioFormats: [{
          label: 'Audio Stream',
          format: isAudio ? matchedExt.replace('.', '') : 'mp3',
          size: isAudio ? directSize : (duration > 0 ? Math.round((192000 * duration) / 8) : 0),
          bitrate: 192,
          formatId: 'bestaudio/best',
          directUrl: url
        }]
      };
    }
  }

  // 2. Extract using yt-dlp's generic multi-site engine
  try {
    const isCdn = (u) => {
      if (!u) return false;
      const l = u.toLowerCase();
      return l.includes('fbcdn.net') || l.includes('cdninstagram.com') || l.includes('tiktokcdn.com') || l.includes('twimg.com');
    };
    const targetUrl = (options.pageUrl && !isCdn(options.pageUrl))
      ? options.pageUrl
      : (isCdn(url) && options.pageUrl ? options.pageUrl : url);
    const cookies = options.headers?.Cookie || '';
    const stdout = await runGenericYtdlp(['-J', '--no-playlist', targetUrl], targetUrl, cookies);
    const raw = JSON.parse(stdout);
    const data = (raw.entries && raw.entries.length > 0) ? raw.entries[0] : raw;

    const duration = options.duration || data.duration || 0;
    const title = cleanMediaTitle(options.title || data.title || 'Web Video', options.pageUrl || url);
    const candidateThumb = options.thumbnail || (data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : (data.thumbnail || ''));
    let thumbnail = isAdOrGifThumbnail(candidateThumb) ? '' : candidateThumb;

    if (!thumbnail) {
      thumbnail = await generateRemoteVideoThumbnail(url, { ...options, duration });
    }

    const videoFormats = [];
    const audioFormats = [];

    if (Array.isArray(data.formats) && data.formats.length > 0) {
      const seenHeights = new Set();
      const sortedFormats = [...data.formats].filter(f => f.vcodec && f.vcodec !== 'none');
      sortedFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

      for (const f of sortedFormats) {
        const h = f.height || (f.resolution ? parseInt(f.resolution) : 0);
        const label = h > 0 ? `${h}p` : (f.format_note || 'Standard Quality');
        if (h > 0 && seenHeights.has(h)) continue;
        if (h > 0) seenHeights.add(h);

        const formatId = f.acodec && f.acodec !== 'none'
          ? (f.format_id || 'best')
          : `${f.format_id || 'bestvideo'}+bestaudio/best`;

        const computedSize = f.filesize || f.filesize_approx || (duration > 0 && f.tbr ? Math.round((f.tbr * 1000 * duration) / 8) : (duration > 0 ? Math.round(((h >= 1080 ? 3500 : (h >= 720 ? 2000 : 1000)) * 1000 * duration) / 8) : 0));

        videoFormats.push({
          label: h >= 1080 ? `${h}p (Full HD)` : label,
          height: h || 720,
          formatId,
          size: computedSize,
          ext: f.ext || 'mp4',
          directUrl: f.url || '',
          useYtDlp: true
        });
      }

      audioFormats.push({
        label: 'Best Audio (MP3/M4A)',
        format: 'mp3',
        size: Math.round((192000 * (duration || 60)) / 8),
        bitrate: 192,
        formatId: 'bestaudio/best',
        useYtDlp: true
      });
    }

    if (videoFormats.length === 0) {
      videoFormats.push({
        label: 'Standard Quality',
        height: 720,
        formatId: 'best',
        size: duration > 0 ? Math.round((1800 * 1000 * duration) / 8) : 0,
        ext: 'mp4',
        useYtDlp: true
      });
    }

    return {
      title,
      thumbnail,
      duration,
      isDirectMedia: false,
      useYtDlp: true,
      pageUrl: targetUrl,
      videoFormats,
      audioFormats
    };
  } catch (ytdlpErr) {
    // 3. Fallback: Parse webpage HTML for embedded video streams or iframes
    try {
      const pageUrlToFetch = options.pageUrl || url;
      const html = await fetchPageHtml(pageUrlToFetch);
      if (html) {
        // Look for direct player configurations (e.g. html5player.setVideoUrlHigh, setVideoHLS, hlssrc)
        const highMatch = html.match(/setVideoUrlHigh\(['"]((?:https?:)?\/\/[^'"]+)['"]\)/i);
        const hlsMatch = html.match(/setVideoHLS\(['"]((?:https?:)?\/\/[^'"]+)['"]\)/i);
        const hlsMatch2 = html.match(/hlssrc\s*=\s*['"]((?:https?:)?\/\/[^'"]+)['"]/i);
        const lowMatch = html.match(/setVideoUrlLow\(['"]((?:https?:)?\/\/[^'"]+)['"]\)/i);

        // Look for m3u8 playlist or mp4 streams in page source (excluding preview, ad, and banner clips)
        const m3u8Match = html.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
        const mp4Matches = Array.from(html.matchAll(/(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/gi));
        let bestMp4 = null;
        for (const m of mp4Matches) {
          const u = m[1];
          const uLower = u.toLowerCase();
          if (!uLower.includes('preview') && !uLower.includes('short') && !uLower.includes('teaser') &&
              !uLower.includes('trailer') && !uLower.includes('verify') && !uLower.includes('.gif') &&
              !uLower.includes('trafficjunky') && !uLower.includes('banner') && !uLower.includes('creative') &&
              !uLower.includes('sponsor') && !uLower.includes('advert')) {
            bestMp4 = u;
            break;
          }
        }

        // Clean Page Title from og:title or title tag (avoiding "Verify your age")
        let pageTitle = options.title;
        if (!pageTitle || /verify\s*(your)?\s*age/i.test(pageTitle)) {
          const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
          const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          pageTitle = ogTitleMatch ? ogTitleMatch[1] : (titleTagMatch ? titleTagMatch[1] : 'Web Video');
          pageTitle = cleanMediaTitle(pageTitle, pageUrlToFetch);
        }

        let foundMediaUrl = highMatch ? highMatch[1] : (hlsMatch ? hlsMatch[1] : (hlsMatch2 ? hlsMatch2[1] : (lowMatch ? lowMatch[1] : (m3u8Match ? m3u8Match[1] : (bestMp4 || null)))));
        if (foundMediaUrl) {
          if (foundMediaUrl.startsWith('//')) foundMediaUrl = 'https:' + foundMediaUrl;
          return await getUniversalWebFormats(foundMediaUrl, {
            title: pageTitle,
            pageUrl: pageUrlToFetch,
            thumbnail: options.thumbnail,
            duration: options.duration
          });
        }
      }
    } catch (e) {}

    // If generic extraction failed, provide clear user guidance
    const errMessage = ytdlpErr?.message || '';
    if (errMessage.includes('Unsupported URL')) {
      throw new Error(
        'This website streams media dynamically via JavaScript. Please play the video in the Stream browser tab, then click "Download Video" so the active stream can be captured automatically.'
      );
    }
    throw ytdlpErr;
  }
}

/**
 * Downloads a video from an arbitrary website using dedicated stream downloader.
 * Completely separated from YouTube: handles direct MP4/stream downloads and HLS without yt-dlp scraping.
 */
function downloadWebVideo(url, output, opts = {}, onProgress) {
  return downloadWebStream(url, output, opts, onProgress);
}

module.exports = {
  getUniversalWebFormats,
  runGenericYtdlp,
  downloadWebVideo
};
