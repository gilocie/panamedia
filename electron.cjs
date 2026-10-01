const { app, BrowserWindow, ipcMain, shell, dialog, Menu, Tray, clipboard, nativeImage, session } = require('electron');

// Prevent any unhandled stream/file error (such as transient EMFILE) from crashing the application
process.on('uncaughtException', (err) => {
  console.error('[Panamedia Main Process uncaughtException]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Panamedia Main Process unhandledRejection]:', reason);
});

// Disable hardware-accelerated video decoding and direct composition video overlays so video frames are decoded and composited cleanly.
// This permanently fixes "SharedImageManager::ProduceMemory: Trying to Produce a Memory representation from a non-existent mailbox"
// and "GetGpuDriverOverlayInfo: Failed to retrieve video device" which causes videos in <webview> to render as a pitch-black box.
app.commandLine.appendSwitch('disable-accelerated-video-decode');
app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
app.commandLine.appendSwitch('disable-features', 'DirectCompositionVideoOverlays,DirectCompositionLetterboxing,D3D11VideoDecoder,VaapiVideoDecoder,PlatformHEVCDecoderSupport,PreloadMediaEngagementData,AutoplayIgnoreWebAudio');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;

function cleanArgPath(arg) {
  if (!arg || typeof arg !== 'string') return '';
  let clean = arg.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  if (clean.startsWith('file:///')) {
    clean = decodeURIComponent(clean.replace(/^file:\/\/\//, ''));
  } else if (clean.startsWith('file://')) {
    clean = decodeURIComponent(clean.replace(/^file:\/\//, ''));
  }
  return clean;
}

// ─── App UserModel ID & Data Dir (isolate dev from installed app) ────────────
const isOpeningMediaAtLaunch = process.argv.some(arg => {
  const clean = cleanArgPath(arg).toLowerCase();
  return ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.net.ts', '.mpg', '.mpeg', '.3gp', '.flv', '.wmv', '.vob', '.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.opus', '.wma'].some(ext => clean.endsWith(ext));
});
const isPlayerLaunch = isOpeningMediaAtLaunch || process.argv.includes('--mode=player');

if (isDev) {
  app.setAppUserModelId(isPlayerLaunch ? 'com.panamedia.player.dev' : 'com.panamedia.app.dev');
  try {
    app.setPath('userData', path.join(app.getPath('appData'), 'panamedia-dev'));
  } catch (e) {}
} else {
  app.setAppUserModelId(isPlayerLaunch ? 'com.panamedia.player' : 'com.panamedia.app');
}

// ─── Single Instance Lock ──────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Electron] Another instance of Panamedia is already running. Quitting duplicate instance.');
  app.quit();
}
// ──────────────────────────────────────────────────────────────────────────────

app.on('child-process-gone', (event, details) => {
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    console.warn('[Electron] GPU process notification:', details.reason, details.exitCode);
  }
});

// Prevent SSL handshake failures (net_error -113) on third-party live media edge CDNs
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});
// ──────────────────────────────────────────────────────────────────────────────
const http = require('http');
const https = require('https');
const os = require('os');
const { exec, execFile } = require('child_process');
const dns = require('dns');
const { 
  checkBinaries, 
  installBinaries, 
  pauseInstall,
  resumeInstall,
  getPlaylistInfo,
  getVideoFormats,
  generateVideoThumbnail,
  binDir,
  ffmpegPath,
  ffprobePath,
  resolveBinary
} = require('./panamedia-downloader/youtube.cjs');
const { initDownloadManager, cleanUpDownloadManager, getDownloadsList, removeDownloadByPath } = require('./panamedia-downloader/downloadManager.cjs');
const { getUniversalWebFormats } = require('./panamedia-downloader/web-downloader/webExtractor.cjs');
const { convertAndSendToDrive, convertMediaFile } = require('./panamedia-downloader/mediaConverter.cjs');

// ─── Production vs Development URL resolution ─────────────────────────────────
function getAppUrl(queryString = '') {
  if (isDev) {
    return `http://localhost:5173${queryString ? '?' + queryString : ''}`;
  }
  // In production, load from bundled dist/index.html
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  return `file://${indexPath}${queryString ? '?' + queryString : ''}`;
}

function getIconPath(filename) {
  // 1. External physical resources directory (created by electron-builder extraResources)
  if (process.resourcesPath) {
    const p1 = path.join(process.resourcesPath, 'icons', filename);
    if (fs.existsSync(p1)) return path.resolve(p1);
    const p2 = path.join(process.resourcesPath, filename);
    if (fs.existsSync(p2)) return path.resolve(p2);
  }

  // 2. Dev mode physical directory (outside asar)
  const devPath = path.resolve(__dirname, 'public', filename);
  if (!devPath.includes('.asar') && fs.existsSync(devPath)) {
    return devPath;
  }

  // 3. Guarantee physical file on disk by extracting to userData if needed (for Windows Shell & taskbar)
  try {
    const userData = app.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || '', 'panamedia');
    const targetDir = path.join(userData, 'icons');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, filename);

    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size === 0) {
      const srcCandidates = [
        path.join(__dirname, 'public', filename),
        path.join(app.getAppPath ? app.getAppPath() : __dirname, 'public', filename),
        path.join(__dirname, 'dist', filename)
      ];
      for (const src of srcCandidates) {
        if (fs.existsSync(src)) {
          fs.writeFileSync(targetPath, fs.readFileSync(src));
          break;
        }
      }
    }
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
      return path.resolve(targetPath);
    }
  } catch (e) {
    console.error('Failed to extract physical icon:', e);
  }

  return path.resolve(__dirname, 'public', filename);
}

function ensurePlayerShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const playerIcon = getIconPath('player.ico');
    const playerAppId = isDev ? 'com.panamedia.player.dev' : 'com.panamedia.player';
    const programsDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const shortcuts = [
      path.join(programsDir, 'Panamedia', 'Panamedia Player.lnk'),
      path.join(programsDir, 'Panamedia Player.lnk')
    ];
    for (const scPath of shortcuts) {
      const dir = path.dirname(scPath);
      if (fs.existsSync(dir)) {
        const operation = fs.existsSync(scPath) ? 'update' : 'create';
        shell.writeShortcutLink(scPath, operation, {
          target: process.execPath,
          args: '--mode=player',
          description: 'Panamedia Player',
          icon: playerIcon,
          iconIndex: 0,
          appUserModelId: playerAppId
        });
      }
    }
  } catch (e) {
    console.warn('[Electron] Could not update player shortcut:', e);
  }
}

function parseFfmpegOutput(rawText) {
  let duration = 0;
  let videoCodec = '';
  let audioCodec = '';
  let pixelFormat = '';
  let width = 0;
  let height = 0;
  let hasAudio = false;

  const durMatch = rawText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (durMatch) {
    const hours = parseInt(durMatch[1], 10);
    const minutes = parseInt(durMatch[2], 10);
    const seconds = parseFloat(durMatch[3]);
    duration = hours * 3600 + minutes * 60 + seconds;
  }

  const vMatch = rawText.match(/Stream #\d+:\d+.*?: Video: ([a-zA-Z0-9_-]+)/i);
  if (vMatch) {
    videoCodec = (vMatch[1] || '').toLowerCase();
    const pixMatch = rawText.match(/Video:[^,]+(?:,[^,]+)?, ([a-zA-Z0-9_]+), (\d+)x(\d+)/i) ||
                     rawText.match(/Video:.*?,\s*([a-zA-Z0-9_]+)\(tv.*?\),\s*(\d+)x(\d+)/i) ||
                     rawText.match(/Video:.*?,\s*([a-zA-Z0-9_]+),\s*(\d+)x(\d+)/i);
    if (pixMatch) {
      pixelFormat = (pixMatch[1] || '').toLowerCase();
      width = parseInt(pixMatch[2], 10) || 0;
      height = parseInt(pixMatch[3], 10) || 0;
    } else {
      const dimMatch = rawText.match(/(\d{3,5})x(\d{3,5})/);
      if (dimMatch) {
        width = parseInt(dimMatch[1], 10) || 0;
        height = parseInt(dimMatch[2], 10) || 0;
      }
    }
  }

  const aMatch = rawText.match(/Stream #\d+:\d+.*?: Audio: ([a-zA-Z0-9_-]+)/i);
  if (aMatch) {
    hasAudio = true;
    audioCodec = (aMatch[1] || '').toLowerCase();
  }

  return { duration, videoCodec, audioCodec, pixelFormat, width, height, hasAudio };
}
// ──────────────────────────────────────────────────────────────────────────────

// Persistent state directories
const dataDir = path.join(app.getPath('userData'));
const settingsFile = path.join(dataDir, 'settings.json');

let mainWindow;
let playerWindow = null; // Track the active player window
let playerState = null; // { filePath, filename, playing, currentTime, duration }
let tray = null; // System tray icon instance
let playerTray = null; // System tray icon instance specifically for player
let wasPlayerMinimizedBeforeParentClosed = false;

function showAndFloatPlayerWindow() {
  if (playerWindow && !playerWindow.isDestroyed()) {
    wasPlayerMinimizedBeforeParentClosed = false;
    if (playerWindow.isMinimized()) playerWindow.restore();
    playerWindow.show();
    playerWindow.setAlwaysOnTop(true);
    playerWindow.focus();
    setTimeout(() => {
      if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.setAlwaysOnTop(false);
      }
    }, 400);
    if (playerState) playerState.minimized = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player-state-changed', playerState);
    }
  } else {
    createWindow('player');
  }
}

function ensurePlayerTray() {
  if (playerTray && !playerTray.isDestroyed()) return;
  try {
    const iconPath = getIconPath('player.ico');
    const playerIconImg = nativeImage.createFromPath(iconPath);
    playerTray = new Tray(playerIconImg.isEmpty() ? iconPath : playerIconImg);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Panamedia Player',
        click: () => showAndFloatPlayerWindow()
      },
      {
        label: 'Play / Pause',
        click: () => {
          if (playerWindow && !playerWindow.isDestroyed()) {
            playerWindow.webContents.send('player-remote-command', 'toggle-play');
          }
        }
      },
      {
        label: 'Next Track',
        click: () => {
          if (playerWindow && !playerWindow.isDestroyed()) {
            playerWindow.webContents.send('player-remote-command', 'next');
          }
        }
      },
      {
        label: 'Previous Track',
        click: () => {
          if (playerWindow && !playerWindow.isDestroyed()) {
            playerWindow.webContents.send('player-remote-command', 'prev');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Close Player',
        click: () => {
          if (playerWindow && !playerWindow.isDestroyed()) {
            playerWindow.close();
          }
        }
      }
    ]);
    playerTray.setToolTip('Panamedia Player');
    playerTray.setContextMenu(contextMenu);
    playerTray.on('click', () => showAndFloatPlayerWindow());
    playerTray.on('double-click', () => showAndFloatPlayerWindow());
  } catch (err) {
    console.error('Failed to create player tray icon:', err);
  }
}

function destroyPlayerTray() {
  if (playerTray && !playerTray.isDestroyed()) {
    try {
      playerTray.destroy();
    } catch (e) {}
    playerTray = null;
  }
}
let settings = {
  connections: 8,
  downloadDir: path.join(process.env.USERPROFILE, 'Downloads'),
  autoCompress: false,
  compressionCRF: 23,
  maxConcurrent: 2,
  syncedFolders: []
};

// Ensure directories exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure public directory exists for player assets
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  try { fs.mkdirSync(publicDir, { recursive: true }); } catch(e) {}
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

