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
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
#[cfg(target_os = "macos")]
use tauri_plugin_dialog::MessageDialogKind;
use walkdir::{DirEntry, WalkDir};

mod app_runtime;
mod context_menu;
mod files;
mod git_status;
mod launch;
#[cfg(target_os = "macos")]
mod macos;
mod menu_events;
mod path_utils;
mod recent_files;
mod tabs;
mod watchers;
mod window_title;

use context_menu::show_sidebar_context_menu;
use files::{
    format_structured_text, list_project_entries, read_text_file, trash_file, write_text_file,
};
use git_status::git_status;
use launch::{
    categorize_paths, get_launch_context, open_paths_in_new_window, queue_open_paths,
    queue_open_paths_for_window, take_pending_open_paths,
};
use menu_events::{
    emit_os_open_paths, emit_to_window, handle_app_menu_event, set_menu_item_enabled, target_window,
};
#[cfg(test)]
use menu_events::{next_transfer_request_id, window_event};
use path_utils::{file_kind, is_text_like, path_to_string, should_traverse};
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
use window_title::set_window_title;

const EVENT_OPEN_FILE_SELECTED: &str = "teex://open-file-selected";
const EVENT_OPEN_FOLDER_SELECTED: &str = "teex://open-folder-selected";
const EVENT_OS_OPEN_PATHS: &str = "teex://os-open-paths";
const EVENT_PROJECT_FOLDER_CHANGED: &str = "teex://project-folder-changed";
const EVENT_PROJECT_FILE_CHANGED: &str = "teex://project-file-changed";
const EVENT_TOGGLE_SIDEBAR: &str = "teex://toggle-sidebar";
const EVENT_TOGGLE_MARKDOWN_MODE: &str = "teex://toggle-markdown-mode";
const EVENT_CLOSE_ACTIVE_FILE: &str = "teex://close-active-file";
const EVENT_NEW_TAB: &str = "teex://new-tab";
const EVENT_REQUEST_EXPORT_ALL_TABS: &str = "teex://request-export-all-tabs";
const EVENT_RECEIVE_TRANSFERRED_TABS: &str = "teex://receive-transferred-tabs";
const EVENT_TAB_TRANSFER_RESULT: &str = "teex://tab-transfer-result";
const EVENT_CONTEXT_MENU_DELETE: &str = "teex://context-menu-delete";
const EVENT_CROSS_WINDOW_DRAG_ENTER: &str = "teex://cross-window-drag-enter";
const EVENT_CROSS_WINDOW_DRAG_LEAVE: &str = "teex://cross-window-drag-leave";
const EVENT_MOUSE_NAV_BACK: &str = "teex://mouse-nav-back";
const EVENT_MOUSE_NAV_FORWARD: &str = "teex://mouse-nav-forward";

const MENU_OPEN_FILE: &str = "open_file";
const MENU_OPEN_FOLDER: &str = "open_folder";
const MENU_NEW_WINDOW: &str = "new_window";
const MENU_MERGE_ALL_WINDOWS_INTO_THIS_WINDOW: &str = "merge_all_windows_into_this_window";
const MENU_INSTALL_CLI: &str = "install_cli";
const MENU_SET_DEFAULT_MARKDOWN: &str = "set_default_markdown";
const MENU_CLOSE_ACTIVE_FILE: &str = "close_active_file";
const MENU_CLOSE_WINDOW: &str = "close_window";
const MENU_TOGGLE_SIDEBAR: &str = "toggle_sidebar";
const MENU_NEW_TAB: &str = "new_tab";
const MENU_TOGGLE_MARKDOWN_MODE: &str = "toggle_markdown_mode";
const MENU_TOGGLE_STATUS_BAR: &str = "toggle_status_bar";
const EVENT_TOGGLE_STATUS_BAR: &str = "teex://toggle-status-bar";
const MENU_FIND: &str = "find";
const EVENT_FIND: &str = "teex://find";
const MENU_THEME_SYSTEM: &str = "theme_system";
const MENU_THEME_LIGHT: &str = "theme_light";
const MENU_THEME_DARK: &str = "theme_dark";
const EVENT_SET_THEME: &str = "teex://set-theme";
const MENU_RESTORE_SESSION: &str = "restore_session";
const EVENT_RESTORE_SESSION: &str = "teex://restore-session";
const MENU_CLEAR_RECENTS: &str = "clear_recents";
const MENU_RECENT_FILE_PREFIX: &str = "recent_file:";
const MENU_RECENT_FOLDER_PREFIX: &str = "recent_folder:";
const EVENT_OPEN_RECENT_FILE: &str = "teex://open-recent-file";
const EVENT_OPEN_RECENT_FOLDER: &str = "teex://open-recent-folder";
static NEXT_WINDOW_ID: AtomicUsize = AtomicUsize::new(1);
static NEXT_TRANSFER_REQUEST_ID: AtomicUsize = AtomicUsize::new(1);
const FOLDER_WATCH_DEBOUNCE: Duration = Duration::from_millis(250);
const FILE_WATCH_DEBOUNCE: Duration = Duration::from_millis(250);

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
fn open_in_file_manager(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(&path_buf);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(&path_buf);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(&path_buf);
        cmd
    };

    let status = command
        .status()
        .map_err(|e| format!("Unable to open file manager: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "File manager command exited with status {}",
            status
        ))
    }
}

#[cfg(test)]
mod tests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app_runtime::run_app();
}
