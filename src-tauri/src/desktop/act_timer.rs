use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};
use waymark_log::parser::Zone;

#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct ActTiming {
    pub current: Option<ActClock>,
    finished: BTreeMap<u8, u64>,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ActClock {
    pub act: u8,
    elapsed_ms: u64,
    pub started_at: Option<u64>,
}

impl ActClock {
    fn elapsed(&self, now: u64) -> u64 {
        self.elapsed_ms.saturating_add(
            self.started_at
                .map_or(0, |started| now.saturating_sub(started)),
        )
    }
}

impl ActTiming {
    pub fn toggle(&mut self, act: Option<u8>, now: u64) -> Result<(), String> {
        if self
            .current
            .as_ref()
            .is_some_and(|clock| clock.started_at.is_some())
        {
            self.pause(now);
        } else {
            let act = act.ok_or("Enter an Acts 1–4 area to start timing.")?;
            let clock = self.current.get_or_insert(ActClock {
                act,
                elapsed_ms: 0,
                started_at: None,
            });
            clock.started_at = Some(now);
        }
        Ok(())
    }

    pub fn pause(&mut self, now: u64) {
        if let Some(clock) = &mut self.current {
            clock.elapsed_ms = clock.elapsed(now);
            clock.started_at = None;
        }
    }

    pub fn advance(&mut self, act: u8, now: u64) {
        let Some(clock) = self.current.as_ref().filter(|clock| act > clock.act) else {
            return;
        };
        self.finished.insert(clock.act, clock.elapsed(now));
        self.current = Some(ActClock {
            act,
            elapsed_ms: 0,
            started_at: clock.started_at.map(|_| now),
        });
    }
}

pub(super) fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Deserialize)]
struct Area {
    id: String,
    name: String,
    act: u8,
}

pub(super) fn act_for_zone(zone: &Zone) -> Option<u8> {
    static AREAS: OnceLock<Vec<Area>> = OnceLock::new();
    let areas = AREAS.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/data/areas.json"))
            .expect("Read bundled campaign areas")
    });
    if let Some(id) = &zone.area_id {
        return areas
            .iter()
            .find(|area| &area.id == id)
            .map(|area| area.act);
    }
    fn scene_key(value: &str) -> String {
        let name = value.to_lowercase().replace('’', "'");
        name.split_whitespace()
            .enumerate()
            .filter_map(|(index, word)| (index > 0 || word != "the").then_some(word))
            .collect::<Vec<_>>()
            .join(" ")
    }
    let scene = scene_key(zone.name.as_deref()?);
    let mut matching = areas.iter().filter(|area| scene_key(&area.name) == scene);
    let act = matching.next()?.act;
    matching.all(|area| area.act == act).then_some(act)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pauses_resumes_and_archives_elapsed_time_on_forward_travel() {
        let mut timing = ActTiming::default();
        assert!(timing.toggle(None, 100).is_err());
        timing.toggle(Some(1), 100).unwrap();
        timing.toggle(None, 300).unwrap();
        assert_eq!(timing.current.as_ref().unwrap().elapsed(900), 200);
        timing.toggle(Some(1), 900).unwrap();
        timing.advance(2, 1_000);
        assert_eq!(timing.finished.get(&1), Some(&300));
        timing.advance(1, 1_100);
        assert_eq!(timing.current.as_ref().unwrap().act, 2);
        assert_eq!(timing.current.as_ref().unwrap().elapsed(1_100), 100);
    }

    #[test]
    fn stopped_timer_advances_to_zero_and_saved_times_round_trip() {
        let mut timing = ActTiming::default();
        timing.toggle(Some(3), 20).unwrap();
        timing.pause(120);
        timing.advance(4, 200);
        let saved = serde_json::to_string(&timing).unwrap();
        let restored: ActTiming = serde_json::from_str(&saved).unwrap();
        assert_eq!(restored.finished.get(&3), Some(&100));
        let clock = restored.current.unwrap();
        assert_eq!(clock.act, 4);
        assert_eq!(clock.elapsed(900), 0);
        assert_eq!(clock.started_at, None);
    }

    #[test]
    fn resolves_known_ids_and_shared_scene_names_without_guessing_from_level() {
        let mut zone = Zone {
            area_id: None,
            name: Some("the Halani Gates".into()),
            level: None,
        };
        assert_eq!(act_for_zone(&zone), Some(2));
        zone.area_id = Some("G3_town".into());
        assert_eq!(act_for_zone(&zone), Some(3));
        zone.area_id = Some("unknown".into());
        assert_eq!(act_for_zone(&zone), None);
    }
}
