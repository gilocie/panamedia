const { contextBridge, ipcRenderer, webUtils } = require('electron');

const isTrustedAppDocument = (() => {
  try {
    const url = new URL(window.location.href);
    if (url.protocol === 'file:') {
      const pathname = decodeURIComponent(url.pathname).toLowerCase().replace(/\\/g, '/');
      return pathname.endsWith('/dist/index.html') || pathname.endsWith('/index.html') || pathname.includes('/dist/');
    }
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '5173';
  } catch {
    return false;
  }
})();

if (isTrustedAppDocument) {
  const invokeChannels = new Set([
    'add-download', 'archive-set-os-lock', 'cancel-app-update-download',
    'check-binaries', 'check-internet', 'check-media-info', 'clear-downloads',
    'convert-and-send-to-drive', 'convert-media-file', 'converter-cancel',
    'converter-toggle-pause', 'copy-file-to-drive', 'delete-download',
    'delete-file', 'describe-volume', 'download-app-update',
    'get-captured-web-media', 'get-converter-minimize-state',
    'get-converter-output-files', 'get-converter-output-paths', 'get-downloads',
    'get-flash-drives', 'get-network-speed', 'get-page-cookies',
    'get-player-state', 'get-power-status', 'get-settings', 'get-streaming-port',
    'get-youtube-formats', 'get-youtube-playlist', 'get-web-video-formats',
    'install-app-update', 'install-binaries', 'install-browser-integration',
    'load-archive-data', 'move-converted-output', 'open-converter-folder',
    'open-file', 'open-folder', 'open-new-player-window',
    'open-player-window', 'open-converter-window', 'pause-binary-install', 'pause-download',
    'player-restore', 'register-media-folder', 'remove-media-path', 'resume-binary-install',
    'resume-download', 'save-archive-data', 'save-folder-to-disk',
    'save-settings', 'select-converter-output-folder', 'select-directory',
    'select-export-directory', 'select-file-dialog', 'select-media-files',
    'send-via-bluetooth', 'share-via-app', 'show-item-in-folder',
    'sync-media-library', 'trash-converter-output', 'validate-library-files'
  ]);

  const sendChannels = new Set([
    'archive-pin-updated', 'archive-updated', 'converter-minimize-state',
    'converter-open-request', 'library-synced', 'player-control-close',
    'player-minimize-to-sidebar', 'player-remote-command', 'player-set-fullscreen',
    'player-update-state', 'set-intended-stream-url', 'synced-folders-updated',
    'window-close', 'window-maximize', 'window-minimize'
  ]);

  const eventChannels = new Set([
    'archive-pin-updated', 'archive-updated', 'binary-install-progress',
    'converter-close-request', 'converter-open-request', 'converter-pause-request',
    'converter-restore-request', 'converter-resume-request', 'converter-run-request',
    'converter-state-changed', 'copy-progress', 'download-completed-toast',
    'downloads-updated', 'library-synced', 'media-path-removed', 'native-download-received',
    'network-speed-update', 'player-control-mute', 'player-control-play-pause',
    'player-fullscreen-changed', 'player-open-file', 'player-remote-command',
    'player-state-changed', 'release-media-file', 'settings-changed', 'streaming-port-ready',
    'synced-folders-updated', 'update-download-progress'
  ]);

  function assertAllowed(channel, allowlist) {
    if (typeof channel !== 'string' || !allowlist.has(channel)) {
      throw new Error(`Blocked IPC channel: ${String(channel)}`);
    }
  }

  const listenerWrappers = new Map();
  const safeIpcRenderer = {
    invoke(channel, ...args) {
      try {
        assertAllowed(channel, invokeChannels);
        return ipcRenderer.invoke(channel, ...args);
      } catch (err) {
        console.warn(`[Preload IPC] Blocked invoke channel: ${channel}`);
        return Promise.reject(err);
      }
    },
    send(channel, ...args) {
      assertAllowed(channel, sendChannels);
      ipcRenderer.send(channel, ...args);
    },
    on(channel, listener) {
      assertAllowed(channel, eventChannels);
      if (typeof listener !== 'function') throw new TypeError('IPC listener must be a function');
      let channelListeners = listenerWrappers.get(listener);
      if (!channelListeners) {
        channelListeners = new Map();
        listenerWrappers.set(listener, channelListeners);
      }
      if (channelListeners.has(channel)) return;
      const wrappedListener = (_event, ...args) => listener({}, ...args);
      channelListeners.set(channel, wrappedListener);
      ipcRenderer.on(channel, wrappedListener);
    },
    removeListener(channel, listener) {
      assertAllowed(channel, eventChannels);
      const channelListeners = listenerWrappers.get(listener);
      const wrappedListener = channelListeners && channelListeners.get(channel);
      if (!wrappedListener) return;
      ipcRenderer.removeListener(channel, wrappedListener);
      channelListeners.delete(channel);
      if (channelListeners.size === 0) listenerWrappers.delete(listener);
    }
  };

  const safeWebUtils = {
    getPathForFile(file) {
      return webUtils.getPathForFile(file);
    }
  };

  contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: safeIpcRenderer,
    webUtils: safeWebUtils
  });
  contextBridge.exposeInMainWorld('electronWebUtils', safeWebUtils);
}

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}, false);

window.addEventListener('drop', (event) => {
  event.preventDefault();
}, false);
