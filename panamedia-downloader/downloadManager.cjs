const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { SegmentedDownloader } = require('./downloader.cjs');
const { downloadYoutubeVideo, compressVideo, cleanYoutubeUrl, isYoutubeUrl } = require('./youtube/youtubeDownloader.cjs');
const { downloadWebStream } = require('./web-downloader/webStreamDownloader.cjs');
const { ffmpegPath, ffprobePath, generateVideoThumbnail } = require('./youtube.cjs');
const traffic = require('./trafficController.cjs');

let activeDownloads = {}; // Stores SegmentedDownloader / youtube tasks
let downloadsList = [];
let currentNetSpeed = 0;
let netSpeedTimer = null;
let queueTimer = null;

let getMainWindow = () => null;
let getPlayerWindow = () => null;

let settings = {
  connections: 8,
  downloadDir: path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads'),
  autoCompress: false,
  compressionCRF: 23,
  maxConcurrent: 2
};

const dataDir = () => path.join(app.getPath('userData'));
const downloadsFile = () => path.join(dataDir(), 'downloads.json');

function parseSpeedStringToBytes(v) {
  if (!v || typeof v !== 'string') return 0;
  const clean = v.trim().replace(/\s/g, '');
  const m = clean.match(/^(\d+(?:\.\d+)?)([a-zA-Z\/]*)$/);
  if (!m) return 0;
  const value = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('g')) return Math.round(value * 1024 * 1024 * 1024);
  if (unit.startsWith('m')) return Math.round(value * 1024 * 1024);
  if (unit.startsWith('k')) return Math.round(value * 1024);
  return Math.round(value);
}

function isSocialPlatform(url) {
  if (!url || typeof url !== 'string') return false;
  const l = url.toLowerCase();
  return l.includes('facebook.com') || l.includes('fb.watch') || l.includes('fb.com') ||
    l.includes('instagram.com') || l.includes('tiktok.com') || l.includes('x.com') ||
    l.includes('twitter.com') || l.includes('reddit.com') || l.includes('threads.net') ||
    l.includes('pinterest.com') || l.includes('vimeo.com') || l.includes('dailymotion.com');
}

function parseEtaStringToSeconds(v) {
  if (!v || typeof v !== 'string') return -1;
  const parts = v.split(':').map(Number);
  if (parts.some(isNaN)) return -1;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return -1;
}

function probeMediaDuration(filePath) {
  return new Promise((resolve) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return resolve(0);
      const proc = spawn(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ], { windowsHide: true });
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.on('close', () => {
        const dur = parseFloat(out.trim());
        resolve(!isNaN(dur) && dur > 0 ? Math.round(dur) : 0);
      });
      proc.on('error', () => resolve(0));
    } catch (e) {
      resolve(0);
    }
  });
}

function extractVideoFrameThumbnail(filePath, duration = 0) {
  return new Promise((resolve) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return resolve('');
      const thumbDir = path.join(dataDir(), 'thumbnails');
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
      const thumbFile = path.join(thumbDir, `thumb_${Date.now()}_${Math.round(Math.random() * 1000)}.jpg`);
      const seekSec = duration > 10 ? Math.min(10, Math.round(duration * 0.1)) : 1;
      const seekStr = `00:00:${seekSec < 10 ? '0' : ''}${seekSec}`;
      const proc = spawn(ffmpegPath, [
        '-y',
        '-ss', seekStr,
        '-i', filePath,
        '-vframes', '1',
        '-q:v', '2',
        thumbFile
      ], { windowsHide: true });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(thumbFile) && fs.statSync(thumbFile).size > 500) {
          const b64 = fs.readFileSync(thumbFile).toString('base64');
          try { fs.unlinkSync(thumbFile); } catch (e) {}
          resolve(`data:image/jpeg;base64,${b64}`);
        } else {
          resolve('');
        }
      });
      proc.on('error', () => resolve(''));
    } catch (e) {
      resolve('');
    }
  });
}

function isAdOrGifThumbnail(thumb) {
  if (!thumb || typeof thumb !== 'string') return false;
  const l = thumb.toLowerCase();
  return l.endsWith('.gif') || l.includes('.gif?') || l.includes('.gif#') || l.includes('.gif') ||
    l.includes('data:image/gif') || l.includes('doubleclick') || l.includes('googleads') ||
    l.includes('ad_') || l.includes('ad-') || l.includes('banner') || l.includes('sponsor') ||
    l.includes('promo') || l.includes('exclusive') || l.includes('trafficjunky') || l.includes('advert');
}

