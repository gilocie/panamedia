/**
 * apply-uninstaller.cjs
 * Copies the newly built PanamediaUninstall.exe into C:\Program Files\Panamedia
 * and updates the Windows Uninstall registry entries to point to it.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetDir = process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Panamedia') : 'C:\\Program Files\\Panamedia';
const srcExe = path.resolve(__dirname, '..', 'dist-installer', 'PanamediaUninstall.exe');
const destExe = path.join(targetDir, 'PanamediaUninstall.exe');

console.log(`Target install directory: ${targetDir}`);
console.log(`Source uninstaller: ${srcExe}`);

if (!fs.existsSync(srcExe)) {
  console.error(`Source uninstaller not found at ${srcExe}`);
  process.exit(1);
}

if (!fs.existsSync(targetDir)) {
  console.log(`Target directory ${targetDir} does not exist yet. It will be populated during next installation.`);
} else {
  try {
    fs.copyFileSync(srcExe, destExe);
    console.log(`Successfully staged PanamediaUninstall.exe into ${destExe}`);
  } catch (err) {
    console.warn(`Could not copy to ${destExe} directly (may require admin elevation):`, err.message);
  }
}

// Update Windows Registry entries
const escapedDest = destExe.replace(/'/g, "''");
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
      Set-ItemProperty -Path $k -Name 'QuietUninstallString' -Value "\\"$dest\\" --uninstall";
      Set-ItemProperty -Path $k -Name 'ModifyPath' -Value "\\"$dest\\" --uninstall";
      Write-Host "Updated registry key: $k";
    }
  }
  Get-ChildItem -Path @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall') -ErrorAction SilentlyContinue | Where-Object { $_.GetValue('DisplayName') -like '*Panamedia*' } | ForEach-Object {
    Set-ItemProperty -Path $_.PSPath -Name 'UninstallString' -Value "\\"$dest\\" --uninstall";
    Set-ItemProperty -Path $_.PSPath -Name 'QuietUninstallString' -Value "\\"$dest\\" --uninstall";
    Set-ItemProperty -Path $_.PSPath -Name 'ModifyPath' -Value "\\"$dest\\" --uninstall";
    Write-Host "Updated uninstaller registry for $($_.GetValue('DisplayName')) at $($_.PSPath)";
  }
  $smDir = '${startMenuDir.replace(/'/g, "''")}';
  if (Test-Path $smDir) {
    $wsh = New-Object -ComObject WScript.Shell;
    $s = $wsh.CreateShortcut('${escapedStartMenu}');
    $s.TargetPath = $dest;
    $s.Arguments = '--uninstall';
    $s.IconLocation = "$dest,0";
    $s.Save();
    Write-Host "Updated Start Menu shortcut: ${escapedStartMenu}";
  }
`.trim();

try {
  const out = execSync(`powershell -NoProfile -Command "${psScript.replace(/\r?\n\s*/g, ' ')}"`, { encoding: 'utf8' });
  console.log(out);
  console.log('Registry and shortcuts updated successfully!');
} catch (e) {
  console.warn('PowerShell registry update:', e.message);
}
