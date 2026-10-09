/**
 * build-custom-installer.cjs
 * ==========================
 * Builds the Panamedia app custom uninstaller, main app NSIS bundle,
 * stages it into installer-ui, and packages the final custom animated
 * UI installer (PanamediaSetup.exe) and uninstaller (PanamediaUninstall.exe).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INSTALLER_UI = path.join(ROOT, 'installer-ui');
const DIST_ELECTRON = path.join(ROOT, 'dist-electron');
const DIST_INSTALLER = path.join(ROOT, 'dist-installer');

function run(cmd, cwd = ROOT) {
  console.log(`\n> [${path.basename(cwd)}] ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

async function main() {
  console.log('=== Building Panamedia Custom Installer & Uninstaller ===\n');

  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const currentVersion = rootPkg.version || '1.0.1';
  console.log(`Building version: v${currentVersion}`);

  // Sync version with installer-ui/package.json
  const installerPkgPath = path.join(INSTALLER_UI, 'package.json');
  if (fs.existsSync(installerPkgPath)) {
    const installerPkg = JSON.parse(fs.readFileSync(installerPkgPath, 'utf8'));
    if (installerPkg.version !== currentVersion) {
      installerPkg.version = currentVersion;
      fs.writeFileSync(installerPkgPath, JSON.stringify(installerPkg, null, 2) + '\n');
      console.log(`✓ Synchronized version ${currentVersion} to installer-ui/package.json`);
    }
  }

  // Sync latest C++ binaries to bin directory
  const cppReleaseDir = path.join(ROOT, 'src-cpp', 'build', 'bin', 'Release');
  const binDir = path.join(ROOT, 'bin');
  if (fs.existsSync(cppReleaseDir) && fs.existsSync(binDir)) {
    const binFiles = fs.readdirSync(cppReleaseDir);
    for (const file of binFiles) {
      if (file.endsWith('.exe') || file.endsWith('.dll')) {
        try {
          fs.copyFileSync(path.join(cppReleaseDir, file), path.join(binDir, file));
        } catch {
          // ignore
        }
      }
    }
  }

  // 1. Ensure build and public asset icons are present in installer-ui
  console.log('\n1. Staging installer icons & assets...');
  const iconSources = [
    { src: path.join(ROOT, 'public', 'panamedia.ico'), dest: path.join(INSTALLER_UI, 'panamedia.ico') },
    { src: path.join(ROOT, 'public', 'icons.svg'), dest: path.join(INSTALLER_UI, 'icons.svg') },
    { src: path.join(ROOT, 'public', 'panamedia.ico'), dest: path.join(INSTALLER_UI, 'build', 'icon.ico') }
  ];

  if (!fs.existsSync(path.join(INSTALLER_UI, 'build'))) {
    fs.mkdirSync(path.join(INSTALLER_UI, 'build'), { recursive: true });
  }

  for (const { src, dest } of iconSources) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }

  // Clean stale staged nsis-installer if present
  const stagedNsis = path.join(INSTALLER_UI, 'nsis-installer.exe');
  if (fs.existsSync(stagedNsis)) {
    try {
      fs.unlinkSync(stagedNsis);
    } catch {
      // ignore
    }
  }

  // 2. Build standalone custom uninstaller UI (PanamediaUninstall.exe)
  console.log('\n2. Packaging Custom Uninstaller UI (PanamediaUninstall.exe)...');
  run('npx electron-builder --config uninstaller-builder.json', INSTALLER_UI);

  const uninstallerExe = path.join(DIST_INSTALLER, 'PanamediaUninstall.exe');
  if (!fs.existsSync(uninstallerExe)) {
    throw new Error(`Failed to build PanamediaUninstall.exe at ${uninstallerExe}`);
  }
  console.log(`✓ Custom Uninstaller built: ${uninstallerExe}`);

  // 3. Build Vite web bundle and NSIS binary (which bundles PanamediaUninstall.exe)
  console.log('\n3. Building main Panamedia app and NSIS package...');
  run('npm run build', ROOT);
  run('npx electron-builder --config electron-builder.json --publish never', ROOT);

  // 4. Locate the built NSIS binary in dist-electron matching current version
  console.log('\n4. Locating built NSIS binary...');
  if (!fs.existsSync(DIST_ELECTRON)) {
    throw new Error(`Output folder ${DIST_ELECTRON} does not exist.`);
  }

  const files = fs.readdirSync(DIST_ELECTRON);
  // Match specifically against current version first
  let nsisExe = files.find(f => f.endsWith('.exe') && f.includes(currentVersion) && !f.includes('uninstaller'));

  // Fallback: pick the most recently modified .exe
  if (!nsisExe) {
    const candidateExes = files
      .filter(f => f.endsWith('.exe') && !f.includes('uninstaller'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(DIST_ELECTRON, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (candidateExes.length > 0) {
      nsisExe = candidateExes[0].name;
    }
  }

  if (!nsisExe) {
    throw new Error(`Could not find NSIS installer executable for version ${currentVersion} in dist-electron.`);
  }

  const srcNsisPath = path.join(DIST_ELECTRON, nsisExe);
  const destNsisPath = path.join(INSTALLER_UI, 'nsis-installer.exe');
  console.log(`Found NSIS binary: ${nsisExe} -> Staging to installer-ui/nsis-installer.exe`);
  fs.copyFileSync(srcNsisPath, destNsisPath);

  // 5. Build Custom Installer UI executable (PanamediaSetup.exe)
  console.log('\n5. Packaging Custom Installer UI (PanamediaSetup.exe)...');
  run('npx electron-builder --config installer-builder.json', INSTALLER_UI);

  // 6. Sign executables if certificate is present
  const signScript = path.join(ROOT, 'scripts', 'sign-installer.ps1');
  if (fs.existsSync(signScript)) {
    console.log('\n6. Signing executables with Go Save Site certificate...');
    try {
      const setupPath = path.join(DIST_INSTALLER, 'PanamediaSetup.exe');
      const uninstPath = path.join(DIST_INSTALLER, 'PanamediaUninstall.exe');
      const signCmd = `powershell -ExecutionPolicy Bypass -File "${signScript}" -SetupPath "${setupPath}" -UninstallPath "${uninstPath}"`;
      execSync(signCmd, { stdio: 'inherit' });
      console.log('✓ Executables signed successfully with Go Save Site publisher identity.');
    } catch (e) {
      console.warn('Signing step warning:', e.message);
    }
  }

  console.log('\n=== Custom Installer & Uninstaller built successfully! ===');
  console.log(`Setup Location: ${path.join(DIST_INSTALLER, 'PanamediaSetup.exe')}`);
  console.log(`Uninstaller Location: ${path.join(DIST_INSTALLER, 'PanamediaUninstall.exe')}`);
}

main().catch(err => {
  console.error('\nBuild failed:', err);
  process.exit(1);
});
