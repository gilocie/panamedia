const { BrowserWindow, nativeImage, ipcMain, app } = require('electron');
const path = require('path');

let mainWindowRef = null;
let lastFocusedPlayerWindow = null;
const activePlayerWindows = new Set();
const playerStates = new Map();
let playerTrayRef = null;
let wasPlayerMinimizedBeforeParentClosed = false;

let getAppUrlFn = null;
let getIconPathFn = null;
let ensurePlayerShortcutFn = null;
let registerMediaFolderFn = null;
let isDevMode = false;

function initPlayerManager(options) {
  getAppUrlFn = options.getAppUrl;
  getIconPathFn = options.getIconPath;
  ensurePlayerShortcutFn = options.ensurePlayerShortcut;
  registerMediaFolderFn = options.registerMediaFolder;
  isDevMode = options.isDev;

  setupIpcHandlers();
}

function setMainWindow(win) {
  mainWindowRef = win;
}

function setPlayerTray(tray) {
  playerTrayRef = tray;
}

function getActivePlayerWindows() {
  return activePlayerWindows;
}

function getPlayerStates() {
  return playerStates;
}

function getLastFocusedPlayerWindow() {
  return (lastFocusedPlayerWindow && !lastFocusedPlayerWindow.isDestroyed())
    ? lastFocusedPlayerWindow
    : (activePlayerWindows.size > 0 ? Array.from(activePlayerWindows)[0] : null);
}

let playerOpenDebounceTimer = null;
let lastOpenCommandToken = 0;

function openPlayerWindow(filePath, filename, options = {}) {
  if (filePath && registerMediaFolderFn) registerMediaFolderFn(filePath);
  const commandToken = ++lastOpenCommandToken;
  const isForceNew = Boolean(options && (options.newWindow || options.forceNew));
  const targetTitle = filename || (filePath ? path.basename(filePath) : 'Media Player');

  const existingPlayer = getLastFocusedPlayerWindow();

  // If not explicitly requesting a new window and an active player window already exists,
  // update the existing player window with the new media
  if (!isForceNew && existingPlayer && !existingPlayer.isDestroyed()) {
    // An empty file path means "open/focus the player", not "replace its
    // current media with nothing". Preserve its playback state in that case.
    if (!filePath) {
      lastFocusedPlayerWindow = existingPlayer;
      if (existingPlayer.isMinimized()) existingPlayer.restore();
      existingPlayer.show();
      existingPlayer.focus();
      return { success: true, windowId: existingPlayer.id };
    }

    const st = { filePath, filename: targetTitle, playing: true, currentTime: 0, duration: 0, minimized: false, windowId: existingPlayer.id };
    playerStates.set(existingPlayer.id, st);
    lastFocusedPlayerWindow = existingPlayer;
    existingPlayer.webContents.send('player-open-file', { filePath, filename: targetTitle, token: commandToken });
    if (existingPlayer.isMinimized()) existingPlayer.restore();
    existingPlayer.show();
    existingPlayer.focus();
    if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
      mainWindowRef.webContents.send('player-state-changed', st);
    }
    return { success: true, windowId: existingPlayer.id };
  }

  // Create a brand new independent player window
  const playerIcon = getIconPathFn('player.ico');
  const playerIconImg = nativeImage.createFromPath(playerIcon);
  const playerAppId = isDevMode ? 'com.panamedia.player.dev' : 'com.panamedia.player';
  if (ensurePlayerShortcutFn) ensurePlayerShortcutFn();

  const winOptions = {
    width: 960,
    height: 600,
    minWidth: 720,
    minHeight: 460,
    frame: false,
    icon: playerIconImg.isEmpty() ? playerIcon : playerIconImg,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, '..', 'preload.cjs')
    }
  };

  // Cascade window position if other player windows are open
  if (activePlayerWindows.size > 0 && existingPlayer && !existingPlayer.isDestroyed()) {
    try {
      const [curX, curY] = existingPlayer.getPosition();
      winOptions.x = curX + 30;
      winOptions.y = curY + 30;
    } catch (e) {}
  }

  const playerWin = new BrowserWindow(winOptions);
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

  playerWin.webContents.on('will-navigate', (event, url) => {
    try {
      const candidate = new URL(url);
      const appUrl = new URL(getAppUrlFn());
      const trusted = isDevMode
        ? candidate.protocol === 'http:' && candidate.origin === appUrl.origin
        : candidate.protocol === 'file:' &&
          (decodeURIComponent(candidate.pathname).toLowerCase().replace(/\\/g, '/').endsWith('/dist/index.html') ||
           decodeURIComponent(candidate.pathname).toLowerCase().replace(/\\/g, '/') === decodeURIComponent(appUrl.pathname).toLowerCase().replace(/\\/g, '/'));
      if (!trusted) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  // Toggle DevTools manually with F12 or Ctrl+Shift+I for player window
  playerWin.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      playerWin.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  activePlayerWindows.add(playerWin);
  lastFocusedPlayerWindow = playerWin;
  const initialPlayerState = {
    filePath,
    filename: targetTitle,
    playing: true,
    currentTime: 0,
    duration: 0,
    minimized: false,
    windowId: playerWin.id
  };
  playerStates.set(playerWin.id, initialPlayerState);

  const queryParams = `mode=player&path=${encodeURIComponent(filePath || '')}&title=${encodeURIComponent(targetTitle)}&windowId=${playerWin.id}`;
  playerWin.loadURL(getAppUrlFn(queryParams));

  playerWin.on('enter-full-screen', () => {
    playerWin.webContents.send('player-fullscreen-changed', true);
  });

  playerWin.on('leave-full-screen', () => {
    playerWin.webContents.send('player-fullscreen-changed', false);
  });

  playerWin.on('focus', () => {
    lastFocusedPlayerWindow = playerWin;
    const st = playerStates.get(playerWin.id);
    if (st && mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
      mainWindowRef.webContents.send('player-state-changed', st);
    }
  });

  playerWin.on('closed', () => {
    activePlayerWindows.delete(playerWin);
    playerStates.delete(playerWin.id);
    if (lastFocusedPlayerWindow === playerWin) {
      lastFocusedPlayerWindow = activePlayerWindows.size > 0 ? Array.from(activePlayerWindows)[activePlayerWindows.size - 1] : null;
    }
    if (activePlayerWindows.size === 0) {
      wasPlayerMinimizedBeforeParentClosed = false;
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('player-state-changed', null);
      } else {
        app.quit();
      }
    } else if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
      const remainingState = lastFocusedPlayerWindow ? playerStates.get(lastFocusedPlayerWindow.id) : null;
      mainWindowRef.webContents.send('player-state-changed', remainingState);
    }
  });

  playerWin.on('minimize', () => {
    const st = playerStates.get(playerWin.id);
    if (st) {
      st.minimized = true;
      if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
        mainWindowRef.webContents.send('player-state-changed', st);
      }
    }
  });

  playerWin.on('restore', () => {
    const st = playerStates.get(playerWin.id);
    if (st) {
      st.minimized = false;
      if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
        mainWindowRef.webContents.send('player-state-changed', st);
      }
      setTimeout(() => {
        if (!playerWin.isDestroyed()) {
          try { playerWin.webContents.send('player-remote-command', 'restore', st.currentTime, st.playing); } catch (e) {}
        }
      }, 50);
    }
  });

  if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
    mainWindowRef.webContents.send('player-state-changed', { ...initialPlayerState, minimized: false });
  }

  return { success: true, windowId: playerWin.id };
}