function loadSettings() {
  if (fs.existsSync(settingsFile)) {
    try {
      settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }
}


// Write the Registry Keys for Chrome & Edge Native Messaging integration
function installRegistryIntegration() {
  return new Promise((resolve, reject) => {
    const hostManifestPath = path.join(app.getAppPath(), 'host', 'com.netdownloader.native.json');
    
    // Check if the manifest exists, if not we will create it dynamically
    const hostDir = path.dirname(hostManifestPath);
    if (!fs.existsSync(hostDir)) {
      fs.mkdirSync(hostDir, { recursive: true });
    }
    
    const manifestContent = {
      name: "com.netdownloader.native",
      description: "net-downloader Native Messaging Host",
      path: path.join(hostDir, 'host.bat'),
      type: "stdio",
      allowed_origins: [
        "chrome-extension://nbkijioeialddnhofnpklnkkjdifaiih/" // extension ID with our deterministic key
      ]
    };
    
    fs.writeFileSync(hostManifestPath, JSON.stringify(manifestContent, null, 2), 'utf8');
    
    // Create the host.bat wrapper in the same directory
    const batContent = `@echo off\r\nnode "${path.join(hostDir, 'host.js')}" %*`;
    fs.writeFileSync(path.join(hostDir, 'host.bat'), batContent, 'utf8');
    
    // Create host.js (the actual Native Messaging host)
    const hostJsPath = path.join(hostDir, 'host.js');
    const hostJsContent = `
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

let inputBuffer = Buffer.alloc(0);

process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
  }
  
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length >= 4 + length) {
      const messageBuffer = inputBuffer.slice(4, 4 + length);
      inputBuffer = inputBuffer.slice(4 + length);
      
      const message = JSON.parse(messageBuffer.toString('utf8'));
      handleMessage(message);
    } else {
      break;
    }
  }
});

function handleMessage(message) {
  // Post request to local net-downloader API
  const data = JSON.stringify(message);
  const req = http.request({
    hostname: '127.0.0.1',
    port: 52321,
    path: '/add-download',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  }, (res) => {
    sendResponse({ status: "ok" });
  });
  
  req.on('error', (err) => {
    // If not running, launch net-downloader
    // Create a temporary file to hold the pending downloads
    const tempDir = process.env.APPDATA + '/net-downloader';
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const pendingPath = tempDir + '/pending_downloads.json';
    let pending = [];
    if (fs.existsSync(pendingPath)) {
      try { pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8')); } catch(e) {}
    }
    pending.push(message);
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2), 'utf8');
    
    // Launch the electron app
    // Spawns npm run dev in development or the executable in production
    const appDir = "${app.getAppPath().replace(/\\/g, '\\\\')}";
    const startCmd = process.env.NODE_ENV === 'development' ? 'npm run dev' : 'npm run dev'; // Fallback to dev for now
    spawn('cmd.exe', ['/c', 'npm run electron-dev'], {
      cwd: appDir,
      detached: true,
      stdio: 'ignore'
    }).unref();
    
    sendResponse({ status: "launched", error: err.message });
  });
  
  req.write(data);
  req.end();
}

function sendResponse(msg) {
  const msgBuf = Buffer.from(JSON.stringify(msg), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(msgBuf.length, 0);
  process.stdout.write(Buffer.concat([lenBuf, msgBuf]));
}
    `.trim();
    
    fs.writeFileSync(hostJsPath, hostJsContent, 'utf8');
    
    // Register in HKCU Registry
    const chromeKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.netdownloader.native`;
    const edgeKey = `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.netdownloader.native`;
    
    const cmdChrome = `reg add "${chromeKey}" /ve /t REG_SZ /d "${hostManifestPath.replace(/\\/g, '\\\\')}" /f`;
    const cmdEdge = `reg add "${edgeKey}" /ve /t REG_SZ /d "${hostManifestPath.replace(/\\/g, '\\\\')}" /f`;
    
    exec(cmdChrome, (errChrome) => {
      exec(cmdEdge, (errEdge) => {
        if (errChrome && errEdge) {
          reject(new Error(`Failed to register registry keys: ${errChrome.message} | ${errEdge.message}`));
        } else {
          resolve({ chrome: !errChrome, edge: !errEdge });
        }
      });
    });
  });
}

let useCppEngine = false;
let cppStreamingPort = 52322;
let coreProcess = null;
let isAppQuitting = false;
const pendingCoreRequests = new Map();
let coreRequestSeq = 0;

function sendCoreRequest(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!coreProcess) {
      return reject(new Error("C++ Core Engine process is not running."));
    }
    const requestId = `req_${++coreRequestSeq}`;
    pendingCoreRequests.set(requestId, { 
      resolve, 
      reject, 
      timeout: setTimeout(() => {
        pendingCoreRequests.delete(requestId);
        reject(new Error(`Core request timeout: ${action}`));
      }, 5000) 
    });

    const message = JSON.stringify({
      id: requestId,
      action: action,
      payload: JSON.stringify(payload)
    });
    
    coreProcess.stdin.write(message + '\n');
  });
}

function initCoreResponseListener() {
  if (!coreProcess) return;
  
  let buffer = '';
  coreProcess.stdout.on('data', (data) => {
    buffer += data.toString('utf8');
    let boundary = buffer.indexOf('\n');
    while (boundary !== -1) {
      const line = buffer.substring(0, boundary).trim();
      buffer = buffer.substring(boundary + 1);
      boundary = buffer.indexOf('\n');
      
      if (!line) continue;
      
      try {
        const response = JSON.parse(line);
        let parsedPayload = response.payload;
        try { parsedPayload = JSON.parse(response.payload); } catch(e) {}

        if (response.id === 'init_server' && parsedPayload && parsedPayload.port) {
          cppStreamingPort = parsedPayload.port;
          console.log(`[Node Bridge] C++ Core Engine streaming port: ${cppStreamingPort}`);
        }

        if (response.id && pendingCoreRequests.has(response.id)) {
          const req = pendingCoreRequests.get(response.id);
          clearTimeout(req.timeout);
          pendingCoreRequests.delete(response.id);
          
          if (response.type === 'success' || response.status === 'success') {
            req.resolve(parsedPayload);
          } else {
            req.reject(new Error(parsedPayload.message || 'C++ operation failed'));
          }
        }
      } catch (e) {
        console.error("[Node Bridge] Failed to parse C++ response line:", line, e);
      }
    }
  });
}

function startCoreEngine() {
  const possiblePaths = [
    path.join(__dirname, 'src-cpp', 'build', 'bin', 'Release', 'panamedia-core.exe'),
    path.join(__dirname, 'src-cpp', 'build', 'bin', 'panamedia-core.exe'),
    path.join(__dirname, 'src-cpp', 'bin', 'Release', 'panamedia-core.exe'),
    path.join(__dirname, 'src-cpp', 'bin', 'panamedia-core.exe'),
    path.join(__dirname, 'bin', 'panamedia-core.exe')
  ];
  
  let corePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      corePath = p;
      break;
    }
  }
  
  if (corePath) {
    try {
      const { spawn } = require('child_process');
      coreProcess = spawn(corePath, [], {
        cwd: path.dirname(corePath),
        env: { ...process.env, PATH: path.dirname(corePath) + ';' + (process.env.PATH || '') },
        stdio: ['pipe', 'pipe', 'inherit']
      });
      
      console.log(`C++ Core Engine spawned: ${corePath}`);
      useCppEngine = true;
      
      // Bind response stream parser
      initCoreResponseListener();
      
      // Send start_stream_server action to C++ engine
      const startReq = JSON.stringify({
        id: "init_server",
        action: "start_stream_server",
        payload: JSON.stringify({ port: 52322, ffmpegPath: ffmpegPath })
      });
      coreProcess.stdin.write(startReq + '\n');
      
      coreProcess.on('close', (code) => {
        console.log(`C++ Core Engine exited with code ${code}`);
        coreProcess = null;
        useCppEngine = false;
        if (!isAppQuitting) {
          setTimeout(() => {
            if (!coreProcess && !isAppQuitting) {
              console.log('Auto-restarting C++ Core Engine...');
              startCoreEngine();
            }
          }, 500);
        }
      });
    } catch (e) {
      console.error('Failed to spawn C++ Core Engine:', e);
    }
  } else {
    console.log('C++ Core Engine binary not found. Running with Node.js fallback streaming server.');
  }
}

// Determine if a file is an authentic MPEG-TS video file vs a TypeScript program source file
function isMpegTsVideo(filePath, fileSize) {
  if (!filePath || typeof filePath !== 'string') return false;
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.net.ts')) return true;
  if (lower.endsWith('.d.ts') || lower.endsWith('.test.ts') || lower.endsWith('.spec.ts') || lower.endsWith('.config.ts')) {
    return false;
  }
  if (!fileSize || fileSize < 512) return false;
  
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(565);
    const bytesRead = fs.readSync(fd, buf, 0, 565, 0);
    fs.closeSync(fd);
    if (bytesRead < 189) return false;

    // Standard MPEG-TS 188-byte packets: sync byte 0x47 (decimal 71)
    if (buf[0] === 0x47 && buf[188] === 0x47 && (bytesRead < 377 || buf[376] === 0x47)) {
      return true;
    }
    // M2TS / BDAV 192-byte packets:
    if ((buf[4] === 0x47 && bytesRead >= 196 && buf[196] === 0x47) ||
        (buf[0] === 0x47 && bytesRead >= 193 && buf[192] === 0x47)) {
      return true;
    }
    // DVB 204-byte packets:
    if (buf[0] === 0x47 && bytesRead >= 205 && buf[204] === 0x47) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Safely serve small image files using buffer read so file descriptors are released immediately and errors are handled
function safeServeThumbnail(res, thumbPath) {
  fs.readFile(thumbPath, (err, data) => {
    if (err) {
      if (!res.writableEnded && !res.destroyed) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500);
        res.end();
      }
      return;
    }
    if (!res.writableEnded && !res.destroyed) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': data.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(data);
    }
  });
}

// Queue for thumbnail generation to prevent spawning dozens of concurrent FFmpeg processes (EMFILE prevention)
const thumbQueue = [];
let activeThumbWorkers = 0;
const MAX_CONCURRENT_THUMBS = 2;

function enqueueThumbnailTask(task) {
  thumbQueue.push(task);
  processThumbQueue();
}

function processThumbQueue() {
  if (activeThumbWorkers >= MAX_CONCURRENT_THUMBS || thumbQueue.length === 0) return;
  activeThumbWorkers++;
  const task = thumbQueue.shift();
  task(() => {
    activeThumbWorkers--;
    processThumbQueue();
  });
}

const previewCache = new Map();

// Strict security whitelist for local media streaming server (prevents path traversal & unauthorized file access)
const ALLOWED_STREAM_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.mpg', '.mpeg', '.mpeg4',
  '.3gp', '.wmv', '.m4v', '.ts', '.net.ts', '.ogv', '.m2ts', '.vob',
  '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus', '.wma', '.weba',
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.srt', '.vtt', '.ass'
]);

function isPathSafeForStreaming(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return null;
  if (inputPath.indexOf('\0') !== -1) return null;
  try {
    const resolved = path.resolve(inputPath);
    const lower = resolved.toLowerCase();
    const isNetTs = lower.endsWith('.net.ts');
    const ext = isNetTs ? '.net.ts' : path.extname(resolved).toLowerCase();

    if (!ALLOWED_STREAM_EXTENSIONS.has(ext)) {
      return null;
    }

    if (!fs.existsSync(resolved)) return null;
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return null;

    return resolved;
  } catch (e) {
    return null;
  }
}

// Start local HTTP server to receive downloads from browser extension native host
function startLocalServer() {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.url === '/ping' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.url === '/add-download' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const downloadData = JSON.parse(body);
          if (mainWindow) {
            mainWindow.webContents.send('native-download-received', downloadData);
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    } else if (req.url.startsWith('/stream') && (req.method === 'GET' || req.method === 'HEAD')) {
      const urlObj = new URL(req.url, 'http://127.0.0.1:52321');
      const rawPath = urlObj.searchParams.get('path');
      const filePath = isPathSafeForStreaming(rawPath);
      if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }
      
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'video/mp4';
      if (ext === '.mp3') contentType = 'audio/mpeg';
      else if (ext === '.m4a') contentType = 'audio/mp4';
      else if (ext === '.wav') contentType = 'audio/wav';
      else if (ext === '.flac') contentType = 'audio/flac';
      else if (ext === '.ogg') contentType = 'audio/ogg';
      else if (ext === '.aac') contentType = 'audio/aac';
      else if (ext === '.opus') contentType = 'audio/opus';
      else if (ext === '.wma') contentType = 'audio/x-ms-wma';
      else if (ext === '.weba') contentType = 'audio/webm';
      else if (ext === '.webm') contentType = 'video/webm';
      else if (ext === '.mkv') contentType = 'video/x-matroska';
      else if (ext === '.avi') contentType = 'video/x-msvideo';
      else if (ext === '.mov') contentType = 'video/quicktime';
      else if (ext === '.mpeg' || ext === '.mpg') contentType = 'video/mpeg';
      else if (ext === '.ts' || filePath.toLowerCase().endsWith('.net.ts')) contentType = 'video/mp2t';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      
      if (range) {
        const rangeClean = range.replace(/bytes=/, "").trim();
        const parts = rangeClean.split("-");
        let start = 0;
        let end = fileSize - 1;
        if (parts[0] === '' && parts[1]) {
          // Suffix range: bytes=-524288 (e.g. read moov atom at end of file)
          const suffix = parseInt(parts[1], 10);
          if (!isNaN(suffix) && suffix > 0) {
            start = Math.max(0, fileSize - suffix);
          }
        } else {
          start = parseInt(parts[0], 10) || 0;
          if (parts[1]) {
            const parsedEnd = parseInt(parts[1], 10);
            if (!isNaN(parsedEnd) && parsedEnd >= start) {
              end = Math.min(fileSize - 1, parsedEnd);
            }
          }
        }
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const destroyFile = () => {
          try { file.destroy(); } catch (e) {}
        };
        file.on('error', (err) => {
          destroyFile();
          if (!res.writableEnded && !res.destroyed) {
            try { res.writeHead(500); res.end(); } catch (e) {}
          }
        });
        req.on('close', destroyFile);
        res.on('close', destroyFile);
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Range',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
        });
        if (req.method === 'HEAD') { destroyFile(); res.end(); return; }
        file.pipe(res);
      } else {
        const file = fs.createReadStream(filePath);
        const destroyFile = () => {
          try { file.destroy(); } catch (e) {}
        };
        file.on('error', (err) => {
          destroyFile();
          if (!res.writableEnded && !res.destroyed) {
            try { res.writeHead(500); res.end(); } catch (e) {}
          }
        });
        req.on('close', destroyFile);
        res.on('close', destroyFile);

        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Range',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
        });
        if (req.method === 'HEAD') { destroyFile(); res.end(); return; }
        file.pipe(res);
      }
    } else if (req.url.startsWith('/transcode') && req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://127.0.0.1:52321');
      const rawPath = urlObj.searchParams.get('path');
      const filePath = isPathSafeForStreaming(rawPath);
      const startSec = parseFloat(urlObj.searchParams.get('start') || '0');
      const quality = urlObj.searchParams.get('quality') || '1080p';

      if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }

      const { execFile, spawn } = require('child_process');

      const executeTranscode = (videoCodec, audioCodec, pixelFormat, width, height, hasAudio) => {
        const ext = path.extname(filePath).toLowerCase();
        const isAudioExt = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(ext);
        const isVideoExt = !isAudioExt;

        const args = [];
        const isAudioOnly = isAudioExt || (!videoCodec && !isVideoExt);

        const isCompatibleVideo = ['h264', 'avc1'].includes(videoCodec);
        const isCompatiblePix = ['yuv420p', 'yuvj420p', 'yuv420p10le', ''].includes(pixelFormat);

        const baseName = filePath.substring(0, filePath.lastIndexOf('.'));
        let subPath = '';
        const subExtensions = ['.srt', '.ass', '.vtt'];
        for (const ext of subExtensions) {
          if (fs.existsSync(baseName + ext)) {
            subPath = baseName + ext;
            break;
          }
        }

        const canDirectCopy = !isAudioOnly && isCompatibleVideo && isCompatiblePix && !subPath && (quality === 'original' || (width <= 1920 && height <= 1080));

        if (!isAudioOnly && !canDirectCopy) {
          args.push('-hwaccel', 'auto');
        }

        if (startSec > 0) {
          args.push('-ss', startSec.toString());
        }

        args.push(
          '-analyzeduration', '3000000',
          '-probesize', '2000000',
          '-fflags', '+genpts+discardcorrupt+igndts',
          '-err_detect', 'ignore_err',
          '-i', filePath
        );

        if (!isAudioOnly) {
          if (canDirectCopy) {
            args.push('-c:v', 'copy');
          } else {
            const filters = [];
            if (quality === '720p') {
              if (width > 1280 || height > 720) {
                filters.push("scale='min(1280,iw)':-2");
              }
            } else if (quality === '1080p') {
              if (width > 1920 || height > 1080) {
                filters.push("scale='min(1920,iw)':-2");
              }
            }

            if (subPath) {
              const escapedSubPath = subPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
              filters.push(`subtitles='${escapedSubPath}'`);
            }

            if (filters.length > 0) {
              args.push('-vf', filters.join(','));
            }

            args.push(
              '-err_detect', 'ignore_err',
              '-c:v', 'libx264',
              '-pix_fmt', 'yuv420p',
              '-preset', 'ultrafast',
              '-tune', 'zerolatency',
              '-g', '30'
            );
          }
        } else {
          args.push('-vn');
        }

        if (hasAudio) {
          if (canDirectCopy && audioCodec === 'aac') {
            args.push('-c:a', 'copy', '-bsf:a', 'aac_adtstoasc');
          } else {
            args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
          }
        } else {
          args.push('-an');
        }

        args.push(
          '-avoid_negative_ts', 'make_zero',
          '-f', 'mp4',
          '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
          'pipe:1'
        );

        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Range',
          'Connection': 'close'
        });

        if (req.method === 'HEAD') {
          res.end();
          return;
        }

        const ffmpegProc = spawn(ffmpegPath, args);
        ffmpegProc.stdout.pipe(res);

        const killFfmpeg = () => {
          try { ffmpegProc.kill('SIGKILL'); } catch (e) {}
        };
        req.on('close', killFfmpeg);
        res.on('close', killFfmpeg);
        ffmpegProc.stdout.on('error', killFfmpeg);

        ffmpegProc.on('error', (procErr) => {
          console.error('[Node Transcode] ffmpeg process error:', procErr);
          killFfmpeg();
        });
      };

      execFile(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'stream=codec_name,codec_type,pix_fmt,width,height',
        '-of', 'json',
        filePath
      ], { timeout: 5000 }, (probeErr, stdout) => {
        let width = 0;
        let height = 0;
        let videoCodec = '';
        let audioCodec = '';
        let pixelFormat = '';
        let hasAudio = false;

        if (!probeErr && stdout) {
          try {
            const info = JSON.parse(stdout);
            const streams = info.streams || [];
            const videoStream = streams.find(s => s.codec_type === 'video');
            const audioStream = streams.find(s => s.codec_type === 'audio');
            if (videoStream) {
              width = videoStream.width || 0;
              height = videoStream.height || 0;
              videoCodec = (videoStream.codec_name || '').toLowerCase();
              pixelFormat = (videoStream.pix_fmt || '').toLowerCase();
            }
            if (audioStream) {
              hasAudio = true;
              audioCodec = (audioStream.codec_name || '').toLowerCase();
            }
          } catch (e) {}
        }

        if (!videoCodec || !audioCodec) {
          // ffprobe failed or crashed on this file; run ffmpeg -i fallback
          execFile(ffmpegPath, ['-i', filePath], { timeout: 8000 }, (ffErr, ffStdout, ffStderr) => {
            const rawText = (ffStdout || '') + '\n' + (ffStderr || '');
            const parsed = parseFfmpegOutput(rawText);
            if (!videoCodec && parsed.videoCodec) videoCodec = parsed.videoCodec;
            if (!audioCodec && parsed.audioCodec) audioCodec = parsed.audioCodec;
            if (!pixelFormat && parsed.pixelFormat) pixelFormat = parsed.pixelFormat;
            if (!width && parsed.width) width = parsed.width;
            if (!height && parsed.height) height = parsed.height;
            if (parsed.hasAudio) hasAudio = true;
            executeTranscode(videoCodec, audioCodec, pixelFormat, width, height, hasAudio);
          });
          return;
        }

        executeTranscode(videoCodec, audioCodec, pixelFormat, width, height, hasAudio);
      });
    } else if (req.url.startsWith('/thumbnail') && req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://127.0.0.1:52321');
      const rawPath = urlObj.searchParams.get('path');
      const filePath = isPathSafeForStreaming(rawPath);
      if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }

      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(filePath).digest('hex');
      const thumbDir = path.join(dataDir, 'thumbnails');
      if (!fs.existsSync(thumbDir)) {
        try { fs.mkdirSync(thumbDir, { recursive: true }); } catch (e) {}
      }
      const thumbPath = path.join(thumbDir, `${hash}.jpg`);

      if (fs.existsSync(thumbPath)) {
        safeServeThumbnail(res, thumbPath);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const isAudio = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac'].includes(ext);

      enqueueThumbnailTask((done) => {
        if (res.writableEnded || res.destroyed) {
          done();
          return;
        }

        if (fs.existsSync(thumbPath)) {
          safeServeThumbnail(res, thumbPath);
          done();
          return;
        }

        if (isAudio) {
          const args = [
            '-y',
            '-i', filePath,
            '-an',
            '-vcodec', 'copy',
            thumbPath
          ];
          const { spawn } = require('child_process');
          const proc = spawn(ffmpegPath, args);
          proc.on('close', (code) => {
            done();
            if (code === 0 && fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
              safeServeThumbnail(res, thumbPath);
            } else {
              if (fs.existsSync(thumbPath)) {
                try { fs.unlinkSync(thumbPath); } catch (e) {}
              }
              if (!res.writableEnded && !res.destroyed) {
                res.writeHead(404);
                res.end();
              }
            }
          });
          proc.on('error', () => {
            done();
            if (!res.writableEnded && !res.destroyed) {
              res.writeHead(404);
              res.end();
            }
          });
        } else {
          generateVideoThumbnail(filePath, thumbPath).then((success) => {
            done();
            if (success && fs.existsSync(thumbPath)) {
              safeServeThumbnail(res, thumbPath);
            } else {
              if (!res.writableEnded && !res.destroyed) {
                res.writeHead(404);
                res.end();
              }
            }
          }).catch(() => {
            done();
            if (!res.writableEnded && !res.destroyed) {
              res.writeHead(404);
              res.end();
            }
          });
        }
      });
    } else if (req.url.startsWith('/preview') && req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://127.0.0.1:52321');
      const rawPath = urlObj.searchParams.get('path');
      const filePath = isPathSafeForStreaming(rawPath);
      const timeSec = Math.max(0, Math.floor(parseFloat(urlObj.searchParams.get('time') || '0')));
      if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const isAudio = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(ext);

      if (isAudio) {
        res.writeHead(302, { 'Location': `/thumbnail?path=${encodeURIComponent(filePath)}` });
        res.end();
        return;
      }

      const cacheKey = `${filePath}:${timeSec}`;
      if (previewCache.has(cacheKey)) {
        const cached = previewCache.get(cacheKey);
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': cached.length,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        });
        res.end(cached);
        return;
      }

      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(filePath).digest('hex');
      const thumbDir = path.join(dataDir, 'thumbnails');
      const thumbPath = path.join(thumbDir, `${hash}.jpg`);

      const { spawn } = require('child_process');
      const effectiveFFmpeg = resolveBinary ? resolveBinary('ffmpeg') : ffmpegPath;
      const args = [
        '-ss', String(timeSec),
        '-i', filePath,
        '-frames:v', '1',
        '-vf', 'scale=240:-2',
        '-q:v', '3',
        '-f', 'image2',
        'pipe:1'
      ];

      if (!global.__activePreviewProcs) global.__activePreviewProcs = [];
      while (global.__activePreviewProcs.length >= 2) {
        const oldProc = global.__activePreviewProcs.shift();
        try { oldProc.kill('SIGKILL'); } catch (e) {}
      }

      const chunks = [];
      const proc = spawn(effectiveFFmpeg, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      global.__activePreviewProcs.push(proc);

      proc.on('error', (err) => {
        const idx = global.__activePreviewProcs.indexOf(proc);
        if (idx !== -1) global.__activePreviewProcs.splice(idx, 1);
        console.warn('[Timeline Preview] ffmpeg spawn error:', err.message);
      });
      proc.stdout.on('data', (d) => chunks.push(d));

      let finished = false;
      const cleanup = () => {
        if (!finished) {
          finished = true;
          const idx = global.__activePreviewProcs.indexOf(proc);
          if (idx !== -1) global.__activePreviewProcs.splice(idx, 1);
          try { proc.kill('SIGKILL'); } catch (e) {}
        }
      };

      req.on('close', cleanup);

      proc.on('close', (code) => {
        finished = true;
        const idx = global.__activePreviewProcs.indexOf(proc);
        if (idx !== -1) global.__activePreviewProcs.splice(idx, 1);

        if (code === 0 && chunks.length > 0) {
          const buf = Buffer.concat(chunks);
          if (previewCache.size > 400) {
            const firstKey = previewCache.keys().next().value;
            previewCache.delete(firstKey);
          }
          previewCache.set(cacheKey, buf);

          if (!res.writableEnded && !res.destroyed) {
            res.writeHead(200, {
              'Content-Type': 'image/jpeg',
              'Content-Length': buf.length,
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600'
            });
            res.end(buf);
          }
        } else {
          if (!res.writableEnded && !res.destroyed) {
            if (fs.existsSync(thumbPath)) {
              safeServeThumbnail(res, thumbPath);
            } else {
              res.writeHead(404);
              res.end();
            }
          }
        }
      });

      proc.on('error', () => {
        finished = true;
        if (fs.existsSync(thumbPath)) {
          if (!res.writableEnded && !res.destroyed) {
            safeServeThumbnail(res, thumbPath);
          }
        } else {
          if (!res.writableEnded && !res.destroyed) {
            res.writeHead(404);
            res.end();
          }
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  
  server.listen(52321, '127.0.0.1', () => {
    console.log('Local server listening on port 52321');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Another Panamedia instance already holds the port — this is normal
      // when Player shortcut opens before the single-instance redirect completes.
      // Safe to ignore: the running instance handles all API requests.
      console.log('Port 52321 already in use — deferring to existing Panamedia instance.');
    } else {
      console.error('Local server error:', err);
    }
  });
}

// Check for temporary pending downloads from Native Host launch
function checkPendingDownloads() {
  const pendingFile = path.join(app.getPath('userData'), 'pending_downloads.json');
  if (fs.existsSync(pendingFile)) {
    try {
      const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
      fs.unlinkSync(pendingFile); // clear
      
      pending.forEach(data => {
        setTimeout(() => {
          if (mainWindow) {
            mainWindow.webContents.send('native-download-received', data);
          }
        }, 3000); // Send after window has fully loaded
      });
    } catch(e) {
      console.error('Failed to process pending downloads', e);
    }
  }
}

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 500,
    height: 350,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    icon: getIconPath('panamedia.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  let iconDataUrl = '';
  try {
    const iconPath = getIconPath('panamedia.ico');
    if (fs.existsSync(iconPath)) {
      const base64Data = fs.readFileSync(iconPath).toString('base64');
      iconDataUrl = `data:image/x-icon;base64,${base64Data}`;
    }
  } catch (e) {
    console.error('Failed to load splash icon:', e);
  }

  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: transparent;
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }
        .splash-card {
          width: 420px;
          height: 280px;
          background: rgba(15, 15, 27, 0.85);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          color: white;
          position: relative;
        }
        .logo-circle {
          width: 80px;
          height: 80px;
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 20px;
        }
        .logo-text {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
          background: linear-gradient(90deg, #a5b4fc 0%, #d8b4fe 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .desc-text {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 30px;
        }
        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid rgba(255, 255, 255, 0.08);
          border-top: 2px solid #6366f1;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="splash-card">
        <div class="logo-circle">
          ${iconDataUrl ? `<img src="${iconDataUrl}" style="width: 64px; height: 64px; object-fit: contain;" alt="logo" />` : ''}
        </div>
        <div class="logo-text">Panamedia</div>
        <div class="desc-text">All in One Media Manager</div>
        <div class="spinner"></div>
      </div>
    </body>
    </html>
  `.trim();
  
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`;
  splash.loadURL(dataUrl);
  return splash;
}

function getMediaFileFromCommandLine(argv, workingDirectory) {
  if (!Array.isArray(argv)) return null;
  const mediaExtensions = [
    '.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v', '.net.ts', '.dat',
    '.mpeg', '.mpg', '.3gp', '.flv', '.wmv', '.vob', '.m2ts',
    '.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.opus', '.wma'
  ];
  for (let i = 1; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw) continue;
    if (raw.startsWith('--') || raw.startsWith('-')) continue;
    if (raw === '.' || raw.endsWith('electron.cjs') || raw.endsWith('dev.cjs') || raw.endsWith('electron.exe') || raw.endsWith('Panamedia.exe')) continue;
    
    let clean = cleanArgPath(raw);
    if (!clean) continue;
    if (workingDirectory && !path.isAbsolute(clean)) {
      clean = path.resolve(workingDirectory, clean);
    }
    const lower = clean.toLowerCase();
    const hasMediaExtension = mediaExtensions.some(ext => lower.endsWith(ext));
    if (hasMediaExtension) {
      try {
        if (fs.existsSync(clean) && fs.statSync(clean).isFile()) {
          return clean;
        }
      } catch (e) {}
      return clean;
    }
  }
  return null;
}

function getMediaFileFromArgs() {
  return getMediaFileFromCommandLine(process.argv, process.cwd());
}

function createWindow(forceMode = null) {
  const fileArg = getMediaFileFromArgs();
  if (fileArg) {
    registerMediaFolder(fileArg);
  }
  
  let isPlayerMode = false;
  if (forceMode === 'player') {
    isPlayerMode = true;
  } else if (forceMode === 'main') {
    isPlayerMode = false;
  } else {
    isPlayerMode = process.argv.includes('--mode=player') || 
                   (app.name && app.name.toLowerCase() === 'player') || 
                   (app.getName && app.getName().toLowerCase() === 'player') ||
                   !!fileArg;
  }
  
  if (isPlayerMode) {
    let filePath = fileArg || '';
    const pathArgIndex = process.argv.findIndex(arg => arg.startsWith('--path='));
    if (pathArgIndex !== -1) {
      filePath = process.argv[pathArgIndex].split('=')[1];
    }
    const filename = filePath ? path.basename(filePath) : 'Media Player';
    
    const playerIcon = getIconPath('player.ico');
    const playerIconImg = nativeImage.createFromPath(playerIcon);
    const playerAppId = isDev ? 'com.panamedia.player.dev' : 'com.panamedia.player';
    ensurePlayerShortcut();

    const playerWin = new BrowserWindow({
      width: 960,
      height: 600,
      minWidth: 720,
      minHeight: 460,
      frame: false,
      icon: playerIconImg.isEmpty() ? playerIcon : playerIconImg,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
        preload: path.join(__dirname, 'preload.cjs')
      }
    });
    playerWin.setIcon(playerIconImg.isEmpty() ? playerIcon : playerIconImg);
    try {
      playerWin.setAppDetails({
        appId: playerAppId,
        appIconPath: playerIcon,
        appIconIndex: 0,
        relaunchDisplayName: 'Panamedia Player',
        relaunchCommand: `"${process.execPath}" --mode=player`
      });
    } catch (e) {}

    // Prevent Chromium from navigating the window away when a file is dropped
    playerWin.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('file://') && !url.includes('index.html')) {
        event.preventDefault();
      }
    });

    playerWindow = playerWin;
    playerState = { filePath, filename, playing: true, currentTime: 0, duration: 0, minimized: false };
    ensurePlayerTray();
    
    const queryParams = `mode=player&path=${encodeURIComponent(filePath)}&title=${encodeURIComponent(filename)}`;
    playerWin.loadURL(getAppUrl(queryParams));

    playerWin.on('enter-full-screen', () => {
      playerWin.webContents.send('player-fullscreen-changed', true);
    });

    playerWin.on('leave-full-screen', () => {
      playerWin.webContents.send('player-fullscreen-changed', false);
    });

    playerWin.on('focus', () => {
      if (playerWin && !playerWin.isDestroyed()) {
        playerWin.webContents.focus();
      }
    });

    playerWin.on('closed', () => {
      destroyPlayerTray();
      playerWindow = null;
      playerState = null;
      wasPlayerMinimizedBeforeParentClosed = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('player-state-changed', null);
      } else {
        app.quit();
      }
    });

    playerWin.on('minimize', () => {
      if (playerState) {
        playerState.minimized = true;
        wasPlayerMinimizedBeforeParentClosed = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player-state-changed', playerState);
        }
      }
    });

    playerWin.on('restore', () => {
      wasPlayerMinimizedBeforeParentClosed = false;
      if (playerState) {
        playerState.minimized = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player-state-changed', playerState);
        }
      }
    });
  } else {
    // Only show splash on initial cold start when player is not running
    const hasActivePlayer = playerWindow && !playerWindow.isDestroyed();
    const splash = hasActivePlayer ? null : createSplashWindow();
    
    mainWindow = new BrowserWindow({
      width: 1100,
      height: 750,
      minWidth: 850,
      minHeight: 600,
      frame: false, // frameless window for premium design
      show: false, // Hide until ready
      icon: getIconPath('panamedia.ico'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false, // simpler for local development pair programming
        webviewTag: true, // enable in-app browser webviews
        preload: path.join(__dirname, 'preload.cjs')
      }
    });

    // Prevent Chromium from navigating the window away when a file is dropped
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('file://') && !url.includes('index.html')) {
        event.preventDefault();
      }
    });
    
    // Load app URL (dev: localhost:5173, prod: dist/index.html)
    mainWindow.loadURL(getAppUrl());
    
    // Toggle DevTools manually with F12 or Ctrl+Shift+I if needed (disabled on startup)
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
    
    mainWindow.setIcon(getIconPath('panamedia.ico'));

    mainWindow.on('closed', () => {
      mainWindow = null;
      if (playerWindow && !playerWindow.isDestroyed()) {
        wasPlayerMinimizedBeforeParentClosed = Boolean(playerState && playerState.minimized) || playerWindow.isMinimized();
        const playerIcon = getIconPath('player.ico');
        const playerIconImg = nativeImage.createFromPath(playerIcon);
        const playerAppId = isDev ? 'com.panamedia.player.dev' : 'com.panamedia.player';
        playerWindow.setIcon(playerIconImg.isEmpty() ? playerIcon : playerIconImg);
        try {
          playerWindow.setAppDetails({
            appId: playerAppId,
            appIconPath: playerIcon,
            appIconIndex: 0,
            relaunchDisplayName: 'Panamedia Player',
            relaunchCommand: `"${process.execPath}" --mode=player`
          });
        } catch (e) {}
        // If the player was not minimized before, keep it visible as floating window.
        // If it was minimized, keep it minimized so it does not pop up uninvited.
        if (!wasPlayerMinimizedBeforeParentClosed) {
          playerWindow.show();
          playerWindow.focus();
        }
      }
    });
    
    mainWindow.webContents.on('did-finish-load', () => {
      checkPendingDownloads();
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.warn('[Electron] mainWindow did-fail-load:', errorCode, errorDescription, '- retrying in 1.5s...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(getAppUrl());
        }
      }, 1500);
    });

    let hasShownMainWindow = false;
    const showMainWindow = () => {
      if (hasShownMainWindow) return;
      hasShownMainWindow = true;
      if (splash && !splash.isDestroyed()) {
        try { splash.close(); } catch(e) {}
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        if (playerWindow && !playerWindow.isDestroyed() && playerState) {
          if (wasPlayerMinimizedBeforeParentClosed) {
            playerState.minimized = true;
          }
          mainWindow.webContents.send('player-state-changed', playerState);
        }
      }
    };

    // Safety fallback: ensure mainWindow is displayed even if network or load event stalls
    const safetyTimer = setTimeout(() => {
      showMainWindow();
    }, 4000);

    mainWindow.webContents.once('did-finish-load', () => {
      if (splash) {
        setTimeout(() => {
          clearTimeout(safetyTimer);
          showMainWindow();
        }, 1800); // Smooth 1.8s splash screen
      } else {
        clearTimeout(safetyTimer);
        showMainWindow();
      }
    });
  }
}

// IPC Handling for Dialogs & UI actions (works dynamically for any window)
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('select-media-files', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ts', 'm4v', 'mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'opus', 'wma'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled) {
      return [];
    }
    return result.filePaths || [];
  } catch (err) {
    console.error('[select-media-files error]:', err);
    return [];
  }
});

ipcMain.handle('get-streaming-port', () => {
  return useCppEngine ? cppStreamingPort : 52321;
});

// IPC State Management
ipcMain.handle('get-settings', () => settings);

ipcMain.handle('save-settings', (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  saveSettings();
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== event.sender) {
    mainWindow.webContents.send('settings-changed', settings);
  }
  if (playerWindow && !playerWindow.isDestroyed() && playerWindow.webContents !== event.sender) {
    playerWindow.webContents.send('settings-changed', settings);
  }
  return settings;
});

ipcMain.on('synced-folders-updated', (event, folders) => {
  if (settings) {
    settings.syncedFolders = Array.isArray(folders) ? folders : [];
    saveSettings();
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== event.sender) {
    mainWindow.webContents.send('synced-folders-updated', folders);
    mainWindow.webContents.send('settings-changed', settings);
  }
  if (playerWindow && !playerWindow.isDestroyed() && playerWindow.webContents !== event.sender) {
    playerWindow.webContents.send('synced-folders-updated', folders);
    playerWindow.webContents.send('settings-changed', settings);
  }
});

// OS-Level Archive Locking: hide/lock files & folders in Windows Explorer safely without shell injection
ipcMain.handle('archive-set-os-lock', async (event, { path: targetPath, shouldLock, isFolder }) => {
  if (process.platform !== 'win32' || !targetPath || typeof targetPath !== 'string') return { success: false };
  try {
    if (!fs.existsSync(targetPath)) return { success: false, error: 'Path does not exist' };
    let actualIsFolder = isFolder;
    try {
      actualIsFolder = isFolder !== undefined ? isFolder : fs.statSync(targetPath).isDirectory();
    } catch {}

    const { execFile } = require('child_process');
    const args = [
      shouldLock ? '+h' : '-h',
      shouldLock ? '+s' : '-s',
      targetPath
    ];
    if (actualIsFolder) {
      args.push('/d');
    }
    return new Promise((resolve) => {
      execFile('attrib', args, { windowsHide: true }, (err) => {
        if (err) {
          console.error('[archive-set-os-lock] attrib error:', err);
          resolve({ success: false, error: err.message });
        } else {
          // When releasing a folder to original visibility, also remove hidden/system from its files
          if (!shouldLock && actualIsFolder) {
            execFile('attrib', ['-h', '-s', path.join(targetPath, '*'), '/s', '/d'], { windowsHide: true }, () => {
              resolve({ success: true });
            });
          } else {
            resolve({ success: true });
          }
        }
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('check-media-info', async (event, filePath) => {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      return resolve({ success: false, error: 'File not found' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const isAudioExt = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'].includes(ext);
    if (isAudioExt) {
      // Audio files play natively in Chromium — return immediately with zero latency!
      return resolve({
        success: true,
        duration: 0,
        videoCodec: '',
        audioCodec: ext.replace('.', ''),
        pixelFormat: '',
        width: 0,
        height: 0,
        directPlay: true,
        needsTranscode: false,
        streams: []
      });
    }

    const fallbackProbe = () => {
      // Check if a completed transcode cache file exists
      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(filePath).digest('hex');
      const transcodeCacheDir = path.join(dataDir, 'transcode-cache');
      const cachePath = path.join(transcodeCacheDir, `${hash}.mp4`);
      const targetPath = fs.existsSync(cachePath) ? cachePath : filePath;

      const { execFile } = require('child_process');

      const ext = path.extname(filePath).toLowerCase();
      const isNativeContainer = ext === '.mp4' || ext === '.webm';
      let nativeVideoCodecs = ['h264', 'avc1'];
      let nativeAudioCodecs = ['aac', 'mp3'];
      if (ext === '.webm') {
        nativeVideoCodecs = ['vp8', 'vp9', 'av1'];
        nativeAudioCodecs = ['opus', 'vorbis'];
      }
      const nativePixFormats = ['yuv420p', 'yuvj420p'];

      const runFfmpegFallback = (info = {}) => {
        execFile(ffmpegPath, ['-i', targetPath], { timeout: 8000 }, (ffErr, ffStdout, ffStderr) => {
          const rawText = (ffStdout || '') + '\n' + (ffStderr || '');
          let duration = 0;
          const match = rawText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
          if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            const seconds = parseFloat(match[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
          }

          // Fallback: file size & bitrate or default bitrate
          if (!duration || duration <= 1) {
            try {
              const stat = fs.statSync(targetPath);
              const fileSize = stat.size;
              const brMatch = rawText.match(/bitrate:\s*(\d+)\s*kb\/s/i);
              if (brMatch && parseInt(brMatch[1], 10) > 0) {
                duration = (fileSize * 8) / (parseInt(brMatch[1], 10) * 1000);
              } else if (fileSize > 0) {
                const isAudio = ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac'].includes(ext);
                duration = (fileSize * 8) / (isAudio ? 128000 : 1100000);
              }
            } catch (eSize) {}
          }

          const streams = info.streams || [];
          const videoStream = streams.find(s => s.codec_type === 'video');
          const audioStream = streams.find(s => s.codec_type === 'audio');

          let videoCodec = videoStream ? (videoStream.codec_name || '').toLowerCase() : '';
          let audioCodec = audioStream ? (audioStream.codec_name || '').toLowerCase() : '';
          let pixelFormat = videoStream ? (videoStream.pix_fmt || '').toLowerCase() : '';
          let width = videoStream ? (videoStream.width || 0) : 0;
          let height = videoStream ? (videoStream.height || 0) : 0;

          if (!videoCodec || !audioCodec) {
            const parsed = parseFfmpegOutput(rawText);
            if (!videoCodec && parsed.videoCodec) videoCodec = parsed.videoCodec;
            if (!audioCodec && parsed.audioCodec) audioCodec = parsed.audioCodec;
            if (!pixelFormat && parsed.pixelFormat) pixelFormat = parsed.pixelFormat;
            if (!width && parsed.width) width = parsed.width;
            if (!height && parsed.height) height = parsed.height;
            if (duration <= 1 && parsed.duration > 1) duration = parsed.duration;
          }

          let needsTranscode = !isNativeContainer;
          if (videoCodec) {
            const isNativeVideo = nativeVideoCodecs.includes(videoCodec);
            const isNativePix = nativePixFormats.includes(pixelFormat);
            if (!isNativeVideo || !isNativePix) {
              needsTranscode = true;
            }
          }
          if (audioCodec && !needsTranscode) {
            const isNativeAudio = nativeAudioCodecs.includes(audioCodec);
            if (!isNativeAudio) {
              needsTranscode = true;
            }
          }

          resolve({
            success: true,
            duration: duration || 0,
            videoCodec,
            audioCodec,
            pixelFormat,
            width,
            height,
            directPlay: !needsTranscode,
            needsTranscode,
            streams
          });
        });
      };

      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration,bit_rate:stream=codec_name,codec_type,pix_fmt,profile,width,height,duration,bit_rate',
        '-of', 'json',
        targetPath
      ];

      execFile(ffprobePath, args, { timeout: 5000 }, (err, stdout, stderr) => {
        if (err) {
          return runFfmpegFallback();
        }
        try {
          const info = JSON.parse(stdout);
          let duration = info.format && info.format.duration ? parseFloat(info.format.duration) : 0;
          
          if ((!duration || duration <= 1) && info.streams) {
            for (const stream of info.streams) {
              if (stream.duration) {
                const d = parseFloat(stream.duration);
                if (d > duration) duration = d;
              }
            }
          }

          if (!duration || duration <= 1) {
            return runFfmpegFallback(info);
          }

          const streams = info.streams || [];
          const videoStream = streams.find(s => s.codec_type === 'video');
          const audioStream = streams.find(s => s.codec_type === 'audio');
          
          let videoCodec = videoStream ? (videoStream.codec_name || '').toLowerCase() : '';
          let audioCodec = audioStream ? (audioStream.codec_name || '').toLowerCase() : '';
          let pixelFormat = videoStream ? (videoStream.pix_fmt || '').toLowerCase() : '';
          let width = videoStream ? (videoStream.width || 0) : 0;
          let height = videoStream ? (videoStream.height || 0) : 0;

          if (!videoCodec || !audioCodec) {
            return runFfmpegFallback(info);
          }
          
          let needsTranscode = !isNativeContainer;
          if (videoStream && !needsTranscode) {
            const isNativeVideo = nativeVideoCodecs.includes(videoCodec);
            const isNativePix = nativePixFormats.includes(pixelFormat);
            if (!isNativeVideo || !isNativePix) {
              needsTranscode = true;
            }
          }
          if (audioStream && !needsTranscode) {
            const isNativeAudio = nativeAudioCodecs.includes(audioCodec);
            if (!isNativeAudio) {
              needsTranscode = true;
            }
          }

          resolve({
            success: true,
            duration,
            videoCodec,
            audioCodec,
            pixelFormat,
            width,
            height,
            directPlay: !needsTranscode,
            needsTranscode,
            streams
          });
        } catch (e) {
          runFfmpegFallback();
        }
      });
    };

    if (useCppEngine) {
      const http = require('http');
      const req = http.get(`http://127.0.0.1:${cppStreamingPort}/probe?path=${encodeURIComponent(filePath)}`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed && parsed.success && parsed.duration > 1.0) {
              resolve(parsed);
            } else {
              fallbackProbe();
            }
          } catch (e) {
            fallbackProbe();
          }
        });
      });
      req.setTimeout(2500, () => {
        req.destroy();
        fallbackProbe();
      });
      req.on('error', (err) => {
        fallbackProbe();
      });
    } else {
      fallbackProbe();
    }
  });
});

