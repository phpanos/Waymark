# Run in a clean Windows test profile with WebView2 and an interactive desktop.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Executable)

$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $Executable).Path
Add-Type @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class OverlayCheck {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct Point { public int X, Y; }
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError=true)] private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", SetLastError=true)] public static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll", SetLastError=true)] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hwnd, int id);

    public static Rect WindowBounds(IntPtr hwnd) {
        // Match the physical screen coordinates used by the low-level mouse hook.
        IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
        try {
            Rect rect;
            if (!GetWindowRect(hwnd, out rect)) throw new Win32Exception();
            return rect;
        } finally {
            if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous);
        }
    }

    public static void Alt(bool down) {
        keybd_event(0x12, 0, down ? 0u : 2u, UIntPtr.Zero);
    }

    public static void Key(byte key, bool down) {
        keybd_event(key, 0, down ? 0u : 2u, UIntPtr.Zero);
    }

    public static void PrimaryButton(bool down) {
        bool swapped = GetSystemMetrics(23) != 0; // SM_SWAPBUTTON
        uint flags = swapped ? 8u : 2u; // MOUSEEVENTF_RIGHTDOWN or LEFTDOWN
        mouse_event(down ? flags : flags << 1, 0, 0, 0, UIntPtr.Zero);
    }
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

function Assert-PassiveOverlay($Hwnd) {
    # WS_EX_TOPMOST, WS_EX_LAYERED, WS_EX_NOACTIVATE and WS_EX_TRANSPARENT.
    $expected = 0x08080028
    $style = [OverlayCheck]::GetWindowLong($Hwnd, -20)
    if (($style -band $expected) -ne $expected) {
        throw ('Missing passive overlay styles: 0x{0:X}' -f $style)
    }
    if (![OverlayCheck]::IsWindowVisible($Hwnd)) { throw 'Compact window is hidden.' }
    if ([OverlayCheck]::GetForegroundWindow() -eq $Hwnd) { throw 'Compact window has foreground focus.' }
}

function Invoke-AltHeaderClick($Hwnd) {
    $bounds = [OverlayCheck]::WindowBounds($Hwnd)
    $cursor = New-Object OverlayCheck+Point
    if (![OverlayCheck]::GetCursorPos([ref]$cursor)) { throw 'Could not read the cursor position.' }
    if (![OverlayCheck]::SetCursorPos(($bounds.Left + 110), ($bounds.Top + 20))) { throw 'Could not position the pointer over the header.' }
    try {
        [OverlayCheck]::Alt($true)
        Start-Sleep -Milliseconds 70
        [OverlayCheck]::PrimaryButton($true)
        Start-Sleep -Milliseconds 70
        [OverlayCheck]::PrimaryButton($false)
        Start-Sleep -Milliseconds 100
    } finally {
        [OverlayCheck]::Alt($false)
        [void][OverlayCheck]::SetCursorPos($cursor.X, $cursor.Y)
    }
}

function Invoke-RewardShortcut([byte]$Key) {
    try {
        [OverlayCheck]::Alt($true)
        [OverlayCheck]::Key(0x10, $true)
        [OverlayCheck]::Key($Key, $true)
        Start-Sleep -Milliseconds 70
    } finally {
        [OverlayCheck]::Key($Key, $false)
        [OverlayCheck]::Key(0x10, $false)
        [OverlayCheck]::Alt($false)
    }
}

