use super::{
    reward_click,
    settings::{
        Placement, MAX_OVERLAY_HEIGHT, MAX_OVERLAY_WIDTH, MIN_OVERLAY_HEIGHT, MIN_OVERLAY_WIDTH,
    },
    Runtime,
};
use std::{cell::RefCell, io, ptr::null_mut};
use tauri::{AppHandle, Emitter, Manager};
use windows_sys::Win32::{
    Foundation::{HWND, POINT, RECT},
    System::LibraryLoader::GetModuleHandleW,
    UI::{
        HiDpi::GetDpiForWindow,
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_MENU},
        WindowsAndMessaging::*,
    },
};

// The hook, timer and Waymark window all run on the Tauri event-loop thread.
thread_local! {
    static INPUT: RefCell<Option<Input>> = const { RefCell::new(None) };
}

type Point = (i32, i32);

#[derive(Clone, Copy)]
enum GestureMode {
    Move(Point),
    Resize {
        placement: Placement,
        origin: RECT,
        dpi: i32,
    },
}

#[derive(Clone, Copy)]
struct Gesture {
    mode: GestureMode,
    start: Point,
    preview: Point,
    button_up: u32,
    released_at: Option<Point>,
    cancelled: bool,
}

struct Input {
    app: AppHandle,
    hwnd: isize,
    hook: HHOOK,
    timer: usize,
    gesture: Option<Gesture>,
    target_pressed: Option<(u32, bool, reward_click::RewardClick)>,
}

pub(super) fn install(app: AppHandle, hwnd: isize) -> io::Result<()> {
    let module = unsafe { GetModuleHandleW(std::ptr::null()) };
    if module.is_null() {
        return Err(io::Error::last_os_error());
    }
    let hook = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), module, 0) };
    if hook.is_null() {
        return Err(io::Error::last_os_error());
    }
    INPUT.with(|input| {
        *input.borrow_mut() = Some(Input {
            app,
            hwnd,
            hook,
            timer: 0,
            gesture: None,
            target_pressed: None,
        });
    });
    Ok(())
}

pub(super) fn uninstall() {
    if let Some(input) = INPUT.with(|input| input.take()) {
        unsafe {
            UnhookWindowsHookEx(input.hook);
            if input.timer != 0 {
                KillTimer(null_mut(), input.timer);
            }
        }
    }
}

pub(super) fn active() -> bool {
    INPUT.with(|input| {
        input
            .borrow()
            .as_ref()
            .and_then(|input| input.gesture)
            .is_some_and(|gesture| !gesture.cancelled)
    })
}

pub(super) fn cancel() {
    INPUT.with(|input| {
        if let Some(gesture) = input
            .borrow_mut()
            .as_mut()
            .and_then(|input| input.gesture.as_mut())
        {
            // Keep consuming the matching release, even after restoring placement.
            gesture.cancelled = true;
        }
    });
}

unsafe extern "system" fn mouse_hook(code: i32, message: usize, data: isize) -> isize {
    let button = message as u32;
    if code == HC_ACTION as i32
        && matches!(
            button,
            WM_LBUTTONDOWN | WM_LBUTTONUP | WM_RBUTTONDOWN | WM_RBUTTONUP
        )
        && INPUT.with(|input| {
            let Ok(mut input) = input.try_borrow_mut() else {
                return false;
            };
            input.as_mut().is_some_and(|input| {
                // Windows provides this structure for every HC_ACTION callback.
                let point = (*(data as *const MSLLHOOKSTRUCT)).pt;
                input.on_mouse(button, (point.x, point.y))
            })
        })
    {
        return 1;
    }
    CallNextHookEx(null_mut(), code, message, data)
}

impl Input {
    fn on_mouse(&mut self, message: u32, cursor: Point) -> bool {
        if let Some((button_up, alt, target)) = &self.target_pressed {
            if message != *button_up {
                return false;
            }
            let activate = self.target_at(cursor, *alt).as_ref() == Some(target);
            let pressed = self.target_pressed.take().unwrap().2;
            if activate {
                let handle = self.app.clone();
                let _ = self.app.run_on_main_thread(move || {
                    if pressed.id.as_deref() == Some(reward_click::ACT_TIMER_TARGET) {
                        super::toggle_timer_with_notice(&handle, Some(pressed.revision));
                    } else {
                        let _ = handle.emit_to("overlay", reward_click::CHANNEL, pressed);
                    }
                });
            }
            return true;
        }
        if let Some(gesture) = &mut self.gesture {
            if gesture.released_at.is_none() && message == gesture.button_up {
                gesture.released_at = Some(cursor);
                return true;
            }
            return false;
        }

        if !matches!(message, WM_LBUTTONDOWN | WM_RBUTTONDOWN) {
            return false;
        }
        let (button_down, button_up) = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } == 0 {
            (WM_LBUTTONDOWN, WM_LBUTTONUP)
        } else {
            (WM_RBUTTONDOWN, WM_RBUTTONUP)
        };
        if message != button_down {
            return false;
        }
        let alt = unsafe { GetAsyncKeyState(i32::from(VK_MENU)) } < 0;
        if let Some(target) = self.target_at(cursor, alt) {
            self.target_pressed = Some((button_up, alt, target));
            return true;
        }
        if !alt {
            return false;
        }

