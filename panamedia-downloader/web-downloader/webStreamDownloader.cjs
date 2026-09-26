const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, exec } = require('child_process');
const { ffmpegPath, resolveBinary } = require('../youtube.cjs');

/**
 * Parses time string (HH:MM:SS.ms) into total seconds.
 */
function parseFfmpegTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
}

/**
 * Follows HTTP/HTTPS redirects to locate final media URL and headers.
 */
function resolveFinalMediaUrl(initialUrl, customHeaders = {}, maxRedirects = 8) {
  return new Promise((resolve) => {
    let currentUrl = initialUrl;
    let redirects = 0;

    function step(urlStr) {
      try {
        const u = new URL(urlStr);
        const mod = u.protocol === 'http:' ? http : https;
        const cookie = customHeaders.Cookie || customHeaders.cookie || '';
        const req = mod.request(urlStr, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': customHeaders.Referer || customHeaders.referer || (u.origin + '/'),
            ...(cookie ? { 'Cookie': cookie } : {}),
            'Range': 'bytes=0-1',
            'Accept': '*/*'
          },
          timeout: 7000
        }, (res) => {
          res.destroy();
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            redirects++;
            if (redirects > maxRedirects) {
              return resolve({ finalUrl: urlStr, headers: res.headers, statusCode: res.statusCode });
            }
            const nextUrl = new URL(res.headers.location, urlStr).href;
            return step(nextUrl);
          }

          let totalBytes = 0;
          const cr = res.headers['content-range'];
          if (cr) {
            const m = cr.match(/\/(\d+)/);
            if (m) totalBytes = parseInt(m[1], 10);
          }
          if (!totalBytes && res.headers['content-length']) {
            totalBytes = parseInt(res.headers['content-length'], 10);
          }

          resolve({
            finalUrl: urlStr,
            headers: res.headers,
            statusCode: res.statusCode,
            totalBytes: totalBytes > 0 ? totalBytes : 0
          });
        });

        req.on('error', () => resolve({ finalUrl: urlStr, headers: {}, statusCode: 0, totalBytes: 0 }));
        req.on('timeout', () => { req.destroy(); resolve({ finalUrl: urlStr, headers: {}, statusCode: 0, totalBytes: 0 }); });
        req.end();
      } catch (e) {
        resolve({ finalUrl: urlStr, headers: {}, statusCode: 0, totalBytes: 0 });
      }
    }

    step(currentUrl);
  });
}

/**
 * Downloads a direct media stream (.mp4, .m4v, .webm, etc.) using HTTP/HTTPS range streaming.
 */
function downloadDirectStream(url, output, opts = {}, onProgress) {
  let isAborted = false;
  let activeReq = null;
  let fileStream = null;

  const promise = new Promise(async (resolve, reject) => {
    try {
      const resolved = await resolveFinalMediaUrl(url, opts.headers || { Referer: opts.referer || opts.pageUrl });
      const targetUrl = resolved.finalUrl || url;
      const expectedTotal = opts.totalBytes && opts.totalBytes > 0 ? opts.totalBytes : (resolved.totalBytes || 0);

      const u = new URL(targetUrl);
      const mod = u.protocol === 'http:' ? http : https;

      const cookie = opts.cookies || opts.headers?.Cookie || opts.headers?.cookie || '';
      const referer = opts.referer || opts.headers?.Referer || opts.headers?.referer || opts.pageUrl || (u.origin + '/');
      const reqHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': referer,
        ...(cookie ? { 'Cookie': cookie } : {}),
        'Accept': '*/*'
      };

      let startBytes = 0;
      const tempPath = output + '.tmp';
      if (fs.existsSync(tempPath)) {
        startBytes = fs.statSync(tempPath).size;
        if (startBytes > 0 && (!expectedTotal || startBytes < expectedTotal)) {
          reqHeaders['Range'] = `bytes=${startBytes}-`;
        } else if (expectedTotal && startBytes >= expectedTotal) {
          fs.renameSync(tempPath, output);
          return resolve(output);
        }
      }

      const req = mod.request(targetUrl, {
        method: 'GET',
        headers: reqHeaders,
        timeout: 25000
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, targetUrl).href;
          return downloadDirectStream(redirectUrl, output, opts, onProgress).promise.then(resolve).catch(reject);
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          return reject(new Error(`Server returned HTTP ${res.statusCode} when downloading stream`));
        }

        const isAppend = res.statusCode === 206 && startBytes > 0;
        fileStream = fs.createWriteStream(tempPath, { flags: isAppend ? 'a' : 'w' });

        let contentLength = parseInt(res.headers['content-length'], 10) || 0;
        const total = isAppend ? (startBytes + contentLength) : (contentLength || expectedTotal);

        let downloaded = startBytes;
        let lastTime = Date.now();
        let lastDownloaded = downloaded;

        res.on('data', (chunk) => {
          if (isAborted) {
            res.destroy();
            return;
          }
          downloaded += chunk.length;

          const now = Date.now();
          if (now - lastTime >= 500) {
            const timeDiff = (now - lastTime) / 1000;
            const bytesDiff = downloaded - lastDownloaded;
            const speedBytes = Math.round(bytesDiff / timeDiff);
            const speedStr = speedBytes > 1024 * 1024
              ? (speedBytes / (1024 * 1024)).toFixed(2) + ' MB/s'
              : (speedBytes / 1024).toFixed(1) + ' KB/s';

            let etaStr = '--:--';
            if (total > downloaded && speedBytes > 0) {
              const remainingSec = Math.round((total - downloaded) / speedBytes);
              const m = Math.floor(remainingSec / 60);
              const s = remainingSec % 60;
              etaStr = `${m}:${s < 10 ? '0' : ''}${s}`;
            }

            const pct = total > 0 ? (downloaded / total) : 0.5;

            if (onProgress) {
              onProgress({
                status: 'downloading',
                progress: Math.min(0.99, pct),
                size: total > 0 ? (total / (1024 * 1024)).toFixed(1) + ' MB' : '',
                speed: speedStr,
                eta: etaStr,
                downloadedBytes: downloaded,
                totalBytes: total
              });
            }

            lastTime = now;
            lastDownloaded = downloaded;
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            if (isAborted) return;
            try {
              if (fs.existsSync(tempPath)) {
                if (fs.existsSync(output)) fs.unlinkSync(output);
                fs.renameSync(tempPath, output);
              }
              resolve(output);
            } catch (err) {
              reject(err);
            }
          });
        });

        fileStream.on('error', (err) => {
          reject(err);
        });
      });

      req.on('error', (err) => {
        if (!isAborted) reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timed out while downloading stream'));
      });

      activeReq = req;
      req.end();
    } catch (err) {
      reject(err);
    }
  });

  const proc = {
    abort: () => {
      isAborted = true;
      if (activeReq) try { activeReq.destroy(); } catch (e) {}
      if (fileStream) try { fileStream.destroy(); } catch (e) {}
    },
    kill: () => {
      isAborted = true;
      if (activeReq) try { activeReq.destroy(); } catch (e) {}
      if (fileStream) try { fileStream.destroy(); } catch (e) {}
    }
  };

  return { promise, proc };
}