// Throttled broadcast — prevents IPC flooding during rapid progress updates
let broadcastTimer = null;
let broadcastPending = false;

function broadcast() {
  const main = getMainWindow();
  const player = getPlayerWindow();
  if (main && !main.isDestroyed()) main.webContents.send('downloads-updated', downloadsList);
  if (player && !player.isDestroyed()) player.webContents.send('downloads-updated', downloadsList);
}

function broadcastThrottled() {
  if (broadcastTimer) {
    broadcastPending = true;
    return;
  }
  broadcast();
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    if (broadcastPending) {
      broadcastPending = false;
      broadcastThrottled();
    }
  }, 300);
}

function saveState() {
  try {
    fs.writeFileSync(downloadsFile(), JSON.stringify(downloadsList, null, 2), 'utf8');
    broadcast();
  } catch (e) {
    console.error('Failed to save downloads state', e);
  }
}

function checkCompleted(task) {
  if (!task.filename) return false;
  const filePath = path.join(task.saveDir, task.filename);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (task.totalBytes > 0 && Math.abs(stat.size - task.totalBytes) < 1024) {
      task.status = 'completed';
      task.locked = true;
      task.completedAt = task.completedAt || Date.now();
      task.downloadedBytes = stat.size;
      task.displayProgress = 100;
      task.speed = 0;
      task.eta = 0;
      task.displaySize = null;
      task.displaySpeed = null;
      task.displayEta = null;
      return true;
    }
  }
  return false;
}

function loadState() {
  try {
    if (!fs.existsSync(downloadsFile())) return;
    downloadsList = JSON.parse(fs.readFileSync(downloadsFile(), 'utf8'));
    downloadsList = downloadsList.map(task => {
      if (isAdOrGifThumbnail(task.thumbnail)) {
        task.thumbnail = '';
      }
      if (task.status === 'completed' && !task.thumbnail && task.filename) {
        const filePath = path.join(task.saveDir, task.filename);
        extractVideoFrameThumbnail(filePath, task.duration || 0).then(th => {
          if (th) {
            task.thumbnail = th;
            saveState();
          }
        }).catch(() => {});
      }
      if (checkCompleted(task)) {
        return task;
      }
      if (task.status === 'downloading' || task.status === 'preparing' || task.status === 'merging') {
        task.status = 'paused';
        task.speed = 0;
        task.eta = -1;
      }
      return task;
    });
  } catch (e) {
    downloadsList = [];
  }
}

function forceComplete(taskId) {
  const task = downloadsList.find(t => t.id === taskId);
  if (!task) return;
  if (activeDownloads[taskId]) {
    try {
      activeDownloads[taskId].pause();
    } catch (e) { }
    delete activeDownloads[taskId];
  }
  traffic.end(taskId);

  task.status = 'completed';
  task.locked = true;
  task.completedAt = Date.now();
  task.displayProgress = 100;
  task.speed = 0;
  task.eta = 0;
  task.displaySize = null;
  task.displaySpeed = null;
  task.displayEta = null;
  saveState();
}

