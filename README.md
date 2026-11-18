# Waymark

Waymark is a Windows 10/11 campaign overlay for Path of Exile 2. It tails newly appended `Client.txt` records and shows the latest detected zone, act when known, log status, and story and optional objective hints for Acts 1–4. Windowed Fullscreen is the initial target.

## In-app updates

In a signed Windows release, open **Settings → Updates**, click **Check for updates**, then choose **Install and restart** when a new version appears. Install the first signed release manually to enroll in the alpha channel.

Maintainers can publish signed installers from GitHub Actions using the [Windows alpha release instructions](docs/windows-updates.md).

## Run on Windows

For the portable x64 build, extract the entire ZIP, keep `waymark.exe` and `WebView2Loader.dll` together, and run `waymark.exe`. The Microsoft Edge WebView2 Evergreen Runtime must already be installed. The portable PoC is unsigned.

For a source build, install Node.js 22.12+ or 24 LTS, Rust stable (1.93.1 or newer), Visual Studio 2022 Build Tools with **Desktop development with C++** and a Windows SDK, and the Microsoft Edge WebView2 Evergreen Runtime. Use the x64 MSVC Rust toolchain on x64 Windows. [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows)

Extract the source and open PowerShell in the directory containing `package.json`.

```powershell
npm ci
npm run tauri -- dev
```

For a release build and NSIS installer, run the following from the same directory.

```powershell
npm run tauri -- build
```

