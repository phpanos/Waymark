mod act_timer;
mod discovery;
mod drag;
mod mobalytics;
mod reward_click;
mod settings;
mod watcher;
mod window;

use reward_click::{RewardClick, RewardTarget, RewardTargets};
use serde::Serialize;
use settings::{
    CampaignProfile, Placement, Settings, TownRewardStatus, MAX_OVERLAY_HEIGHT, MIN_OVERLAY_HEIGHT,
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU16, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use waymark_log::parser::Zone;

const CHANNEL: &str = "waymark://state-v1";
const REWARD_ACTION: &str = "waymark://reward-action";
const ACT_TIMER_SHORTCUT: &str = "Alt+Shift+T";
const TOWN_REWARD_SHORTCUTS: [(&str, &str, &str); 5] = [
    ("Alt+Shift+N", "next", "Select next town reward"),
    ("Alt+Shift+D", "done", "Mark town reward claimed"),
    ("Alt+Shift+U", "undo", "Undo last town reward change"),
    ("Alt+Shift+P", "pin", "Pin reward for town"),
    ("Alt+Shift+X", "dismiss", "Dismiss pinned reward"),
];

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
    reward_recap: bool,
    update_check_request: u32,
    anchored: bool,
    log_error: Option<String>,
    window_error: Option<String>,
    notices: Vec<String>,
    replay_session: u32,
}

