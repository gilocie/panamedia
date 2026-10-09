$dest = "C:\Program Files\Panamedia\PanamediaUninstall.exe"
$keys = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.panamedia.app",
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.panamedia.app",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.panamedia.app"
)
foreach ($k in $keys) {
  if (Test-Path $k) {
    Set-ItemProperty -Path $k -Name "UninstallString" -Value "`"$dest`" --uninstall"
    Set-ItemProperty -Path $k -Name "QuietUninstallString" -Value "`"$dest`" --uninstall"
    Set-ItemProperty -Path $k -Name "ModifyPath" -Value "`"$dest`" --uninstall"
    Write-Host "Updated registry key: $k"
  }
}
$parents = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
)
foreach ($p in $parents) {
  if (Test-Path $p) {
    Get-ChildItem -Path $p -ErrorAction SilentlyContinue | ForEach-Object {
      $dn = $_.GetValue("DisplayName")
      if ($dn -and $dn -like "*Panamedia*") {
        Set-ItemProperty -Path $_.PSPath -Name "UninstallString" -Value "`"$dest`" --uninstall"
        Set-ItemProperty -Path $_.PSPath -Name "QuietUninstallString" -Value "`"$dest`" --uninstall"
        Set-ItemProperty -Path $_.PSPath -Name "ModifyPath" -Value "`"$dest`" --uninstall"
        Write-Host "Updated $($_.PSPath) (DisplayName: $dn)"
      }
    }
  }
}
$smDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Panamedia")
$smLink = [System.IO.Path]::Combine($smDir, "Uninstall Panamedia.lnk")
if (Test-Path $smDir) {
  $wsh = New-Object -ComObject WScript.Shell
  $s = $wsh.CreateShortcut($smLink)
  $s.TargetPath = $dest
  $s.Arguments = "--uninstall"
  $s.IconLocation = "$dest,0"
  $s.Save()
  Write-Host "Updated Start Menu shortcut: $smLink"
}