With the default Cargo target directory, the executable is `target\release\waymark.exe` and the installer is under `target\release\bundle\nsis\`. The installer handles WebView2 installation using Tauri's default Windows bootstrapper. Network access is needed to fetch development dependencies and may be needed to install WebView2.

## Use the overlay

1. Launch Waymark once. The compact window appears at the top right. The compass icon in the Windows notification area opens a menu with **Open settings**, **Show / hide overlay**, and **Quit Waymark**. Windows may put the icon under the overflow arrow.
2. Open PoE 2 in **Windowed Fullscreen** and enter a zone. **Connected** means the file is readable. **Awaiting zone** lasts until a supported *new* record arrives. Starting the app in the middle of a zone may require another transition.
3. In **Settings → Log source**, check the selected path. Auto-detection checks standalone install locations and Steam libraries, including custom libraries declared in `libraryfolders.vdf`. Use **Choose Client.txt…** for a custom install. **Use auto-detection** clears a manual selection.
4. **Alt+N** toggles the compact window globally. If Windows refuses registration, the settings window shows the error and the tray toggle remains available.
5. Hold **Alt** and drag the Waymark header. Release the mouse to save the position relative to the current anchor. Ordinary clicks pass through to the game. To place the overlay with exact insets, open **Settings → Position**, choose a corner, enter the insets in device-independent pixels, and select **Save position**.
6. **Settings → Diagnostics → Replay fixture** runs the bundled synthetic log through the Rust decoder and detector. The status reads **Replaying** and then **Replay complete**. Expect **The Riverbank · Act 1** with **Reach Clearfell**, followed by **Fixture_Unknown_02** with no act or assigned objective. Choose **Return to live** to display the latest live observation, including transitions received during replay.

Settings are saved on change under `%APPDATA%\app.waymark.overlay\settings-v1.json`, using a temporary file and replacement. Placement and the manual path survive restart. Visibility, replay mode and the current zone are session state.

## Campaign objectives

The compact overlay shows the area's story hint and a muted optional hint when available. **Settings → Objectives** follows the detected zone by default. Search by area, boss, or reward, or use the act and area menus. Select **Use current zone** to resume following the game.

Choose a character and optionally name the league to save an independent reward checklist. Tick an optional objective to remove it from that character's compact overlay. Enable **League-start recommendations** to highlight lasting rewards such as passive points, Spirit, and Ascendancy unlocks.

The bundled catalog uses area IDs checked against [ExileData's 0.5.5.10 export](https://data.exiledata.dev/poe2/0.5.5.10/world_areas.min.json) and hints based on PoE2DB's [Act 1](https://poe2db.tw/us/Act_1), [Act 2](https://poe2db.tw/us/Act_2), [Act 3](https://poe2db.tw/us/Act_3), and [Act 4](https://poe2db.tw/us/Act_4) references. Recommendations focus on permanent campaign rewards and don’t depend on the league mechanic.

**Settings → Objectives** also shows preparation tips for selected bosses and Ascendancy trials. The detected area level and any suggested character level are labeled separately. The suggested levels for a first trial are approximate and depend on your build and gear. [Campaign and trial preparation reference](https://buildmentor.org/new-player-guide/)

The overlay shows a **Shortcut** cue in selected areas. Open **Settings → Objectives** for the full steps, including when to use a town portal, activate a waypoint, backtrack via a checkpoint, or return to the ship. [Act 1 route](https://mobalytics.gg/poe-2/guides/act-1-guide-guythatdies), [checkpoint routes for Act 1](https://www.definitivguide.com/docs/PoE2/Act%201/overview), [Act 2 route](https://www.definitivguide.com/docs/PoE2/Act%202/overview), [Act 3 route](https://www.definitivguide.com/docs/PoE2/Act%203/overview), [Act 4 route](https://www.definitivguide.com/docs/PoE2/Act%204/overview).

## Build-aware leveling

Open **Settings → Build** and choose a local PoE 2 `.build` export. If the guide offers multiple leveling stages, import the files together and select the stage you want. Waymark shows skills, supports, passive recommendations and gear notes for the selected level. **Preview level** shows the next level with new guidance. Imported files and level preferences are stored locally. [Build Planner format](https://www.pathofexile.com/developer/docs/game#buildplanner), [Path of Building export](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/dev/src/Classes/ImportTab.lua), [Mobalytics exports](https://mobalytics.gg/poe-2/guides/build-files).

For automatic level tracking, enter your in-game character name and enable **Use character level from Client.txt**. Waymark looks for that character's English level-up messages in the last 1 MiB of the selected log, then follows new messages as they arrive. Set a manual level if a matching record is unavailable or if you want to read another part of the guide. The game log supplies the character name and level. The league label organizes your saved checklists and manual preferences. Gem, passive and campaign boss labels use the [0.5.5.10 ExileData export](https://data.exiledata.dev/poe2/0.5.5.10/).

## Project layout

| Path | Responsibility |
| --- | --- |
| `crates/log-core/src/tail.rs` | Incremental file reading, file identity, UTF-8 line framing and rotation |
| `crates/log-core/src/parser.rs` | Message recognition, duplicate suppression and transition refinement |
| `crates/log-core/tests/`, `fixtures/` | Portable filesystem tests and synthetic log samples |
| `src-tauri/src/desktop/watcher.rs` | Live and fixture sources, polling and event publication |
| `src-tauri/src/desktop/window.rs` | Win32 window identification, DPI conversion, placement and passive visibility |
| `src-tauri/src/desktop/{discovery,settings,mod}.rs` | Install discovery, local persistence, commands, hotkey and tray |
| `src/native/` | TypeScript IPC contract and Tauri adapter |
| `src/state/` | Zustand snapshot ordering, zone lookup, display labels and Vitest tests |
| `src/views/`, `src/data/areas.json` | React presentation and the small external area reference |
| `docs/windows-validation.md` | Manual test procedure and integration limits |

## Detection and IPC

The tailer polls approximately every 200 ms and catches up immediately when a 32 KiB read fills. On first attach to an existing file it starts at EOF and discards the continuation of any pre-existing partial line. A previously missing file, replacement or truncated generation starts at byte zero. It compares identities of open handles, drains a rotated handle to observed EOF and drops unfinished records at a generation boundary. A 64-byte checkpoint detects common truncate-and-regrow cases between polls. Only new bytes enter the decoder. Incomplete UTF-8 stays buffered until LF, CRLF is accepted, and malformed or oversized lines are skipped. A line is limited to 16 KiB.

The first supported marker emits a zone change immediately. Repeated observations of the same fields are suppressed. A complementary area/scene marker within 12 seconds fills in the existing transition. When both records have client elapsed-millisecond fields, those must also be within 12 seconds. The detector accepts either order. Pairing is heuristic because the two record types carry no shared transition identifier. Unsupported messages leave the last observation intact.

The native channel is `waymark://state-v1`. Every payload is a full snapshot with `version: 1`, a process-local increasing `revision`, and a typed `kind`. Consumers subscribe first, request the current snapshot and keep the highest revision. `zoneChanged` represents a new detected zone, `zoneUpdated` enriches the current one, and `snapshot` carries other state changes or a switch between displayed sources. Replay status identifies fixture observations. Each zone contains nullable `areaId`, `name` and `level`. The complete shape is in `src/native/contract.ts`. No raw chat or log lines cross the WebView boundary.

## Automated checks

```powershell
npm ci
npm test
npm run build
cargo fmt --all -- --check
cargo test --locked -p waymark-log
cargo clippy --locked -p waymark-log --all-targets -- -D warnings
```

On a Windows development machine, also run the desktop checks.

```powershell
cargo clippy --locked -p waymark -- -D warnings
npm run tauri -- build
```

The parser, file tests, Vitest tests and frontend build can run on Linux or macOS. Running Vite alone serves the frontend assets. Native observation, settings and visibility require the Tauri host.

## Integration boundary

Waymark reads the selected log, installation metadata and local settings. It queries OS window geometry and manages its own windows. It does not access game memory, inject code, send game input, capture the screen, or connect to a backend. This is an independent, unofficial PoC. [Windows integration tests and limitations](docs/windows-validation.md)