ipcMain.handle('core-player-open', async (event, filePath) => {
  return sendCoreRequest('player_open', { filePath });
});

ipcMain.handle('core-player-play', async () => {
  return sendCoreRequest('player_play');
});

ipcMain.handle('core-player-pause', async () => {
  return sendCoreRequest('player_pause');
});

ipcMain.handle('core-player-seek', async (event, seconds) => {
  return sendCoreRequest('player_seek', { seconds });
});

ipcMain.handle('core-player-speed', async (event, speed) => {
  return sendCoreRequest('player_speed', { speed });
});

ipcMain.handle('core-player-close', async () => {
  return sendCoreRequest('player_close');
});


ipcMain.handle('open-file', (event, { saveDir, filename }) => {
  const fullPath = path.join(saveDir, filename);
  if (fs.existsSync(fullPath)) {
    shell.openPath(fullPath);
    return true;
  }
  return false;
});

ipcMain.handle('open-folder', (event, saveDir) => {
  if (fs.existsSync(saveDir)) {
    shell.openPath(saveDir);
    return true;
  }
  return false;
});

function registerMediaFolder(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    const folderPath = path.dirname(filePath);
    const normalizedFolder = path.normalize(folderPath).replace(/[\\/]/g, '/').toLowerCase();
    
    const isPrimary = settings.downloadDir && path.normalize(settings.downloadDir).replace(/[\\/]/g, '/').toLowerCase() === normalizedFolder;
    const isSynced = settings.syncedFolders && settings.syncedFolders.some(f => path.normalize(f).replace(/[\\/]/g, '/').toLowerCase() === normalizedFolder);
    
    if (!isPrimary && !isSynced) {
      if (!settings.syncedFolders) settings.syncedFolders = [];
      settings.syncedFolders.push(folderPath);
      saveSettings();
      
      // Notify both windows that settings updated
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings-changed', settings);
      }
      if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('settings-changed', settings);
      }
    }
  } catch (e) {
    console.error('Failed to auto-register folder:', e);
  }
}

