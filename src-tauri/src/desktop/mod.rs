mod discovery;
mod drag;
mod settings;
mod watcher;
mod window;

use serde::Serialize;
use settings::{CampaignProfile, Placement, Settings};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU16, Ordering},
        Mutex,
    },
};
use tauri::{
    menu::MenuBuilder, tray::TrayIconBuilder, AppHandle, Emitter, Manager, State, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use waymark_log::parser::Zone;

const CHANNEL: &str = "waymark://state-v1";

#[derive(Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum Status {
    Searching,
    Watching,
    Missing,
    ReadError,
    Replaying,
    ReplayComplete,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
enum Kind {
    Snapshot,
    ZoneChanged,
    ZoneUpdated,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    version: u8,
    revision: u64,
    kind: Kind,
    settings: Settings,
    active_path: Option<PathBuf>,
    status: Status,
    zone: Option<Zone>,
    character_level: Option<u8>,
    visible: bool,
    details_expanded: bool,
    anchored: bool,
    log_error: Option<String>,
    window_error: Option<String>,
    notices: Vec<String>,
    replay_session: u32,
}

struct Runtime {
    snapshot: Mutex<Snapshot>,
    overlay_height: AtomicU16,
    file: PathBuf,
}
impl Runtime {
    fn read(&self) -> Snapshot {
        self.snapshot.lock().unwrap().clone()
    }
    fn mutate(&self, app: &AppHandle, kind: Kind, f: impl FnOnce(&mut Snapshot) -> bool) {
        let mut s = self.snapshot.lock().unwrap();
        if f(&mut s) {
            s.kind = kind;
            s.revision += 1;
            let event = s.clone();
            drop(s);
            if let Err(e) = app.emit(CHANNEL, event) {
                eprintln!("UI event delivery failed: {e}");
            }
        }
    }
    fn edit(&self, app: &AppHandle, f: impl FnOnce(&mut Settings)) -> Result<(), String> {
        let mut result = Ok(());
        self.mutate(app, Kind::Snapshot, |s| {
            let mut next = s.settings.clone();
            f(&mut next);
            if next == s.settings {
                return false;
            }
            if let Err(e) = settings::save(&self.file, &next) {
                result = Err(e.to_string());
                return false;
            }
            if next.active_profile != s.settings.active_profile
                || next.log_path != s.settings.log_path
            {
                s.character_level = None;
            }
            s.settings = next;
            true
        });
        result
    }
}

#[tauri::command]
fn snapshot(state: State<'_, Runtime>) -> Snapshot {
    state.read()
}

#[tauri::command]
fn set_placement(
    app: AppHandle,
    state: State<'_, Runtime>,
    placement: Placement,
) -> Result<(), String> {
    placement.validate()?;
    if drag::active() {
        return Err("Finish moving the overlay first.".into());
    }
    state.edit(&app, |s| s.placement = placement)
}

// Apply geometry on the UI thread so a watcher poll cannot undo an active drag.
fn apply_overlay(app: &AppHandle, hwnd: isize) {
    if drag::active() {
        return;
    }
    let state = app.state::<Runtime>();
    let s = state.read();
    let result = app.state::<Mutex<window::Tracker>>().lock().unwrap().apply(
        hwnd,
        s.settings.placement,
        s.visible,
        state.overlay_height.load(Ordering::Relaxed),
    );
    let (anchored, error) = match result {
        Ok(anchored) => (anchored, None),
        Err(e) => (false, Some(e.to_string())),
    };
    state.mutate(app, Kind::Snapshot, |s| {
        if s.anchored == anchored && s.window_error == error {
            return false;
        }
        s.anchored = anchored;
        s.window_error = error;
        true
    });
}

#[tauri::command]
fn set_overlay_height(window: WebviewWindow, state: State<'_, Runtime>, height: u16) {
    if window.label() == "overlay" {
        state
            .overlay_height
            .store(height.clamp(window::COMPACT_HEIGHT, 720), Ordering::Relaxed);
    }
}

fn toggle_details(app: &AppHandle) {
    app.state::<Runtime>().mutate(app, Kind::Snapshot, |state| {
        if !state.visible {
            return false;
        }
        state.details_expanded = !state.details_expanded;
        true
    });
}

fn save_drag_position(app: &AppHandle, hwnd: isize) -> Result<(), String> {
    let state = app.state::<Runtime>();
    let saved = state.read().settings.placement;
    let placement = app
        .state::<Mutex<window::Tracker>>()
        .lock()
        .unwrap()
        .capture(hwnd, saved)
        .map_err(|e| e.to_string())?;
    state.edit(app, |settings| settings.placement = placement)
}

fn report_drag_problem(app: &AppHandle, message: String) {
    app.state::<Runtime>().mutate(app, Kind::Snapshot, |state| {
        if state.notices.contains(&message) {
            return false;
        }
        state.notices.push(message);
        true
    });
}

#[tauri::command]
async fn pick_log(app: AppHandle) -> Result<(), String> {
    let path = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Choose the Path of Exile 2 Client.txt log")
            .add_filter("Client log", &["txt"])
            .pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(p) = path {
        if !p
            .file_name()
            .is_some_and(|v| v.eq_ignore_ascii_case("Client.txt"))
        {
            return Err("Choose the file named Client.txt in the game's logs folder.".into());
        }
        app.state::<Runtime>()
            .edit(&app, |s| s.log_path = Some(p))?;
    }
    Ok(())
}

#[tauri::command]
fn use_discovery(app: AppHandle, state: State<'_, Runtime>) -> Result<(), String> {
    state.edit(&app, |s| s.log_path = None)
}

#[tauri::command]
fn set_league_start(
    app: AppHandle,
    state: State<'_, Runtime>,
    enabled: bool,
) -> Result<(), String> {
    state.edit(&app, |settings| settings.league_start = enabled)
}

#[tauri::command]
fn set_campaign_profile(
    app: AppHandle,
    state: State<'_, Runtime>,
    character: String,
    league: String,
) -> Result<(), String> {
    let character = character.trim();
    let league = league.trim();
    if [character, league]
        .iter()
        .any(|value| value.len() > 128 || value.chars().any(char::is_control))
    {
        return Err("Use a character and league name of up to 128 bytes.".into());
    }
    state.edit(&app, |settings| {
        if character.is_empty() {
            settings.active_profile = None;
            return;
        }
        let index = settings.profiles.iter().position(|profile| {
            profile.character.eq_ignore_ascii_case(character)
                && profile.league.eq_ignore_ascii_case(league)
        });
        settings.active_profile = Some(index.unwrap_or_else(|| {
            settings.profiles.push(CampaignProfile {
                character: character.into(),
                league: league.into(),
                ..CampaignProfile::default()
            });
            settings.profiles.len() - 1
        }));
    })
}

#[tauri::command]
fn set_objective_completed(
    app: AppHandle,
    state: State<'_, Runtime>,
    profile: usize,
    objective: String,
    completed: bool,
) -> Result<(), String> {
    if objective.is_empty()
        || objective.len() > 96
        || !objective
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'_' | b'-'))
    {
        return Err("Invalid objective ID.".into());
    }
    if state.read().settings.active_profile != Some(profile) {
        return Err("Choose a campaign character before marking objectives.".into());
    }
    state.edit(&app, |settings| {
        if let Some(progress) = settings.profiles.get_mut(profile) {
            if completed {
                progress.completed.insert(objective);
            } else {
                progress.completed.remove(&objective);
            }
        }
    })
}

