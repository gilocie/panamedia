const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn, spawnSync, execSync } = require('child_process');

const userDataPath = (app && typeof app.getPath === 'function') ? app.getPath('userData') : path.join(process.env.APPDATA || '', 'panamedia');
const binDir = path.join(userDataPath, 'bin');
// Only the compiled media tools are health-checked. Running yt-dlp for a
// version costs a Python interpreter startup, which is not worth paying on
// every launch when nothing downstream depends on the answer.
const HEALTH_CHECKED = new Set(['ffmpeg', 'ffprobe']);
const HEALTH_CACHE_FILE = 'binary-health.json';

let healthCache = null;
function loadHealthCache() {
  if (healthCache) return healthCache;
  try {
    healthCache = JSON.parse(fs.readFileSync(path.join(binDir, HEALTH_CACHE_FILE), 'utf8'));
    if (!healthCache || typeof healthCache !== 'object') healthCache = {};
  } catch (e) {
    healthCache = {};
  }
  return healthCache;
}

function saveHealthCache() {
  try {
    // Keep the cache small: drop entries for files that no longer exist.
    const live = {};
    for (const key of Object.keys(healthCache)) {
      const file = key.split('|')[0];
      if (fs.existsSync(file)) live[key] = healthCache[key];
    }
    fs.writeFileSync(path.join(binDir, HEALTH_CACHE_FILE), JSON.stringify(live));
  } catch (e) {
    // A cache we cannot persist is still usable in-memory for this session.
  }
}

/**
 * A binary that exists is not a binary that runs. An interrupted download
 * leaves a full-sized file that dies with an access violation on the first
 * call, and existence checks happily return it forever -- which is how a
 * corrupt ffprobe ends up silently reporting every file as having no
 * duration, no codec and no dimensions.
 */
function probeBinary(fullPath) {
  const name = path.basename(fullPath).replace(/\.exe$/i, '');
  let st;
  try { st = fs.statSync(fullPath); } catch (e) { return false; }

  const cache = loadHealthCache();
  const key = `${fullPath}|${st.size}|${Math.round(st.mtimeMs)}`;
  if (cache[key] !== undefined) return cache[key];

  let ok = false;
  try {
    const r = spawnSync(fullPath, ['-version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
      windowsHide: true
    });
    // spawnSync surfaces a hard crash as signal SIGSEGV / a negative status.
    ok = !r.error && r.status === 0 && /\bversion\b/i.test(String(r.stdout || ''));
  } catch (e) {
    ok = false;
  }
  cache[key] = ok;
  saveHealthCache();

  if (!ok) {
    // Move the broken file aside so later launches do not keep picking it,
    // and so the file survives for diagnosis.
    try {
      const quarantine = `${fullPath}.corrupt-${Date.now()}`;
      fs.renameSync(fullPath, quarantine);
      console.warn(`[binaries] ${name} at ${fullPath} does not run; moved to ${path.basename(quarantine)}`);
    } catch (e) {
      console.warn(`[binaries] ${name} at ${fullPath} does not run and could not be moved aside: ${e.message}`);
    }
  }
  return ok;
}

function resolveBinary(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const directPath = path.join(binDir, exe);
  const healthCheck = HEALTH_CHECKED.has(name);
  if (healthCheck && !probeBinary(directPath)) {
    // fall through to the other locations
  } else if (fs.existsSync(directPath)) {
    return directPath;
  }

  const appData = process.env.APPDATA || '';
  const candidates = [
    directPath,
    path.join(appData, 'panamedia', 'bin', exe),
    path.join(appData, 'net-downloader', 'bin', exe),
    path.join(appData, 'Electron', 'bin', exe),
    path.join(process.cwd(), 'bin', exe),
    path.join(__dirname, '..', 'bin', exe),
    path.join(__dirname, 'bin', exe)
  ];
  for (const c of candidates) {
    if (!c || !fs.existsSync(c)) continue;
    if (healthCheck && !probeBinary(c)) continue;
    return c;
  }
  return directPath;
}

