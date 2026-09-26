/**
 * build-custom-installer.cjs
 * ==========================
 * Builds the Panamedia app NSIS bundle, stages it into installer-ui,
 * and packages the final custom animated UI installer (PanamediaSetup.exe).
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
  console.log('=== Building Panamedia Custom Installer ===\n');

  // 1. Ensure build and public asset icons are present in installer-ui
  console.log('1. Staging installer icons & assets...');
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

  // 2. Build Vite web bundle and NSIS binary
  console.log('\n2. Building main Panamedia app and NSIS package...');
  run('npm run build', ROOT);
  run('npx electron-builder --config electron-builder.json --publish never', ROOT);

  // 3. Locate the built NSIS installer exe in dist-electron
  console.log('\n3. Locating built NSIS binary...');
  if (!fs.existsSync(DIST_ELECTRON)) {
    throw new Error(`Output folder ${DIST_ELECTRON} does not exist.`);
  }

  const files = fs.readdirSync(DIST_ELECTRON);
  const nsisExe = files.find(f => f.endsWith('.exe') && !f.includes('uninstaller'));

  if (!nsisExe) {
    throw new Error('Could not find NSIS installer executable in dist-electron.');
  }

  const srcNsisPath = path.join(DIST_ELECTRON, nsisExe);
  const destNsisPath = path.join(INSTALLER_UI, 'nsis-installer.exe');
  console.log(`Found NSIS binary: ${nsisExe} -> Staging to installer-ui/nsis-installer.exe`);
  fs.copyFileSync(srcNsisPath, destNsisPath);

  // 4. Build Custom Installer UI executable
  console.log('\n4. Packaging Custom Installer UI (PanamediaSetup.exe)...');
  run('npx electron-builder --config installer-builder.json', INSTALLER_UI);

  console.log('\n=== Custom Installer built successfully! ===');
  console.log(`Location: ${path.join(DIST_INSTALLER, 'PanamediaSetup.exe')}`);
}

main().catch(err => {
  console.error('\nBuild failed:', err);
  process.exit(1);
});