struct Runtime {
    snapshot: Mutex<Snapshot>,
    overlay_height: AtomicU16,
    reward_targets: Mutex<RewardTargets>,
    file: PathBuf,
}
impl Runtime {
    fn read(&self) -> Snapshot {
        self.snapshot.lock().unwrap().clone()
    }
    fn overlay_target_at(
        &self,
        rect: windows_sys::Win32::Foundation::RECT,
        dpi: u32,
        point: (i32, i32),
        alt: bool,
    ) -> Option<RewardClick> {
        let state = self.snapshot.try_lock().ok()?;
        if !state.visible
            || (!alt && (state.status != Status::Watching || state.replay_session != 0))
        {
            return None;
        }
        let targets = self.reward_targets.try_lock().ok()?;
        if targets.revision != state.revision {
            return None;
        }
        targets.hit(rect, dpi, point, alt)
    }
    fn mutate(&self, app: &AppHandle, kind: Kind, f: impl FnOnce(&mut Snapshot) -> bool) {
        self.update(app, |state| f(state).then_some(kind));
    }
    fn update(&self, app: &AppHandle, f: impl FnOnce(&mut Snapshot) -> Option<Kind>) {
        let mut s = self.snapshot.lock().unwrap();
        if let Some(kind) = f(&mut s) {
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
        self.try_edit(app, |settings| {
            f(settings);
            Ok(())
        })
        .map(|_| ())
    }
    fn try_edit(
        &self,
        app: &AppHandle,
        f: impl FnOnce(&mut Settings) -> Result<(), String>,
    ) -> Result<bool, String> {
        self.try_edit_with_snapshot(app, |_, settings| f(settings))
    }
    fn try_edit_with_snapshot(
        &self,
        app: &AppHandle,
        f: impl FnOnce(&Snapshot, &mut Settings) -> Result<(), String>,
    ) -> Result<bool, String> {
        let mut result = Ok(false);
        self.mutate(app, Kind::Snapshot, |s| {
            let mut next = s.settings.clone();
            if let Err(error) = f(s, &mut next) {
                result = Err(error);
                return false;
            }
            if next == s.settings {
                return false;
            }
            if next.active_profile != s.settings.active_profile {
                if let Some(timing) = next.act_timing_for(s.settings.active_profile) {
                    timing.pause(act_timer::timestamp());
                }
            }
            if let Err(e) = self.store_settings(s, next) {
                result = Err(e.to_string());
                return false;
            }
            result = Ok(true);
            true
        });
        result
    }
    fn store_settings(&self, state: &mut Snapshot, next: Settings) -> std::io::Result<()> {
        settings::save(&self.file, &next)?;
        if next.active_profile != state.settings.active_profile
            || next.log_path != state.settings.log_path
        {
            state.character_level = None;
        }
        state.settings = next;
        Ok(())
    }
    fn update_campaign_progress(&self, state: &mut Snapshot, zone: &Zone) -> bool {
        let is_clearfell = match zone.area_id.as_deref() {
            Some(id) => id == "G1_2",
            None => zone
                .name
                .as_deref()
                .is_some_and(|name| name.eq_ignore_ascii_case("Clearfell")),
        };
        let reached_clearfell = is_clearfell && !state.settings.reached_clearfell();
        let later_act = state
            .settings
            .act_timing()
            .current
            .as_ref()
            .and_then(|clock| act_timer::act_for_zone(zone).filter(|act| *act > clock.act));
        if !reached_clearfell && later_act.is_none() {
            return false;
        }
        let mut next = state.settings.clone();
        if reached_clearfell {
            next.record_clearfell();
        }
        if let Some(act) = later_act {
            if let Some(timing) = next.act_timing_for(next.active_profile) {
                timing.advance(act, act_timer::timestamp());
            }
        }
        if let Err(error) = self.store_settings(state, next) {
            let notice = format!("Campaign progress could not be saved ({error}).");
            if state.notices.contains(&notice) {
                return false;
            }
            state.notices.push(notice);
        }
        true
    }
}

#[tauri::command]
fn snapshot(state: State<'_, Runtime>) -> Snapshot {
    state.read()
}

#[tauri::command]
fn set_reward_targets(
    window: WebviewWindow,
    state: State<'_, Runtime>,
    revision: u64,
    width: u16,
    height: u16,
    targets: Vec<RewardTarget>,
) {
    if window.label() != "overlay"
        || targets.len() > 24
        || !(1..=settings::MAX_OVERLAY_WIDTH).contains(&width)
        || !(1..=MAX_OVERLAY_HEIGHT).contains(&height)
    {
        return;
    }
    let mut hitboxes = state.reward_targets.lock().unwrap();
    if revision >= hitboxes.revision {
        *hitboxes = RewardTargets {
            revision,
            width,
            height,
            targets,
        };
    }
}

#[tauri::command]
fn toggle_act_timer(app: AppHandle, state: State<'_, Runtime>) -> Result<(), String> {
    update_act_timer(&app, &state, None)
}

fn update_act_timer(app: &AppHandle, state: &Runtime, revision: Option<u64>) -> Result<(), String> {
    state
        .try_edit_with_snapshot(app, |snapshot, settings| {
            if revision.is_some_and(|revision| !snapshot.visible || revision != snapshot.revision) {
                return Ok(());
            }
            let act = if snapshot.status == Status::Watching && snapshot.replay_session == 0 {
                snapshot.zone.as_ref().and_then(act_timer::act_for_zone)
            } else {
                None
            };
            let timing = settings
                .act_timing_for(settings.active_profile)
                .ok_or("Choose a campaign profile first.")?;
            timing.toggle(act, act_timer::timestamp())
        })
        .map(|_| ())
}

fn toggle_timer_with_notice(app: &AppHandle, revision: Option<u64>) {
    if let Err(error) = update_act_timer(app, &app.state::<Runtime>(), revision) {
        report_notice(app, error);
    }
}

#[tauri::command]
fn set_placement(
    app: AppHandle,
    state: State<'_, Runtime>,
    placement: Placement,
) -> Result<(), String> {
    placement.validate()?;
    if drag::active() {
        return Err("Finish the overlay drag first.".into());
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
        state.overlay_height.store(
            height.clamp(MIN_OVERLAY_HEIGHT, MAX_OVERLAY_HEIGHT),
            Ordering::Relaxed,
        );
    }
}

fn toggle_details(app: &AppHandle) {
    app.state::<Runtime>().mutate(app, Kind::Snapshot, |state| {
        if !state.visible {
            return false;
        }
        if state.reward_recap {
            state.reward_recap = false;
        } else {
            state.details_expanded = !state.details_expanded;
        }
        true
    });
}

fn toggle_act_rewards(app: &AppHandle, revision: u64) {
    app.state::<Runtime>().mutate(app, Kind::Snapshot, |state| {
        if !state.visible || state.revision != revision {
            return false;
        }
        state.reward_recap = !state.reward_recap;
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

fn resize_overlay(
    app: &AppHandle,
    hwnd: isize,
    mut placement: Placement,
    origin: windows_sys::Win32::Foundation::RECT,
    axes: (bool, bool),
    commit: bool,
) -> Result<(), String> {
    let state = app.state::<Runtime>();
    let height = state.overlay_height.load(Ordering::Relaxed);
    if axes.1 && placement.min_height <= height {
        placement.min_height = MIN_OVERLAY_HEIGHT;
    }
    let tracker = app.state::<Mutex<window::Tracker>>();
    let mut tracker = tracker.lock().unwrap();
    let placement = tracker
        .resize_placement(placement, height, origin, axes)
        .map_err(|error| error.to_string())?;
    if commit {
        drop(tracker);
        return state.edit(app, |settings| settings.placement = placement);
    }
    tracker
        .apply(hwnd, placement, true, height)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn report_notice(app: &AppHandle, message: String) {
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
    profile: Option<usize>,
    objective: String,
    completed: bool,
) -> Result<bool, String> {
    if objective.is_empty()
        || objective.len() > 96
        || !objective
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'_' | b'-'))
    {
        return Err("Invalid objective ID.".into());
    }
    state.try_edit(&app, |settings| {
        let progress = settings
            .completed_for(profile)
            .ok_or("The active campaign profile changed.")?;
        if completed {
            progress.insert(objective);
        } else {
            progress.remove(&objective);
        }
        Ok(())
    })
}

#[tauri::command]
fn set_town_reward(
    app: AppHandle,
    state: State<'_, Runtime>,
    profile: Option<usize>,
    reward: String,
    expected: Option<TownRewardStatus>,
    status: Option<TownRewardStatus>,
) -> Result<bool, String> {
    if reward.is_empty()
        || reward.len() > 96
        || !reward
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err("Invalid town reward ID.".into());
    }
    state.try_edit(&app, |settings| {
        let rewards = settings
            .town_rewards_for(profile)
            .ok_or("The active campaign profile changed.")?;
        if rewards.get(&reward).copied() == expected {
            if let Some(status) = status {
                rewards.insert(reward, status);
            } else {
                rewards.remove(&reward);
            }
        }
        Ok(())
    })
}

fn send_reward_action(app: &AppHandle, action: &str) {
    let runtime = app.state::<Runtime>();
    let state = runtime.read();
    if state.visible {
        if let Err(error) = app.emit(REWARD_ACTION, action) {
            eprintln!("Reward shortcut delivery failed: {error}");
        }
    }
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

fn open_settings(app: &AppHandle) -> bool {
    let Some(window) = app.get_webview_window("settings") else {
        return false;
    };
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    if !window.is_maximized().unwrap_or(false) {
        let _ = window.center();
    }
    let _ = window.show();
    let _ = window.set_focus();
    true
}

pub fn run() {
    // A second launch can arrive before the Settings window is registered.
    let settings_requested = Arc::new(AtomicBool::new(false));
    let pending_settings = Arc::clone(&settings_requested);
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(move |app, _, _| {
            if !open_settings(app) {
                pending_settings.store(true, Ordering::Relaxed);
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            mobalytics::import_mobalytics_guide,
            snapshot,
            set_placement,
            pick_log,
            use_discovery,
            set_league_start,
            set_campaign_profile,
            set_objective_completed,
            set_town_reward,
            set_reward_targets,
            toggle_act_timer,
            replay_fixture,
            set_overlay_height,
            toggle_overlay,
            close_settings
        ])
        .setup(move |app| {
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
            for (shortcut, action, _) in TOWN_REWARD_SHORTCUTS {
                if let Err(error) =
                    app.global_shortcut()
                        .on_shortcut(shortcut, move |app, _, event| {
                            if event.state == ShortcutState::Pressed {
                                send_reward_action(app, action);
                            }
                        })
                {
                    report_notice(
                        app.handle(),
                        format!(
                            "{shortcut} unavailable ({error}). Use the Town rewards tray menu."
                        ),
                    );
                }
            }
            if let Err(error) =
                app.global_shortcut()
                    .on_shortcut(ACT_TIMER_SHORTCUT, |app, _, event| {
                        if event.state == ShortcutState::Pressed {
                            toggle_timer_with_notice(app, None);
                        }
                    })
            {
                report_notice(
                    app.handle(),
                    format!(
                        "{ACT_TIMER_SHORTCUT} unavailable ({error}). Use Act timer in Settings."
                    ),
                );
            }
            let overlay = app.get_webview_window("overlay").unwrap();
            let hwnd = overlay.hwnd()?.0 as isize;
            window::enable_click_through(hwnd)?;
            if let Err(e) = drag::install(app.handle().clone(), hwnd) {
                report_notice(
                    app.handle(),
                    format!("Alt-drag unavailable ({e}). Use the Position settings."),
                );
            }
            let mut rewards = SubmenuBuilder::new(app, "Town rewards");
            for (_, action, label) in TOWN_REWARD_SHORTCUTS {
                rewards = rewards.text(action, label);
            }
            let menu = MenuBuilder::new(app)
                .text("settings", "Open settings…")
                .text("check-updates", "Check for updates")
                .text("toggle", "Show / hide overlay")
                .text("details", "Expand / collapse overlay details")
                .text("act-timer", "Start / stop act timer")
                .item(&rewards.build()?)
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
                        open_settings(app);
                    }
                    "check-updates" => {
                        if open_settings(app) {
                            app.state::<Runtime>().mutate(app, Kind::Snapshot, |state| {
                                state.update_check_request =
                                    state.update_check_request.wrapping_add(1).max(1);
                                true
                            });
                        }
                    }
                    "toggle" => toggle(app),
                    "details" => toggle_details(app),
                    "act-timer" => toggle_timer_with_notice(app, None),
                    action @ ("next" | "done" | "undo" | "pin" | "dismiss") => {
                        send_reward_action(app, action)
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            let handle = app.handle().clone();
            std::thread::Builder::new()
                .name("waymark-watcher".into())
                .spawn(move || watcher::run(handle, hwnd))?;
            if settings_requested.swap(false, Ordering::Relaxed) {
                open_settings(app.handle());
            }
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
        overlay_height: AtomicU16::new(MIN_OVERLAY_HEIGHT),
        reward_targets: Mutex::new(RewardTargets::default()),
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
            reward_recap: false,
            update_check_request: 0,
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
