// installer-ui/main.cjs
// Custom Panamedia Installer - Electron Main Process
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const os = require('os');

// Disable GPU for installer (avoids driver issues on target machines)
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

const isDev = !app.isPackaged;

const cliArgs = process.argv.slice(1);
const isUninstall = cliArgs.some(a => {
  const l = a.toLowerCase();
  return l === '--uninstall' || l === '/uninstall' || l === '-uninstall' || l.includes('uninstall');
}) || path.basename(process.execPath).toLowerCase().includes('uninstall');

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
  const exeDir = path.dirname(process.execPath);
  if (fs.existsSync(path.join(exeDir, 'Panamedia.exe')) || fs.existsSync(path.join(exeDir, 'resources'))) {
    return exeDir;
  }
  const defaultDir = getDefaultInstallDir();
  if (fs.existsSync(defaultDir)) return defaultDir;
  return defaultDir;
}

// In uninstall mode, if running from inside the install directory, relocate to %TEMP%
// so that the install folder is not locked and can be deleted cleanly.
if (isUninstall && !process.env.__PANAMEDIA_UNINSTALL_TEMP) {
  const currentExeDir = path.resolve(path.dirname(process.execPath)).toLowerCase();
  const targetDir = path.resolve(resolveInstalledDir()).toLowerCase();
  if (currentExeDir.startsWith(targetDir)) {
    const tempExe = path.join(os.tmpdir(), 'PanamediaUninstall_' + Date.now() + '.exe');
    try {
      fs.copyFileSync(process.execPath, tempExe);
      const child = spawn(tempExe, ['--uninstall', `--install-dir=${resolveInstalledDir()}`], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, __PANAMEDIA_UNINSTALL_TEMP: '1' }
      });
      child.unref();
      process.exit(0);
    } catch (e) {}
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
    const out = execSync(
      `powershell -NoProfile -Command "(Get-PSDrive '${driveLetter}').Free"`,
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

// Run installation: launch NSIS silently, report progress via events
ipcMain.handle('run-install', async (event, installDir) => {
  const nsisPath = getNsisExePath();

  if (!fs.existsSync(nsisPath)) {
    return { success: false, error: 'Installer package not found: ' + nsisPath };
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
      if (installerWindow && !installerWindow.isDestroyed()) {
        installerWindow.webContents.send('install-progress', 100);
      }
      if (code === 0) {
        // Stage custom uninstaller UI inside install folder and update Windows Registry
        try {
          const targetDir = installDir && installDir.trim() ? installDir.trim() : getDefaultInstallDir();
          if (fs.existsSync(targetDir)) {
            const uninstallerDest = path.join(targetDir, 'PanamediaUninstall.exe');
            try {
              fs.copyFileSync(process.execPath, uninstallerDest);
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
                'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.panamedia.app'
              );
              foreach ($k in $keys) {
                if (Test-Path $k) {
                  Set-ItemProperty -Path $k -Name 'UninstallString' -Value "\\"$dest\\" --uninstall";
                  Set-ItemProperty -Path $k -Name 'QuietUninstallString' -Value "\\"$dest\\" --uninstall";
                  Set-ItemProperty -Path $k -Name 'ModifyPath' -Value "\\"$dest\\" --uninstall";
                }
              }
              Get-ChildItem -Path @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall') -ErrorAction SilentlyContinue | Where-Object { $_.GetValue('DisplayName') -like '*Panamedia*' } | ForEach-Object {
                Set-ItemProperty -Path $_.PSPath -Name 'UninstallString' -Value "\\"$dest\\" --uninstall";
                Set-ItemProperty -Path $_.PSPath -Name 'QuietUninstallString' -Value "\\"$dest\\" --uninstall";
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
            const { exec } = require('child_process');
            exec(`powershell -NoProfile -Command "${psScript.replace(/\r?\n\s*/g, ' ')}"`, () => {});
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

// Run uninstallation: close app, invoke silent NSIS uninstaller, clean up shortcuts & data
ipcMain.handle('run-uninstall', async (event, options = {}) => {
  const targetDir = resolveInstalledDir();

  // 1. Kill any running Panamedia processes
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM Panamedia.exe /T 2>nul', { stdio: 'ignore' });
    } catch (e) {}
    try {
      execSync('taskkill /F /IM "Panamedia Player.exe" /T 2>nul', { stdio: 'ignore' });
    } catch (e) {}
  }

  // 2. Find NSIS uninstaller executable
  const uninstallerCandidates = [
    path.join(targetDir, 'Uninstall Panamedia.exe'),
    path.join(targetDir, 'uninstall.exe'),
    path.join(targetDir, 'Uninstall.exe')
  ];
  const nsisUninstaller = uninstallerCandidates.find(c => fs.existsSync(c));

  return new Promise((resolve) => {
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += Math.random() * 4 + 2;
        if (progress > 90) progress = 90;
        if (installerWindow && !installerWindow.isDestroyed()) {
          installerWindow.webContents.send('uninstall-progress', Math.round(progress));
        }
      }
    }, 200);

    const finishCleanup = (code) => {
      clearInterval(progressInterval);

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
            Get-ChildItem -Path @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall') -ErrorAction SilentlyContinue | Where-Object { $_.GetValue('DisplayName') -like '*Panamedia*' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue;
          `.trim();
          execSync(`powershell -NoProfile -Command "${regCleanPs.replace(/\r?\n\s*/g, ' ')}"`, { stdio: 'ignore' });
        } catch (regErr) {}
      } catch (e) {}

      // If user checked "remove personal data / settings"
      if (options && options.removeData) {
        try {
          const appDataDir = path.join(process.env['APPDATA'] || '', 'net-downloader');
          if (fs.existsSync(appDataDir)) fs.rmSync(appDataDir, { recursive: true, force: true });
        } catch (e) {}
        try {
          const localDir = path.join(process.env['LOCALAPPDATA'] || '', 'panamedia');
          if (fs.existsSync(localDir)) fs.rmSync(localDir, { recursive: true, force: true });
        } catch (e) {}
      }

      if (installerWindow && !installerWindow.isDestroyed()) {
        installerWindow.webContents.send('uninstall-progress', 100);
      }
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
      try {
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
      } catch (e) {}
      finishCleanup(0);
    }
  });
});

// Launch Panamedia after install
ipcMain.handle('launch-panamedia', (event, installDir) => {
  try {
    const exePath = path.join(installDir || getDefaultInstallDir(), 'Panamedia.exe');
    if (fs.existsSync(exePath)) {
      shell.openPath(exePath);
      return true;
    }
    // Fallback: look in Program Files
    const fallback = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Panamedia', 'Panamedia.exe');
    if (fs.existsSync(fallback)) {
      shell.openPath(fallback);
      return true;
    }
  } catch (e) {}
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
