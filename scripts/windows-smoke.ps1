# Run in a clean Windows test profile with WebView2 and an interactive desktop.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Executable)

$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $Executable).Path
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OverlayCheck {
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hwnd, int id);
}
'@

function Test-HotkeyAvailable {
    if ([OverlayCheck]::RegisterHotKey([IntPtr]::Zero, 1, 1, 0x4E)) {
        [void][OverlayCheck]::UnregisterHotKey([IntPtr]::Zero, 1)
        return $true
    }
    $win32 = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($win32 -ne 1409) { throw "RegisterHotKey failed with Win32 error $win32" }
    return $false
}

function Wait-For($Description, [scriptblock]$Probe) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        if ($process.HasExited) { throw "Waymark exited with code $($process.ExitCode) while waiting for $Description" }
        $value = & $Probe
        if ($value) { return $value }
        Start-Sleep -Milliseconds 250
    } while ($timer.Elapsed.TotalSeconds -lt 45)
    throw "Timed out waiting for $Description"
}

if (Get-Process waymark -ErrorAction SilentlyContinue) { throw 'Use a test profile with no running Waymark.' }
if (!(Test-HotkeyAvailable)) { throw 'Alt+N is already registered before startup.' }
$settingsDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'app.waymark.overlay'
$settingsFile = Join-Path $settingsDir 'settings-v1.json'
$fixtureDir = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid())
$utf8 = [Text.UTF8Encoding]::new($false)
$createdSettings = $false
$process = $null
try {
    [void][IO.Directory]::CreateDirectory($fixtureDir)
    [void][IO.Directory]::CreateDirectory($settingsDir)
    $log = Join-Path $fixtureDir 'Client.txt'
    [IO.File]::WriteAllText($log, "[SCENE] Set Source [Old history]`r`n", $utf8)
    # CreateNew protects any existing user preferences, including concurrent creation.
    $stream = [IO.File]::Open($settingsFile, [IO.FileMode]::CreateNew)
    $createdSettings = $true
    try {
        $bytes = $utf8.GetBytes((@{logPath = $log} | ConvertTo-Json -Compress))
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
    $profile = Join-Path $fixtureDir 'WebView2'
    $start = [Diagnostics.ProcessStartInfo]::new($exe)
    $start.UseShellExecute = $false
    $start.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER'] = $profile
    $start.EnvironmentVariables['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-port=0 --remote-debugging-address=127.0.0.1'
    $process = [Diagnostics.Process]::Start($start)
    $hwnd = Wait-For 'the compact Waymark window' {
        $process.Refresh()
        if ($process.MainWindowTitle -eq 'Waymark') { $process.MainWindowHandle }
    }
    $style = [OverlayCheck]::GetWindowLong($hwnd, -20)
    # WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_EX_LAYERED, WS_EX_NOACTIVATE.
    $required = 0x08080028
    if (($style -band $required) -ne $required) { throw ('Missing passive window styles: 0x{0:X}' -f $style) }
    if (![OverlayCheck]::IsWindowVisible($hwnd)) { throw 'Compact window is hidden.' }
    if ([OverlayCheck]::GetForegroundWindow() -eq $hwnd) { throw 'Compact window has foreground focus.' }
    if (Test-HotkeyAvailable) { throw 'Waymark did not register Alt+N.' }
    node (Join-Path $PSScriptRoot 'check-overlay.mjs') $profile $log
    if ($LASTEXITCODE -ne 0) { throw 'Rendered overlay check failed.' }
    Write-Host 'Native overlay, hotkey registration and live log recovery passed.'
} finally {
    if ($process -and !$process.HasExited) { $process.Kill(); $process.WaitForExit() }
    if ($createdSettings) { Remove-Item -LiteralPath $settingsFile }
    # WebView2 child processes can briefly hold profile files after their host exits.
    for ($i = 0; $i -lt 20 -and (Test-Path -LiteralPath $fixtureDir); $i++) {
        Remove-Item -Recurse -Force -LiteralPath $fixtureDir -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $fixtureDir) { Start-Sleep -Milliseconds 250 }
    }
}
