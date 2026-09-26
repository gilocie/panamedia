const electron = require('electron');
const { webUtils, ipcRenderer } = electron;

// Expose webUtils to window object safely for drag-and-drop file path resolution
try {
  window.electronWebUtils = {
    getPathForFile: (file) => {
      try {
        if (webUtils && typeof webUtils.getPathForFile === 'function') {
          const p = webUtils.getPathForFile(file);
          if (p) return p;
        }
      } catch (err) {
        console.warn('[Preload] webUtils.getPathForFile error:', err);
      }
      return file ? ((file && file.path) || '') : '';
    }
  };
} catch (e) {
  console.warn('[Preload] Failed to attach electronWebUtils:', e);
}

// Expose standard electron bridge on window for renderer components
try {
  window.electron = {
    ipcRenderer,
    webUtils
  };
} catch (e) {
  console.warn('[Preload] Failed to attach window.electron:', e);
}

// Global drag-and-drop guard: prevent Chromium from navigating away when dropping files anywhere on window
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
}, false);

window.addEventListener('drop', (e) => {
  // Let component drop handlers process the file, but prevent default browser page navigation
  e.preventDefault();
}, false);
