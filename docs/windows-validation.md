# Windows acceptance pass

Run on Windows 10 and 11 x64 with WebView2 installed. Record Windows build, game version, Steam or standalone, renderer, display mode, monitor scaling and result for each check. These checks require the target desktop. Cross-compilation and browser tests cannot verify in-game focus or compositing.

| Check | Procedure and expected observation |
| --- | --- |
| Passive startup | Focus the game while Waymark starts (a delayed PowerShell launch can help). The compact panel appears at the top right. Game keyboard input continues. |
| Click-through | Put an ordinary game UI control under the compact panel. Click it yourself. The game receives the click and retains focus. Repeat over text and the edge of the panel. |
| Hotkey | While typing in a game text field, press Alt+N, release, and press it again. The panel hides and returns without activating. Lock Alt+N in another program before starting Waymark and confirm that settings reports a conflict and the tray toggle still works. |
| Settings | Open the compass tray menu, select Open settings, change a corner and both insets, then save. Verify that compact stays click-through while settings is interactive. Close settings, quit from the tray and restart. Check that the saved position returns. |
| Drag placement | In Settings → Position, select Move overlay and drag the Waymark header. Pause after releasing the mouse and verify the overlay stays at the preview position. Confirm and verify click-through over a game control. Quit and restart to check the saved position. Move again and cancel. Repeat using Done, the Settings close button, and Alt+N. Each restores the saved placement and click-through. Alt+N also hides the overlay. While the overlay is hidden, start a move and cancel. Verify it goes back to hidden. Repeat on a scaled display and, with game tracking enabled, on a monitor with negative coordinates. Drop outside the anchor and check that confirmation keeps the window inside it. |
| Steam and standalone | On each install, start the game and inspect the discovered path. Include a Steam library on a second drive. Change zones and compare the display with the game. Select a different Client.txt manually, restart and verify that its path persists. Use auto-detection to clear it. |
| Tracking | Focus the game, including on a secondary monitor with negative desktop coordinates. Check Position → Current anchor. If identified, move/resize a windowed game or change monitor/DPI (100%, 150%, 200%) and verify corner alignment. Minimize the game, restore it and disable tracking. Check primary work-area fallback and edge clamping. |
| Replay isolation | Start a fixture replay. The panel changes to replay status, shows The Riverbank and finishes on Fixture_Unknown_02. Change zones in the game during replay, choose Return to live and check that the live observation is restored. Restart replay twice. |
| Exit | Quit Waymark from the tray, then relaunch. Confirm a single tray icon, released hotkey, and restored saved log source. |

## On-demand Windows check

In GitHub Actions, choose **Windows validation → Run workflow**. The Windows Server 2022 runner tests the log core on NTFS, runs Vitest, builds an x64 executable and NSIS installer, and launches the executable with a disposable Client.txt. The smoke test queries only Waymark's own window and rendered text. It starts a disposable WebView2 profile with a loopback debugging port for this test process. It launches Waymark three times using the same settings and WebView2 profile. On each launch it checks that both windows load their initial state, then checks the passive window styles, Alt+N registration, new zone records, and recovery after rotation. A successful run retains the unsigned installer as a workflow artifact for seven days.

To repeat the native smoke test in a clean Windows test profile, build the app and run the following from the repository root in Windows PowerShell with Node.js 24 available. The script needs a desktop session and an unused Alt+N shortcut. It exits if the profile already has Waymark settings.

```powershell
.\scripts\windows-smoke.ps1 -Executable .\target\release\waymark.exe
```

## Controlled file test

Use a disposable directory and choose **its** `Client.txt` in settings. These commands generate synthetic data independently of the game. Run the first block once in PowerShell, select the file, and wait for **Connected**.

```powershell
$testDir = Join-Path $env:TEMP ("waymark-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $testDir | Out-Null
$testLog = Join-Path $testDir "Client.txt"
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($testLog, "[SCENE] Set Source [Old history]`n", $utf8)
```

1. The old line must not appear. Append an incomplete line. The zone stays unchanged until the terminating newline.

   ```powershell
   [IO.File]::AppendAllText($testLog, 'Generating level 1 area "G1_1"', $utf8)
   Start-Sleep -Seconds 1
   [IO.File]::AppendAllText($testLog, "`r`n[SCENE] Set Source [The Riverbank]`r`n", $utf8)
   ```

2. Expect The Riverbank and Act 1. Append a malformed scene and repeat the complete scene. The displayed zone stays the same. The automated tests assert the event counts.
3. Truncate with `[IO.File]::WriteAllText($testLog, "", $utf8)`, wait one second, then append a new zone. Expect its literal ID and an unknown act.

   ```powershell
   [IO.File]::AppendAllText($testLog, ('Generating level 9 area "Unknown_Test"' + "`n"), $utf8)
   ```

4. Rotate with `Rename-Item -LiteralPath $testLog -NewName Client.old`. After a poll the panel should say **File missing**. Recreate the file using `[IO.File]::WriteAllText($testLog, "[SCENE] Set Source [Replacement]`n", $utf8)`. Expect **Connected** and **Replacement**, even though the line was written before the new handle opened.
5. Quit and reopen while the selected file is missing. Recreate it after the panel shows **File missing**. Its first complete record must be detected.

## Known limits

- The supported target is a composed Windows desktop in Windowed Fullscreen. Exclusive fullscreen, protected surfaces, secure desktops and other topmost overlays can obscure Waymark. Opening settings intentionally activates a separate regular window.
- Game anchoring requires a foreground window observed with the exact title `Path of Exile 2`, class `POEWindowClass`, and usable client geometry. The handle is rechecked while valid. Localized titles, changed classes or minimized windows use the primary display work area. The overlay can remain visible over other programs until hidden with Alt+N.
- Discovery checks the current user's Steam registry path, standard Program Files roots, Steam library metadata, app manifest 2694490, and a standalone registry hint. With several candidates it prefers the most recently written existing log. The picker covers unrecognized layouts. Log files must be readable by the current Windows user.
- Formats, locales and game versions can change. PoE is not required to emit either supported marker. Exact duplicate observations do not identify a new instance of the same zone. Complementary records outside the correlation window can produce two changes, and unrelated complementary records very close together can be paired. Zone level is never used to infer an act.
- Polling cannot reconstruct a generation created and removed entirely between reads, writes to an old handle after its final drain, or a same-identity rewrite that regrows past the previous offset with the same checkpoint bytes. Local NTFS is the intended filesystem.
- The compact title truncates long names to fit. Settings shows the complete detected label. Unknown area IDs are rendered as text and leave the act blank. The small external lookup contains only a Sprint 1 reference entry.
- This source includes a Windows installer configuration. Signing, packaged-installer execution and the in-game acceptance pass are separate release checks.