let playerOpenDebounceTimer = null;
let lastOpenCommandToken = 0;

function openPlayerWindow(filePath, filename) {
  if (filePath) registerMediaFolder(filePath);
  const commandToken = ++lastOpenCommandToken;

  // Clear any existing pending open timer so previous command is ignored
  if (playerOpenDebounceTimer) {
    clearTimeout(playerOpenDebounceTimer);
    playerOpenDebounceTimer = null;
  }

  // Short debounce (50ms) to ignore previous command if clicked multiple times rapidly,
  // focusing cleanly on the latest command.
  playerOpenDebounceTimer = setTimeout(() => {
    if (commandToken !== lastOpenCommandToken) return; // Superseded command, ignore

    const targetTitle = filename || (filePath ? path.basename(filePath) : 'Media Player');

    if (playerWindow && !playerWindow.isDestroyed()) {
      playerState = { filePath, filename: targetTitle, playing: true, currentTime: 0, duration: 0, minimized: false };
      playerWindow.webContents.send('player-open-file', { filePath, filename: targetTitle, token: commandToken });
      if (playerWindow.isMinimized()) playerWindow.restore();
      playerWindow.show();
      playerWindow.focus();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('player-state-changed', playerState);
      }
      return;
    }

    const playerIcon = getIconPath('player.ico');
    const playerIconImg = nativeImage.createFromPath(playerIcon);
    const playerAppId = isDev ? 'com.panamedia.player.dev' : 'com.panamedia.player';
    ensurePlayerShortcut();

    const playerWin = new BrowserWindow({
      width: 960,
      height: 600,
      minWidth: 720,
      minHeight: 460,
      frame: false,
      icon: playerIconImg.isEmpty() ? playerIcon : playerIconImg,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
        preload: path.join(__dirname, 'preload.cjs')
      }
    });
    playerWin.setIcon(playerIconImg.isEmpty() ? playerIcon : playerIconImg);
    try {
      playerWin.setAppDetails({
        appId: playerAppId,
        appIconPath: playerIcon,
        appIconIndex: 0,
        relaunchDisplayName: 'Panamedia Player',
        relaunchCommand: `"${process.execPath}" --mode=player`
      });
    } catch (e) {}

    // Prevent Chromium from navigating the window away when a file is dropped
    playerWin.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('file://') && !url.includes('index.html')) {
        event.preventDefault();
      }
    });

    playerWindow = playerWin;
    playerState = { filePath, filename: targetTitle, playing: true, currentTime: 0, duration: 0, minimized: false };
    
    const queryParams = `mode=player&path=${encodeURIComponent(filePath || '')}&title=${encodeURIComponent(targetTitle)}`;
    playerWin.loadURL(getAppUrl(queryParams));

    playerWin.on('enter-full-screen', () => {
      playerWin.webContents.send('player-fullscreen-changed', true);
    });

    playerWin.on('leave-full-screen', () => {
      playerWin.webContents.send('player-fullscreen-changed', false);
    });

    playerWin.on('closed', () => {
      playerWindow = null;
      playerState = null;
      wasPlayerMinimizedBeforeParentClosed = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('player-state-changed', null);
      } else {
        app.quit();
      }
    });

    playerWin.on('minimize', () => {
      if (playerState) {
        playerState.minimized = true;
        wasPlayerMinimizedBeforeParentClosed = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player-state-changed', playerState);
        }
      }
    });

    playerWin.on('restore', () => {
      wasPlayerMinimizedBeforeParentClosed = false;
      if (playerState) {
        playerState.minimized = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player-state-changed', playerState);
        }
      }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player-state-changed', { ...playerState, minimized: false });
    }
  }, 50);

  return true;
}

