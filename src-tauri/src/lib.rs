use notify::{
    event::ModifyKind, Config as NotifyConfig, Event, EventKind, RecommendedWatcher, RecursiveMode,
    Watcher,
};
use serde::{Deserialize, Serialize};
#[cfg(target_os = "macos")]
use std::ffi::{c_char, c_void, CString};
#[cfg(target_os = "macos")]
use std::os::unix::fs as unix_fs;
use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    sync::atomic::Ordering,
    sync::{Arc, Mutex},
    time::Instant,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
#[cfg(target_os = "macos")]
use tauri_plugin_dialog::MessageDialogKind;
use walkdir::{DirEntry, WalkDir};

mod app_runtime;
mod constants;
mod files;
mod git;
mod launch;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
mod menu;
mod menu_events;
mod path_utils;
mod recent_files;
mod tabs;
mod watchers;
mod window;

use constants::*;

use files::{
    format_structured_text, list_project_entries, read_text_file, trash_file, write_text_file,
};
use git::git_diff;
use git::git_diff_all;
use git::git_status;
#[cfg(target_os = "macos")]
use launch::queue_open_paths;
use launch::{
    categorize_paths, get_launch_context, open_paths_in_new_window, queue_open_paths_for_window,
    take_pending_open_paths,
};
use menu_events::{emit_to_window, handle_app_menu_event, set_menu_item_enabled};
#[cfg(test)]
use menu_events::{next_transfer_request_id, window_event};
use path_utils::{
    file_kind, is_dotfile_config, is_text_like, path_to_string, should_traverse_with_hidden,
};
use recent_files::{add_recent_file, add_recent_folder};
use tabs::{
    cancel_cross_window_drag_hover, cleanup_drag_entries_for_window, create_window_from_drag,
    get_drag_preview_content, hide_tab_drag_preview, report_drag_position, route_tab_transfer,
    route_tab_transfer_result, show_tab_drag_preview, CrossWindowDragRegistry,
    RequestExportAllTabsPayload, TabDragPreviewState,
};
use watchers::{
    clear_project_file_watch_for_label, clear_project_folder_watch_for_label,
    install_project_file_watch, install_project_folder_watch,
};
use window::set_window_title;
use window::{open_in_file_manager, show_sidebar_context_menu, show_tab_context_menu};

struct FocusTracker {
    label: Mutex<Option<String>>,
    recently_created: Mutex<Option<(String, Instant)>>,
}

struct PendingOpenPaths {
    global_paths: Mutex<Vec<String>>,
    by_window: Mutex<HashMap<String, Vec<String>>>,
}

struct FolderWatchRegistry {
    by_window: Mutex<HashMap<String, WindowFolderWatch>>,
}

struct WindowFolderWatch {
    root: PathBuf,
    _watcher: RecommendedWatcher,
}

struct FileWatchRegistry {
    by_window: Mutex<HashMap<String, WindowFileWatch>>,
}

pub(crate) struct ThemeMenuState {
    pub system: tauri::menu::CheckMenuItem<tauri::Wry>,
    pub light: tauri::menu::CheckMenuItem<tauri::Wry>,
    pub dark: tauri::menu::CheckMenuItem<tauri::Wry>,
}

struct WindowFileWatch {
    paths: Vec<PathBuf>,
    _watcher: RecommendedWatcher,
}

fn set_tracked_window_label(app: &tauri::AppHandle, label: String) {
    let tracker = app.state::<FocusTracker>();
    if let Ok(mut tracked) = tracker.label.lock() {
        *tracked = Some(label);
    };
}

fn set_recently_created_window(app: &tauri::AppHandle, label: String) {
    let tracker = app.state::<FocusTracker>();
    if let Ok(mut created) = tracker.recently_created.lock() {
        *created = Some((label, Instant::now()));
    };
}

fn next_window_label() -> String {
    format!(
        "teex-window-{}",
        NEXT_WINDOW_ID.fetch_add(1, Ordering::Relaxed)
    )
}

