# Run on a disposable Windows runner. The signing key and loopback feed are only for the test.
$ErrorActionPreference = 'Stop'
$work = Join-Path $env:RUNNER_TEMP 'waymark-updater-test'
New-Item -ItemType Directory -Path $work | Out-Null
$key = Join-Path $work 'test.key'
$baseVersion = (Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json).version
$nextVersion = [version]$baseVersion
$upgrade = "$($nextVersion.Major).$($nextVersion.Minor).$($nextVersion.Build + 1)"
$config = Join-Path $work 'test-config.json'
$installDir = Join-Path $work 'installed'
$profile = Join-Path $work 'webview'
$settingsDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'app.waymark.overlay'
$settingsFile = Join-Path $settingsDir 'settings-v1.json'
$exe = Join-Path $installDir 'waymark.exe'
$process = $null
if ((Test-Path $settingsFile) -or (Get-Process waymark -ErrorAction SilentlyContinue)) {
    throw 'The updater smoke test needs a clean Windows runner.'
}

try {
    npm run tauri -- signer generate --ci -w $key *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate the test signing key.' }
    $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $key -Raw).Trim()
    $env:VITE_WAYMARK_UPDATES = '1'
    $override = @{
        bundle = @{ createUpdaterArtifacts = $true }
        plugins = @{ updater = @{
            pubkey = (Get-Content "$key.pub" -Raw).Trim()
            endpoints = @('http://127.0.0.1:44891/latest.json')
            dangerousInsecureTransportProtocol = $true
            requireSignedVersion = $true
            windows = @{ installMode = 'passive' }
        }}
    }
    $override | ConvertTo-Json -Depth 5 | Set-Content $config
    npm run tauri -- build --ci --bundles nsis --config $config
    if ($LASTEXITCODE -ne 0) { throw 'Base build failed.' }
    $baseInstaller = (Resolve-Path "target/release/bundle/nsis/Waymark_${baseVersion}_x64-setup.exe").Path
    Copy-Item $baseInstaller (Join-Path $work 'base.exe')

    $override.version = $upgrade
    $override | ConvertTo-Json -Depth 5 | Set-Content $config
    npm run tauri -- build --ci --bundles nsis --config $config
    if ($LASTEXITCODE -ne 0) { throw 'Upgrade build failed.' }
    $nextInstaller = (Resolve-Path "target/release/bundle/nsis/Waymark_${upgrade}_x64-setup.exe").Path

    $install = Start-Process (Join-Path $work 'base.exe') -ArgumentList "/S /D=$installDir" -Wait -PassThru
    if ($install.ExitCode -ne 0 -or !(Test-Path $exe)) { throw 'Base setup failed.' }
    $log = Join-Path $work 'Client.txt'
    New-Item -ItemType File -Path $log | Out-Null
    New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null
    $settings = @{ logPath = $log; placement = @{ corner = 'bottomLeft'; insetX = 10; insetY = 10; followGame = $false } } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($settingsFile, $settings)

    $start = [Diagnostics.ProcessStartInfo]::new($exe)
    $start.UseShellExecute = $false
    $start.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER'] = $profile
    $start.EnvironmentVariables['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-port=0 --remote-debugging-address=127.0.0.1'
    $process = [Diagnostics.Process]::Start($start)
    node (Join-Path $PSScriptRoot 'check-overlay.mjs') $profile $log update $nextInstaller $upgrade
    if ($LASTEXITCODE -ne 0) { throw 'Update UI test failed.' }

    $deadline = (Get-Date).AddSeconds(90)
    do {
        $running = Get-Process waymark -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $process.Id -and $_.Path -eq $exe }
        if ($running -and (Get-Item $exe).VersionInfo.ProductVersion -like "$upgrade*") {
            if ((Get-Content $settingsFile -Raw) -ne $settings) { throw 'Settings changed during update.' }
            Write-Host "Waymark upgraded to $upgrade and restarted with its settings intact."
            return
        }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $deadline)
    throw 'Updated Waymark did not restart at the expected version.'
} finally {
    Get-Process waymark -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exe } | Stop-Process
    Remove-Item $settingsFile -ErrorAction SilentlyContinue
    Remove-Item $key -ErrorAction SilentlyContinue
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
}
