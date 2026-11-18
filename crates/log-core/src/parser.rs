use serde::Serialize;
use std::time::Duration;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Zone {
    pub area_id: Option<String>,
    pub name: Option<String>,
    pub level: Option<u16>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Record {
    Area { id: String, level: u16 },
    Scene(String),
}

fn safe_value(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 192 && !value.chars().any(|c|
        c.is_control() || matches!(c, '\u{061c}' | '\u{200e}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'))
}

fn client_body(line: &str) -> Option<(&str, &str)> {
    let (header, body) = line.trim_end_matches(['\n', '\r']).split_once("] ")?;
    let tag = header.rsplit_once('[')?.1;
    let (severity, client) = tag.split_once(" Client ")?;
    client.parse::<u32>().ok()?;
    Some((severity, body))
}

/// A system level-up for the named character. Chat and area levels are separate records.
pub fn character_level(line: &str, character: &str) -> Option<u8> {
    let ("INFO", body) = client_body(line)? else {
        return None;
    };
    let (name, rest) = body.strip_prefix(": ")?.split_once(" (")?;
    if !name.eq_ignore_ascii_case(character) || !safe_value(name) {
        return None;
    }
    let (class, level) = rest.split_once(") is now level ")?;
    let level = level.strip_suffix('.').unwrap_or(level);
    if !safe_value(class)
        || class.contains(['(', ')'])
        || !level.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    level.parse().ok().filter(|value| (1..=100).contains(value))
}

/// Recognize only a complete message body. Marker-like strings in chat are ignored.
pub fn parse(line: &str) -> Option<Record> {
    let line = line.trim_end_matches(['\n', '\r']);
    let body = if line.starts_with("Generating ") || line.starts_with("[SCENE]") {
        line
    } else {
        let (severity, body) = client_body(line)?;
        if !matches!(severity, "INFO" | "DEBUG" | "WARN" | "TRACE") {
            return None;
        }
        body
    };
    if let Some(tail) = body.strip_prefix("Generating level ") {
        let (level, tail) = tail.split_once(" area \"")?;
        let (id, suffix) = tail.split_once('"')?;
        if !suffix.is_empty() && !suffix.starts_with(" with seed ") {
            return None;
        }
        if !safe_value(id) {
            return None;
        }
        return Some(Record::Area {
            id: id.into(),
            level: level.parse().ok()?,
        });
    }
    let name = body
        .strip_prefix("[SCENE] Set Source [")?
        .strip_suffix(']')?;
    (safe_value(name) && !name.contains(['[', ']'])).then(|| Record::Scene(name.into()))
}

/// A complementary marker enriches a transition without counting another change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Detection {
    Changed(Zone),
    Updated(Zone),
}
impl Detection {
    pub fn zone(&self) -> &Zone {
        match self {
            Self::Changed(z) | Self::Updated(z) => z,
        }
    }
}

const PAIR_WINDOW: Duration = Duration::from_secs(12);

struct Transition {
    zone: Zone,
    observed: Duration,
    client_tick: Option<u64>,
}

#[derive(Default)]
pub struct Detector {
    last: Option<Transition>,
}

impl Detector {
    pub fn line(&mut self, line: &str, now: Duration) -> Option<Detection> {
        let record = parse(line)?;
        let tick = line
            .split_ascii_whitespace()
            .nth(2)
            .and_then(|s| s.parse::<u64>().ok());
        if let Some(last) = &mut self.last {
            let repeated = match &record {
                Record::Area { id, level } => {
                    last.zone.area_id.as_ref() == Some(id) && last.zone.level == Some(*level)
                }
                Record::Scene(name) => last.zone.name.as_ref() == Some(name),
            };
            if repeated {
                return None;
            }
            // Use client elapsed milliseconds as well when present: one read may contain a backlog.
            let nearby = now.saturating_sub(last.observed) <= PAIR_WINDOW
                && tick.zip(last.client_tick).is_none_or(|(new, old)| {
                    new.checked_sub(old)
                        .is_some_and(|dt| Duration::from_millis(dt) <= PAIR_WINDOW)
                });
            if nearby {
                match &record {
                    Record::Area { id, level } if last.zone.area_id.is_none() => {
                        last.zone.area_id = Some(id.clone());
                        last.zone.level = Some(*level);
                        return Some(Detection::Updated(last.zone.clone()));
                    }
                    Record::Scene(name) if last.zone.name.is_none() => {
                        last.zone.name = Some(name.clone());
                        return Some(Detection::Updated(last.zone.clone()));
                    }
                    _ => {}
                }
            }
        }
        let zone = match record {
            Record::Area { id, level } => Zone {
                area_id: Some(id),
                name: None,
                level: Some(level),
            },
            Record::Scene(name) => Zone {
                area_id: None,
                name: Some(name),
                level: None,
            },
        };
        self.last = Some(Transition {
            zone: zone.clone(),
            observed: now,
            client_tick: tick,
        });
        Some(Detection::Changed(zone))
    }
}