fn focused_window_position(app: &tauri::AppHandle) -> Option<(f64, f64)> {
    let tracker = app.state::<FocusTracker>();
    let label = tracker.label.lock().ok()?.clone()?;
    let window = app.webview_windows().get(&label)?.clone();
    let pos = window.outer_position().ok()?;
    let scale = window.scale_factor().ok()?;
    Some((pos.x as f64 / scale, pos.y as f64 / scale))
}

fn build_new_window(app: &tauri::AppHandle, label: String) -> Result<tauri::WebviewWindow, String> {
    let mut builder = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::default())
        .title("Teex")
        .inner_size(800.0, 600.0);

    // Cascade: offset from the focused window so new windows don't stack exactly on top
    if let Some(pos) = focused_window_position(app) {
        builder = builder.position(pos.0 + 22.0, pos.1 + 22.0);
    }

    let new_window = builder
        .build()
        .map_err(|e| format!("Unable to create window: {e}"))?;

    let label = new_window.label().to_string();
    set_tracked_window_label(app, label.clone());
    set_recently_created_window(app, label);
    let _ = new_window.set_focus();

    Ok(new_window)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MenuState {
    can_toggle_sidebar: bool,
    can_toggle_markdown_mode: bool,
}

#[tauri::command]
fn get_all_window_labels(app: tauri::AppHandle) -> Vec<String> {
    app.webview_windows().keys().cloned().collect()
}

#[tauri::command]
fn get_window_label(window: tauri::Window) -> String {
    window.label().to_string()
}

#[tauri::command]
fn notify_window_focused(window: tauri::Window) {
    set_tracked_window_label(window.app_handle(), window.label().to_string());
}

#[tauri::command]
fn watch_project_folder(window: tauri::Window, root: String) -> Result<(), String> {
    install_project_folder_watch(window.app_handle(), window.label(), PathBuf::from(root))
}

#[tauri::command]
fn clear_project_folder_watch(window: tauri::Window) {
    clear_project_folder_watch_for_label(window.app_handle(), window.label());
}

#[tauri::command]
fn watch_project_files(window: tauri::Window, paths: Vec<String>) -> Result<(), String> {
    install_project_file_watch(window.app_handle(), window.label(), paths)
}

#[tauri::command]
fn set_menu_state(app: tauri::AppHandle, state: MenuState) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };

    set_menu_item_enabled(&menu, MENU_TOGGLE_SIDEBAR, state.can_toggle_sidebar)?;
    set_menu_item_enabled(
        &menu,
        MENU_TOGGLE_MARKDOWN_MODE,
        state.can_toggle_markdown_mode,
    )?;

    Ok(())
}

#[tauri::command]
fn set_show_hidden_files_checked(app: tauri::AppHandle, checked: bool) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    let Some(item) = menu.get(MENU_SHOW_HIDDEN_FILES) else {
        return Ok(());
    };
    if let Some(check_item) = item.as_check_menuitem() {
        check_item
            .set_checked(checked)
            .map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn set_show_modified_only_checked(app: tauri::AppHandle, checked: bool) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    let Some(item) = menu.get(MENU_SHOW_MODIFIED_ONLY) else {
        return Ok(());
    };
    if let Some(check_item) = item.as_check_menuitem() {
        check_item
            .set_checked(checked)
            .map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn focus_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app
        .webview_windows()
        .get(&label)
        .cloned()
        .ok_or_else(|| format!("Window not found: {label}"))?;
    window
        .set_focus()
        .map_err(|e| format!("Unable to focus window: {e}"))
}

#[tauri::command]
fn close_current_window(window: tauri::Window) -> Result<(), String> {
    window
        .close()
        .map_err(|e| format!("Unable to close window: {e}"))
}

#[tauri::command]
fn get_folder_icon() -> Option<String> {
    get_folder_icon_impl()
}

#[cfg(target_os = "macos")]
fn get_folder_icon_impl() -> Option<String> {
    macos::icons::get_system_folder_icon()
}

#[cfg(target_os = "linux")]
fn get_folder_icon_impl() -> Option<String> {
    linux::icons::get_system_folder_icon()
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn get_folder_icon_impl() -> Option<String> {
    None
}

#[cfg(test)]
mod tests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app_runtime::run_app();
}