function startDownload(taskId) {
  const task = downloadsList.find(t => t.id === taskId);
  if (!task) {
    traffic.end(taskId);
    return;
  }
  if (task.locked || task.status === 'completed') {
    traffic.end(taskId);
    return;
  }
  if (activeDownloads[taskId]) {
    traffic.end(taskId);
    return;
  }

  if (task.locked || task.status === 'completed') {
    traffic.end(taskId);
    saveState();
    return;
  }

  task.status = 'preparing';
  saveState();

  const isYt = isYoutubeUrl(task.url);
  const isSocial = isSocialPlatform(task.url) || isSocialPlatform(task.pageUrl);
  const useYtDlp = isYt || isSocial || Boolean(task.useYtDlp) || Boolean(task.youtubeOptions?.useYtDlp) || Boolean(task.youtubeOptions?.format && task.youtubeOptions.format.includes('+'));
  const isWebVideo = !isYt && (task.isWebExtractor || !!task.youtubeOptions || task.type === 'web' || useYtDlp);

  if (isYt || isWebVideo) {
    const opts = {
      ...(task.youtubeOptions || {}),
      connections: task.connections || settings.connections,
      referer: task.headers?.Referer || task.headers?.referer || task.pageUrl || '',
      headers: task.headers || {},
      cookies: task.headers?.Cookie || task.headers?.cookie || '',
      duration: task.duration || 0,
      totalBytes: task.totalBytes || 0
    };
    let filename = task.filename || `${isYt ? 'youtube' : 'media'}_${Date.now()}.mp4`;

    if (opts.isAudioOnly) {
      filename = filename.replace(/\.(mp4|mkv|webm)$/i, opts.isRaw ? '.m4a' : '.mp3');
    }

    const output = path.join(task.saveDir, filename);
    task.filename = filename;

    const downloadUrl = (useYtDlp && task.pageUrl && !task.pageUrl.includes('fbcdn.net') && !task.pageUrl.includes('cdninstagram.com'))
      ? task.pageUrl
      : task.url;

    console.log(`[DownloadManager] Starting task ${taskId} | Engine: ${useYtDlp ? (isYt ? 'YouTube (Isolated)' : 'yt-dlp Multi-Stream Merger') : 'Custom Web Stream (Direct/HLS)'} | Target: ${downloadUrl}`);

    const downloadFn = useYtDlp ? downloadYoutubeVideo : downloadWebStream;
    const { promise, proc } = downloadFn(downloadUrl, output, opts, (p) => {
      if (task.locked) return;
      task.status = p.status;

      task.displayProgress = Math.round((p.progress || 0) * 100);

      task.speed = parseSpeedStringToBytes(p.speed);
      task.eta = parseEtaStringToSeconds(p.eta);
      if (p.size && p.size !== '0' && p.size !== 'Unknown') {
        task.displaySize = p.size;
      }
      if (p.totalBytes) {
        // Prevent smaller secondary streams (like 4.5MB audio) from overwriting a 200MB+ video totalBytes
        if (!task.totalBytes || task.totalBytes <= 0 || p.totalBytes >= (task.totalBytes * 0.7)) {
          task.totalBytes = Math.max(task.totalBytes || 0, p.totalBytes);
          task.downloadedBytes = p.downloadedBytes;
        } else {
          // Keep the main video totalBytes; update downloaded progress proportionally
          task.downloadedBytes = Math.min(task.totalBytes, Math.max(task.downloadedBytes || 0, Math.round(task.totalBytes * (p.progress || 0))));
        }
      }

      broadcastThrottled();
    });

    activeDownloads[taskId] = {
      type: isYt ? 'youtube' : 'web',
      proc,
      pause: () => {
        try {
          if (proc.abort) proc.abort();
          else if (proc.kill) {
            if (process.platform === 'win32' && proc.pid) exec(`taskkill /pid ${proc.pid} /t /f`);
            else proc.kill('SIGKILL');
          }
        } catch (e) { }
      }
    };

    promise.then(async (filePath) => {
      // Let the OS filesystem settle and antivirus release locks before we stat the file
      await new Promise(resolve => setTimeout(resolve, 1500));

      traffic.end(taskId);
      delete activeDownloads[taskId];

      if (filePath) {
        task.filename = path.basename(filePath);
      }

      task.status = 'completed';
      task.locked = true;
      task.completedAt = Date.now();
      task.displayProgress = 100;
      task.speed = 0;
      task.eta = 0;
      task.displaySize = null;
      task.displaySpeed = null;
      task.displayEta = null;

      let st = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (fs.existsSync(filePath)) {
            st = fs.statSync(filePath);
            break;
          }
        } catch (e) { }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (st) {
        task.totalBytes = st.size;
        task.downloadedBytes = st.size;
      }

      // 1. Probe exact file duration from the downloaded video using ffprobe
      try {
        const probedDuration = await probeMediaDuration(filePath);
        if (probedDuration > 0) {
          task.duration = probedDuration;
        }
      } catch (e) { }

      const ext = path.extname(filePath).toLowerCase();
      const audioOnly = ['.mp3', '.m4a', '.aac', '.wav'].includes(ext);

      // 2. Extract authentic video frame thumbnail directly from the downloaded file
      if (!audioOnly) {
        try {
          const videoThumb = await extractVideoFrameThumbnail(filePath, task.duration || 0);
          if (videoThumb) {
            task.thumbnail = videoThumb;
          }
        } catch (e) { }
      }

      saveState();
      broadcast();

      const main = getMainWindow();
      if (main) main.webContents.send('download-completed-toast', task.filename);
    }).catch((err) => {
      traffic.end(taskId);
      delete activeDownloads[taskId];
      if (task.status === 'paused') return;
      task.status = 'failed';
      task.error = err?.message || 'Download failed';
      saveState();
      broadcast();
    });

    return;
  }

  // Normal segmented download
  const downloader = new SegmentedDownloader(task);
  activeDownloads[taskId] = downloader;

  downloader.on('status', (d) => {
    if (task.locked) return;
    task.status = d.status;
    saveState();
  });

  downloader.on('progress', (d) => {
    if (task.locked) return;
    task.downloadedBytes = d.downloadedBytes;
    task.totalBytes = d.totalBytes;
    task.speed = d.speed;
    task.eta = d.eta;
    const pct = task.totalBytes > 0 ? Math.round((task.downloadedBytes / task.totalBytes) * 100) : 0;
    task.displayProgress = pct;
    broadcastThrottled();
  });

  downloader.on('completed', async () => {
    traffic.end(taskId);
    delete activeDownloads[taskId];
    task.status = 'completed';
    task.locked = true;
    task.completedAt = Date.now();
    task.displayProgress = 100;
    task.speed = 0;
    task.eta = 0;
    task.displaySize = null;
    task.displaySpeed = null;
    task.displayEta = null;
    saveState();
    
    const main = getMainWindow();
    if (main) main.webContents.send('download-completed-toast', task.filename);
  });

  downloader.on('error', (errStr) => {
    traffic.end(taskId);
    delete activeDownloads[taskId];
    if (task.status === 'paused') return;
    task.status = 'failed';
    task.error = errStr;
    saveState();
  });

  downloader.prepare().then(() => {
    if (task.locked) {
      traffic.end(taskId);
      delete activeDownloads[taskId];
      return;
    }
    task.filename = downloader.filename;
    task.totalBytes = downloader.totalBytes;
    downloader.start();
  }).catch((err) => {
    traffic.end(taskId);
    delete activeDownloads[taskId];
    task.status = 'failed';
    task.error = err?.message || 'Preparation failed';
    saveState();
  });
}

