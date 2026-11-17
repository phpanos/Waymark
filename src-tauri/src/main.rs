#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(not(windows))]
compile_error!(
    "Waymark desktop targets Windows. Use cargo test -p waymark-log for portable tests."
);
#[cfg(windows)]
mod desktop;
fn main() {
    #[cfg(windows)]
    desktop::run()
}
