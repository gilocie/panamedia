const { ipcMain, app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let converterMinimizedState = null;
let getMainWindowFn = null;
let getActivePlayerWindowsFn = null;

function getConverterStateFilePath() {
  try {
    const userData = app.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || '', 'panamedia');
    return path.join(userData, 'converter_minimized_state.json');
  } catch (e) {
    return null;
  }
}

function initConverterManager(options) {
  getMainWindowFn = options.getMainWindow;
  getActivePlayerWindowsFn = options.getActivePlayerWindows;

  try {
    const sf = getConverterStateFilePath();
    if (sf && fs.existsSync(sf)) {
      converterMinimizedState = JSON.parse(fs.readFileSync(sf, 'utf8'));
    }
  } catch (e) {}

  setupIpcHandlers();
}

function broadcastConverterState(state) {
  converterMinimizedState = state;
  const mainWindow = getMainWindowFn ? getMainWindowFn() : null;
  const activePlayers = getActivePlayerWindowsFn ? getActivePlayerWindowsFn() : [];

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('converter-state-changed', state);
  }

  for (const pWin of activePlayers) {
    if (pWin && !pWin.isDestroyed()) {
      pWin.webContents.send('converter-state-changed', state);
    }
  }

  try {
    const sf = getConverterStateFilePath();
    if (sf) {
      fs.writeFileSync(sf, JSON.stringify(state, null, 2), 'utf8');
    }
  } catch (e) {}
}

function setupIpcHandlers() {
  ipcMain.on('converter-minimize-state', (_event, state) => {
    broadcastConverterState(state);
  });

  ipcMain.handle('get-converter-minimize-state', () => {
    return converterMinimizedState;
  });

  ipcMain.on('converter-run-request', () => {
    const mainWindow = getMainWindowFn ? getMainWindowFn() : null;
    const activePlayers = getActivePlayerWindowsFn ? getActivePlayerWindowsFn() : [];

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('converter-run-request');
    }
    for (const pWin of activePlayers) {
      if (pWin && !pWin.isDestroyed()) {
        pWin.webContents.send('converter-run-request');
      }
    }
  });

  ipcMain.on('converter-pause-request', () => {
    const mainWindow = getMainWindowFn ? getMainWindowFn() : null;
    const activePlayers = getActivePlayerWindowsFn ? getActivePlayerWindowsFn() : [];

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('converter-pause-request');
    }
    for (const pWin of activePlayers) {
      if (pWin && !pWin.isDestroyed()) {
        pWin.webContents.send('converter-pause-request');
      }
    }
  });

  ipcMain.on('converter-resume-request', () => {
    const mainWindow = getMainWindowFn ? getMainWindowFn() : null;
    const activePlayers = getActivePlayerWindowsFn ? getActivePlayerWindowsFn() : [];

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('converter-resume-request');
    }
    for (const pWin of activePlayers) {
      if (pWin && !pWin.isDestroyed()) {
        pWin.webContents.send('converter-resume-request');
      }
    }
  });

  ipcMain.on('converter-close-request', () => {
    broadcastConverterState({ minimized: false, queueCount: 0, converting: false });

    const mainWindow = getMainWindowFn ? getMainWindowFn() : null;
    const activePlayers = getActivePlayerWindowsFn ? getActivePlayerWindowsFn() : [];

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('converter-close-request');
    }
    for (const pWin of activePlayers) {
      if (pWin && !pWin.isDestroyed()) {
        pWin.webContents.send('converter-close-request');
      }
    }
  });

  // Converter restore request: if from a player window, open modal inside player only and NEVER focus/show mainWindow!
  ipcMain.on('converter-restore-request', (event) => {
    const senderWin = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : null;
    const activePlayers = getActivePlayerWindowsFn ? getActivePlayerWindowsFn() : [];
    // activePlayers is an Array — use .some() not .has() which only exists on Set/Map
    const isFromPlayer = senderWin && Array.isArray(activePlayers)
      ? activePlayers.some(w => w === senderWin)
      : (activePlayers.has ? activePlayers.has(senderWin) : false);

    // Only reply to the sender window — never touch mainWindow if the request came from a player
    if (senderWin && !senderWin.isDestroyed()) {
      senderWin.webContents.send('converter-restore-request');
    }

    // Only forward to mainWindow if this request did NOT originate from a player window
    const mainWindow = getMainWindowFn ? getMainWindowFn() : null;
    if (!isFromPlayer && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('converter-restore-request');
    }
  });

  // Converter open request: never open mainWindow if requested from player
  ipcMain.on('converter-open-request', (event) => {
    const senderWin = (event && event.sender) ? BrowserWindow.fromWebContents(event.sender) : null;
    const activePlayers = getActivePlayerWindowsFn ? getActivePlayerWindowsFn() : [];
    // activePlayers is an Array — use .some() not .has() which only exists on Set/Map
    const isFromPlayer = senderWin && Array.isArray(activePlayers)
      ? activePlayers.some(w => w === senderWin)
      : (activePlayers.has ? activePlayers.has(senderWin) : false);

    // Only reply to the sender window
    if (senderWin && !senderWin.isDestroyed()) {
      senderWin.webContents.send('converter-open-request');
    }

    // Only forward to mainWindow if this request did NOT originate from a player window
    const mainWindow = getMainWindowFn ? getMainWindowFn() : null;
    if (!isFromPlayer && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.webContents.send('converter-open-request');
    }
  });

  // Converter toggle pause for single file
  ipcMain.handle('converter-toggle-pause', async (_event, filePath) => {
    try {
      const { togglePauseProcess } = require('../panamedia-downloader/conversion-engine/hardwareEngine.cjs');
      // Now async: it asks the C++ engine to suspend/resume the ffmpeg process.
      const isPaused = await togglePauseProcess(filePath);
      return { success: true, isPaused };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Cancel a running conversion outright.
  ipcMain.handle('converter-cancel', async (_event, filePath) => {
    try {
      const coreClient = require('./core-client.cjs');
      const res = await coreClient.call('convert_cancel', { jobId: filePath }, 8000);
      if (res && res.cancelled) {
        console.log('[Converter] cancelled job:', filePath);
        return { success: true };
      }
      const { cancelConversion } = require('../panamedia-downloader/conversion-engine/hardwareEngine.cjs');
      if (cancelConversion(filePath)) {
        console.log('[Converter] cancelled local job:', filePath);
        return { success: true };
      }
      return { success: false, error: (res && res.error) || 'No running conversion for that file' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  initConverterManager,
  broadcastConverterState
};