// ─── Single Instance & Second Instance Handler ─────────────────────────────
app.on('second-instance', (event, argv, workingDirectory) => {
  const fileArg = getMediaFileFromCommandLine(argv, workingDirectory);
  if (fileArg) {
    registerMediaFolder(fileArg);
    openPlayerWindow(fileArg, path.basename(fileArg));
    return;
  }

  if (argv && argv.includes('--mode=player')) {
    let filePath = '';
    const pathArgIndex = argv.findIndex(arg => arg.startsWith('--path='));
    if (pathArgIndex !== -1) {
      filePath = cleanArgPath(argv[pathArgIndex].split('=')[1]);
    }
    openPlayerWindow(filePath, filePath ? path.basename(filePath) : 'Media Player');
    return;
  }

  // Double-clicking desktop shortcut or launching main app
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow('main');
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('register-media-folder', (event, filePath) => {
  registerMediaFolder(filePath);
  return settings;
});

ipcMain.handle('open-player-window', (event, { filePath, filename }) => {
  return openPlayerWindow(filePath, filename);
});

ipcMain.on('player-set-fullscreen', (event, flag) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.setFullScreen(flag);
  }
});

// IPC player window controls from mini-player sidebar
ipcMain.on('player-control-play-pause', () => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('player-control-play-pause');
  }
});

ipcMain.on('player-control-close', () => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.close();
  }
});

ipcMain.on('player-control-mute', () => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('player-control-mute');
  }
});




ipcMain.handle('get-flash-drives', async () => {
  return new Promise((resolve) => {
    const cmd = `powershell -Command "[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Removable' } | ForEach-Object { [PSCustomObject]@{ Name = $_.Name; Label = $_.VolumeLabel } } | ConvertTo-Json"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Failed to get flash drives', err);
        return resolve([]);
      }
      try {
        const output = stdout.trim();
        if (!output) return resolve([]);
        const parsed = JSON.parse(output);
        const drives = Array.isArray(parsed) ? parsed : [parsed];
        const formatted = drives
          .filter(d => d && d.Name)
          .map(d => ({
            letter: d.Name,
            label: d.Label || 'USB Drive'
          }));
        resolve(formatted);
      } catch (e) {
        console.error('Failed to parse flash drives output', e);
        resolve([]);
      }
    });
  });
});

ipcMain.handle('copy-file-to-drive', async (event, { filePath, driveLetter }) => {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      return resolve({ success: false, error: 'Source file does not exist' });
    }
    const filename = path.basename(filePath);
    const destPath = path.join(driveLetter, filename);
    
    const stat = fs.statSync(filePath);
    const totalBytes = stat.size;
    let copiedBytes = 0;
    
    const readStream = fs.createReadStream(filePath);
    const writeStream = fs.createWriteStream(destPath);
    
    readStream.on('data', (chunk) => {
      copiedBytes += chunk.length;
      const progress = totalBytes > 0 ? (copiedBytes / totalBytes) : 0;
      event.sender.send('copy-progress', { filePath, progress, status: 'copying' });
    });
    
    writeStream.on('finish', () => {
      event.sender.send('copy-progress', { filePath, progress: 1.0, status: 'completed' });
      resolve({ success: true });
    });
    
    readStream.on('error', (err) => {
      writeStream.end();
      event.sender.send('copy-progress', { filePath, progress: 0, status: 'failed', error: err.message });
      resolve({ success: false, error: err.message });
    });
    
    writeStream.on('error', (err) => {
      readStream.destroy();
      event.sender.send('copy-progress', { filePath, progress: 0, status: 'failed', error: err.message });
      resolve({ success: false, error: err.message });
    });
    
    readStream.pipe(writeStream);
  });
});

ipcMain.handle('convert-and-send-to-drive', async (event, { filePath, driveLetter, options = {} }) => {
  try {
    const result = await convertAndSendToDrive(filePath, driveLetter, options, (progressData) => {
      event.sender.send('copy-progress', {
        filePath,
        progress: progressData.progress,
        status: progressData.status,
        error: progressData.error
      });
    });
    return { success: true, ...result };
  } catch (err) {
    console.error('[convert-and-send-to-drive error]:', err);
    event.sender.send('copy-progress', {
      filePath,
      progress: 0,
      status: 'failed',
      error: err.message
    });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('convert-media-file', async (event, { filePath, targetDir, options = {} }) => {
  try {
    const format = (options.format || (options.mode === 'extract_audio' ? 'mp3' : 'mp4')).toLowerCase();
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const outFolder = targetDir || path.dirname(filePath);
    let outputFilename;
    if (options.mode === 'extract_audio') {
      outputFilename = `${baseName}.${format}`;
    } else if (options.mode === 'convert_video') {
      outputFilename = `${baseName}_converted.${format}`;
    } else {
      outputFilename = path.basename(filePath);
    }
    const outputPath = path.join(outFolder, outputFilename);

    const result = await convertMediaFile(filePath, outputPath, options, (progressData) => {
      event.sender.send('copy-progress', {
        filePath,
        progress: progressData.progress,
        status: progressData.status,
        error: progressData.error
      });
    });
    return { success: true, outputPath, ...result };
  } catch (err) {
    console.error('[convert-media-file error]:', err);
    event.sender.send('copy-progress', {
      filePath,
      progress: 0,
      status: 'failed',
      error: err.message
    });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-folder-to-disk', async (event, { folderName, filePaths }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const sanitizedName = (folderName || 'Sendtray Group')
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim() || 'Sendtray Group';

    const dialogResult = await dialog.showOpenDialog(win || undefined, {
      title: `Select Destination to Save Folder "${sanitizedName}"`,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Save Folder Here'
    });

    if (dialogResult.canceled || !dialogResult.filePaths || dialogResult.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const selectedBaseDir = dialogResult.filePaths[0];
    const destinationFolder = path.join(selectedBaseDir, sanitizedName);

    if (!fs.existsSync(destinationFolder)) {
      fs.mkdirSync(destinationFolder, { recursive: true });
    }

    const copiedFiles = [];
    const filesToCopy = Array.isArray(filePaths) ? filePaths : [];

    for (const srcPath of filesToCopy) {
      if (srcPath && fs.existsSync(srcPath)) {
        const fileName = path.basename(srcPath);
        const destPath = path.join(destinationFolder, fileName);
        fs.copyFileSync(srcPath, destPath);
        copiedFiles.push(destPath);
      }
    }

    return {
      success: true,
      targetPath: destinationFolder,
      copiedCount: copiedFiles.length
    };
  } catch (err) {
    console.error('[save-folder-to-disk error]:', err);
    return { success: false, error: err.message };
  }
});

function setWindowsClipboardFiles(filePaths) {
  const list = Array.isArray(filePaths) ? filePaths : [filePaths];
  const validFiles = list.filter(p => p && fs.existsSync(p));
  if (validFiles.length === 0) return;

  try {
    clipboard.writeText(validFiles.join('\r\n'));
  } catch (e) {}

  // Set Windows Explorer FileDropList via PowerShell so pasting in WhatsApp/Telegram pastes the actual file
  const escapedList = validFiles.map(p => `$col.Add('${p.replace(/'/g, "''")}');`).join(' ');
  const psCmd = `Add-Type -AssemblyName System.Windows.Forms; $col = New-Object System.Collections.Specialized.StringCollection; ${escapedList} [System.Windows.Forms.Clipboard]::SetFileDropList($col);`;
  execFile('powershell', ['-NoProfile', '-STA', '-Command', psCmd], (err) => {
    if (err) console.warn('[Clipboard] Failed to set FileDropList:', err.message);
  });
}

ipcMain.handle('select-export-directory', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogResult = await dialog.showOpenDialog(win || undefined, {
      title: 'Select Export Destination Folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Select Folder'
    });
    if (dialogResult.canceled || !dialogResult.filePaths || dialogResult.filePaths.length === 0) {
      return { canceled: true, targetPath: null };
    }
    return { canceled: false, targetPath: dialogResult.filePaths[0] };
  } catch (err) {
    console.error('[select-export-directory error]:', err);
    return { canceled: true, error: err.message };
  }
});