function startQueue() {
  queueTimer = setInterval(() => {
    const active = traffic.activeCount();
    if (active >= settings.maxConcurrent) return;

    const next = downloadsList.find(t => t.status === 'queued');
    if (next) {
      if (traffic.canStart(next.id)) {
        traffic.start(next.id);
        startDownload(next.id);
      }
    }
  }, 2000);
}

function startSpeed() {
  netSpeedTimer = setInterval(() => {
    const total = downloadsList.filter(t => t.status === 'downloading').reduce((a, b) => a + (b.speed || 0), 0);
    currentNetSpeed = total;
    const main = getMainWindow();
    if (main) main.webContents.send('network-speed-update', currentNetSpeed);
  }, 1000);
}

function registerIPC() {
  ipcMain.handle('get-downloads', () => downloadsList);
  ipcMain.handle('get-network-speed', () => currentNetSpeed);

  ipcMain.handle('add-download', (e, data) => {
    const isActualYt = isYoutubeUrl(data.url);
    const isSocial = isSocialPlatform(data.url) || isSocialPlatform(data.pageUrl);
    const useYtDlp = isActualYt || isSocial || Boolean(data.useYtDlp) || Boolean(data.youtubeOptions?.useYtDlp);
    const isWebExtractor = !isActualYt && (data.isWebExtractor || !!data.youtubeOptions);
    const task = {
      id: 'dl_' + Date.now() + '_' + Math.round(Math.random() * 1000),
      url: isActualYt ? cleanYoutubeUrl(data.url) : data.url,
      pageUrl: data.pageUrl || '',
      useYtDlp: useYtDlp,
      filename: data.filename || '',
      saveDir: data.saveDir || settings.downloadDir,
      totalBytes: data.totalBytes || -1,
      downloadedBytes: 0,
      speed: 0,
      eta: -1,
      status: 'queued',
      connections: settings.connections,
      headers: data.headers || {},
      addedAt: Date.now(),
      isYoutube: isActualYt,
      isWebExtractor: isWebExtractor,
      type: isActualYt ? 'youtube' : (useYtDlp ? 'web' : (isWebExtractor ? 'web' : 'normal')),
      thumbnail: isAdOrGifThumbnail(data.thumbnail) ? '' : (data.thumbnail || ''),
      youtubeOptions: data.youtubeOptions || null,
      duration: data.duration || 0
    };
    downloadsList.unshift(task);
    saveState();
    if (data.startImmediately !== false) {
      if (traffic.canStart(task.id)) {
        traffic.start(task.id);
        startDownload(task.id);
      }
    }
    return task;
  });

  ipcMain.handle('pause-download', (e, id) => {
    const task = downloadsList.find(t => t.id === id);
    if (activeDownloads[id]) {
      try { activeDownloads[id].pause(); } catch (e) { }
      delete activeDownloads[id];
    }
    traffic.end(id);
    if (task) {
      task.status = 'paused';
      task.speed = 0;
      task.eta = -1;
    }
    saveState();
  });

  ipcMain.handle('resume-download', (e, id) => {
    const task = downloadsList.find(t => t.id === id);
    if (task) {
      task.status = 'queued';
      saveState();
    }
    return true;
  });

  ipcMain.handle('delete-download', (e, { taskId, deleteFile }) => {
    if (activeDownloads[taskId]) {
      try { activeDownloads[taskId].pause(); } catch (e) { }
      delete activeDownloads[taskId];
    }
    traffic.end(taskId);
    
    const taskIndex = downloadsList.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      const task = downloadsList[taskIndex];
      downloadsList.splice(taskIndex, 1);
      saveState();
      
      if (deleteFile && task.filename) {
        const fullPath = path.join(task.saveDir, task.filename);
        if (fs.existsSync(fullPath)) {
          try { fs.unlinkSync(fullPath); } catch(e) {}
        }
        const partsPath = fullPath + '.parts';
        if (fs.existsSync(partsPath)) {
          try { fs.rmSync(partsPath, { recursive: true, force: true }); } catch(e) {}
        }
      }
    }
    return downloadsList;
  });

  ipcMain.handle('mark-complete-download', (e, id) => {
    forceComplete(id);
    return downloadsList;
  });

  ipcMain.handle('clear-downloads', (e, { filterType }) => {
    const initialLength = downloadsList.length;
    
    const killTask = (id) => {
      if (activeDownloads[id]) {
        try { activeDownloads[id].pause(); } catch (e) {}
        delete activeDownloads[id];
      }
      traffic.end(id);
    };

    const tasksToClear = downloadsList.filter(t => {
      if (filterType === 'all') return true;
      if (filterType === 'pending') return t.status === 'queued' || t.status === 'preparing';
      if (filterType === 'completed') return t.status === 'completed';
      if (filterType === 'paused') return t.status === 'paused';
      if (filterType === 'active') return t.status === 'downloading' || t.status === 'merging' || t.status === 'compressing';
      return false;
    });

    tasksToClear.forEach(t => killTask(t.id));
    downloadsList = downloadsList.filter(t => !tasksToClear.some(tc => tc.id === t.id));

    if (downloadsList.length !== initialLength) {
      saveState();
    }
    return downloadsList;
  });
}

