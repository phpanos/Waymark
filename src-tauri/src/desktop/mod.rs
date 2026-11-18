mod discovery;
mod settings;
mod watcher;
mod window;

use serde::Serialize;
use settings::{Placement, Settings};
use std::{path::PathBuf, sync::Mutex};
use tauri::{menu::MenuBuilder, tray::TrayIconBuilder, AppHandle, Emitter, Manager, State};
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
    visible: bool,
    anchored: bool,
    log_error: Option<String>,
    window_error: Option<String>,
    notices: Vec<String>,
    replay_session: u32,
}

struct Runtime {
    snapshot: Mutex<Snapshot>,
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
    state.edit(&app, |s| s.placement = placement)
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
    app.state::<Runtime>().mutate(app, Kind::Snapshot, |s| {
        s.visible = !s.visible;
        true
    });
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
        .invoke_handler(tauri::generate_handler![
            snapshot,
            set_placement,
            pick_log,
            use_discovery,
            replay_fixture,
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
            overlay.set_ignore_cursor_events(true)?;
            let hwnd = overlay.hwnd()?.0 as isize;
            let menu = MenuBuilder::new(app)
                .text("settings", "Open settings…")
                .text("toggle", "Show / hide overlay")
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
    app.manage(Runtime {
        file,
        snapshot: Mutex::new(Snapshot {
            version: 1,
            revision: 0,
            kind: Kind::Snapshot,
            settings,
            active_path: None,
            status: Status::Searching,
            zone: None,
            visible: true,
            anchored: false,
            log_error: None,
            notices: notice.into_iter().collect(),
            window_error: None,
            replay_session: 0,
        }),
    });
    app.run(|_, _| {});
}
