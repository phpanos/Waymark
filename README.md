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

1. Launch Waymark. The compact window appears at the top right. Launch it again to open Settings in the running instance. The compass icon in the Windows notification area opens a menu with **Open settings**, **Show / hide overlay**, and **Quit Waymark**. Windows may put the icon under the overflow arrow.
2. Open PoE 2 in **Windowed Fullscreen** and enter a zone. **Connected** means the file is readable. **Awaiting zone** lasts until a supported *new* record arrives. Starting the app in the middle of a zone may require another transition.
3. In **Settings → Log source**, check the selected path. Auto-detection checks standalone install locations and Steam libraries, including custom libraries declared in `libraryfolders.vdf`. Use **Choose Client.txt…** for a custom install. **Use auto-detection** clears a manual selection.
4. **Alt+N** toggles the compact window globally. If Windows refuses registration, the settings window shows the error and the tray toggle remains available.
5. Hold **Alt** and drag the Waymark header. Release the mouse to save the position relative to the current anchor. Hold **Alt** and drag the marked bottom corner to resize the width. Release to save it. Ordinary clicks pass through to the game. To place the overlay with exact insets, open **Settings → Position**, choose a corner, enter the insets in device-independent pixels, and select **Save position**.
6. **Settings → Diagnostics → Replay fixture** runs the bundled synthetic log through the Rust decoder and detector. The status reads **Replaying** and then **Replay complete**. Expect **The Riverbank · Act 1** with **Reach Clearfell**, followed by **Fixture_Unknown_02** with no act or assigned objective. Real zone transitions continue updating the act timer and campaign progress during replay. Choose **Return to live** to display the latest live zone.

Settings are saved on change under `%APPDATA%\app.waymark.overlay\settings-v1.json`, using a temporary file and replacement. Placement and the manual path survive restart. Visibility, replay mode and the current zone are session state.

## Campaign objectives