function initDownloadManager(mainFn, playerFn, cfg) {
  getMainWindow = mainFn;
  getPlayerWindow = playerFn;
  settings = cfg || settings;
  traffic.maxConcurrent = settings.maxConcurrent || 2;
  loadState();
  startSpeed();
  startQueue();
  registerIPC();
}

function cleanUpDownloadManager() {
  if (netSpeedTimer) clearInterval(netSpeedTimer);
  if (queueTimer) clearInterval(queueTimer);
  Object.keys(activeDownloads).forEach(id => {
    try { activeDownloads[id].pause(); } catch (e) { }
    traffic.end(id);
  });
  activeDownloads = {};
}

function removeDownloadByPath(filePath) {
  if (!filePath) return false;
  const norm = filePath.toLowerCase().replace(/[\\/]/g, '/');
  const initialLength = downloadsList.length;
  const toRemove = downloadsList.filter(t => (t.filePath || t.path || '').toLowerCase().replace(/[\\/]/g, '/') === norm);
  toRemove.forEach(t => killTask(t.id));
  downloadsList = downloadsList.filter(t => (t.filePath || t.path || '').toLowerCase().replace(/[\\/]/g, '/') !== norm);
  if (downloadsList.length !== initialLength) {
    saveState();
    return true;
  }
  return false;
}

module.exports = {
  initDownloadManager,
  cleanUpDownloadManager,
  getDownloadsList: () => downloadsList,
  removeDownloadByPath,
  saveState
};
