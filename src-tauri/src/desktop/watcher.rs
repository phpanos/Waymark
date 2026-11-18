use super::{apply_overlay, discovery, Kind, Runtime, Status};
use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
use waymark_log::{
    parser::{Detection, Detector, Zone},
    tail::{Health, Item, Lines, Tail},
};

const FIXTURE: &[u8] = include_bytes!("../../../fixtures/transitions.log");
const POLL: Duration = Duration::from_millis(200);

struct Replay {
    offset: usize,
    next: Duration,
    detector: Detector,
    lines: Lines,
    zone: Option<Zone>,
}
impl Replay {
    fn new(now: Duration) -> Self {
        Self {
            offset: 0,
            next: now,
            detector: Detector::default(),
            lines: Lines::default(),
            zone: None,
        }
    }
    fn step(&mut self, now: Duration, events: &mut Vec<Detection>) -> Status {
        if self.offset < FIXTURE.len() && now >= self.next {
            let remaining = &FIXTURE[self.offset..];
            let len = remaining
                .iter()
                .position(|&b| b == b'\n')
                .map_or(remaining.len(), |n| n + 1);
            self.lines.push(&remaining[..len], |line| {
                if let Some(d) = self.detector.line(line, now) {
                    events.push(d);
                }
            });
            self.offset += len;
            self.next = now + Duration::from_millis(500);
        }
        if let Some(z) = events.last() {
            self.zone = Some(z.zone().clone());
        }
        if self.offset == FIXTURE.len() && now >= self.next {
            Status::ReplayComplete
        } else {
            Status::Replaying
        }
    }
}

pub(super) fn run(app: AppHandle, hwnd: isize) {
    let state = app.state::<Runtime>();
    let start = Instant::now();
    let mut requested: Option<PathBuf> = None;
    let mut path: Option<PathBuf> = None;
    let mut tail: Option<Tail> = None;
    let mut detector = Detector::default();
    let mut next_search = Duration::ZERO;
    let mut live_zone = None;
    let mut replay = None;
    let mut session = 0;
    loop {
        let now = start.elapsed();
        let s = state.read();
        let manual = &s.settings.log_path;
        let changed = manual != &requested;
        if changed || (manual.is_none() && now >= next_search) {
            let next = manual.clone().or_else(discovery::discover);
            if next != path {
                tail = next.as_deref().map(Tail::new);
                detector = Detector::default();
                live_zone = None;
                path = next;
            }
            requested.clone_from(manual);
            next_search = now + Duration::from_secs(5);
        }
        let mut events = vec![];
        let mut again = false;
        let (live_status, error) = if let Some(tail) = &mut tail {
            match tail.poll(|item| match item {
                Item::Line(line) => {
                    if let Some(d) = detector.line(line, now) {
                        events.push(d);
                    }
                }
                Item::Reset => {
                    detector = Detector::default();
                }
            }) {
                Ok((h, more)) => {
                    again = more;
                    (
                        if h == Health::Watching {
                            Status::Watching
                        } else {
                            Status::Missing
                        },
                        None,
                    )
                }
                Err(e) => (Status::ReadError, Some(e.to_string())),
            }
        } else {
            (Status::Searching, None)
        };
        if let Some(z) = events.last() {
            live_zone = Some(z.zone().clone());
        }

        if session != s.replay_session {
            session = s.replay_session;
            replay = (session != 0).then(|| Replay::new(now));
        }
        let (zone, status, error) = match &mut replay {
            Some(r) => {
                events.clear();
                let status = r.step(now, &mut events);
                (r.zone.clone(), status, None)
            }
            None => (live_zone.clone(), live_status, error),
        };
        // Preserve every accepted transition even when one disk read contains several.
        for detection in events {
            let (kind, z) = match detection {
                Detection::Changed(z) => (Kind::ZoneChanged, z),
                Detection::Updated(z) => (Kind::ZoneUpdated, z),
            };
            state.mutate(&app, kind, |v| {
                if v.replay_session != session || v.settings.log_path != requested {
                    return false;
                }
                v.zone = Some(z);
                v.status = status;
                v.active_path.clone_from(&path);
                v.log_error.clone_from(&error);
                true
            });
        }
        state.mutate(&app, Kind::Snapshot, |v| {
            if v.replay_session != session || v.settings.log_path != requested {
                return false;
            }
            if v.zone == zone
                && v.status == status
                && v.active_path == path
                && v.log_error == error
            {
                return false;
            }
            v.zone = zone;
            v.status = status;
            v.active_path.clone_from(&path);
            v.log_error = error;
            true
        });
        if !again {
            let handle = app.clone();
            if let Err(e) = app.run_on_main_thread(move || apply_overlay(&handle, hwnd)) {
                eprintln!("Overlay placement dispatch failed: {e}");
            }
            thread::sleep(POLL);
        }
    }
}