function checkInternetConnection() {
  return new Promise((resolve) => {
    dns.lookup('google.com', (err) => {
      if (err && (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN' || err.code === 'ECONNREFUSED')) {
        dns.lookup('cloudflare.com', (err2) => {
          resolve(!err2);
        });
      } else {
        resolve(true);
      }
    });
  });
}

ipcMain.handle('check-internet', async () => {
  const online = await checkInternetConnection();
  return { online };
});

// ── In-App Update Download & Install ──────────────────────────────────────────
let updateDownloadAbort = null;

ipcMain.handle('download-app-update', async (event, { downloadUrl, fileName } = {}) => {
  try {
    const online = await checkInternetConnection();
    if (!online) {
      return { success: false, error: 'No internet connection. Please check your network and try again.' };
    }

    const LATEST_ENDPOINT = 'https://panamedia.lovable.app/api/public/latest/windows';
    const DOWNLOAD_ENDPOINT = 'https://panamedia.lovable.app/api/public/download/windows';

    // 1. Fetch metadata if file_name or expected size is missing
    let targetFileName = fileName || 'PanamediaSetup.exe';
    let expectedTotalBytes = 0;
    try {
      const metaRes = await fetch(LATEST_ENDPOINT, {
        headers: { 'cache-control': 'no-cache', 'User-Agent': 'Panamedia-Updater' }
      });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta && meta.file_name) targetFileName = meta.file_name;
        if (meta && meta.file_size) expectedTotalBytes = Number(meta.file_size);
      }
    } catch (e) {
      console.warn('[Updater] Could not query latest metadata:', e.message);
    }

    // Always fetch directly from the permanent redirect endpoint or given downloadUrl
    const fetchUrl = downloadUrl && downloadUrl.startsWith('http') && !downloadUrl.includes('localhost')
      ? downloadUrl
      : DOWNLOAD_ENDPOINT;

    // Save directly to the user's Downloads folder
    const downloadsDir = app.getPath('downloads');
    const finalInstallerPath = path.join(downloadsDir, targetFileName);
    const tempPartPath = path.join(downloadsDir, `${targetFileName}.download`);

    // Clean up any stale partial download
    try { if (fs.existsSync(tempPartPath)) fs.unlinkSync(tempPartPath); } catch (e) {}

    const controller = new AbortController();
    updateDownloadAbort = controller;

    console.log(`[Updater] Starting in-app download from ${fetchUrl} to ${finalInstallerPath}...`);

    const res = await fetch(fetchUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Panamedia-Updater',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      updateDownloadAbort = null;
      return { success: false, error: `Update server returned status ${res.status}: ${res.statusText}` };
    }

    const clHeader = res.headers.get('content-length');
    const totalBytes = clHeader ? parseInt(clHeader, 10) : (expectedTotalBytes || 0);

    const { Readable } = require('stream');
    const nodeReadable = Readable.fromWeb(res.body);
    const fileStream = fs.createWriteStream(tempPartPath);

    let downloadedBytes = 0;
    let lastProgressTime = 0;
    let lastBytesSample = 0;
    let currentSpeed = 0;

    return await new Promise((resolve) => {
      nodeReadable.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        fileStream.write(chunk);

        const now = Date.now();
        if (now - lastProgressTime >= 250 || (totalBytes > 0 && downloadedBytes >= totalBytes)) {
          const deltaSec = (now - lastProgressTime) / 1000;
          if (deltaSec > 0) {
            currentSpeed = Math.round((downloadedBytes - lastBytesSample) / deltaSec);
          }
          lastProgressTime = now;
          lastBytesSample = downloadedBytes;

          if (mainWindow && !mainWindow.isDestroyed()) {
            const progress = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : -1;
            mainWindow.webContents.send('update-download-progress', {
              downloadedBytes,
              totalBytes,
              progress,
              speed: currentSpeed
            });
          }
        }
      });

      nodeReadable.on('end', () => {
        fileStream.end();
      });

      fileStream.on('finish', () => {
        updateDownloadAbort = null;
        try {
          if (fs.existsSync(finalInstallerPath)) {
            try { fs.unlinkSync(finalInstallerPath); } catch (e) {}
          }
          fs.renameSync(tempPartPath, finalInstallerPath);

          const stat = fs.statSync(finalInstallerPath);
          if (stat.size > 1024 * 1024) { // At least 1MB
            console.log(`[Updater] Download complete: ${finalInstallerPath} (${stat.size} bytes)`);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-download-progress', {
                downloadedBytes: stat.size,
                totalBytes: stat.size,
                progress: 100,
                speed: 0
              });
            }
            resolve({ success: true, installerPath: finalInstallerPath, size: stat.size });
          } else {
            resolve({ success: false, error: 'Downloaded file is incomplete or too small.' });
          }
        } catch (err) {
          resolve({ success: false, error: `Failed to finalize installer file: ${err.message}` });
        }
      });

      const handleError = (err) => {
        try { fileStream.destroy(); } catch (e) {}
        try { if (fs.existsSync(tempPartPath)) fs.unlinkSync(tempPartPath); } catch (e) {}
        updateDownloadAbort = null;
        if (err.name === 'AbortError' || controller.signal.aborted) {
          resolve({ success: false, error: 'Download was cancelled.' });
        } else {
          console.error('[Updater] Download error:', err);
          resolve({ success: false, error: err.message || 'Download stream error.' });
        }
      };

      nodeReadable.on('error', handleError);
      fileStream.on('error', handleError);
    });
  } catch (err) {
    updateDownloadAbort = null;
    if (err.name === 'AbortError') {
      return { success: false, error: 'Download was cancelled.' };
    }
    return { success: false, error: err.message || 'Unexpected error downloading update.' };
  }
});

ipcMain.handle('cancel-app-update-download', async () => {
  if (updateDownloadAbort) {
    try { updateDownloadAbort.abort(); } catch (e) {}
    updateDownloadAbort = null;
  }
  return { success: true };
});

ipcMain.handle('install-app-update', async (_event, { installerPath }) => {
  try {
    if (!installerPath || !fs.existsSync(installerPath)) {
      return { success: false, error: 'Installer file not found.' };
    }

    console.log(`[Updater] Launching installer: ${installerPath}`);
    // Launch the installer and quit the app so it can update
    const { spawn: spawnProcess } = require('child_process');
    const child = spawnProcess(installerPath, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    // Give the installer a moment to start, then quit
    setTimeout(() => {
      app.quit();
    }, 1200);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to launch installer.' };
  }
});

ipcMain.handle('send-via-bluetooth', async (_event, { filePath, filePaths }) => {
  const files = filePaths && filePaths.length > 0 ? filePaths : (filePath ? [filePath] : []);
  const valid = files.filter(p => p && fs.existsSync(p));
  if (valid.length > 0) {
    setWindowsClipboardFiles(valid);
    try {
      shell.showItemInFolder(valid[0]);
    } catch (e) {}
  }

  const fsquirtPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'fsquirt.exe');
  if (fs.existsSync(fsquirtPath)) {
    execFile(fsquirtPath, ['-send'], (err) => {
      if (err) console.warn('[Bluetooth] fsquirt launch error:', err);
    });
    return { success: true, method: 'fsquirt' };
  } else {
    try {
      await shell.openExternal('ms-settings:bluetooth');
    } catch (e) {}
    return { success: true, method: 'settings' };
  }
});

ipcMain.handle('share-via-app', async (_event, { app: targetApp, filePath, filePaths }) => {
  const isOnline = await checkInternetConnection();
  if (!isOnline) {
    return { success: false, reason: 'offline' };
  }

  const files = filePaths && filePaths.length > 0 ? filePaths : (filePath ? [filePath] : []);
  const valid = files.filter(p => p && fs.existsSync(p));
  if (valid.length > 0) {
    setWindowsClipboardFiles(valid);
    try {
      shell.showItemInFolder(valid[0]);
    } catch (e) {}
  }

  if (targetApp === 'whatsapp') {
    try {
      await shell.openExternal('whatsapp://');
      return { success: true, opened: 'desktop' };
    } catch (e) {
      await shell.openExternal('https://web.whatsapp.com');
      return { success: true, opened: 'web' };
    }
  } else if (targetApp === 'telegram') {
    try {
      await shell.openExternal('tg://');
      return { success: true, opened: 'desktop' };
    } catch (e) {
      await shell.openExternal('https://web.telegram.org');
      return { success: true, opened: 'web' };
    }
  }

  return { success: false, reason: 'unknown-app' };
});

ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

// Converter default paths: Documents/Panamedia/Video Output and Documents/Panamedia/Audio Output
ipcMain.handle('get-converter-output-paths', async () => {
  try {
    const documentsDir = app.getPath('documents');
    const panamediaDir = path.join(documentsDir, 'Panamedia');
    const videoOutputDir = path.join(panamediaDir, 'Video Output');
    const audioOutputDir = path.join(panamediaDir, 'Audio Output');

    if (!fs.existsSync(panamediaDir)) fs.mkdirSync(panamediaDir, { recursive: true });
    if (!fs.existsSync(videoOutputDir)) fs.mkdirSync(videoOutputDir, { recursive: true });
    if (!fs.existsSync(audioOutputDir)) fs.mkdirSync(audioOutputDir, { recursive: true });

    return {
      documentsDir,
      panamediaDir,
      videoOutputDir,
      audioOutputDir
    };
  } catch (err) {
    console.error('[Electron] Error creating converter default folders in Documents:', err);
    return null;
  }
});

ipcMain.handle('select-converter-output-folder', async (_event, defaultPath) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const res = await dialog.showOpenDialog(win, {
      title: 'Select Output Location for Converter',
      defaultPath: defaultPath && fs.existsSync(defaultPath) ? defaultPath : app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory']
    });
    if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
      return res.filePaths[0];
    }
    return null;
  } catch (err) {
    console.error('[Electron] select-converter-output-folder error:', err);
    return null;
  }
});

ipcMain.handle('open-converter-folder', async (_event, folderPath) => {
  try {
    if (folderPath && fs.existsSync(folderPath)) {
      shell.openPath(folderPath);
      return true;
    }
  } catch (err) {
    console.error('[Electron] open-converter-folder error:', err);
  }
  return false;
});

ipcMain.handle('get-converter-output-files', async (_event, dirPath) => {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return [];
    const files = fs.readdirSync(dirPath);
    const results = [];
    for (const f of files) {
      try {
        const full = path.join(dirPath, f);
        const stat = fs.statSync(full);
        if (stat.isFile() && !f.startsWith('.')) {
          const ext = path.extname(f).toLowerCase().replace('.', '');
          const sizeMb = (stat.size / (1024 * 1024)).toFixed(1) + ' MB';
          results.push({
            name: f,
            path: full,
            size: sizeMb,
            format: ext.toUpperCase(),
            date: new Date(stat.mtime).toLocaleString()
          });
        }
      } catch (e) {}
    }
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return results;
  } catch (err) {
    console.error('[Electron] get-converter-output-files error:', err);
    return [];
  }
});


// IPC Player State sync
ipcMain.handle('get-player-state', () => {
  if (playerWindow && !playerWindow.isDestroyed() && playerState) {
    const isMinimized = wasPlayerMinimizedBeforeParentClosed || !playerWindow.isVisible() || playerWindow.isMinimized();
    return { ...playerState, minimized: isMinimized };
  }
  return null;
});

// Player sends its state updates (playing/paused, currentTime, title changes)
ipcMain.on('player-update-state', (event, state) => {
  const isMinimized = wasPlayerMinimizedBeforeParentClosed || (playerWindow ? (!playerWindow.isVisible() || playerWindow.isMinimized()) : false);
  playerState = { ...playerState, ...state, minimized: isMinimized };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('player-state-changed', playerState);
  }
  if (playerWindow && !playerWindow.isDestroyed()) {
    if (state && state.duration > 0 && typeof state.currentTime === 'number') {
      const ratio = Math.max(0, Math.min(1, state.currentTime / state.duration));
      playerWindow.setProgressBar(ratio, { mode: state.playing ? 'normal' : 'paused' });
    } else {
      playerWindow.setProgressBar(-1);
    }
  }
  if (playerTray && !playerTray.isDestroyed() && state && state.filename) {
    try {
      playerTray.setToolTip(`Panamedia Player - ${state.filename}`);
    } catch (e) {}
  }
});

// Player minimize: hide window instead of minimizing, show mini-player in main sidebar
ipcMain.on('player-minimize-to-sidebar', (event) => {
  const win = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : playerWindow;
  wasPlayerMinimizedBeforeParentClosed = true;
  if (win && !win.isDestroyed()) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      win.hide();
      if (!playerState) {
        playerState = { filePath: '', filename: 'Media Player', playing: true, currentTime: 0, duration: 0, volume: 100 };
      }
      playerState.minimized = true;
      mainWindow.webContents.send('player-state-changed', playerState);
    } else {
      win.minimize();
      if (playerState) playerState.minimized = true;
    }
  }
});

// Restore player window from mini-player click
ipcMain.handle('player-restore', () => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    wasPlayerMinimizedBeforeParentClosed = false;
    if (playerWindow.isMinimized()) {
      playerWindow.restore();
    }
    playerWindow.show();
    playerWindow.focus();
    if (!playerState) {
      playerState = { filePath: '', filename: 'Media Player', playing: true, currentTime: 0, duration: 0, volume: 100 };
    }
    playerState.minimized = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player-state-changed', playerState);
    }
    return true;
  }
  return false;
});

// Relay remote commands from main window sidebar mini-player controls to the player window
// Commands: 'toggle-play', 'prev', 'next', 'mute'
ipcMain.on('player-remote-command', (event, command, ...args) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('player-remote-command', command, ...args);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('player-remote-command', command, ...args);
  }
});

// Converter Pro minimized state synchronization between Converter and Player Header
let converterMinimizedState = null;
function getConverterStateFilePath() {
  try {
    const userData = app.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || '', 'panamedia');
    return path.join(userData, 'converter_minimized_state.json');
  } catch (e) {
    return null;
  }
}

try {
  const sf = getConverterStateFilePath();
  if (sf && fs.existsSync(sf)) {
    converterMinimizedState = JSON.parse(fs.readFileSync(sf, 'utf8'));
  }
} catch (e) {}

ipcMain.on('converter-minimize-state', (_event, state) => {
  converterMinimizedState = state;
  try {
    const sf = getConverterStateFilePath();
    if (sf) fs.writeFileSync(sf, JSON.stringify(state));
  } catch (e) {}
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('converter-state-changed', state);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('converter-state-changed', state);
  }
});

ipcMain.handle('get-converter-minimize-state', () => {
  if (!converterMinimizedState) {
    try {
      const sf = getConverterStateFilePath();
      if (sf && fs.existsSync(sf)) {
        converterMinimizedState = JSON.parse(fs.readFileSync(sf, 'utf8'));
      }
    } catch (e) {}
  }
  return converterMinimizedState;
});

ipcMain.on('converter-restore-request', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('converter-restore-request');
    mainWindow.show();
    mainWindow.focus();
  }
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('converter-restore-request');
  }
});

ipcMain.on('converter-close-request', () => {
  converterMinimizedState = { minimized: false, queueCount: 0 };
  try {
    const sf = getConverterStateFilePath();
    if (sf) fs.writeFileSync(sf, JSON.stringify(converterMinimizedState));
  } catch (e) {}
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('converter-close-request');
  }
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('converter-close-request');
    playerWindow.webContents.send('converter-state-changed', { minimized: false, queueCount: 0 });
  }
});

