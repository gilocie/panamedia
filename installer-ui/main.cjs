// installer-ui/main.cjs
// Custom Panamedia Installer - Electron Main Process
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile, execFileSync } = require('child_process');
const os = require('os');

// Disable GPU for installer (avoids driver issues on target machines)
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

const isDev = !app.isPackaged;

const cliArgs = process.argv.slice(1);
const portableExe = process.env.PORTABLE_EXECUTABLE_FILE || '';
const isUninstall = cliArgs.some(a => {
  const l = a.toLowerCase();
  return l === '--uninstall' || l === '/uninstall' || l === '-uninstall' || l.includes('uninstall');
}) || path.basename(process.execPath).toLowerCase().includes('uninstall') || (portableExe && path.basename(portableExe).toLowerCase().includes('uninstall'));

// Silent invocation. When the NSIS installer replaces an old version it runs
// the previous install's registered uninstall string with NSIS silent flags
// appended (typically `--uninstall /S _?=DIR`). In that case the old app must
// be removed headlessly: the custom uninstaller GUI only appears when the user
// deliberately uninstalls from Control Panel / the Start Menu shortcut.
const isSilent = cliArgs.some(a => {
  const l = a.toLowerCase();
  return l === '/s' || l === '-s' || l === '--silent' || l === '--uninstall-silent' || l.startsWith('_?=');
});

let passedInstallDir = '';
for (const arg of cliArgs) {
  if (arg.toLowerCase().startsWith('--install-dir=')) {
    passedInstallDir = arg.split('=')[1].replace(/^["']|["']$/g, '');
  }
}

// Default install directory
function getDefaultInstallDir() {
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  return path.join(programFiles, 'Panamedia');
}

function resolveInstalledDir() {
  if (passedInstallDir && fs.existsSync(passedInstallDir)) return passedInstallDir;

  if (!isDev) {
    // If running from portable launcher in install dir
    if (process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(process.env.PORTABLE_EXECUTABLE_DIR)) {
      const pDir = process.env.PORTABLE_EXECUTABLE_DIR;
      if (fs.existsSync(path.join(pDir, 'Panamedia.exe')) || fs.existsSync(path.join(pDir, 'Uninstall Panamedia.exe'))) {
        return pDir;
      }
    }

    const exeDir = path.dirname(process.execPath);
    if (fs.existsSync(path.join(exeDir, 'Panamedia.exe'))) {
      return exeDir;
    }
  }

  const defaultDir = getDefaultInstallDir();
  if (fs.existsSync(defaultDir)) return defaultDir;
  return defaultDir;
}

// In packaged uninstall mode, if running from inside the install directory, relocate to %TEMP%
// so that the install folder is not locked and can be deleted cleanly.
if (!isDev && isUninstall && !isSilent && !process.env.__PANAMEDIA_UNINSTALL_TEMP) {
  const actualExePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const currentExeDir = path.resolve(path.dirname(actualExePath)).toLowerCase();
  const targetDir = path.resolve(resolveInstalledDir()).toLowerCase();
  if (currentExeDir.startsWith(targetDir) && fs.existsSync(actualExePath)) {
    const tempExe = path.join(os.tmpdir(), 'PanamediaUninstall_' + Date.now() + '.exe');
    try {
      fs.copyFileSync(actualExePath, tempExe);
      const child = spawn(tempExe, ['--uninstall', `--install-dir=${resolveInstalledDir()}`], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, __PANAMEDIA_UNINSTALL_TEMP: '1' }
      });
      child.unref();
      process.exit(0);
    } catch (e) {
      console.warn('Could not relocate uninstaller to temp:', e);
    }
  }
}