#[tauri::command]
fn replay_fixture(app: AppHandle, state: State<'_, Runtime>, enabled: bool) {
    state.mutate(&app, Kind::Snapshot, |s| {
        s.replay_session = if enabled {
            s.replay_session.wrapping_add(1).max(1)
        } else {
            0
        };
        true
    });
}

fn toggle(app: &AppHandle) {
    drag::cancel();
    app.state::<Runtime>().mutate(app, Kind::Snapshot, |s| {
        s.visible = !s.visible;
        true
    });
    if let Some(overlay) = app.get_webview_window("overlay") {
        if let Ok(hwnd) = overlay.hwnd() {
            apply_overlay(app, hwnd.0 as isize);
        }
    }
}
#[tauri::command]
fn toggle_overlay(app: AppHandle) {
    toggle(&app);
}

#[tauri::command]
fn close_settings(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("settings")
        .unwrap()
        .hide()
        .map_err(|e| e.to_string())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            snapshot,
            set_placement,
            pick_log,
            use_discovery,
            set_league_start,
            set_campaign_profile,
            set_objective_completed,
            replay_fixture,
            set_overlay_height,
            toggle_overlay,
            close_settings
        ])
        .setup(|app| {
            if let Err(e) = app.global_shortcut().on_shortcut("Alt+N", |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    toggle(app);
                }
            }) {
                app.state::<Runtime>()
                    .mutate(app.handle(), Kind::Snapshot, |state| {
                        state.notices.push(format!(
                            "Alt+N unavailable ({e}). Use the tray to toggle the overlay."
                        ));
                        true
                    });
            }
            let overlay = app.get_webview_window("overlay").unwrap();
            let hwnd = overlay.hwnd()?.0 as isize;
            window::enable_click_through(hwnd)?;
            if let Err(e) = drag::install(app.handle().clone(), hwnd) {
                report_drag_problem(
                    app.handle(),
                    format!("Alt-drag unavailable ({e}). Use the Position settings."),
                );
            }
            let menu = MenuBuilder::new(app)
                .text("settings", "Open settings…")
                .text("toggle", "Show / hide overlay")
                .text("details", "Expand / collapse overlay details")
                .separator()
                .text("quit", "Quit Waymark")
                .build()?;
            TrayIconBuilder::new()
                .tooltip("Waymark • Campaign overlay")
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "settings" => {
                        let w = app.get_webview_window("settings").unwrap();
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                    "toggle" => toggle(app),
                    "details" => toggle_details(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            let handle = app.handle().clone();
            std::thread::Builder::new()
                .name("waymark-watcher".into())
                .spawn(move || watcher::run(handle, hwnd))?;
            Ok(())
        })
        .on_window_event(|win, event| {
            if win.label() == "settings" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Unable to build Waymark");

    // Tauri creates configured windows on Ready, before calling our setup hook.
    // Register the command state before starting the event loop so even a cached page can read it.
    let file = app
        .path()
        .app_config_dir()
        .expect("Unable to resolve the Waymark settings directory")
        .join("settings-v1.json");
    let (settings, notice) = settings::load(&file);
    app.manage(Mutex::new(window::Tracker::default()));
    app.manage(Runtime {
        file,
        overlay_height: AtomicU16::new(window::COMPACT_HEIGHT),
        snapshot: Mutex::new(Snapshot {
            version: 1,
            revision: 0,
            kind: Kind::Snapshot,
            settings,
            active_path: None,
            status: Status::Searching,
            zone: None,
            character_level: None,
            visible: true,
            details_expanded: false,
            anchored: false,
            log_error: None,
            notices: notice.into_iter().collect(),
            window_error: None,
            replay_session: 0,
        }),
    });
    app.run(|_, event| {
        if let tauri::RunEvent::Exit = event {
            drag::uninstall();
        }
    });
}
