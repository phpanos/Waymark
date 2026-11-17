use super::settings::{Corner, Placement};
use std::{io, mem::size_of};
use windows_sys::Win32::{
    Foundation::{HWND, POINT, RECT},
    Graphics::Gdi::{
        ClientToScreen, GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
    },
    UI::{
        HiDpi::{GetDpiForMonitor, GetDpiForWindow, MDT_EFFECTIVE_DPI},
        WindowsAndMessaging::*,
    },
};

/// Only remember a handle observed in the foreground. Revalidate before every use.
#[derive(Default)]
pub struct Tracker {
    game: isize,
}

unsafe fn game_bounds(hwnd: HWND) -> Option<(RECT, u32)> {
    if hwnd.is_null() || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
        return None;
    }
    let mut title = [0u16; 128];
    let mut class = [0u16; 64];
    let n = GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32);
    let k = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
    if String::from_utf16_lossy(&title[..n as usize]) != "Path of Exile 2"
        || String::from_utf16_lossy(&class[..k as usize]) != "POEWindowClass"
    {
        return None;
    }
    let mut rc = RECT::default();
    let mut origin = POINT::default();
    if GetClientRect(hwnd, &mut rc) == 0
        || ClientToScreen(hwnd, &mut origin) == 0
        || rc.right <= 0
        || rc.bottom <= 0
    {
        return None;
    }
    Some((
        RECT {
            left: origin.x,
            top: origin.y,
            right: origin.x + rc.right,
            bottom: origin.y + rc.bottom,
        },
        GetDpiForWindow(hwnd),
    ))
}

unsafe fn primary_bounds() -> io::Result<(RECT, u32)> {
    let monitor = MonitorFromPoint(POINT::default(), MONITOR_DEFAULTTOPRIMARY);
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if GetMonitorInfoW(monitor, &mut info) == 0 {
        return Err(io::Error::last_os_error());
    }
    let (mut x, mut y) = (96, 96);
    let dpi = if GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut x, &mut y) == 0 {
        x
    } else {
        96
    };
    Ok((info.rcWork, dpi))
}

impl Tracker {
    /// All coordinates are physical desktop pixels. The webview layout and insets use DIPs.
    pub fn apply(&mut self, hwnd: isize, p: Placement, visible: bool) -> io::Result<bool> {
        // HWNDs are borrowed OS identifiers; failed/stale lookups fall back to the work area.
        unsafe {
            let hwnd = hwnd as HWND;
            let mut bounds = None;
            if p.follow_game {
                let fg = GetForegroundWindow();
                bounds = game_bounds(fg);
                if bounds.is_some() {
                    self.game = fg as isize;
                } else {
                    bounds = game_bounds(self.game as HWND);
                }
            }
            let anchored = bounds.is_some();
            let (r, dpi) = match bounds {
                Some(b) => b,
                None => primary_bounds()?,
            };
            let px = |dip: i32| (dip * dpi.max(96) as i32 + 48) / 96;
            let w = px(328).min(r.right - r.left);
            let h = px(172).min(r.bottom - r.top);
            let dx = px(p.inset_x.into()).min(r.right - r.left - w);
            let dy = px(p.inset_y.into()).min(r.bottom - r.top - h);
            let x = match p.corner {
                Corner::TopLeft | Corner::BottomLeft => r.left + dx,
                _ => r.right - w - dx,
            };
            let y = match p.corner {
                Corner::TopLeft | Corner::TopRight => r.top + dy,
                _ => r.bottom - h - dy,
            };
            let mut actual = RECT::default();
            let matches = GetWindowRect(hwnd, &mut actual) != 0
                && actual.left == x
                && actual.top == y
                && actual.right == x + w
                && actual.bottom == y + h;
            if !matches || (IsWindowVisible(hwnd) != 0) != visible {
                let flags = SWP_NOACTIVATE
                    | SWP_NOOWNERZORDER
                    | if visible {
                        SWP_SHOWWINDOW
                    } else {
                        SWP_HIDEWINDOW
                    };
                if SetWindowPos(hwnd, HWND_TOPMOST, x, y, w, h, flags) == 0 {
                    return Err(io::Error::last_os_error());
                }
            }
            Ok(anchored)
        }
    }
}