const ffmpegPath = resolveBinary('ffmpeg');
const ffprobePath = resolveBinary('ffprobe');
const ytdlpPath = resolveBinary('yt-dlp');

/** Diagnostics for the log: which copy each tool actually came from. */
function describeResolvedBinaries() {
  return {
    ffmpeg: ffmpegPath,
    ffprobe: ffprobePath,
    ytdlp: ytdlpPath,
    health: loadHealthCache()
  };
}

const progressRegex = /\[download\]\s+(\d+\.\d+)%\s+of\s+(~\s*)?([0-9.]+[a-zA-Z\/]+)\s+at\s+([0-9.]+[a-zA-Z\/s]+)\s+ETA\s+([0-9:]+)/;

let nodePath = '';
try {
  const cmd = process.platform === 'win32' ? 'where node' : 'which node';
  nodePath = execSync(cmd).toString().trim().split('\n')[0].trim();
} catch (e) {
  console.error('[youtube.cjs] Failed to find node path:', e);
}

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

function checkBinaries() {
  return fs.existsSync(resolveBinary('ffmpeg')) && fs.existsSync(resolveBinary('ffprobe')) && fs.existsSync(resolveBinary('yt-dlp'));
}

let isPaused = false;
let currentRequest = null;
let currentStage = ''; // 'ytdlp_download', 'ffmpeg_download', etc.
let savedProgressData = null;
let globalOnProgress = null;

