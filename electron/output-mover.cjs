/**
 * Moves a completed conversion from where ffmpeg wrote it (the source folder)
 * to the user's chosen export destination.
 *
 * This never actually happened before: `handleMoveFileToSendtray` only pushed
 * the path into React state and wrote a localStorage folder assignment, and
 * "sendtray" had no directory behind it at all. So a finished conversion was
 * left sitting next to the original file and the Audio/Video Output counters
 * stayed at zero.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { ipcMain, app } = require('electron');

/** Physical location backing the Sendtray destination. */
function getSendtrayRootDir() {
  let base;
  try {
    base = app.getPath('documents');
  } catch (e) {
    base = path.join(os.homedir(), 'Documents');
  }
  return path.join(base, 'Panamedia', 'Sendtray');
}

/** Picks a non-colliding name so an existing export is never overwritten. */
function resolveFreeTarget(targetDir, fileName) {
  let target = path.join(targetDir, fileName);
  if (!fs.existsSync(target)) return target;

  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  for (let n = 1; n <= 999; n++) {
    const candidate = path.join(targetDir, `${stem} (${n})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(targetDir, `${stem}-${Date.now()}${ext}`);
}

function register() {
  ipcMain.handle('move-converted-output', async (_event, payload = {}) => {
    const { sourcePath, destination, destPath } = payload || {};
    try {
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { success: false, error: 'Converted output not found' };
      }

      const targetDir = (destination === 'folder' && destPath)
        ? destPath
        : getSendtrayRootDir();

      // Same-path case: the user pointed the destination at the source folder.
      if (path.resolve(targetDir).toLowerCase() === path.resolve(path.dirname(sourcePath)).toLowerCase()) {
        return { success: true, path: sourcePath, moved: false };
      }

      await fs.promises.mkdir(targetDir, { recursive: true });
      const target = resolveFreeTarget(targetDir, path.basename(sourcePath));

      // rename() cannot cross volumes, which is the common case for USB targets.
      try {
        await fs.promises.rename(sourcePath, target);
      } catch (e) {
        await fs.promises.copyFile(sourcePath, target);
        try { await fs.promises.unlink(sourcePath); } catch (e2) {}
      }

      console.log(`[Converter] moved output -> ${target}`);
      return { success: true, path: target, moved: true };
    } catch (err) {
      console.error('[move-converted-output] error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-sendtray-dir', async () => {
    try {
      await fs.promises.mkdir(getSendtrayRootDir(), { recursive: true });
      return { success: true, dir: getSendtrayRootDir() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register, getSendtrayRootDir };