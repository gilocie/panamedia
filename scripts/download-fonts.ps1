$fonts = @(
    @{url='https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4W61C4E.ttf'; name='outfit-300.ttf'},
    @{url='https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf'; name='outfit-400.ttf'},
    @{url='https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4QK1C4E.ttf'; name='outfit-500.ttf'},
    @{url='https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4e6yC4E.ttf'; name='outfit-600.ttf'},
    @{url='https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf'; name='outfit-700.ttf'},
    @{url='https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4bCyC4E.ttf'; name='outfit-800.ttf'},
    @{url='https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_907NSg.ttf'; name='plus-jakarta-sans-300.ttf'},
    @{url='https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_qU7NSg.ttf'; name='plus-jakarta-sans-400.ttf'},
    @{url='https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_m07NSg.ttf'; name='plus-jakarta-sans-500.ttf'},
    @{url='https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_d0nNSg.ttf'; name='plus-jakarta-sans-600.ttf'},
    @{url='https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_TknNSg.ttf'; name='plus-jakarta-sans-700.ttf'},
    @{url='https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_KUnNSg.ttf'; name='plus-jakarta-sans-800.ttf'}
)

$dest = 'D:\PROJECT BUCKUP\MY SOFTWARES\panamedia-pro\public\fonts'
if (!(Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }

foreach ($font in $fonts) {
    $outFile = Join-Path $dest $font.name
    Write-Host "Downloading $($font.name)..."
    try {
        Invoke-WebRequest -Uri $font.url -OutFile $outFile -UseBasicParsing
        $size = (Get-Item $outFile).Length
        Write-Host "  OK ($([math]::Round($size/1KB)) KB)"
    } catch {
        Write-Host "  FAILED: $_"
    }
}

Write-Host "`nAll fonts downloaded to $dest"
Get-ChildItem $dest | Select-Object Name, @{N='Size(KB)';E={[math]::Round($_.Length/1KB)}} | Format-Table -AutoSize