        let hwnd = self.hwnd as HWND;
        let mut rect = RECT::default();
        if unsafe { IsWindowVisible(hwnd) == 0 || GetWindowRect(hwnd, &mut rect) == 0 } {
            return false;
        }
        let dpi = unsafe { GetDpiForWindow(hwnd) };
        let mode = if header_contains(rect, dpi, cursor) {
            GestureMode::Move((rect.left, rect.top))
        } else if resize_corner_contains(rect, dpi, cursor) {
            let state = self.app.state::<Runtime>();
            let Ok(snapshot) = state.snapshot.try_lock() else {
                return false;
            };
            GestureMode::Resize {
                placement: snapshot.settings.placement,
                origin: rect,
                dpi: dpi.max(96) as i32,
            }
        } else {
            return false;
        };

        // Update the window and save outside the hook.
        self.timer = unsafe { SetTimer(null_mut(), 0, 16, Some(update_drag)) };
        if self.timer == 0 {
            return false;
        }
        self.gesture = Some(Gesture {
            mode,
            start: cursor,
            preview: cursor,
            button_up,
            released_at: None,
            cancelled: false,
        });
        true
    }

    fn target_at(&self, point: Point, alt: bool) -> Option<reward_click::RewardClick> {
        let hwnd = self.hwnd as HWND;
        let mut rect = RECT::default();
        if unsafe { IsWindowVisible(hwnd) == 0 || GetWindowRect(hwnd, &mut rect) == 0 } {
            return None;
        }
        self.app.state::<Runtime>().overlay_target_at(
            rect,
            unsafe { GetDpiForWindow(hwnd) },
            point,
            alt,
        )
    }
}

fn header_contains(rect: RECT, dpi: u32, (x, y): Point) -> bool {
    // The compact panel starts after a 2 DIP margin, then a 1 DIP border and 42 DIP header.
    let dpi = if dpi == 0 { 96 } else { dpi as i32 };
    let px = |dip| (dip * dpi + 48) / 96;
    x >= rect.left + px(2)
        && x < rect.right - px(2)
        && y >= rect.top + px(2)
        && y < rect.bottom.min(rect.top + px(45))
}

fn resize_corner_contains(rect: RECT, dpi: u32, (x, y): Point) -> bool {
    let grip = (18 * dpi.max(96) as i32 + 48) / 96;
    (rect.right - grip..rect.right).contains(&x) && (rect.bottom - grip..rect.bottom).contains(&y)
}

