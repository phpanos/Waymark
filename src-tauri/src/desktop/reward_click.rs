use serde::{Deserialize, Serialize};
use windows_sys::Win32::Foundation::RECT;

pub(super) const CHANNEL: &str = "waymark://reward-click";
pub(super) const ACT_TIMER_TARGET: &str = "act-timer";

#[derive(Clone, PartialEq, Eq, Serialize)]
pub(super) struct RewardClick {
    pub revision: u64,
    pub id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct RewardTarget {
    id: Option<String>,
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

#[derive(Default)]
pub(super) struct RewardTargets {
    pub revision: u64,
    pub height: u16,
    pub targets: Vec<RewardTarget>,
}

impl RewardTargets {
    pub fn hit(&self, rect: RECT, dpi: u32, (x, y): (i32, i32), alt: bool) -> Option<RewardClick> {
        if x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom {
            return None;
        }
        let scale = if dpi == 0 { 1.0 } else { f64::from(dpi) / 96.0 };
        if (f64::from(rect.bottom - rect.top) - f64::from(self.height) * scale).abs() > 2.0 {
            return None;
        }
        let x = f64::from(x - rect.left) / scale;
        let y = f64::from(y - rect.top) / scale;
        let target = self.targets.iter().find(|target| {
            (target.id.as_deref() == Some(ACT_TIMER_TARGET)) == alt
                && x >= target.left
                && x < target.right
                && y >= target.top
                && y < target.bottom
        })?;
        Some(RewardClick {
            revision: self.revision,
            id: target.id.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reward_target_respects_window_bounds_and_display_scale() {
        let mut targets = RewardTargets {
            revision: 8,
            height: 200,
            targets: vec![RewardTarget {
                id: Some("G1_2:1".into()),
                left: 16.0,
                top: 110.0,
                right: 36.0,
                bottom: 132.0,
            }],
        };
        let rect = RECT {
            left: -450,
            top: 200,
            right: 42,
            bottom: 500,
        };
        let hit = targets.hit(rect, 144, (-420, 380), false).unwrap();
        assert_eq!(hit.revision, 8);
        assert_eq!(hit.id.as_deref(), Some("G1_2:1"));
        assert!(targets.hit(rect, 144, (-420, 380), true).is_none());
        assert!(targets.hit(rect, 144, (-395, 380), false).is_none());
        assert!(targets.hit(rect, 144, (-420, 510), false).is_none());
        assert!(targets
            .hit(
                RECT {
                    bottom: 520,
                    ..rect
                },
                144,
                (-420, 380),
                false,
            )
            .is_none());

        targets.targets[0].id = Some(ACT_TIMER_TARGET.into());
        assert!(targets.hit(rect, 144, (-420, 380), false).is_none());
        let hit = targets.hit(rect, 144, (-420, 380), true).unwrap();
        assert_eq!(hit.id.as_deref(), Some(ACT_TIMER_TARGET));
    }
}
