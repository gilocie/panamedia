param(
    [string]$SetupPath = "dist-installer\PanamediaSetup.exe",
    [string]$UninstallPath = "dist-installer\PanamediaUninstall.exe",
    [string]$PfxPath = "D:\GoSaveSiteCert.pfx",
    [string]$Password = "Password123!"
)

$cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -match "Go Save Site" } | Select-Object -First 1

if (-not $cert -and (Test-Path $PfxPath)) {
    try {
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($PfxPath, $Password)
    } catch {
        Write-Warning "Could not load certificate from PFX: $_"
    }
}

if ($cert) {
    Write-Host "Signing with certificate: $($cert.Subject) [$($cert.Thumbprint)]"
    if (Test-Path $SetupPath) {
        $res1 = Set-AuthenticodeSignature -FilePath $SetupPath -Certificate $cert -TimestampServer "http://timestamp.digicert.com"
        Write-Host "✓ Signed: $SetupPath [$($res1.Status)]"
    }
    if (Test-Path $UninstallPath) {
        $res2 = Set-AuthenticodeSignature -FilePath $UninstallPath -Certificate $cert -TimestampServer "http://timestamp.digicert.com"
        Write-Host "✓ Signed: $UninstallPath [$($res2.Status)]"
    }
} else {
    Write-Warning "No Go Save Site code signing certificate found."
}