function showAndFloatPlayerWindow() {
  const win = getLastFocusedPlayerWindow();

  if (win && !win.isDestroyed()) {
    wasPlayerMinimizedBeforeParentClosed = false;
    if (win.isMinimized()) win.restore();
    win.show();
    // Force Chromium to repaint immediately so the video frame shows up
    // without the background image flashing through first.
    try { win.webContents.invalidate(); } catch (e) {}
    win.setAlwaysOnTop(true);
    win.focus();
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        try { win.setAlwaysOnTop(false); } catch (e) {}
      }
    }, 400);
    const st = playerStates.get(win.id);
    if (st) st.minimized = false;
    if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
      mainWindowRef.webContents.send('player-state-changed', st);
    }
  } else {
    openPlayerWindow('', 'Media Player', { newWindow: true });
  }
}

function detachPlayerWindowsOnMainClose() {
  const playerIcon = getIconPathFn('player.ico');
  const playerIconImg = nativeImage.createFromPath(playerIcon);
  const playerAppId = isDevMode ? 'com.panamedia.player.dev' : 'com.panamedia.player';

  for (const pWin of activePlayerWindows) {
    if (!pWin.isDestroyed()) {
      try {
        pWin.setParentWindow(null);
      } catch (e) {}
      pWin.setIcon(playerIconImg.isEmpty() ? playerIcon : playerIconImg);
      try {
        pWin.setAppDetails({
          appId: playerAppId,
          appIconPath: playerIcon,
          appIconIndex: 0,
          relaunchDisplayName: 'Panamedia Player',
          relaunchCommand: `"${process.execPath}" --mode=player`
        });
      } catch (e) {}

      const st = playerStates.get(pWin.id);
      const wasMin = Boolean(st && st.minimized) || pWin.isMinimized();
      if (!wasMin) {
        pWin.show();
        pWin.focus();
      }
    }
  }
}