fn move_header(hwnd: HWND, origin: Point, start: Point, cursor: Point) -> io::Result<()> {
    let moved = unsafe {
        SetWindowPos(
            hwnd,
            null_mut(),
            origin.0 + (cursor.0 - start.0),
            origin.1 + (cursor.1 - start.1),
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        )
    };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

unsafe extern "system" fn update_drag(_: HWND, _: u32, timer: usize, _: u32) {
    let frame = INPUT.with(|input| {
        let mut input = input.borrow_mut();
        let input = input.as_mut().filter(|input| input.timer == timer)?;
        let gesture = input.gesture?;
        let cursor = if let Some(cursor) = gesture.released_at {
            KillTimer(null_mut(), timer);
            input.timer = 0;
            input.gesture = None;
            cursor
        } else {
            let mut cursor = POINT::default();
            // The low-level hook supplies physical screen points for press and release.
            if gesture.cancelled || GetPhysicalCursorPos(&mut cursor) == 0 {
                return None;
            }
            let cursor = (cursor.x, cursor.y);
            if cursor == gesture.preview {
                return None;
            }
            input.gesture.as_mut()?.preview = cursor;
            cursor
        };
        Some((input.app.clone(), input.hwnd, gesture, cursor))
    });
    let Some((app, hwnd, gesture, cursor)) = frame else {
        return;
    };
    if gesture.cancelled {
        return;
    }
    let released = gesture.released_at.is_some();
    if cursor == gesture.start && gesture.preview == gesture.start {
        if released && matches!(gesture.mode, GestureMode::Move(_)) {
            super::toggle_details(&app);
        }
        return;
    }

    let dx = cursor.0 - gesture.start.0;
    let dy = cursor.1 - gesture.start.1;
    let result = match gesture.mode {
        GestureMode::Move(origin) => move_header(hwnd as HWND, origin, gesture.start, cursor)
            .map_err(|error| error.to_string())
            .and_then(|()| {
                if released {
                    super::save_drag_position(&app, hwnd)
                } else {
                    Ok(())
                }
            }),
        GestureMode::Resize {
            mut placement,
            origin,
            dpi,
        } => {
            let to_dip = |pixels| (pixels * 96 + dpi / 2) / dpi;
            if dx != 0 {
                let width = to_dip(origin.right - origin.left + dx);
                placement.width =
                    width.clamp(i32::from(MIN_OVERLAY_WIDTH), i32::from(MAX_OVERLAY_WIDTH)) as u16;
            }
            if dy != 0 {
                let height = to_dip(origin.bottom - origin.top + dy);
                placement.min_height = height
                    .clamp(i32::from(MIN_OVERLAY_HEIGHT), i32::from(MAX_OVERLAY_HEIGHT))
                    as u16;
            }
            super::resize_overlay(&app, hwnd, placement, origin, (dx != 0, dy != 0), released)
        }
    };

    if released {
        if let Err(error) = result {
            super::report_notice(&app, format!("Overlay drag could not be saved ({error})."));
        }
        super::apply_overlay(&app, hwnd);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::core::w;

    struct HiddenWindow(HWND);

    impl Drop for HiddenWindow {
        fn drop(&mut self) {
            unsafe { DestroyWindow(self.0) };
        }
    }

    impl HiddenWindow {
        fn bounds(&self) -> RECT {
            let mut rect = RECT::default();
            assert_ne!(unsafe { GetWindowRect(self.0, &mut rect) }, 0);
            rect
        }
    }

    #[test]
    fn only_bottom_right_can_start_a_resize() {
        let rect = RECT {
            left: -600,
            top: 100,
            right: -108,
            bottom: 400,
        };
        assert!(resize_corner_contains(rect, 144, (-135, 373)));
        for point in [
            (-591, 391),
            (-591, 109),
            (-117, 109),
            (-136, 373),
            (-108, 399),
        ] {
            assert!(!resize_corner_contains(rect, 144, point));
        }
    }

    #[test]
    fn header_hit_box_uses_scaled_bounds_on_either_monitor() {
        for (left, dpi, height) in [(-900, 96, 45), (140, 144, 68)] {
            let rect = RECT {
                left,
                top: 100,
                right: left + 492,
                bottom: 420,
            };
            assert!(header_contains(rect, dpi, (left + 20, rect.top + 20)));
            assert!(header_contains(
                rect,
                dpi,
                (left + 20, rect.top + height - 1)
            ));
            assert!(!header_contains(rect, dpi, (left + 20, rect.top + height)));
            assert!(!header_contains(rect, dpi, (rect.right, rect.top + 20)));
        }
    }

    #[test]
    fn header_drag_moves_a_hidden_window_without_resizing() {
        let hwnd = unsafe {
            CreateWindowExW(
                WS_EX_NOACTIVATE,
                w!("STATIC"),
                w!("Waymark header drag test"),
                WS_POPUP,
                140,
                150,
                420,
                220,
                null_mut(),
                null_mut(),
                GetModuleHandleW(std::ptr::null()),
                std::ptr::null(),
            )
        };
        assert!(!hwnd.is_null(), "{}", io::Error::last_os_error());
        let window = HiddenWindow(hwnd);
        let before = window.bounds();
        let press = (before.left + 30, before.top + 20);
        assert!(header_contains(
            before,
            unsafe { GetDpiForWindow(hwnd) },
            press
        ));

        // Feed screen coordinates directly. The test never reads or moves the desktop cursor.
        move_header(
            hwnd,
            (before.left, before.top),
            press,
            (press.0 + 48, press.1 + 64),
        )
        .unwrap();

        let after = window.bounds();
        assert_eq!(
            (after.left, after.top, after.right, after.bottom),
            (
                before.left + 48,
                before.top + 64,
                before.right + 48,
                before.bottom + 64
            ),
        );
        assert_eq!(unsafe { IsWindowVisible(hwnd) }, 0);
    }
}
