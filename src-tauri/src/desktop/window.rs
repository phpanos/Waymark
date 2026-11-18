use super::settings::{Corner, Placement};
use std::{io, mem::size_of};
use windows_sys::Win32::{
    Foundation::{GetLastError, SetLastError, HWND, POINT, RECT},
    Graphics::Gdi::{
        ClientToScreen, GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
    },
    UI::{
        HiDpi::{GetDpiForMonitor, GetDpiForWindow, MDT_EFFECTIVE_DPI},
        Input::KeyboardAndMouse::{GetAsyncKeyState, ReleaseCapture, VK_LBUTTON, VK_RBUTTON},
        WindowsAndMessaging::*,
    },
};

pub fn set_click_through(hwnd: isize, enabled: bool) -> io::Result<()> {
    // Keep the overlay layered and leave its visibility under Tracker's control.
    // Tao's cursor-ignore setter rewrites both window styles and can hide the overlay.
    unsafe {
        let hwnd = hwnd as HWND;
        SetLastError(0);
        let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        if style == 0 && GetLastError() != 0 {
            return Err(io::Error::last_os_error());
        }
        let layered = style | WS_EX_LAYERED as i32;
        let next = if enabled {
            layered | WS_EX_TRANSPARENT as i32
        } else {
            layered & !(WS_EX_TRANSPARENT as i32)
        };
        if next != style {
            SetLastError(0);
            if SetWindowLongW(hwnd, GWL_EXSTYLE, next) == 0 && GetLastError() != 0 {
                return Err(io::Error::last_os_error());
            }
        }
        Ok(())
    }
}

pub fn start_drag(hwnd: isize) -> io::Result<()> {
    unsafe {
        let button = if GetSystemMetrics(SM_SWAPBUTTON) == 0 {
            VK_LBUTTON
        } else {
            VK_RBUTTON
        };
        if GetAsyncKeyState(i32::from(button)) >= 0 {
            return Ok(());
        }
        let mut cursor = POINT::default();
        if GetCursorPos(&mut cursor) == 0 {
            return Err(io::Error::last_os_error());
        }
        // The caption message packs signed screen coordinates into its low and high words.
        let coords = u32::from(cursor.x as u16) | (u32::from(cursor.y as u16) << 16);
        ReleaseCapture();
        if PostMessageW(hwnd as HWND, WM_NCLBUTTONDOWN, HTCAPTION as usize, coords as isize) == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

pub fn cancel_drag(hwnd: isize) {
    unsafe { SendMessageW(hwnd as HWND, WM_CANCELMODE, 0, 0) };
}

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

struct Anchor {
    rect: RECT,
    dpi: i32,
    width: i32,
    height: i32,
    game: bool,
}

impl Anchor {
    fn pixels(&self, dip: u16) -> i32 {
        (i32::from(dip) * self.dpi + 48) / 96
    }

    fn inset(&self, pixels: i32) -> u16 {
        let dpi = i64::from(self.dpi);
        ((i64::from(pixels) * 96 + dpi / 2) / dpi).min(4096) as u16
    }

    fn origin(&self, p: Placement) -> (i32, i32) {
        let r = self.rect;
        let dx = self.pixels(p.inset_x).min(r.right - r.left - self.width);
        let dy = self.pixels(p.inset_y).min(r.bottom - r.top - self.height);
        let x = match p.corner {
            Corner::TopLeft | Corner::BottomLeft => r.left + dx,
            _ => r.right - self.width - dx,
        };
        let y = match p.corner {
            Corner::TopLeft | Corner::TopRight => r.top + dy,
            _ => r.bottom - self.height - dy,
        };
        (x, y)
    }
}

impl Tracker {
    fn anchor(&mut self, follow_game: bool) -> io::Result<Anchor> {
        // HWNDs are borrowed OS identifiers; failed/stale lookups fall back to the work area.
        unsafe {
            let mut bounds = None;
            if follow_game {
                let fg = GetForegroundWindow();
                bounds = game_bounds(fg);
                if bounds.is_some() {
                    self.game = fg as isize;
                } else {
                    bounds = game_bounds(self.game as HWND);
                }
            }
            let game = bounds.is_some();
            let (rect, dpi) = match bounds {
                Some(b) => b,
                None => primary_bounds()?,
            };
            let dpi = dpi.max(96) as i32;
            Ok(Anchor {
                rect,
                dpi,
                width: ((328 * dpi + 48) / 96).min(rect.right - rect.left),
                height: ((172 * dpi + 48) / 96).min(rect.bottom - rect.top),
                game,
            })
        }
    }

    pub fn capture(&mut self, hwnd: isize, saved: Placement) -> io::Result<Placement> {
        let anchor = self.anchor(saved.follow_game)?;
        let mut actual = RECT::default();
        if unsafe { GetWindowRect(hwnd as HWND, &mut actual) } == 0 {
            return Err(io::Error::last_os_error());
        }
        if (actual.left, actual.top) == anchor.origin(saved) {
            return Ok(saved);
        }
        let r = anchor.rect;
        let x = actual.left.clamp(r.left, r.right - anchor.width);
        let y = actual.top.clamp(r.top, r.bottom - anchor.height);
        let (left, right) = (x - r.left, r.right - anchor.width - x);
        let (top, bottom) = (y - r.top, r.bottom - anchor.height - y);
        let corner = match (left <= right, top <= bottom) {
            (true, true) => Corner::TopLeft,
            (false, true) => Corner::TopRight,
            (true, false) => Corner::BottomLeft,
            (false, false) => Corner::BottomRight,
        };
        Ok(Placement {
            corner,
            inset_x: anchor.inset(left.min(right)),
            inset_y: anchor.inset(top.min(bottom)),
            follow_game: saved.follow_game,
        })
    }

    /// All coordinates are physical desktop pixels. The webview layout and insets use DIPs.
    pub fn apply(&mut self, hwnd: isize, p: Placement, visible: bool) -> io::Result<bool> {
        let anchor = self.anchor(p.follow_game)?;
        let (w, h) = (anchor.width, anchor.height);
        let (x, y) = anchor.origin(p);
        unsafe {
            let hwnd = hwnd as HWND;
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
            Ok(anchor.game)
        }
    }
}
