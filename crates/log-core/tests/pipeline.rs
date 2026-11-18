use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::Duration,
};
use waymark_log::{
    parser::{character_level, parse, Detection, Detector, Record, Zone},
    tail::{recent_character_level, Health, Item, Lines, Tail},
};

#[test]
fn parses_only_complete_supported_messages() {
    assert_eq!(
        parse("Generating level 42 area \"X\""),
        Some(Record::Area {
            id: "X".into(),
            level: 42
        })
    );
    assert_eq!(
        parse("[SCENE] Set Source [L'île]"),
        Some(Record::Scene("L'île".into()))
    );
    for line in [
        "[SCENE] Set Source []",
        "[SCENE] Set Source [bad",
        "[SCENE] Set Source [x] trailing",
        "Generating level N area \"x\"",
        "Generating level 0 area \"\"",
        "Generating level 3 area \"open",
        "x [INFO Client 2] #player: [SCENE] Set Source [spoof]",
        "[SCENE] Set Source [a\u{202e}b]",
    ] {
        assert_eq!(parse(line), None, "{line}");
    }
}

fn replay(input: &[u8]) -> Vec<Zone> {
    let mut lines = Lines::default();
    let mut detector = Detector::default();
    let mut out = vec![];
    let mut now = Duration::ZERO;
    for bytes in input.chunks(7) {
        lines.push(bytes, |line| {
            now += Duration::from_millis(250);
            match detector.line(line, now) {
                Some(Detection::Changed(z)) => out.push(z),
                Some(Detection::Updated(z)) => *out.last_mut().unwrap() = z,
                None => {}
            }
        });
    }
    out
}

#[test]
fn fixture_pairs_and_repeats_publish_one_event_per_zone() {
    let out = replay(include_bytes!("../../../fixtures/transitions.log"));
    assert_eq!(out.len(), 2);
    assert_eq!(
        serde_json::to_value(&out[0]).unwrap(),
        serde_json::json!({"areaId":"G1_1","name":"The Riverbank","level":1})
    );
    assert_eq!(out[1].area_id.as_deref(), Some("Fixture_Unknown_02"));
    assert_eq!(out[1].name, None);
    assert_eq!(
        replay(include_bytes!("../../../fixtures/scene-only.log")).len(),
        2
    );
}

#[test]
fn campaign_fixture_keeps_distinct_area_ids_and_scene_only_zones() {
    let zones = replay(include_bytes!("../../../fixtures/campaign-areas.log"));
    assert_eq!(
        zones
            .iter()
            .map(|zone| (zone.area_id.as_deref(), zone.name.as_deref()))
            .collect::<Vec<_>>(),
        [
            (Some("G1_1"), Some("The Riverbank")),
            (None, Some("Traitor's Passage")),
            (Some("G2_3a"), Some("The Halani Gates")),
            (Some("G2_3s"), Some("The Halani Gates")),
            (Some("G3_2_2"), Some("The Matlan Waterways")),
            (None, Some("Solitary Confinement")),
            (Some("G4_11_1a"), Some("Ngakanu")),
            (Some("G4_11_1b"), Some("Ngakanu")),
        ]
    );
}

#[test]
fn reads_only_named_character_level_up_messages() {
    let line = "2026/01/01 10:00:00 1000 a [INFO Client 42] : ExampleExile (Smith of Kitava) is now level 12.";
    assert_eq!(character_level(line, "exampleexile"), Some(12));
    assert_eq!(
        character_level(line.trim_end_matches('.'), "ExampleExile"),
        Some(12)
    );
    assert_eq!(character_level(line, "OtherExile"), None);
    for invalid in [
        line.replace(" : ", " #ExampleExile: "),
        line.replace("INFO", "DEBUG"),
        line.replace("12.", "101."),
        line.replace("12.", "12. trailing"),
        line.replace("12.", "+12"),
        "Generating level 12 area \"G1_2\"".into(),
    ] {
        assert_eq!(character_level(&invalid, "ExampleExile"), None, "{invalid}");
    }
}

#[test]
fn level_history_is_bounded_and_ignores_incomplete_lines() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Client.txt");
    let record =
        |name: &str, level: u8| format!("[INFO Client 42] : {name} (Warrior) is now level {level}");
    fs::write(&path, format!("{}\n", record("ExampleExile", 12))).unwrap();
    append(&path, &vec![b'z'; 1024 * 1024]);
    append(
        &path,
        format!("\n{}\n", record("OtherExile", 24)).as_bytes(),
    );
    assert_eq!(recent_character_level(&path, "ExampleExile").unwrap(), None);
    append(
        &path,
        format!(
            "{}\r\n{}",
            record("ExampleExile", 13),
            record("ExampleExile", 14)
        )
        .as_bytes(),
    );
    assert_eq!(
        recent_character_level(&path, "ExampleExile").unwrap(),
        Some(13)
    );
    append(&path, b"\n");
    assert_eq!(
        recent_character_level(&path, "ExampleExile").unwrap(),
        Some(14)
    );
}