/**
 * Fetches playlist raw text over HTTP/HTTPS with redirect support.
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
 * Parses HLS master playlist to resolve the exact maximum quality (1080p+) stream variant and audio rendition.
 * Prevents FFmpeg from defaulting to lower 480p/720p streams.
 */
async function resolveMaxQualityHlsVariant(url, headers = {}) {
  try {
    const text = await fetchPlaylistText(url, headers);
    if (!text || !text.includes('#EXTM3U') || !text.includes('#EXT-X-STREAM-INF')) {
      return { videoUrl: url, audioUrl: null };
    }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const variants = [];
    let audioUrl = null;

    for (const line of lines) {
      if (line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO') && !audioUrl) {
        const uriMatch = line.match(/URI=["']([^"']+)["']/i);
        if (uriMatch) {
          try { audioUrl = new URL(uriMatch[1], url).href; } catch (e) {}
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const inf = line.substring('#EXT-X-STREAM-INF:'.length);
        const resMatch = inf.match(/RESOLUTION=(\d+)x(\d+)/i);
        const width = resMatch ? parseInt(resMatch[1], 10) : 0;
        let height = resMatch ? parseInt(resMatch[2], 10) : 0;
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
          if (!height) {
            if (/1080|1920|fhd/i.test(uri)) height = 1080;
            else if (/720|1280|hd/i.test(uri)) height = 720;
            else if (/2160|3840|4k/i.test(uri)) height = 2160;
            else if (bandwidth > 3000000) height = 1080;
            else if (bandwidth > 1500000) height = 720;
            else height = 480;
          }

          try {
            const absoluteUrl = new URL(uri, url).href;
            variants.push({
              height,
              width,
              bandwidth: bandwidth || (height >= 1080 ? 4000000 : 2000000),
              url: absoluteUrl
            });
          } catch (e) {}
        }
      }
    }

    if (variants.length > 0) {
      variants.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0));
      console.log(`[WebStreamDownloader] Auto-resolved master playlist to max quality: ${variants[0].height}p (${variants[0].url})`);
      return { videoUrl: variants[0].url, audioUrl };
    }
  } catch (err) {
    console.warn('[WebStreamDownloader] resolveMaxQualityHlsVariant error:', err.message);
  }

  return { videoUrl: url, audioUrl: null };
}

/**
 * Downloads an HLS .m3u8 stream using FFmpeg direct segment multiplexing.
 */