function downloadWithRedirects(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    isPaused = false;
    let file = null;

    function get(currentUrl) {
      if (isPaused) {
        reject(new Error('Aborted'));
        return;
      }

      // Use a temp file for download so we can pause/resume
      const tempDest = dest + '.tmp';
      let startBytes = 0;
      let headers = {};

      if (fs.existsSync(tempDest)) {
        startBytes = fs.statSync(tempDest).size;
        if (startBytes > 0) {
          headers['Range'] = `bytes=${startBytes}-`;
        }
      }

      const options = { headers };

      currentRequest = https.get(currentUrl, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
        } else if (res.statusCode === 200 || res.statusCode === 206) {
          const isAppend = res.statusCode === 206 && startBytes > 0;
          file = fs.createWriteStream(tempDest, { flags: isAppend ? 'a' : 'w' });

          const contentLen = parseInt(res.headers['content-length'], 10) || 0;
          const total = isAppend ? (startBytes + contentLen) : contentLen;
          let completed = isAppend ? startBytes : 0;

          res.on('data', (chunk) => {
            if (isPaused) {
              res.destroy();
              file.end();
              reject(new Error('Aborted'));
              return;
            }
            file.write(chunk);
            completed += chunk.length;
            if (onProgress && total > 0) {
              onProgress(completed / total);
            }
          });

          res.on('end', () => {
            file.end(() => {
              if (isPaused) {
                reject(new Error('Aborted'));
                return;
              }
              if (total > 0 && completed < total) {
                reject(new Error(`Download truncated: got ${completed} of ${total} bytes`));
                return;
              }
              try {
                if (fs.existsSync(dest)) {
                  fs.unlinkSync(dest);
                }
                fs.renameSync(tempDest, dest);
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          });

          res.on('error', (err) => {
            file.end();
            reject(err);
          });
        } else {
          // If Range request failed or is out of range, clear temp file and retry without range
          if (res.statusCode === 416) {
            try { fs.unlinkSync(tempDest); } catch (e) {}
            startBytes = 0;
            delete headers['Range'];
            get(currentUrl);
          } else {
            reject(new Error(`Failed with status code: ${res.statusCode}`));
          }
        }
      });

      currentRequest.on('error', (err) => {
        if (file) file.end();
        reject(err);
      });
    }

    get(url);
  });
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    try {
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`);
      try { fs.unlinkSync(zipPath); } catch (e) {}
      resolve();
    } catch (e) {
      try {
        if (process.platform === 'win32') {
          execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
        } else {
          execSync(`unzip -o "${zipPath}" -d "${destDir}"`);
        }
        try { fs.unlinkSync(zipPath); } catch (err) {}
        resolve();
      } catch (err) {
        reject(err);
      }
    }
  });
}

async function executeStages(onProgress) {
  globalOnProgress = onProgress;
  isPaused = false;

  const platform = process.platform;
  let ytdlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  let ffmpegUrl = '';
  let ffprobeUrl = '';

  if (platform === 'win32') {
    ytdlpUrl += '.exe';
    ffmpegUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-win-64.zip';
    ffprobeUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-win-64.zip';
  } else if (platform === 'darwin') {
    ytdlpUrl += '_macos';
    ffmpegUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-osx-64.zip';
    ffprobeUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-osx-64.zip';
  } else {
    ffmpegUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-64.zip';
    ffprobeUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-linux-64.zip';
  }

  if (fs.existsSync(ytdlpPath) && (currentStage === 'ytdlp_download' || currentStage === '')) {
    currentStage = 'ffmpeg_download';
  }
  if (fs.existsSync(ffmpegPath) && currentStage === 'ffmpeg_download') {
    currentStage = 'ffprobe_download';
  }
  if (fs.existsSync(ffprobePath) && currentStage === 'ffprobe_download') {
    currentStage = 'completed';
  }

  while (true) {
    if (isPaused) {
      if (onProgress && savedProgressData) {
        onProgress({ ...savedProgressData, isPaused: true });
      }
      throw new Error('Aborted');
    }

    if (currentStage === 'ytdlp_download') {
      if (onProgress) {
        savedProgressData = { status: 'Downloading yt-dlp', progress: 10 };
        onProgress(savedProgressData);
      }
      try {
        await downloadWithRedirects(ytdlpUrl, ytdlpPath, (p) => {
          if (onProgress) {
            savedProgressData = { status: 'Downloading yt-dlp', progress: Math.round(10 + p * 30) };
            onProgress(savedProgressData);
          }
        });
        if (platform !== 'win32') {
          fs.chmodSync(ytdlpPath, 0o755);
        }
        currentStage = 'ffmpeg_download';
      } catch (err) {
        if (isPaused) throw new Error('Aborted');
        throw err;
      }
    }

    else if (currentStage === 'ffmpeg_download') {
      const ffmpegZip = path.join(binDir, 'ffmpeg.zip');
      if (onProgress) {
        savedProgressData = { status: 'Downloading ffmpeg', progress: 40 };
        onProgress(savedProgressData);
      }
      try {
        await downloadWithRedirects(ffmpegUrl, ffmpegZip, (p) => {
          if (onProgress) {
            savedProgressData = { status: 'Downloading ffmpeg', progress: Math.round(40 + p * 30) };
            onProgress(savedProgressData);
          }
        });
        currentStage = 'ffmpeg_extract';
      } catch (err) {
        if (isPaused) throw new Error('Aborted');
        throw err;
      }
    }

    else if (currentStage === 'ffmpeg_extract') {
      const ffmpegZip = path.join(binDir, 'ffmpeg.zip');
      if (onProgress) {
        savedProgressData = { status: 'Extracting ffmpeg', progress: 75 };
        onProgress(savedProgressData);
      }
      try {
        await extractZip(ffmpegZip, binDir);
        if (platform !== 'win32') {
          try { fs.chmodSync(ffmpegPath, 0o755); } catch (e) {}
        }
        currentStage = 'ffprobe_download';
      } catch (err) {
        try { fs.unlinkSync(ffmpegZip); } catch (e) {}
        try { fs.unlinkSync(ffmpegZip + '.tmp'); } catch (e) {}
        currentStage = 'ffmpeg_download';
        throw err;
      }
    }

    else if (currentStage === 'ffprobe_download') {
      const ffprobeZip = path.join(binDir, 'ffprobe.zip');
      if (onProgress) {
        savedProgressData = { status: 'Downloading ffprobe', progress: 80 };
        onProgress(savedProgressData);
      }
      try {
        await downloadWithRedirects(ffprobeUrl, ffprobeZip, (p) => {
          if (onProgress) {
            savedProgressData = { status: 'Downloading ffprobe', progress: Math.round(80 + p * 15) };
            onProgress(savedProgressData);
          }
        });
        currentStage = 'ffprobe_extract';
      } catch (err) {
        if (isPaused) throw new Error('Aborted');
        throw err;
      }
    }

    else if (currentStage === 'ffprobe_extract') {
      const ffprobeZip = path.join(binDir, 'ffprobe.zip');
      if (onProgress) {
        savedProgressData = { status: 'Extracting ffprobe', progress: 95 };
        onProgress(savedProgressData);
      }
      try {
        await extractZip(ffprobeZip, binDir);
        if (platform !== 'win32') {
          try { fs.chmodSync(ffprobePath, 0o755); } catch (e) {}
        }
        currentStage = 'completed';
      } catch (err) {
        try { fs.unlinkSync(ffprobeZip); } catch (e) {}
        try { fs.unlinkSync(ffprobeZip + '.tmp'); } catch (e) {}
        currentStage = 'ffprobe_download';
        throw err;
      }
    }

    else if (currentStage === 'completed') {
      if (onProgress) {
        savedProgressData = { status: 'Installation completed!', progress: 100 };
        onProgress(savedProgressData);
      }
      return;
    }
  }
}

async function installBinaries(onProgress) {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (currentStage === 'completed' || currentStage === '') {
    currentStage = 'ytdlp_download';
  }

  isPaused = false;
  globalOnProgress = onProgress;

  await executeStages(onProgress);
}

function pauseInstall() {
  isPaused = true;
  if (currentRequest) {
    try { currentRequest.destroy(); } catch (e) {}
    currentRequest = null;
  }
  if (globalOnProgress && savedProgressData) {
    globalOnProgress({ ...savedProgressData, isPaused: true });
  }
}
function resumeInstall() {
  isPaused = false;
  if (globalOnProgress) {
    executeStages(globalOnProgress).catch((err) => {
      globalOnProgress({ status: 'error', error: err.message, progress: savedProgressData ? savedProgressData.progress : 0 });
    });
  }
}

function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    const finalArgs = args.includes('--no-update') ? [...args] : ['--no-update', ...args];
    if (nodePath && !finalArgs.includes('--js-runtimes')) {
      finalArgs.push('--js-runtimes', `node:${nodePath}`);
    }
    const proc = spawn(ytdlpPath, finalArgs, { windowsHide: true });
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('yt-dlp operation timed out (120s)'));
    }, 120000);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => stdout += d.toString());
    proc.stderr.on('data', (d) => stderr += d.toString());
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`yt-dlp exited with code ${code}. Stderr: ${stderr}`));
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function getPlaylistInfo(url) {
  const args = ['-J', '--flat-playlist', '--no-warnings', url];
  const stdout = await runYtdlp(args);
  const data = JSON.parse(stdout);
  
  const entries = (data.entries || []).map(entry => {
    let thumbnail = '';
    if (entry.thumbnails && entry.thumbnails.length > 0) {
      thumbnail = entry.thumbnails[entry.thumbnails.length - 1].url;
    } else if (entry.thumbnail) {
      thumbnail = entry.thumbnail;
    } else if (entry.id) {
      thumbnail = `https://img.youtube.com/vi/${entry.id}/hqdefault.jpg`;
    }

    return {
      id: entry.id || '',
      title: entry.title || '',
      url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
      duration: entry.duration || 0,
      thumbnail
    };
  });

  return {
    title: data.title || 'Playlist',
    entries
  };
}

function cleanYoutubeUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com') && parsed.searchParams.has('v')) {
      const v = parsed.searchParams.get('v');
      return `https://www.youtube.com/watch?v=${v}`;
    }
    if (parsed.hostname.includes('youtu.be')) {
      const v = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
  } catch (e) {}
  return url;
}

async function getVideoFormats(url) {
  const cleanUrl = cleanYoutubeUrl(url);
  const args = [
    '-J',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--force-ipv4',
    cleanUrl
  ];
  const stdout = await runYtdlp(args);
  const raw = JSON.parse(stdout);
  const data = (raw.entries && raw.entries.length > 0) ? raw.entries[0] : raw;

  const duration = data.duration || 0;

  let bestAudioSize = Math.round((128000 * duration) / 8);
  let bestAudioFormatId = 'bestaudio[ext=m4a]/bestaudio/best';
  
  if (data.formats) {
    const rawAudioFormats = data.formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
    if (rawAudioFormats.length > 0) {
      rawAudioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
      const bestRaw = rawAudioFormats[0];
      bestAudioFormatId = bestRaw.format_id;
      bestAudioSize = bestRaw.filesize || bestRaw.filesize_approx || Math.round(((bestRaw.abr || 128) * 1000 * duration) / 8);
    }
  }

  const audioFormats = [
    {
      label: 'High Quality (MP3 320kbps)',
      format: 'mp3',
      size: Math.round((320000 * duration) / 8),
      bitrate: 320,
      formatId: 'bestaudio/best'
    },
    {
      label: 'Medium Quality (MP3 192kbps)',
      format: 'mp3',
      size: Math.round((192000 * duration) / 8),
      bitrate: 192,
      formatId: 'bestaudio/best'
    },
    {
      label: 'Standard Quality (MP3 128kbps)',
      format: 'mp3',
      size: Math.round((128000 * duration) / 8),
      bitrate: 128,
      formatId: 'bestaudio/best'
    },
    {
      label: 'Raw Audio (M4A/AAC)',
      format: 'm4a',
      size: bestAudioSize,
      isRaw: true,
      formatId: bestAudioFormatId
    }
  ];

  const videoFormats = [];

  if (data.formats) {
    const rawVideoFormats = data.formats.filter(f => f.vcodec && f.vcodec !== 'none');
    const maxHeight = Math.max(...rawVideoFormats.map(f => f.height || 0), data.height || 0);
    const maxWidth = Math.max(...rawVideoFormats.map(f => f.width || 0), data.width || 0);

    const targets = [
      { label: '8K (4320p)', height: 4320, width: 7680, minH: 3000, minW: 5000, bitrate: 30000 },
      { label: '4K (2160p)', height: 2160, width: 3840, minH: 1800, minW: 3000, bitrate: 15000 },
      { label: '2K (1440p)', height: 1440, width: 2560, minH: 1200, minW: 2000, bitrate: 8000 },
      { label: '1080p', height: 1080, width: 1920, minH: 900, minW: 1600, bitrate: 4500 },
      { label: '720p', height: 720, width: 1280, minH: 600, minW: 1000, bitrate: 2200 },
      { label: '480p', height: 480, width: 854, minH: 400, minW: 700, bitrate: 1200 },
      { label: '360p', height: 360, width: 640, minH: 300, minW: 500, bitrate: 700 }
    ];

    for (const target of targets) {
      const matches = rawVideoFormats.filter(f => 
        (f.height && f.height >= target.minH && f.height <= target.height + 60) ||
        (f.width && f.width >= target.minW && f.width <= target.width + 100)
      );

      const hasResolution = matches.length > 0 || (maxHeight >= target.minH || maxWidth >= target.minW);

      if (hasResolution) {
        let bestStream = null;
        if (matches.length > 0) {
          matches.sort((a, b) => {
            const sizeA = a.filesize || a.filesize_approx || 0;
            const sizeB = b.filesize || b.filesize_approx || 0;
            return sizeB - sizeA;
          });
          bestStream = matches[0];
        }

        let videoSize = bestStream ? (bestStream.filesize || bestStream.filesize_approx || 0) : 0;
        if (videoSize === 0) {
          const estimatedBitrate = (bestStream && (bestStream.vbr || bestStream.tbr))
            ? (bestStream.vbr || bestStream.tbr)
            : target.bitrate;
          videoSize = Math.round((estimatedBitrate * 1000 * duration) / 8);
        }

        const totalSize = videoSize + bestAudioSize;
        const targetStreamId = (bestStream && bestStream.format_id) ? bestStream.format_id : null;
        // Prioritize the exact highest-bitrate stream matching the displayed size
        const formatId = targetStreamId
          ? `${targetStreamId}+bestaudio[ext=m4a]/${targetStreamId}+bestaudio/bestvideo[height<=${target.height}][height>=${target.minH}]+bestaudio[ext=m4a]/bestvideo[height<=${target.height}]+bestaudio`
          : (target.minH > 360
              ? `bestvideo[height<=${target.height}][height>=${target.minH}]+bestaudio[ext=m4a]/bestvideo[height<=${target.height}][height>=${target.minH}]+bestaudio/bestvideo[height<=${target.height}]+bestaudio`
              : `bestvideo[height<=${target.height}]+bestaudio[ext=m4a]/bestvideo[height<=${target.height}]+bestaudio/best[height<=${target.height}]/best`);

        videoFormats.push({
          label: target.label,
          size: totalSize,
          formatId
        });
      }
    }
  }

  if (videoFormats.length === 0) {
    const fallbackResolutions = [
      { label: '1080p', height: 1080, minH: 900, bitrate: 4500 },
      { label: '720p', height: 720, minH: 600, bitrate: 2200 },
      { label: '480p', height: 480, minH: 400, bitrate: 1200 },
      { label: '360p', height: 360, minH: 0, bitrate: 700 }
    ];
    for (const fb of fallbackResolutions) {
      const formatId = fb.minH > 0
        ? `bestvideo[height<=${fb.height}][height>=${fb.minH}]+bestaudio[ext=m4a]/bestvideo[height<=${fb.height}][height>=${fb.minH}]+bestaudio/bestvideo[height<=${fb.height}]+bestaudio`
        : `bestvideo[height<=${fb.height}]+bestaudio[ext=m4a]/bestvideo[height<=${fb.height}]+bestaudio/best[height<=${fb.height}]/best`;
      videoFormats.push({
        label: fb.label,
        size: Math.round(((fb.bitrate + 128) * 1000 * duration) / 8),
        formatId
      });
    }
  }

  let thumbnail = '';
  if (data.id) {
    thumbnail = `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`;
  } else if (data.thumbnails && data.thumbnails.length > 0) {
    thumbnail = data.thumbnails[data.thumbnails.length - 1].url;
  } else if (data.thumbnail) {
    thumbnail = data.thumbnail;
  }

  return {
    id: data.id || '',
    title: data.title || 'Video',
    thumbnail,
    duration,
    videoFormats,
    audioFormats
  };
}