The compact overlay puts the current objective and its known quest reward first. In Acts 1–4, returning to town directly from a quest area can show the reward, who to talk to, and what you need to bring or complete. Optional rewards are labeled. These reminders use the detected area transition. **Settings → Objectives** follows the detected zone by default. Search by area, boss, or reward, or use the act and area menus. Select **Use current zone** to resume following the game. [Campaign quest rewards](https://poe2db.tw/us/QuestRewards)

Choose a character and optionally name the league to save an independent reward checklist. Tick an optional objective to remove it from that character's compact overlay. Enable **League-start recommendations** to highlight lasting rewards such as passive points, Spirit, and Ascendancy unlocks.

When a quest area offers **Pin for town**, press **Alt+Shift+P** to save the gem reward reminder for the active character. In the matching town, press **Alt+Shift+N** to cycle between pins, **Alt+Shift+D** to mark one claimed, **Alt+Shift+X** to dismiss it, or **Alt+Shift+U** to undo the last claim or dismissal during this session. Pins survive area changes and restarts.

The bundled catalog uses area IDs checked against [ExileData's 0.5.5.10 export](https://data.exiledata.dev/poe2/0.5.5.10/world_areas.min.json) and hints based on PoE2DB's [Act 1](https://poe2db.tw/us/Act_1), [Act 2](https://poe2db.tw/us/Act_2), [Act 3](https://poe2db.tw/us/Act_3), and [Act 4](https://poe2db.tw/us/Act_4) references. Recommendations focus on permanent campaign rewards and don’t depend on the league mechanic.

**Settings → Objectives** also shows preparation tips for selected bosses and Ascendancy trials. The detected area level and any suggested character level are labeled separately. The suggested levels for a first trial are approximate and depend on your build and gear. [Campaign and trial preparation reference](https://buildmentor.org/new-player-guide/)

The overlay includes cues for town portals, waypoints, checkpoints, and returning to the ship. Open **Settings → Objectives** for the full shortcut instructions. [Act 1 route](https://mobalytics.gg/poe-2/guides/act-1-guide-guythatdies), [checkpoint routes for Act 1](https://www.definitivguide.com/docs/PoE2/Act%201/overview), [Act 2 route](https://www.definitivguide.com/docs/PoE2/Act%202/overview), [Act 3 route](https://www.definitivguide.com/docs/PoE2/Act%203/overview), [Act 4 route](https://www.definitivguide.com/docs/PoE2/Act%204/overview).

The overlay starts compact. It shows the zone’s route steps, travel shortcuts, and unfinished optional objectives together. Hold **Alt** and click the Waymark header for diagrams, detailed landmarks, and encounter tips. See **Settings → Controls** for the hotkeys. Orient yourself from the entrance, the world map, or the named landmarks as each instance can vary. [Act 1 layouts](https://mobalytics.gg/poe-2/guides/campaign-layout-act-1), [Act 2 layouts](https://mobalytics.gg/poe-2/guides/campaign-layout-act-2), [Act 3 layouts](https://mobalytics.gg/poe-2/guides/campaign-layout-act-3), [Act 4 layouts](https://mobalytics.gg/poe-2/guides/campaign-layout-act-4).

The expanded overlay shows objectives, waypoints, and exits for each cataloged area in Acts 1–4. The separate **Directions** diagram appears where there’s a known route or landmark to orient by. Arrows can refer to the screen, the world map, or the starting landmark printed on the diagram. In Clearfell, use the arrow that matches the Grelwood’s position on your world map. [Act 1 layout reference](https://mobalytics.gg/poe-2/guides/campaign-layout-act-1)

The quick directions for Acts 1–4 also draw on Keyson’s wall-following, junction, and landmark tips. [Keyson’s campaign layout guide](https://www.youtube.com/watch?v=kvxQ4YA5HRI)

Use the arrows beside the zone name to browse Waymark’s suggested story route, including town turn-ins and return visits. The guide uses one itinerary for branches you can visit in different orders, such as the Act 4 islands. Select **Live** to return to the detected zone. [Act 2 itinerary](https://www.definitivguide.com/docs/PoE2/Act%202/overview) · [Campaign walkthrough](https://pathofexile.gg/campaign/)

Press **Alt+Shift+T** to start or stop the act timer, or use **Settings → Act timer**. When Waymark detects a later act, it saves the previous act’s time and resets the clock for the new act. A running timer continues into the new act and through app restarts. Switching campaign profiles stops the previous profile’s clock. See **Settings → Act timer** for the active profile’s saved times.

The Waterways and island directions also use the [0.5.5 campaign walkthrough](https://pathofexile.gg/campaign/), the [0.5.5 Act 3 route](https://worstguidesever.com/poe2-act-3-campaign-guide/), and the [0.5.5 Act 4 guide](https://domistae.github.io/poe2-leveling/poe2_act4_guide.html).

The overlay shows how many permanent rewards remain in the current act. Use **Alt+Shift+R** to open the recap or return to the current objective. Click a checkbox to mark a reward done, and click **Undo** to restore the last completion in the current session. The recap shows the rewards, their zones, and directions to the highlighted reward. **Alt+Shift+N** selects the next reward, **Alt+Shift+D** marks it done, and **Alt+Shift+U** undoes the last completion. The **Campaign rewards** tray menu offers the same keyboard actions.

Quick completion updates the same checklist as Settings. It uses the selected character and league, or saves to a separate default checklist when no character is selected.

## Build-aware leveling

Open **Settings → Build** and choose a local PoE 2 `.build` export. If the guide offers multiple leveling stages, import the files together and select the stage you want. Waymark shows skills, supports, passive recommendations and gear notes for the selected level. **Preview level** shows the next level with new guidance. Imported files and level preferences are stored locally. [Build Planner format](https://www.pathofexile.com/developer/docs/game#buildplanner), [Path of Building export](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/blob/dev/src/Classes/ImportTab.lua), [Mobalytics exports](https://mobalytics.gg/poe-2/guides/build-files).

The overlay shows the next level with a scheduled gem, support, passive, or gear change from the selected build file. It advances as the character levels up and uses the same manual fallback as the Build tab. Expanding the overlay shows more changes scheduled for the same level. Builds without future level intervals have no upcoming cue.

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

Pull requests run frontend tests and a production build, the Rust format check and log-pipeline tests, and a Windows desktop build with workspace tests and the WebView2 smoke suite. [Pull request workflow](.github/workflows/pull-request-checks.yml)

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