function downloadHlsStream(url, output, opts = {}, onProgress) {
  let isAborted = false;
  let ffmpegProc = null;

  const promise = new Promise(async (resolve, reject) => {
    try {
      const cookie = opts.cookies || opts.headers?.Cookie || opts.headers?.cookie || '';
      const referer = opts.referer || opts.headers?.Referer || opts.headers?.referer || opts.pageUrl || '';
      let headerStr = '';
      if (cookie) headerStr += `Cookie: ${cookie}\r\n`;
      if (referer) headerStr += `Referer: ${referer}\r\n`;
      headerStr += `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n`;

      // Guarantee exact max quality: resolve master HLS playlist to the 1080p / top resolution stream
      const { videoUrl, audioUrl } = await resolveMaxQualityHlsVariant(url, { Referer: referer, Cookie: cookie });
      if (isAborted) return reject(new Error('Download cancelled by user'));

      const duration = opts.duration || 0;

      const runFfmpeg = (extraAudioArgs) => {
        return new Promise((resSpawn, rejSpawn) => {
          const args = [
            '-y',
            '-allowed_extensions', 'ALL',
            '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,data',
            '-headers', headerStr,
            '-i', videoUrl
          ];
          if (audioUrl && audioUrl !== videoUrl) {
            args.push('-headers', headerStr, '-i', audioUrl);
          }
          args.push(...extraAudioArgs);
          args.push('-movflags', '+faststart', output);

          ffmpegProc = spawn(ffmpegPath, args, { windowsHide: true });
          let lastStderr = '';

          ffmpegProc.stderr.on('data', (data) => {
            const line = data.toString();
            lastStderr += line;
            if (lastStderr.length > 2000) lastStderr = lastStderr.slice(-2000);

            // FFmpeg progress format: size=   12544kB time=00:05:23.45 bitrate= 317.5kbits/s speed=4.5x
            const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
            const sizeMatch = line.match(/size=\s*(\d+)kB/i);
            const speedMatch = line.match(/speed=\s*([0-9.]+x)/i);

            if (timeMatch && onProgress) {
              const currentSeconds = parseFfmpegTime(timeMatch[1]);
              const pct = duration > 0 ? Math.min(0.99, currentSeconds / duration) : 0.5;
              const currentKb = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
              const downloadedBytes = currentKb * 1024;
              const estTotalBytes = duration > 0 ? Math.round((downloadedBytes / Math.max(0.01, pct))) : 0;

              onProgress({
                status: 'downloading',
                progress: pct,
                size: downloadedBytes > 0 ? (downloadedBytes / (1024 * 1024)).toFixed(1) + ' MB' : '',
                speed: speedMatch ? speedMatch[1] : 'Streaming...',
                eta: duration > 0 && pct > 0 ? `${Math.round(duration - currentSeconds)}s` : '--:--',
                downloadedBytes,
                totalBytes: estTotalBytes
              });
            }
          });

          ffmpegProc.on('close', (code) => {
            if (isAborted) return rejSpawn(new Error('Download cancelled by user'));
            if (code === 0 && fs.existsSync(output) && fs.statSync(output).size > 0) {
              return resSpawn(output);
            }
            if (fs.existsSync(output) && fs.statSync(output).size > 1024 * 512) {
              return resSpawn(output);
            }
            rejSpawn(new Error(lastStderr.trim() || `FFmpeg exited with code ${code}`));
          });

          ffmpegProc.on('error', (err) => {
            rejSpawn(err);
          });
        });
      };

      try {
        // Attempt 1: Fast direct stream copy
        await runFfmpeg(['-c', 'copy', '-bsf:a', 'aac_adtstoasc']);
        return resolve(output);
      } catch (err1) {
        if (isAborted) return reject(err1);
        console.warn('[WebStreamDownloader] Direct stream copy failed, falling back to audio-transcode copy:', err1.message);
        try {
          // Attempt 2: Copy video untouched (100% max original video quality), transcode audio to universal aac
          await runFfmpeg(['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k']);
          return resolve(output);
        } catch (err2) {
          return reject(err2);
        }
      }
    } catch (err) {
      reject(err);
    }
  });

  const proc = {
    abort: () => {
      isAborted = true;
      if (ffmpegProc) {
        try {
          if (process.platform === 'win32') exec(`taskkill /pid ${ffmpegProc.pid} /t /f`);
          else ffmpegProc.kill('SIGKILL');
        } catch (e) {}
      }
    },
    kill: () => {
      isAborted = true;
      if (ffmpegProc) {
        try {
          if (process.platform === 'win32') exec(`taskkill /pid ${ffmpegProc.pid} /t /f`);
          else ffmpegProc.kill('SIGKILL');
        } catch (e) {}
      }
    }
  };

  return { promise, proc };
}

/**
 * Unified Custom Web Video Downloader.
 * Routes directly to HTTP streaming or HLS copy without touching YouTube or yt-dlp scraping.
 */
function downloadWebStream(url, output, opts = {}, onProgress) {
  const cleanUrl = url.split('?')[0].toLowerCase();
  const isHls = cleanUrl.endsWith('.m3u8') || url.includes('.m3u8');

  console.log(`[Web Stream Downloader] Starting stream download: ${url} (isHls: ${isHls})`);

  if (isHls) {
    return downloadHlsStream(url, output, opts, onProgress);
  }

  // Direct MP4 or video stream
  return downloadDirectStream(url, output, opts, onProgress);
}

module.exports = {
  downloadWebStream,
  downloadDirectStream,
  downloadHlsStream,
  resolveFinalMediaUrl
};