function Test-AltDrag($Hwnd) {
    $origin = [OverlayCheck]::WindowBounds($Hwnd)
    $cursor = New-Object OverlayCheck+Point
    if (![OverlayCheck]::GetCursorPos([ref]$cursor)) { throw 'Could not read the cursor position.' }
    $x = $origin.Left + 110
    $distance = 64
    $savedBefore = Get-Content -LiteralPath $settingsFile -Raw
    $altHeld = $false
    $buttonHeld = $false
    try {
        foreach ($gesture in 'ordinary header drag', 'Alt body drag', 'Alt header drag') {
            $y = $origin.Top + $(if ($gesture -eq 'Alt body drag') { 85 } else { 20 })
            if (![OverlayCheck]::SetCursorPos($x, $y)) { throw 'Could not position the drag cursor.' }
            if ($gesture -ne 'ordinary header drag') {
                [OverlayCheck]::Alt($true)
                $altHeld = $true
                Start-Sleep -Milliseconds 70
            }
            [OverlayCheck]::PrimaryButton($true)
            $buttonHeld = $true
            Start-Sleep -Milliseconds 70
            if (![OverlayCheck]::SetCursorPos($x, ($y + $distance))) { throw 'Could not move the drag cursor.' }
            if ($gesture -eq 'Alt header drag') {
                [void](Wait-For 'the overlay to follow the mouse during Alt-drag' {
                    ([OverlayCheck]::WindowBounds($Hwnd)).Top -eq ($origin.Top + $distance)
                })
                Assert-PassiveOverlay $Hwnd
                if ((Get-Content -LiteralPath $settingsFile -Raw) -ne $savedBefore) { throw 'Placement was saved before release.' }
            } else {
                Start-Sleep -Milliseconds 250
                if (([OverlayCheck]::WindowBounds($Hwnd)).Top -ne $origin.Top) { throw "$gesture moved the overlay." }
            }
            [OverlayCheck]::PrimaryButton($false)
            $buttonHeld = $false
            if ($altHeld) {
                [OverlayCheck]::Alt($false)
                $altHeld = $false
            }
        }
        [void](Wait-For 'a saved position after releasing the mouse' {
            (Get-Content -LiteralPath $settingsFile -Raw) -ne $savedBefore
        })
        Assert-PassiveOverlay $Hwnd
        $saved = [OverlayCheck]::WindowBounds($Hwnd)
        if ([Math]::Abs($saved.Top - ($origin.Top + $distance)) -gt 2) { throw 'The overlay snapped back after release.' }
        return $saved
    } finally {
        if ($buttonHeld) { [OverlayCheck]::PrimaryButton($false) }
        if ($altHeld) { [OverlayCheck]::Alt($false) }
        [void][OverlayCheck]::SetCursorPos($cursor.X, $cursor.Y)
    }
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
    # Reuse both the settings and WebView2 disk cache to cover warm launches.
    $dragged = $null
    foreach ($launch in 1..3) {
        Write-Host "Testing launch $launch with the same profile"
        $process = [Diagnostics.Process]::Start($start)
        $hwnd = Wait-For 'the compact Waymark window' {
            $process.Refresh()
            if ($process.MainWindowTitle -eq 'Waymark') { $process.MainWindowHandle }
        }
        Assert-PassiveOverlay $hwnd
        if (Test-HotkeyAvailable) { throw 'Waymark did not register Alt+N.' }
        $check = Join-Path $PSScriptRoot 'check-overlay.mjs'
        node $check $profile $log settings $launch
        if ($LASTEXITCODE -ne 0) { throw "Settings controls failed on launch $launch." }
        if ($launch -eq 1) {
            $dragged = Test-AltDrag $hwnd
        } else {
            $bounds = [OverlayCheck]::WindowBounds($hwnd)
            if ($bounds.Left -ne $dragged.Left -or [Math]::Abs($bounds.Top - $dragged.Top) -gt 2) {
                throw 'The Alt-drag position did not survive restart.'
            }
        }
        node $check $profile $log overlay
        if ($LASTEXITCODE -ne 0) { throw "Rendered overlay check failed on launch $launch." }
        if ($launch -eq 1) {
            [IO.File]::AppendAllText($log, "Generating level 4 area `"G1_4`"`r`n", $utf8)
            node $check $profile $log details expanded
            if ($LASTEXITCODE -ne 0) { throw 'The overlay did not open with objective details expanded.' }
            Invoke-AltHeaderClick $hwnd
            node $check $profile $log details collapsed
            if ($LASTEXITCODE -ne 0) { throw 'The overlay did not collapse after Alt-click.' }
            $collapsed = [OverlayCheck]::WindowBounds($hwnd)
            Invoke-AltHeaderClick $hwnd
            node $check $profile $log details reopened
            if ($LASTEXITCODE -ne 0) { throw 'The overlay did not expand again after Alt-click.' }
            Invoke-RewardShortcut 0x52 # R
            node $check $profile $log rewards opened
            if ($LASTEXITCODE -ne 0) { throw 'Reward recap shortcut failed.' }
            Invoke-RewardShortcut 0x4E # N
            node $check $profile $log rewards selected
            if ($LASTEXITCODE -ne 0) { throw 'Reward selection shortcut failed.' }
            Invoke-RewardShortcut 0x44 # D
            node $check $profile $log rewards completed
            if ($LASTEXITCODE -ne 0) { throw 'Reward completion shortcut failed.' }
            if ('G1_11:1' -notin (Get-Content $settingsFile -Raw | ConvertFrom-Json).profiles[0].completed) {
                throw 'Reward completion was not saved.'
            }
            Invoke-RewardShortcut 0x55 # U
            node $check $profile $log rewards undone
            if ($LASTEXITCODE -ne 0) { throw 'Reward undo shortcut failed.' }
            if ('G1_11:1' -in (Get-Content $settingsFile -Raw | ConvertFrom-Json).profiles[0].completed) {
                throw 'Undo did not restore the saved reward.'
            }
            Assert-PassiveOverlay $hwnd
            Invoke-AltHeaderClick $hwnd
            node $check $profile $log details collapsed
            if ($LASTEXITCODE -ne 0) { throw 'Collapsing overlay details failed.' }
            [void](Wait-For 'the collapsed overlay bounds' {
                $bounds = [OverlayCheck]::WindowBounds($hwnd)
                $bounds.Top -eq $collapsed.Top -and $bounds.Bottom -eq $collapsed.Bottom
            })
        }
        $process.Kill()
        $process.WaitForExit()
    }
    Write-Host 'Native overlay, Alt-drag persistence, hotkey registration and live log recovery passed.'
} finally {
    if ($process -and !$process.HasExited) { $process.Kill(); $process.WaitForExit() }
    if ($createdSettings) { Remove-Item -LiteralPath $settingsFile }
    # WebView2 child processes can briefly hold profile files after their host exits.
    for ($i = 0; $i -lt 20 -and (Test-Path -LiteralPath $fixtureDir); $i++) {
        Remove-Item -Recurse -Force -LiteralPath $fixtureDir -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $fixtureDir) { Start-Sleep -Milliseconds 250 }
    }
}