ipcMain.on('converter-run-request', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('converter-run-request');
  }
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('converter-run-request');
  }
});

ipcMain.on('converter-pause-request', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('converter-pause-request');
  }
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('converter-pause-request');
  }
});

ipcMain.on('converter-resume-request', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('converter-resume-request');
  }
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('converter-resume-request');
  }
});

ipcMain.on('converter-open-request', () => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('converter-open-request');
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('converter-open-request');
  }
});

ipcMain.handle('remove-media-path', async (_event, filePath) => {
  if (!filePath) return { success: false };
  try {
    const removed = removeDownloadByPath(filePath);
    return { success: true, removed };
  } catch (err) {
    return { success: false, error: err.message };
  }
});



const dirCache = new Map();
const cacheFile = path.join(dataDir, 'dirCache.json');

function saveDirCache() {
  try {
    const obj = {};
    for (const [key, val] of dirCache.entries()) {
      obj[key] = val;
    }
    fs.writeFileSync(cacheFile, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save dir cache', e);
  }
}

function loadDirCache() {
  if (fs.existsSync(cacheFile)) {
    try {
      const raw = fs.readFileSync(cacheFile, 'utf8').trim();
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        for (const key in obj) {
          const entry = obj[key];
          if (entry && Array.isArray(entry.files)) {
            // Re-validate any .ts files: only genuine MPEG-TS videos belong in 'videos'
            for (const f of entry.files) {
              if (f && f.ext === '.ts') {
                const isVid = isMpegTsVideo(f.path, f.size);
                f.category = isVid ? 'videos' : 'files';
              }
            }
          }
          dirCache.set(key, entry);
        }
      }
    } catch (e) {
      console.warn('Failed to load dir cache, resetting corrupted cache file:', e.message);
      try { fs.unlinkSync(cacheFile); } catch (_) {}
    }
  }
}

// Helper function for depth-limited recursive traversal with folder-level caching
function scanDirRecursive(dir, fileList, scannedPaths, depth = 0) {
  if (depth > 8 || fileList.length > 10000) return;
  if (!fs.existsSync(dir)) return;

  let dirStat;
  try {
    dirStat = fs.statSync(dir);
  } catch (e) {
    return;
  }

  // Check if we have a cached version of this directory that is up to date
  const cached = dirCache.get(dir);
  if (cached && cached.mtimeMs === dirStat.mtimeMs) {
    // Reuse cached files
    for (const f of cached.files) {
      if (!scannedPaths.has(f.path)) {
        scannedPaths.add(f.path);
        fileList.push(f);
      }
    }
    // Recurse into cached subdirectories
    for (const subdir of cached.subdirs) {
      if (!scannedPaths.has(subdir)) {
        scannedPaths.add(subdir);
        scanDirRecursive(subdir, fileList, scannedPaths, depth + 1);
      }
    }
    return;
  }

  // Not cached or modified: rescan
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    return; // ignore unreadable dirs
  }

  const directFiles = [];
  const directSubdirs = [];

  for (const file of files) {
    if (file.startsWith('.') || 
        ['node_modules', 'Windows', 'Program Files', 'Program Files (x86)', 'AppData', '$RECYCLE.BIN', 'System Volume Information', '.git', '.svn', '.vscode', '.idea', 'target', 'vendor', '__pycache__', 'dist', 'build', '.agents'].includes(file)) {
      continue;
    }

    const fullPath = path.join(dir, file);
    if (scannedPaths.has(fullPath)) continue;

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      continue;
    }

    if (stat.isDirectory()) {
      directSubdirs.push(fullPath);
      scannedPaths.add(fullPath);
      scanDirRecursive(fullPath, fileList, scannedPaths, depth + 1);
    } else if (stat.isFile()) {
      const lowerName = file.toLowerCase();
      const isNetTs = lowerName.endsWith('.net.ts');
      const ext = isNetTs ? '.net.ts' : path.extname(file).toLowerCase();
      let category = 'files';
      const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.mpg', '.mpeg', '.mpeg4', '.dat', '.3gp', '.wmv', '.m4v', '.ts', '.net.ts', '.ogv', '.m2ts', '.3g2', '.f4v', '.divx', '.mpg4', '.rm', '.rmvb', '.asf', '.asx', '.swf', '.vob'];
      const audioExts = ['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus', '.wma', '.alac', '.aiff', '.ape', '.amr', '.m4b', '.mka', '.m4r', '.mid', '.midi', '.mp2', '.mpa', '.wv'];
      const docExts = ['.docx', '.doc', '.pdf', '.txt', '.pptx', '.xlsx', '.rtf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.tiff'];

      if (ext === '.ts') {
        const isVideoTs = isMpegTsVideo(fullPath, stat.size);
        if (isVideoTs) {
          category = 'videos';
        } else {
          category = 'files';
        }
      } else if (videoExts.includes(ext)) {
        category = 'videos';
      } else if (audioExts.includes(ext)) {
        category = 'audios';
      } else if (docExts.includes(ext)) {
        category = 'docx';
      } else {
        category = 'files';
      }

      const fileObj = {
        name: file,
        path: fullPath,
        size: stat.size,
        mtime: stat.mtimeMs,
        category,
        ext
      };
      directFiles.push(fileObj);
      scannedPaths.add(fullPath);
      fileList.push(fileObj);
    }
  }

  // Update directory cache
  dirCache.set(dir, {
    mtimeMs: dirStat.mtimeMs,
    files: directFiles,
    subdirs: directSubdirs
  });
}

ipcMain.handle('sync-media-library', async (event, folderPath) => {
  let foldersToScan = [];
  if (folderPath) {
    foldersToScan = [folderPath];
  } else {
    if (settings.downloadDir) {
      foldersToScan.push(settings.downloadDir);
    }
    if (settings.syncedFolders && Array.isArray(settings.syncedFolders)) {
      for (const folder of settings.syncedFolders) {
        if (folder && !foldersToScan.includes(folder)) {
          foldersToScan.push(folder);
        }
      }
    }
    // Also include any archived folders from archive_data.json so they are synced back to the app
    try {
      const archiveFile = path.join(dataDir, 'archive_data.json');
      if (fs.existsSync(archiveFile)) {
        const archData = JSON.parse(fs.readFileSync(archiveFile, 'utf-8'));
        if (archData.archivePaths && Array.isArray(archData.archivePaths)) {
          for (const archP of archData.archivePaths) {
            if (fs.existsSync(archP)) {
              try {
                const s = fs.statSync(archP);
                const dirToAdd = s.isDirectory() ? archP : path.dirname(archP);
                if (dirToAdd && !foldersToScan.includes(dirToAdd)) {
                  foldersToScan.push(dirToAdd);
                }
              } catch {}
            }
          }
        }
      }
    } catch (e) {
      console.error('[sync-media-library] Error checking archive folders:', e);
    }
  }

  const fileList = [];
  const scannedPaths = new Set();

  for (const dir of foldersToScan) {
    if (fs.existsSync(dir)) {
      scanDirRecursive(dir, fileList, scannedPaths, 0);
    }
  }
  saveDirCache();
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('library-synced', fileList);
  }
  return fileList;
});

ipcMain.on('library-synced', (event, files) => {
  if (playerWindow && !playerWindow.isDestroyed() && event.sender !== playerWindow.webContents) {
    playerWindow.webContents.send('library-synced', files);
  }
  if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('library-synced', files);
  }
});

ipcMain.on('archive-updated', (event, paths) => {
  if (playerWindow && !playerWindow.isDestroyed() && event.sender !== playerWindow.webContents) {
    playerWindow.webContents.send('archive-updated', paths);
  }
  if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('archive-updated', paths);
  }
  // Persist archive paths to file so they survive app updates/reinstalls
  try {
    const archiveFile = path.join(dataDir, 'archive_data.json');
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(archiveFile, 'utf-8')); } catch {}
    existing.archivePaths = paths;
    fs.writeFileSync(archiveFile, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    console.error('[archive-persist] Failed to save archive paths:', err);
  }
});

ipcMain.on('archive-pin-updated', (event, pin) => {
  if (playerWindow && !playerWindow.isDestroyed() && event.sender !== playerWindow.webContents) {
    playerWindow.webContents.send('archive-pin-updated', pin);
  }
  if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('archive-pin-updated', pin);
  }
  try {
    const archiveFile = path.join(dataDir, 'archive_data.json');
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(archiveFile, 'utf-8')); } catch {}
    existing.archivePin = pin;
    fs.writeFileSync(archiveFile, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    console.error('[archive-persist] Failed to save archive pin:', err);
  }
});