function downloadYoutubeVideo(url, output, opts, onProgress) {
  const cleanUrl = cleanYoutubeUrl(url);
  const args = [
    '--no-playlist',
    '--no-check-certificates',
    '--force-ipv4',
    '--format-sort', 'res,vbr,filesize',
    '--retries', '10',
    '--fragment-retries', '10',
    '--file-access-retries', '5'
  ];
  if (nodePath) {
    args.push('--js-runtimes', `node:${nodePath}`);
  }

  const cookie = opts.headers?.Cookie || opts.headers?.cookie || opts.cookies || '';
  if (cookie) {
    args.push('--add-header', `Cookie:${cookie}`);
  }
  const referer = opts.referer || opts.headers?.Referer || opts.headers?.referer || '';
  if (referer) {
    args.push('--referer', referer);
  }
  args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  if (opts.format) {
    args.push('-f', opts.format);
    if (!opts.isAudioOnly) {
      args.push('--merge-output-format', 'mp4');
    }
  } else if (opts.isAudioOnly) {
    args.push('-f', 'bestaudio/best');
  } else {
    args.push('-f', 'bestvideo+bestaudio/best');
    args.push('--merge-output-format', 'mp4');
  }

  if (opts.isAudioOnly) {
    args.push('-x');
    if (opts.isRaw) {
      args.push('--audio-format', 'm4a');
    } else {
      args.push('--audio-format', 'mp3');
      args.push('--audio-quality', '0');
    }
  }

  args.push('--ffmpeg-location', ffmpegPath);
  args.push('-o', output);
  args.push(cleanUrl);

  const startTime = Date.now();
  const proc = spawn(ytdlpPath, args, { windowsHide: true });

  const promise = new Promise((resolve, reject) => {
    let lastStderr = '';
    proc.stdout.on('data', (data) => {
      const line = data.toString();
      const match = line.match(progressRegex);
      if (match) {
        const percent = parseFloat(match[1]);
        const size = match[3];
        const speed = match[4];
        const eta = match[5];
        
        const total = parseSizeToBytes(size);
        const downloaded = Math.round(total * (percent / 100));
        
        onProgress({
          status: 'downloading',
          progress: percent / 100,
          size,
          speed,
          eta,
          downloadedBytes: downloaded,
          totalBytes: total
        });
      } else if (
        line.includes('Merging formats') ||
        line.includes('[Merger]') ||
        line.includes('[ExtractAudio]') ||
        line.includes('[ffmpeg]') ||
        line.includes('[Fixup') ||
        line.includes('Deleting original file')
      ) {
        onProgress({
          status: 'merging',
          progress: 0.99,
          size: '',
          speed: 'Finishing...',
          eta: '00:00'
        });
      } else if (line.includes('100% of') || line.includes('has already been downloaded')) {
        onProgress({
          status: 'merging',
          progress: 1.0,
          size: '',
          speed: 'Finishing...',
          eta: '00:00'
        });
      }
    });

    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      lastStderr += msg;
      if (lastStderr.length > 2000) lastStderr = lastStderr.slice(-2000);
      console.error('[yt-dlp error]', msg);
    });

    proc.on('close', (code) => {
      // 1. Direct success
      if (code === 0 && fs.existsSync(output) && fs.statSync(output).size > 0) {
        return resolve(output);
      }

      // 2. Output file exists despite non-zero exit code (e.g. minor postprocessing warning)
      // Only resolve if file was modified recently during this download
      if (fs.existsSync(output)) {
        const stat = fs.statSync(output);
        if (stat.size > 1024 * 512 && stat.mtimeMs >= startTime - 3000) {
          console.log('[yt-dlp] Output file exists and was modified during download despite code', code, '- completing successfully.');
          return resolve(output);
        }
      }

      // 3. Output saved with alternative extension (e.g. .mkv, .webm, .m4a, .mp3)
      const dotIdx = output.lastIndexOf('.');
      if (dotIdx !== -1) {
        const base = output.substring(0, dotIdx);
        for (const altExt of ['.mp4', '.mkv', '.webm', '.mp3', '.m4a']) {
          const altPath = base + altExt;
          if (fs.existsSync(altPath)) {
            const altStat = fs.statSync(altPath);
            if (altStat.size > 1024 * 512 && altStat.mtimeMs >= startTime - 3000) {
              console.log('[yt-dlp] Found completed file at', altPath);
              return resolve(altPath);
            }
          }
        }
      }

      if (code === 0) {
        resolve(output);
      } else {
        const extraErr = lastStderr.trim() ? ` Details: ${lastStderr.trim().slice(-200)}` : '';
        reject(new Error(`yt-dlp exited with code ${code}.${extraErr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });

  return { promise, proc };
}

function compressVideo(inputPath, outputPath, crf = 23) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx265',
      '-crf', crf.toString(),
      '-c:a', 'copy',
      outputPath
    ], { windowsHide: true });
    proc.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg compression failed with code ${code}`));
    });
    proc.on('error', reject);
  });
}

function generateVideoThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-y',
      '-i', videoPath,
      '-ss', '00:00:01',
      '-vframes', '1',
      '-q:v', '2',
      thumbnailPath
    ], { windowsHide: true });
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}

module.exports = {
  checkBinaries,
  installBinaries,
  pauseInstall,
  resumeInstall,
  getPlaylistInfo,
  getVideoFormats,
  downloadYoutubeVideo,
  compressVideo,
  generateVideoThumbnail,
  binDir,
  ffmpegPath,
  ffprobePath,
  resolveBinary,
  describeResolvedBinaries,
  cleanYoutubeUrl
};