#[test]
fn reverse_order_duplicates_and_reentry() {
    let out = replay(b"[SCENE] Set Source [A]\nGenerating level 1 area \"a\"\nGenerating level 1 area \"a\"\n[SCENE] Set Source [A]\n[SCENE] Set Source [B]\n[SCENE] Set Source [A]\n");
    assert_eq!(
        out.iter()
            .filter_map(|z| z.name.as_deref())
            .collect::<Vec<_>>(),
        ["A", "B", "A"]
    );
}

fn append(path: &Path, bytes: &[u8]) {
    OpenOptions::new()
        .append(true)
        .open(path)
        .unwrap()
        .write_all(bytes)
        .unwrap()
}
fn poll(t: &mut Tail) -> (Health, Vec<String>) {
    let mut out = vec![];
    let (state, _) = t
        .poll(|item| {
            out.push(match item {
                Item::Line(s) => s.into(),
                Item::Reset => "<reset>".into(),
            })
        })
        .unwrap();
    (state, out)
}

#[test]
fn starts_at_eof_completes_only_new_lines_and_detects_same_inode_rewrites() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("Client.txt");
    fs::write(&p, b"old\ncut").unwrap();
    let mut t = Tail::new(&p);
    assert!(poll(&mut t).1.is_empty());
    append(&p, b"off\nfresh\r");
    assert!(poll(&mut t).1.is_empty());
    append(&p, b"\n");
    assert_eq!(poll(&mut t).1, ["fresh"]);
    fs::write(&p, b"new\n").unwrap();
    assert_eq!(poll(&mut t).1, ["<reset>", "new"]);
    fs::write(&p, b"longer than before\n").unwrap();
    assert_eq!(poll(&mut t).1, ["<reset>", "longer than before"]);
}

#[test]
fn missing_rotation_drains_old_handle_and_drops_partial_across_generations() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("Client.txt");
    let mut t = Tail::new(&p);
    assert_eq!(poll(&mut t).0, Health::Missing);
    fs::write(&p, b"created\npar").unwrap();
    assert_eq!(poll(&mut t).1, ["created"]);
    let old = p.with_extension("old");
    fs::rename(&p, &old).unwrap();
    assert_eq!(poll(&mut t).0, Health::Missing);
    append(&old, b"tial\nabandoned");
    fs::write(&p, b"replacement\n").unwrap();
    assert_eq!(poll(&mut t).1, ["partial", "<reset>", "replacement"]);
}

#[test]
fn skips_invalid_utf8_and_oversized_records_then_recovers() {
    let mut lines = Lines::default();
    let mut out = vec![];
    lines.push(&vec![b'a'; 17000], |_| panic!());
    lines.push(b"\n\xff\nok\n", |s| out.push(s.to_owned()));
    assert_eq!(out, ["ok"]);
}

#[test]
fn delayed_scene_refines_existing_transition_and_backlog_respects_elapsed_ticks() {
    let mut d = Detector::default();
    let a = "2026/01/01 10:00:00 1000 a [DEBUG Client 9] Generating level 1 area \"X\"";
    let b = "2026/01/01 10:00:05 6000 a [INFO Client 9] [SCENE] Set Source [Crossing]";
    assert!(matches!(
        d.line(a, Duration::ZERO),
        Some(Detection::Changed(_))
    ));
    assert!(matches!(
        d.line(b, Duration::from_secs(5)),
        Some(Detection::Updated(_))
    ));
    assert_eq!(d.line(b, Duration::from_secs(6)), None);
    let mut d = Detector::default();
    d.line(a, Duration::ZERO);
    assert!(matches!(
        d.line(&b.replace("6000", "91000"), Duration::ZERO),
        Some(Detection::Changed(_))
    ));
}

#[test]
fn reads_appends_in_bounded_chunks_without_splitting_utf8_records() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Client.txt");
    fs::write(&path, []).unwrap();
    let mut tail = Tail::new(&path);
    poll(&mut tail);
    let line = "[SCENE] Set Source [Île du Nord]\r\n";
    append(&path, line.repeat(2500).as_bytes());
    let mut total = 0;
    let mut polls = 0;
    loop {
        let (_, more) = tail
            .poll(|item| {
                if let Item::Line(s) = item {
                    assert_eq!(s, line.trim_end());
                    total += 1;
                } else {
                    panic!("append incorrectly classified as a reset")
                }
            })
            .unwrap();
        polls += 1;
        if !more {
            break;
        }
    }
    assert!(polls > 1);
    assert_eq!(total, 2500);
}