// Resolve the bundled NSIS installer path
function getNsisExePath() {
  if (isDev) {
    // In dev, look in local folder or dist-installer first
    const candidates = [
      path.join(__dirname, 'nsis-installer.exe'),
      path.join(__dirname, '..', 'dist-installer', 'nsis-installer.exe'),
      path.join(__dirname, '..', 'dist-electron', 'nsis-installer.exe')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return path.join(__dirname, 'nsis-installer.exe');
  }
  // In production, it's bundled as a resource
  return path.join(process.resourcesPath, 'nsis-installer.exe');
}

// Resolve the playerbg.jpg path
function getBgImagePath() {
  if (isDev) {
    return path.join(__dirname, '..', 'src', 'assets', 'playerbg.jpg');
  }
  return path.join(process.resourcesPath, 'playerbg.jpg');
}

// Resolve app icon path for dev and packaged build
function getAppIconPath() {
  const candidates = [
    path.join(__dirname, 'panamedia.ico'),
    path.join(process.resourcesPath, 'panamedia.ico'),
    path.join(__dirname, '..', 'public', 'panamedia.ico')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {}
  }
  return path.join(__dirname, '..', 'public', 'panamedia.ico');
}

let installerWindow;

function createInstallerWindow() {
  const iconPath = getAppIconPath();
  installerWindow = new BrowserWindow({
    width: 1020,
    height: 630,
    minWidth: 860,
    minHeight: 540,
    useContentSize: true,
    resizable: true,
    frame: false,
    center: true,
    title: isUninstall ? 'Panamedia Pro Uninstall' : 'Panamedia Pro Setup',
    backgroundColor: '#09090e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: iconPath,
  });

  try {
    if (installerWindow.setIcon && fs.existsSync(iconPath)) {
      installerWindow.setIcon(iconPath);
    }
  } catch (e) {}

  const indexPath = path.join(__dirname, 'index.html');
  installerWindow.loadFile(indexPath);

  installerWindow.on('closed', () => {
    installerWindow = null;
  });
}

app.whenReady().then(() => {
  if (isUninstall && isSilent) {
    // The NSIS installer runs the previous install's registered uninstall
    // string (with /S _?=DIR appended) while replacing an old version.
    // Remove the old install headlessly -- never open the custom uninstaller
    // GUI during an install; that UI is only for deliberate user uninstalls.
    runSilentUninstall();
    return;
  }
  createInstallerWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

// ─── IPC Handlers ──────────────────────────────────────────────────────────

// Return background image path as data URL
ipcMain.handle('get-bg-image', () => {
  try {
    const bgPath = getBgImagePath();
    if (fs.existsSync(bgPath)) {
      const data = fs.readFileSync(bgPath);
      return 'data:image/jpeg;base64,' + data.toString('base64');
    }
  } catch (e) {}
  return null;
});

// Return icon image path as data URL
ipcMain.handle('get-icon-image', () => {
  try {
    const iconPath = getAppIconPath();
    if (fs.existsSync(iconPath)) {
      const data = fs.readFileSync(iconPath);
      return 'data:image/x-icon;base64,' + data.toString('base64');
    }
  } catch (e) {}
  return null;
});

// Return SVG logo as string
ipcMain.handle('get-svg-logo', () => {
  try {
    const candidates = [
      path.join(__dirname, 'icons.svg'),
      path.join(process.resourcesPath, 'icons.svg'),
      path.join(__dirname, '..', 'public', 'icons.svg')
    ];
    for (const svgPath of candidates) {
      if (fs.existsSync(svgPath)) {
        return fs.readFileSync(svgPath, 'utf8');
      }
    }
  } catch (e) {}
  return null;
});

// Return default install directory
ipcMain.handle('get-default-install-dir', () => {
  return getDefaultInstallDir();
});

// Return app version dynamically from package.json or runtime
ipcMain.handle('get-app-version', () => {
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch (e) {}
  try {
    const rootPkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
      if (rootPkg.version) return rootPkg.version;
    }
  } catch (e) {}
  return app.getVersion();
});

// Return NSIS installer existence
ipcMain.handle('check-nsis-exists', () => {
  const nsisPath = getNsisExePath();
  return fs.existsSync(nsisPath);
});

// Browse for install directory
ipcMain.handle('browse-install-dir', async () => {
  const result = await dialog.showOpenDialog(installerWindow, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: getDefaultInstallDir(),
    title: 'Choose Installation Folder',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Get available disk space (approximate)
ipcMain.handle('get-disk-space', (event, dirPath) => {
  // 1. Modern Node.js built-in fs.statfsSync (fast, native, works without wmic)
  try {
    if (typeof fs.statfsSync === 'function') {
      const target = dirPath || 'C:\\';
      const root = path.parse(target).root || (target.slice(0, 2) + '\\');
      const stats = fs.statfsSync(root);
      const freeBytes = (stats.bavail || stats.bfree) * stats.bsize;
      if (freeBytes > 0) {
        const gb = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
        return `${gb} GB free`;
      }
    }
  } catch (e) {}

  // 2. PowerShell fallback (works on Windows 10/11 even when wmic is uninstalled)
  try {
    const driveLetter = (dirPath || 'C:').slice(0, 1);
    const { execSync } = require('child_process');
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `(Get-PSDrive '${driveLetter}').Free`],
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    );
    const bytes = parseInt(out.trim(), 10);
    if (!isNaN(bytes) && bytes > 0) {
      const gb = (bytes / (1024 * 1024 * 1024)).toFixed(1);
      return `${gb} GB free`;
    }
  } catch (e) {}

  return 'Unknown';
});

ipcMain.handle('confirm-replace-existing', async (_event, installDir) => {
  const targetDir = installDir && installDir.trim()
    ? path.resolve(installDir.trim())
    : path.resolve(getDefaultInstallDir());
  const existingInstall = fs.existsSync(path.join(targetDir, 'Panamedia.exe')) ||
    fs.existsSync(path.join(targetDir, 'Uninstall Panamedia.exe'));

  if (!existingInstall) return true;

  const result = await dialog.showMessageBox(installerWindow, {
    type: 'question',
    title: 'Replace existing Panamedia?',
    message: 'Panamedia is already installed in this location.',
    detail: `Continue to remove the existing app and install this version?\n\nYour settings and personal media files will be kept.\n\n${targetDir}`,
    buttons: ['Replace installation', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });

  return result.response === 0;
});

// Run installation: launch NSIS silently, report progress via events
ipcMain.handle('run-install', async (event, installDir) => {
  const nsisPath = getNsisExePath();

  if (!fs.existsSync(nsisPath)) {
    return { success: false, error: 'Installer package not found: ' + nsisPath };
  }

  // Upgrade safety: a legacy Panamedia install (especially one from an older
  // custom installer) may register an uninstaller that cannot honour NSIS
  // silent flags. If the NSIS installer invokes that legacy uninstaller mid-
  // install it opens its GUI and can leave the app half-removed (the
  // "Missing Shortcut" failure). When installing over an existing build,
  // remove it headlessly with our own routine so NSIS starts from a clean
  // state every time.
  try {
    const chosenDir = installDir && installDir.trim() ? path.resolve(installDir.trim()) : '';
    const legacyDir = chosenDir || path.resolve(resolveInstalledDir());
    const legacyPresent = fs.existsSync(path.join(legacyDir, 'Panamedia.exe')) ||
      fs.existsSync(path.join(legacyDir, 'Uninstall Panamedia.exe'));
    if (legacyPresent) {
      const uninstallResult = await performUninstall({ targetDir: legacyDir, removeData: false, silent: true });
      if (!uninstallResult.success) {
        return { success: false, error: `Could not safely remove the existing Panamedia installation: ${uninstallResult.error}` };
      }
    }
  } catch (preCleanErr) {
    console.error('Pre-install legacy cleanup failed:', preCleanErr);
    return { success: false, error: `Could not remove the existing Panamedia installation: ${preCleanErr.message}` };
  }

  return new Promise((resolve) => {
    // NSIS /S = silent, /D= = custom install directory
    const args = ['/S'];
    if (installDir && installDir.trim()) {
      args.push(`/D=${installDir.trim()}`);
    }

    const proc = spawn(nsisPath, args, {
      windowsHide: true,
      detached: false,
    });

    // Progress simulation — NSIS doesn't report live progress in silent mode.
    // We animate based on time; actual finish is detected by process exit.
    let progress = 0;
    const progressInterval = setInterval(() => {
      // Increment progress slowly up to 90%, rest jumps to 100% on exit
      if (progress < 90) {
        progress += Math.random() * 3 + 1;
        if (progress > 90) progress = 90;
        if (installerWindow && !installerWindow.isDestroyed()) {
          installerWindow.webContents.send('install-progress', Math.round(progress));
        }
      }
    }, 300);

    proc.on('close', (code) => {
      clearInterval(progressInterval);
      if (code === 0) {
        if (installerWindow && !installerWindow.isDestroyed()) {
          installerWindow.webContents.send('install-progress', 100);
        }
        // Stage custom uninstaller UI inside install folder and update Windows Registry
        try {
          const targetDir = installDir && installDir.trim() ? installDir.trim() : getDefaultInstallDir();
          if (fs.existsSync(targetDir)) {
            const uninstallerDest = path.join(targetDir, 'PanamediaUninstall.exe');
            try {
              // Always refresh the custom uninstaller binary. A stale copy from an
              // older build (which may not know NSIS silent flags) is exactly what
              // caused the installer to pop the uninstaller GUI mid-install.
              const actualExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
              if (fs.existsSync(actualExe)) {
                fs.copyFileSync(actualExe, uninstallerDest);
              }
            } catch (copyErr) {
              console.warn('Could not copy custom uninstaller exe:', copyErr);
            }

            const escapedDest = uninstallerDest.replace(/'/g, "''");
            const startMenuDir = path.join(process.env['APPDATA'] || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Panamedia');
            const escapedStartMenu = path.join(startMenuDir, 'Uninstall Panamedia.lnk').replace(/'/g, "''");

            const psScript = `
              $dest = '${escapedDest}';
              $keys = @(
                'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.panamedia.app',
                'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.panamedia.app',
                'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.panamedia.app'
              );
              foreach ($k in $keys) {
                if (Test-Path $k) {
                  Set-ItemProperty -Path $k -Name 'UninstallString' -Value "\\"$dest\\" --uninstall";
                  Set-ItemProperty -Path $k -Name 'QuietUninstallString' -Value "\\"$dest\\" --uninstall --silent";
                  Set-ItemProperty -Path $k -Name 'ModifyPath' -Value "\\"$dest\\" --uninstall";
                }
              }
              Get-ChildItem -Path @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall') -ErrorAction SilentlyContinue | Where-Object { $_.GetValue('DisplayName') -like '*Panamedia*' } | ForEach-Object {
                Set-ItemProperty -Path $_.PSPath -Name 'UninstallString' -Value "\\"$dest\\" --uninstall";
                Set-ItemProperty -Path $_.PSPath -Name 'QuietUninstallString' -Value "\\"$dest\\" --uninstall --silent";
                Set-ItemProperty -Path $_.PSPath -Name 'ModifyPath' -Value "\\"$dest\\" --uninstall";
              }
              $smDir = '${startMenuDir.replace(/'/g, "''")}';
              if (Test-Path $smDir) {
                $wsh = New-Object -ComObject WScript.Shell;
                $s = $wsh.CreateShortcut('${escapedStartMenu}');
                $s.TargetPath = $dest;
                $s.Arguments = '--uninstall';
                $s.IconLocation = "$dest,0";
                $s.Save();
              }
            `.trim();
            execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript], {
              windowsHide: true
            }, (error) => {
              if (error) console.warn('Could not update the installed uninstaller shortcuts:', error.message);
            });
          }
        } catch (stageErr) {
          console.warn('Failed to stage custom uninstaller:', stageErr);
        }

        resolve({ success: true });
      } else {
        resolve({ success: false, error: `Installation failed with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      clearInterval(progressInterval);
      resolve({ success: false, error: err.message });
    });
  });
});

// Return app mode ('install' | 'uninstall')
ipcMain.handle('get-app-mode', () => {
  return isUninstall ? 'uninstall' : 'install';
});

// Return installed directory for uninstaller
ipcMain.handle('get-installed-dir', () => {
  return resolveInstalledDir();
});

// Run uninstallation: close app, invoke silent NSIS uninstaller, clean up shortcuts & data.
// Shared by the GUI path (IPC from the custom uninstaller window) and the headless
// path used when the NSIS installer replaces an old version on upgrade.
async function performUninstall({ targetDir, removeData = false, silent = false }) {
  // 1. Kill any running Panamedia processes
  if (process.platform === 'win32') {
    for (const imageName of ['Panamedia.exe', 'Panamedia Player.exe', 'panamedia-core.exe', 'panamedia-suspend.exe', 'ffmpeg.exe', 'ffprobe.exe']) {
      try {
        execFileSync('taskkill.exe', ['/F', '/IM', imageName, '/T'], {
          stdio: 'ignore',
          windowsHide: true
        });
      } catch (err) {
        // taskkill returns non-zero when that process is not running.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  // 2. Find NSIS uninstaller executable
  const uninstallerCandidates = [
    path.join(targetDir, 'Uninstall Panamedia.exe'),
    path.join(targetDir, 'uninstall.exe'),
    path.join(targetDir, 'Uninstall.exe')
  ];
  const nsisUninstaller = uninstallerCandidates.find(c => fs.existsSync(c));

  // Only send progress when a window exists (silent mode has none).
  const sendProgress = (value) => {
    if (installerWindow && !installerWindow.isDestroyed()) {
      installerWindow.webContents.send('uninstall-progress', value);
    }
  };

  return new Promise((resolve) => {
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += Math.random() * 4 + 2;
        if (progress > 90) progress = 90;
        sendProgress(Math.round(progress));
      }
    }, 200);

    const finishCleanup = async (code) => {
      clearInterval(progressInterval);

      if (code !== 0) {
        resolve({ success: false, error: `The existing Panamedia uninstaller exited with code ${code}.` });
        return;
      }

      // Small delay to let Windows kernel fully release any handles closed by NSIS
      await new Promise(r => setTimeout(r, 800));

      // Clean up desktop shortcuts
      try {
        const userDesktop = path.join(os.homedir(), 'Desktop');
        const shortcuts = [
          path.join(userDesktop, 'Panamedia.lnk'),
          path.join(userDesktop, 'Panamedia Player.lnk'),
          'C:\\Users\\Public\\Desktop\\Panamedia.lnk',
          'C:\\Users\\Public\\Desktop\\Panamedia Player.lnk'
        ];
        shortcuts.forEach(s => {
          if (fs.existsSync(s)) try { fs.unlinkSync(s); } catch (e) {}
        });

        // Clean up Start Menu directory
        const startMenuDir = path.join(process.env['APPDATA'] || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Panamedia');
        if (fs.existsSync(startMenuDir)) {
          fs.rmSync(startMenuDir, { recursive: true, force: true });
        }

        // Clean up registry entries
        try {
          const regCleanPs = `
            Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.panamedia.app' -Recurse -Force -ErrorAction SilentlyContinue;
            Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.panamedia.app' -Recurse -Force -ErrorAction SilentlyContinue;
            Remove-Item -Path 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.panamedia.app' -Recurse -Force -ErrorAction SilentlyContinue;
            Get-ChildItem -Path @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall') -ErrorAction SilentlyContinue | Where-Object { $_.GetValue('DisplayName') -like '*Panamedia*' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue;
          `.trim();
          execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', regCleanPs], {
            stdio: 'ignore',
            windowsHide: true
          });
        } catch (regErr) {}
      } catch (e) {}

      // If user checked "remove personal data / settings"
      if (removeData) {
        try {
          const appDataDir = path.join(process.env['APPDATA'] || '', 'panamedia');
          if (fs.existsSync(appDataDir)) fs.rmSync(appDataDir, { recursive: true, force: true });
        } catch (e) {}
        try {
          const legacyAppData = path.join(process.env['APPDATA'] || '', 'net-downloader');
          if (fs.existsSync(legacyAppData)) fs.rmSync(legacyAppData, { recursive: true, force: true });
        } catch (e) {}
        try {
          const localDir = path.join(process.env['LOCALAPPDATA'] || '', 'panamedia');
          if (fs.existsSync(localDir)) fs.rmSync(localDir, { recursive: true, force: true });
        } catch (e) {}
      }

      // NSIS's silent uninstaller only removes files it installed itself, so
      // our custom uninstaller binary and the install folder itself survive.
      // Remove those leftovers safely:
      try {
        fs.unlinkSync(path.join(targetDir, 'PanamediaUninstall.exe'));
      } catch (e) {}

      const selfDir = path.resolve(path.dirname(process.execPath)).toLowerCase();
      const targetLower = path.resolve(targetDir).toLowerCase();
      if (selfDir !== targetLower && fs.existsSync(targetDir)) {
        try {
          fs.rmSync(targetDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 600 });
        } catch (e) {}
      }

      // If folder still remains (e.g. explorer window was open or self process running),
      // schedule an asynchronous background purge once this process terminates
      if (fs.existsSync(targetDir)) {
        try {
          const cleanupScript = `timeout /t 2 /nobreak >nul & rmdir /s /q "${targetDir}"`;
          const purgeProc = spawn('cmd.exe', ['/c', cleanupScript], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
          });
          purgeProc.unref();
        } catch (e) {}
      }

      sendProgress(100);
      resolve({ success: true });
    };

    if (nsisUninstaller && fs.existsSync(nsisUninstaller)) {
      // NSIS /S = silent uninstallation
      const proc = spawn(nsisUninstaller, ['/S', `_?=${targetDir}`], {
        windowsHide: true,
        detached: false
      });

      proc.on('close', (code) => finishCleanup(code));
      proc.on('error', () => finishCleanup(1));
    } else {
      // Fallback: manually delete targetDir
      let cleanupCode = 0;
      try {
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error('Could not remove existing Panamedia installation:', e);
        cleanupCode = 1;
      }
      if (fs.existsSync(targetDir)) cleanupCode = 1;
      finishCleanup(cleanupCode);
    }
  });
}

ipcMain.handle('run-uninstall', async (event, options = {}) => {
  const result = await performUninstall({
    targetDir: resolveInstalledDir(),
    removeData: !!(options && options.removeData)
  });
  return result;
});

// Headless uninstall used when the NSIS installer replaces an old version.
// The installer invokes the previous install's registered uninstall string
// with NSIS silent flags (`--uninstall /S _?=DIR`); remove the old build
// without showing any UI so the new install can proceed automatically.
async function runSilentUninstall() {
  const safetyTimer = setTimeout(() => {
    console.warn('Silent uninstall timed out; forcing exit.');
    app.exit(1);
  }, 90000);
  safetyTimer.unref();

  let exitCode = 0;
  try {
    const result = await performUninstall({
      targetDir: resolveInstalledDir(),
      removeData: false,
      silent: true
    });
    if (!result.success) {
      console.error('Silent uninstall failed:', result.error);
      exitCode = 1;
    }
  } catch (err) {
    console.error('Silent uninstall failed:', err);
    exitCode = 1;
  }
  clearTimeout(safetyTimer);
  app.exit(exitCode);
}

// Launch Panamedia after install
ipcMain.handle('launch-panamedia', (event, installDir) => {
  try {
    const targetDir = installDir && installDir.trim() ? installDir.trim() : getDefaultInstallDir();
    let exePath = path.join(targetDir, 'Panamedia.exe');
    if (!fs.existsSync(exePath)) {
      exePath = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Panamedia', 'Panamedia.exe');
    }
    if (fs.existsSync(exePath)) {
      const workingDir = path.dirname(exePath);
      try {
        const child = spawn(exePath, [], {
          cwd: workingDir,
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        return true;
      } catch (spawnErr) {
        shell.openPath(exePath);
        return true;
      }
    }
  } catch (e) {
    console.warn('Failed to launch Panamedia:', e);
  }
  return false;
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (installerWindow && !installerWindow.isDestroyed()) {
    installerWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (installerWindow && !installerWindow.isDestroyed()) {
    if (installerWindow.isMaximized()) {
      installerWindow.unmaximize();
    } else {
      installerWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (installerWindow && !installerWindow.isDestroyed()) {
    installerWindow.close();
  }
});