// Save archive data (paths, pin, favourites) to file — called from renderer on changes
ipcMain.handle('save-archive-data', async (event, data) => {
  try {
    const archiveFile = path.join(dataDir, 'archive_data.json');
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(archiveFile, 'utf-8')); } catch {}
    if (data.archivePaths !== undefined) existing.archivePaths = data.archivePaths;
    if (data.archivePin !== undefined) {
      existing.archivePin = data.archivePin;
      if (playerWindow && !playerWindow.isDestroyed() && event.sender !== playerWindow.webContents) {
        playerWindow.webContents.send('archive-pin-updated', data.archivePin);
      }
      if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
        mainWindow.webContents.send('archive-pin-updated', data.archivePin);
      }
    }
    if (data.favouritePaths !== undefined) existing.favouritePaths = data.favouritePaths;
    fs.writeFileSync(archiveFile, JSON.stringify(existing, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Load archive data from file — used on startup to restore after updates
ipcMain.handle('load-archive-data', async () => {
  try {
    const archiveFile = path.join(dataDir, 'archive_data.json');
    if (!fs.existsSync(archiveFile)) return { success: true, data: {} };
    const content = JSON.parse(fs.readFileSync(archiveFile, 'utf-8'));
    return { success: true, data: content };
  } catch (err) {
    return { success: false, error: err.message, data: {} };
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'File not found' };
  }
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});




// Binary check & Install handlers
ipcMain.handle('check-binaries', () => {
  return checkBinaries();
});

ipcMain.handle('install-binaries', async (event) => {
  try {
    await installBinaries((progressData) => {
      if (mainWindow) {
        mainWindow.webContents.send('binary-install-progress', progressData);
      }
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pause-binary-install', () => {
  pauseInstall();
  return { success: true };
});

ipcMain.handle('resume-binary-install', () => {
  resumeInstall();
  return { success: true };
});

// YouTube integrations
ipcMain.handle('get-youtube-playlist', async (event, url) => {
  try {
    const info = await getPlaylistInfo(url);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-youtube-formats', async (event, url, options) => {
  try {
    const isYt = (url || '').toLowerCase().includes('youtube.com/') || (url || '').toLowerCase().includes('youtu.be/');
    if (isYt) {
      const info = await getVideoFormats(url);
      if (info) info.isYoutube = true;
      return { success: true, info };
    } else {
      // Dynamic routing to isolated universal web extractor
      const info = await getUniversalWebFormats(url, options);
      if (info) info.isYoutube = false;
      return { success: true, info };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Built-in AdBlocker for web viewer
const STREAM_PARTITION = 'persist:panamedia_stream';

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getAppSessions() {
  const sessions = [];
  if (session && session.defaultSession) {
    sessions.push(session.defaultSession);
  }
  try {
    const streamSess = session.fromPartition(STREAM_PARTITION);
    if (streamSess && !sessions.includes(streamSess)) {
      sessions.push(streamSess);
      // Ensure webview uses standard Chrome user agent without "Electron" token for web streaming sites
      try {
        streamSess.setUserAgent(CHROME_USER_AGENT);
        // Automatically grant media, audio, video, WebRTC, and autoplay permissions for stream playback
        streamSess.setPermissionRequestHandler((webContents, permission, callback) => {
          callback(true);
        });
        streamSess.setPermissionCheckHandler(() => true);
      } catch (e) {}
    }
  } catch (e) {}
  return sessions;
}

const adDomains = [
  'doubleclick.net', 'googlesyndication.com', 'googleads', 'pagead2.googlesyndication.com',
  'adservice.google', 'exoclick.com', 'popads.net', 'propellerads.com', 'adsterra.com',
  'juicyads.com', 'trafficjunky.com', 'trafficjunky.net', 'tsyndicate.com', 'adnxs.com',
  'moatads.com', 'scorecardresearch.com', 'taboola.com', 'outbrain.com', 'criteo.com',
  'pubmatic.com', 'rubiconproject.com', 'adroll.com', 'yieldmo.com', 'bidswitch.net',
  'zedo.com', 'adcolony.com', 'unityads.unity3d.com', 'vungle.com', 'applovin.com',
  'inmobi.com', 'ironsource.com', 'exosrv.com', 'realsrv.com', 'ero-advertising.com',
  'adxad.com', 'plugrush.com', 'twinred.com', 'trafficfactory.biz', 'popcash.net',
  'adcash.com', 'hilltopads.com', 'clickadu.com', 'evadav.com', 'rollerads.com',
  'yllix.com', 'clicksor.com', 'infocontrol.net', 'monetag.com', 'galaksion.com',
  'richpush.co', 'richaudience.com', 'adtarget.com', 'onclickalgo.com', 'onclkds.com',
  'sofun', 'sofungame', 'game300', 'adsupply', 'adkeeper', 'mgid.com', 'admaven.com',
  'cpmstar', 'adzerk', 'bidvertiser', 'revcontent', 'smartadserver', 'adform',
  // Video ad CDNs and networks that serve video creatives
  'serving-sys.com', 'innovid.com', 'spotxchange.com', 'spotx.tv', 'springserve.com',
  'teads.tv', 'smartclip.net', 'tremorhub.com', 'extremereach.io', 'freewheel.tv',
  'videohub.tv', 'adaptv.advertising.com', 'brightroll.com', 'imasdk.googleapis.com',
  'vid.springserve.com', 'adsrvr.org', 'eyereturn.com', 'pointroll.com', 'mixpo.com',
  'jivox.com', 'celtra.com', 'flashtalking.com', 'sizmek.com', 'mediaplex.com',
  'undertone.com', 'yieldlab.net', 'vertamedia.com', 'synacor.com', 'connatix.com',
  'vidoomy.com', 'ayads.co', 'pushground.com', 'clickaine.com', 'pushhouse.io',
  'daoad.com', 'ntv.io', 'nativo.com', 'seedtag.com', 'ad-maven.com',
  // Common popup / redirect / interstitial domains
  'adf.ly', 'linkbucks.com', 'shrink.', 'sh.st', 'adfoc.us', 'bc.vc',
  'strtgic.com', 'track.', 'trk.', 'clksite.com', 'clicksfly.com',
  'syndication.exoclick.com', 'deloplen.com', 'wpadmngr.com', 'alwingulla.com',
  'ontagtracking.com', 'whos.amung.us', 'histats.com', 'adsco.re', 'creative.mycdn.me',
  'bet365', '1xbet', 'spinmacho', 'stake.com',
  // Adult / Tube ad networks & redirect engines
  'syndication.exoclick.com', 'syndication.trafficjunky.com', 'ads.trafficjunky.net',
  'trafficfactory.biz', 'adxad.com', 'ero-advertising.com', 'plugrush.com', 'twinred.com',
  'trafficjunky.com', 'trafficjunky.net', 'exoclick.com', 'realsrv.com', 'exosrv.com', 'pt167.com'
];

// Track user's active intended stream host (e.g. xvideos.com, youtube.com)
let currentIntendedStreamUrl = '';
let currentIntendedHost = '';

ipcMain.on('set-intended-stream-url', (event, url) => {
  if (!url || typeof url !== 'string') return;
  currentIntendedStreamUrl = url;
  try {
    currentIntendedHost = new URL(url).hostname.replace('www.', '').toLowerCase();
  } catch (e) {}
});

function isCampaignOrAdUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const l = rawUrl.toLowerCase();

  // 1. Direct campaign / tour / affiliate parameter tokens
  if (
    (l.includes('campaign=') && l.includes('click_id=')) ||
    (l.includes('/tours/') && (l.includes('campaign=') || l.includes('track='))) ||
    l.includes('track=00e_interstitial') ||
    l.includes('track=00e') ||
    l.includes('/livecampreview') ||
    l.includes('/interstitial/') ||
    l.includes('popunder')
  ) {
    return true;
  }

  // 2. Cam redirect networks when user is browsing another site
  const camSites = ['chaturbate.com', 'stripchat.com', 'camsoda.com', 'bongacams.com', 'livecampreview', 'cam4.com', 'jerkmate.com', 'myfreecams.com'];
  const isTargetCam = camSites.some(cs => l.includes(cs));
  if (isTargetCam) {
    if (!currentIntendedHost || !camSites.some(cs => currentIntendedHost.includes(cs))) {
      return true;
    }
  }

  // 3. Known ad domains
  if (adDomains.some(d => l.includes(d))) {
    return true;
  }

  return false;
}

function setupAdBlocker() {
  try {
    const sessions = getAppSessions();

    sessions.forEach(sess => {
      try {
        sess.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
          try {
            // Only block top-level and subframe navigations to ad campaign redirect URLs
            // Page assets and scripts load naturally like standard Chrome so sites don't reload or enter anti-adblock loops
            if (details.resourceType === 'main_frame' || details.resourceType === 'sub_frame') {
              if (isCampaignOrAdUrl(details.url)) {
                return callback({ cancel: true });
              }
            }
          } catch (e) {}

          callback({ cancel: false });
        });
      } catch (e) {}
    });

    // Block unwanted popup and popunder windows created by web pages
    app.on('web-contents-created', (event, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        // Deny all popup / new-window requests in the stream player browser
        // All genuine user clicks are handled as in-page navigation. Popups on tube sites are ad traps.
        console.log('[AdBlocker] Denied popup window request:', url);
        return { action: 'deny' };
      });

      const handleNavigationSecurity = (navEvent, navigationUrl, isRedirect = false) => {
        if (!navigationUrl) return;

        if (isCampaignOrAdUrl(navigationUrl)) {
          console.log(`[AdBlocker] Blocked ${isRedirect ? 'redirect' : 'navigation'} hijack to:`, navigationUrl);
          navEvent.preventDefault();
          return;
        }

        let navHost = '';
        try {
          navHost = new URL(navigationUrl).hostname.replace('www.', '').toLowerCase();
        } catch (e) {}

        let curHost = currentIntendedHost || '';
        try {
          if (!curHost && contents.getURL()) {
            curHost = new URL(contents.getURL()).hostname.replace('www.', '').toLowerCase();
          }
        } catch (e) {}

        if (curHost && navHost) {
          const isDifferentHost = !navHost.includes(curHost) && !curHost.includes(navHost);
          const camSites = ['chaturbate', 'stripchat', 'camsoda', 'bongacams', 'livecampreview'];
          if (isDifferentHost && (camSites.some(cs => navHost.includes(cs)) || adDomains.some(ad => navHost.includes(ad)))) {
            console.log(`[AdBlocker] Blocked cross-domain ${isRedirect ? 'redirect' : 'navigation'} from ${curHost} to ${navHost}`);
            navEvent.preventDefault();
            return;
          }
        }
      };

      // Intercept and prevent page scripts from navigating away
      contents.on('will-navigate', (event, navigationUrl) => {
        handleNavigationSecurity(event, navigationUrl, false);
      });

      // Intercept HTTP 301/302/307 redirects to ad campaigns
      contents.on('will-redirect', (event, navigationUrl) => {
        handleNavigationSecurity(event, navigationUrl, true);
      });
    });

    console.log('[Electron] Built-in AdBlocker initialized successfully for all sessions');
  } catch (err) {
    console.warn('[Electron] setupAdBlocker error:', err);
  }
}

// Webview & Browser Session Media Sniffer
const capturedMediaStreams = new Map();
let latestCapturedMediaStream = null;

function setupMediaSniffer() {
  try {
    const sessions = getAppSessions();
    const filter = { urls: ['http://*/*', 'https://*/*'] };

    sessions.forEach(sess => {
      try {
        sess.webRequest.onResponseStarted(filter, async (details) => {
          try {
            const url = details.url;
            if (!url) return;
            const cleanUrl = url.split('?')[0].toLowerCase();

            // Ignore common static non-media assets
            if (/\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|json|woff|woff2|ttf|map)$/i.test(cleanUrl)) {
              return;
            }

            // Strictly ignore ad videos, GIF video ads, banners, game ad clips, and tracking beacons
            const isAdUrl = cleanUrl.includes('.gif') ||
                            cleanUrl.includes('/ads/') ||
                            cleanUrl.includes('/ad_banner') ||
                            cleanUrl.includes('adservice') ||
                            cleanUrl.includes('doubleclick') ||
                            cleanUrl.includes('popunder') ||
                            cleanUrl.includes('trafficjunky') ||
                            cleanUrl.includes('tsyndicate') ||
                            cleanUrl.includes('exoclick') ||
                            cleanUrl.includes('juicyads') ||
                            cleanUrl.includes('vast') ||
                            cleanUrl.includes('vpaid') ||
                            cleanUrl.includes('game-ad') ||
                            cleanUrl.includes('ad_video') ||
                            cleanUrl.includes('ad_media') ||
                            cleanUrl.includes('overlay_ad') ||
                            cleanUrl.includes('companion_ad') ||
                            cleanUrl.includes('imasdk') ||
                            adDomains.some(d => cleanUrl.includes(d));

            if (isAdUrl) {
              return;
            }

            // Also check the full URL (with query params) for ad tracking tokens
            const fullLower = url.toLowerCase();
            const hasAdQueryParams = fullLower.includes('ad_type=') ||
                                     fullLower.includes('adtype=') ||
                                     fullLower.includes('ad_zone=') ||
                                     fullLower.includes('adzone=') ||
                                     fullLower.includes('campaign_id=') ||
                                     fullLower.includes('adid=') ||
                                     fullLower.includes('ad_id=') ||
                                     fullLower.includes('creative_id=') ||
                                     fullLower.includes('spot_id=') ||
                                     fullLower.includes('placement_id=');
            if (hasAdQueryParams) {
              return;
            }

            const isM3u8OrDASH = /\.(m3u8|mpd)(\?.*)?$/i.test(url) || cleanUrl.includes('.m3u8') || cleanUrl.includes('.mpd');
            const isDirectVideoExt = /\.(mp4|webm|m4v|mkv|mov|ts)(\?.*)?$/i.test(url);
            const headers = details.responseHeaders || {};
            const ctHeader = ((headers['content-type'] || headers['Content-Type'] || [])[0] || '').toLowerCase();
            const isVideoContentType = ctHeader.includes('video/') ||
                                       ctHeader.includes('application/vnd.apple.mpegurl') ||
                                       ctHeader.includes('application/x-mpegurl') ||
                                       ctHeader.includes('application/dash+xml');

            if (isM3u8OrDASH || isDirectVideoExt || isVideoContentType) {
              const clHeader = (headers['content-length'] || headers['Content-Length'] || [])[0];
              const contentLength = clHeader ? parseInt(clHeader, 10) : 0;

              // Block small direct video files (< 10 MB) - these are almost always ad banners, game animations,
              // promotional clips, or tracking videos. Real content videos are typically 50MB+.
              if (!isM3u8OrDASH && !ctHeader.includes('mpegurl') && !ctHeader.includes('dash+xml')) {
                if (contentLength > 0 && contentLength < 10000000) {
                  return;
                }
              }

              let originKey = '';
              const referrerUrl = details.referrer || '';
              try {
                originKey = new URL(referrerUrl || url).hostname.replace('www.', '').toLowerCase();
              } catch (e) {
                originKey = 'default';
              }

              // Query session cookies for authorization
              let cookieStr = '';
              try {
                const cookies = await sess.cookies.get({ url: referrerUrl || url });
                if (cookies && cookies.length > 0) {
                  cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                }
              } catch (e) {}

              const entry = {
                mediaUrl: url,
                pageUrl: referrerUrl,
                isMaster: isM3u8OrDASH,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                  'Referer': referrerUrl || (new URL(url).origin + '/'),
                  ...(cookieStr ? { 'Cookie': cookieStr } : {})
                },
                timestamp: Date.now()
              };

              // Smart stream selection: prefer master playlists (.m3u8) and larger files over smaller ones
              const existing = capturedMediaStreams.get(originKey);
              if (existing) {
                if (existing.isMaster && !entry.isMaster) {
                  return;
                }
                if (!existing.isMaster && !entry.isMaster && contentLength > 0) {
                  const existingAge = Date.now() - existing.timestamp;
                  if (existingAge > 3000 && contentLength < (existing.contentLength || 0)) {
                    return;
                  }
                }
              }

              entry.contentLength = contentLength;
              capturedMediaStreams.set(originKey, entry);
              latestCapturedMediaStream = entry;
            }
          } catch (e) {}
        });
      } catch (e) {}
    });
  } catch (err) {
    console.warn('[Electron] setupMediaSniffer error:', err);
  }
}

ipcMain.handle('get-captured-web-media', async (event, { pageUrl } = {}) => {
  let cookieHeader = '';
  if (pageUrl) {
    for (const sess of getAppSessions()) {
      try {
        const cookies = await sess.cookies.get({ url: pageUrl });
        if (cookies && cookies.length > 0) {
          cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          break;
        }
      } catch (e) {}
    }
  }

  let stream = null;
  if (pageUrl) {
    try {
      const hostname = new URL(pageUrl).hostname.replace('www.', '').toLowerCase();
      if (capturedMediaStreams.has(hostname)) {
        stream = capturedMediaStreams.get(hostname);
      }
    } catch (e) {}
  }
  if (!stream && latestCapturedMediaStream && (Date.now() - latestCapturedMediaStream.timestamp < 3 * 60 * 1000)) {
    stream = latestCapturedMediaStream;
  }

  if (stream) {
    if (cookieHeader) {
      stream.headers = { ...stream.headers, Cookie: cookieHeader };
    }
    return { success: true, stream, cookies: cookieHeader };
  }
  return { success: false, cookies: cookieHeader };
});

ipcMain.handle('get-page-cookies', async (event, pageUrl) => {
  if (!pageUrl) return '';
  for (const sess of getAppSessions()) {
    try {
      const cookies = await sess.cookies.get({ url: pageUrl });
      if (cookies && cookies.length > 0) {
        return cookies.map(c => `${c.name}=${c.value}`).join('; ');
      }
    } catch (e) {}
  }
  return '';
});

ipcMain.handle('get-web-video-formats', async (event, urlOrObj, opts) => {
  try {
    const url = typeof urlOrObj === 'string' ? urlOrObj : urlOrObj?.url;
    const options = typeof urlOrObj === 'object' ? { ...urlOrObj, ...opts } : (opts || {});
    const isYt = (url || '').toLowerCase().includes('youtube.com/') || (url || '').toLowerCase().includes('youtu.be/');
    if (isYt) {
      const info = await getVideoFormats(url);
      if (info) info.isYoutube = true;
      return { success: true, info };
    }
    const info = await getUniversalWebFormats(url, options);
    if (info) info.isYoutube = false;
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Registry integration installer
ipcMain.handle('install-browser-integration', async () => {
  try {
    const result = await installRegistryIntegration();
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  ensurePlayerShortcut();
  loadSettings();
  loadDirCache();
  startCoreEngine();
  startLocalServer();
  setupMediaSniffer();
  setupAdBlocker();
  
  // Initialize System Tray
  try {
    const iconPath = getIconPath('panamedia.ico');
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Panamedia',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.restore();
            mainWindow.focus();
          } else {
            createWindow('main');
          }
        }
      },
      {
        label: 'Open Player',
        click: () => {
          openPlayerWindow('', 'Media Player');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);
    tray.setToolTip('Panamedia All-in-One');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.restore();
        mainWindow.focus();
      } else {
        createWindow('main');
      }
    });
    tray.on('double-click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.restore();
        mainWindow.focus();
      } else {
        createWindow('main');
      }
    });
  } catch (err) {
    console.error('Failed to create tray icon:', err);
  }

  // Initialize download manager
  initDownloadManager(
    () => mainWindow,
    () => playerWindow,
    settings
  );

  createWindow();
});

app.on('before-quit', () => {
  isAppQuitting = true;
  cleanUpDownloadManager();
  if (coreProcess) {
    coreProcess.kill('SIGKILL');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow('main');
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('open-file', (event, rawFilePath) => {
  event.preventDefault();
  const filePath = cleanArgPath(rawFilePath) || rawFilePath;
  const filename = path.basename(filePath);
  registerMediaFolder(filePath);
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerState = { filePath, filename, playing: true, currentTime: 0, duration: 0 };
    playerWindow.webContents.send('player-open-file', { filePath, filename });
    if (playerWindow.isMinimized()) playerWindow.restore();
    playerWindow.show();
    playerWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player-state-changed', playerState);
    }
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    openPlayerWindow(filePath, filename);
  } else {
    process.argv.push('--mode=player', `--path=${filePath}`);
    if (app.isReady()) {
      createWindow('player');
    }
  }
});