function setupIpcHandlers() {
  ipcMain.handle('open-player-window', (event, { filePath, filename, newWindow = false } = {}) => {
    return openPlayerWindow(filePath, filename, { newWindow });
  });

  ipcMain.handle('open-new-player-window', (event, data = {}) => {
    return openPlayerWindow(data?.filePath || '', data?.filename || '', { newWindow: true });
  });

  ipcMain.on('player-set-fullscreen', (event, flag) => {
    const win = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : getLastFocusedPlayerWindow();
    if (win && !win.isDestroyed()) {
      win.setFullScreen(flag);
    }
  });

  ipcMain.on('player-control-play-pause', (event) => {
    const win = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : getLastFocusedPlayerWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('player-control-play-pause');
    }
  });

  ipcMain.on('player-control-close', (event) => {
    const win = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : getLastFocusedPlayerWindow();
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  ipcMain.on('player-control-mute', (event) => {
    const win = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : getLastFocusedPlayerWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('player-control-mute');
    }
  });

  ipcMain.on('player-update-state', (event, state) => {
    const win = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : getLastFocusedPlayerWindow();
    if (win && !win.isDestroyed()) {
      const isMinimized = !win.isVisible() || win.isMinimized();
      const existing = playerStates.get(win.id) || {};
      const updated = { ...existing, ...state, minimized: isMinimized, windowId: win.id };
      playerStates.set(win.id, updated);
      if (win === lastFocusedPlayerWindow || !lastFocusedPlayerWindow) {
        lastFocusedPlayerWindow = win;
      }
      if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
        mainWindowRef.webContents.send('player-state-changed', updated);
      }
      if (state && state.duration > 0 && typeof state.currentTime === 'number') {
        const ratio = Math.max(0, Math.min(1, state.currentTime / state.duration));
        win.setProgressBar(ratio, { mode: state.playing ? 'normal' : 'paused' });
      } else {
        win.setProgressBar(-1);
      }
      if (playerTrayRef && !playerTrayRef.isDestroyed() && state && state.filename) {
        try {
          playerTrayRef.setToolTip(`Panamedia Player - ${state.filename}`);
        } catch (e) {}
      }
    }
  });

  ipcMain.on('player-minimize-to-sidebar', (event) => {
    const win = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : getLastFocusedPlayerWindow();
    if (!win || win.isDestroyed()) return;

    if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible() && !mainWindowRef.isMinimized()) {
      win.hide();
      const st = playerStates.get(win.id) || { filePath: '', filename: 'Media Player', playing: true, currentTime: 0, duration: 0, volume: 100 };
      st.minimized = true;
      playerStates.set(win.id, st);
      mainWindowRef.webContents.send('player-state-changed', st);
    } else {
      win.minimize();
      const st = playerStates.get(win.id);
      if (st) st.minimized = true;
    }
  });

  ipcMain.handle('player-restore', (_event, miniCurrentTime) => {
    const targetWin = getLastFocusedPlayerWindow();
    if (targetWin && !targetWin.isDestroyed()) {
      wasPlayerMinimizedBeforeParentClosed = false;
      if (targetWin.isMinimized()) {
        targetWin.restore();
      }
      targetWin.show();
      targetWin.focus();

      const st = playerStates.get(targetWin.id) || { filePath: '', filename: 'Media Player', playing: true, currentTime: 0, duration: 0 };
      st.minimized = false;
      if (typeof miniCurrentTime === 'number' && Number.isFinite(miniCurrentTime) && miniCurrentTime >= 0) {
        st.currentTime = miniCurrentTime;
      }
      st.playing = true;
      playerStates.set(targetWin.id, st);

      setTimeout(() => {
        if (!targetWin.isDestroyed()) {
          try {
            targetWin.webContents.send('player-remote-command', 'restore', {
              currentTime: st.currentTime,
              filePath: st.filePath,
              filename: st.filename,
              shouldResume: true
            });
            targetWin.webContents.send('player-remote-command', 'restore', st.currentTime, true);
          } catch (e) {}
        }
      }, 50);

      if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.isVisible()) {
        mainWindowRef.webContents.send('player-state-changed', st);
      }
      return true;
    }
    return false;
  });

  ipcMain.on('player-remote-command', (event, command, ...args) => {
    const targetWin = getLastFocusedPlayerWindow();
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('player-remote-command', command, ...args);
    }
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('player-remote-command', command, ...args);
    }
  });

  ipcMain.handle('get-player-state', () => {
    const targetWin = getLastFocusedPlayerWindow();
    if (targetWin && !targetWin.isDestroyed()) {
      return playerStates.get(targetWin.id) || null;
    }
    return null;
  });
}

module.exports = {
  initPlayerManager,
  setMainWindow,
  setPlayerTray,
  openPlayerWindow,
  showAndFloatPlayerWindow,
  detachPlayerWindowsOnMainClose,
  getActivePlayerWindows,
  getPlayerStates,
  getLastFocusedPlayerWindow
};
