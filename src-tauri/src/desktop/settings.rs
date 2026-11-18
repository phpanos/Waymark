use super::act_timer::ActTiming;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CampaignProfile {
    pub character: String,
    pub league: String,
    pub completed: BTreeSet<String>,
    pub town_rewards: BTreeMap<String, TownRewardStatus>,
    pub reached_clearfell: bool,
    pub(super) act_timing: ActTiming,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TownRewardStatus {
    Pinned,
    Claimed,
    Dismissed,
}

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
    pub league_start: bool,
    pub profiles: Vec<CampaignProfile>,
    pub active_profile: Option<usize>,
    pub default_completed: BTreeSet<String>,
    pub default_town_rewards: BTreeMap<String, TownRewardStatus>,
    pub default_reached_clearfell: bool,
    pub(super) default_act_timing: ActTiming,
}

impl Settings {
    pub fn campaign_profile(&self) -> Option<&CampaignProfile> {
        self.profiles.get(self.active_profile?)
    }

    pub fn reached_clearfell(&self) -> bool {
        self.campaign_profile()
            .map_or(self.default_reached_clearfell, |profile| profile.reached_clearfell)
    }

    pub fn record_clearfell(&mut self) {
        match self.active_profile {
            Some(index) => {
                if let Some(profile) = self.profiles.get_mut(index) {
                    profile.reached_clearfell = true;
                }
            }
            None => self.default_reached_clearfell = true,
        }
    }

    pub(super) fn act_timing(&self) -> &ActTiming {
        self.campaign_profile()
            .map_or(&self.default_act_timing, |profile| &profile.act_timing)
    }

    pub(super) fn act_timing_for(&mut self, profile: Option<usize>) -> Option<&mut ActTiming> {
        match profile {
            Some(index) => self.profiles.get_mut(index).map(|item| &mut item.act_timing),
            None => Some(&mut self.default_act_timing),
        }
    }

    pub fn completed_for(&mut self, profile: Option<usize>) -> Option<&mut BTreeSet<String>> {
        if self.active_profile != profile {
            return None;
        }
        match profile {
            Some(index) => self.profiles.get_mut(index).map(|item| &mut item.completed),
            None => Some(&mut self.default_completed),
        }
    }

    pub fn town_rewards_for(
        &mut self,
        profile: Option<usize>,
    ) -> Option<&mut BTreeMap<String, TownRewardStatus>> {
        if self.active_profile != profile {
            return None;
        }
        match profile {
            Some(index) => self
                .profiles
                .get_mut(index)
                .map(|item| &mut item.town_rewards),
            None => Some(&mut self.default_town_rewards),
        }
    }
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
