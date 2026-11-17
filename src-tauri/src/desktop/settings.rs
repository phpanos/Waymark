use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Corner {
    TopLeft,
    #[default]
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub corner: Corner,
    pub inset_x: u16,
    pub inset_y: u16,
    pub follow_game: bool,
}
impl Default for Placement {
    fn default() -> Self {
        Self {
            corner: Corner::TopRight,
            inset_x: 20,
            inset_y: 20,
            follow_game: true,
        }
    }
}
impl Placement {
    pub fn validate(&self) -> Result<(), String> {
        if self.inset_x > 4096 || self.inset_y > 4096 {
            return Err("Insets must be between 0 and 4096.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub log_path: Option<PathBuf>,
    pub placement: Placement,
}

pub fn load(path: &Path) -> (Settings, Option<String>) {
    match fs::read(path) {
        Ok(bytes) => match serde_json::from_slice::<Settings>(&bytes) {
            Ok(s) if s.placement.validate().is_ok() => (s, None),
            _ => (
                Settings::default(),
                Some("Saved settings could not be read. Using defaults.".into()),
            ),
        },
        Err(e) if e.kind() == io::ErrorKind::NotFound => (Settings::default(), None),
        Err(e) => (
            Settings::default(),
            Some(format!("Settings read failed: {e}")),
        ),
    }
}
pub fn save(path: &Path, settings: &Settings) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("Missing settings directory"))?;
    fs::create_dir_all(parent)?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent)?;
    tmp.write_all(&serde_json::to_vec_pretty(settings)?)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path)?;
    Ok(())
}
