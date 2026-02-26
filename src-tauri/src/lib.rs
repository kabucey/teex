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
#[cfg(target_os = "macos")]
mod apple_events;
#[cfg(target_os = "macos")]
mod cli_install;
mod files;
mod launch;
mod menu_events;
mod path_utils;
mod tab_transfer;
mod watchers;
mod window_title;

use files::{list_project_entries, read_text_file, write_text_file};
use launch::{
    categorize_paths, get_launch_context, open_paths_in_new_window, queue_open_paths,
    take_pending_open_paths,
};
use menu_events::{
    emit_os_open_paths, emit_to_window, handle_app_menu_event, set_menu_item_enabled, target_window,
};
#[cfg(test)]
use menu_events::{next_transfer_request_id, window_event};
use path_utils::{file_kind, is_text_like, path_to_string, should_traverse};
use tab_transfer::{route_tab_transfer, route_tab_transfer_result, RequestExportAllTabsPayload};
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
const EVENT_REQUEST_EXPORT_ALL_TABS: &str = "teex://request-export-all-tabs";
const EVENT_RECEIVE_TRANSFERRED_TABS: &str = "teex://receive-transferred-tabs";
const EVENT_TAB_TRANSFER_RESULT: &str = "teex://tab-transfer-result";

const MENU_OPEN_FILE: &str = "open_file";
const MENU_OPEN_FOLDER: &str = "open_folder";
const MENU_NEW_WINDOW: &str = "new_window";
const MENU_MERGE_ALL_WINDOWS_INTO_THIS_WINDOW: &str = "merge_all_windows_into_this_window";
const MENU_INSTALL_CLI: &str = "install_cli";
const MENU_CLOSE_ACTIVE_FILE: &str = "close_active_file";
const MENU_CLOSE_WINDOW: &str = "close_window";
const MENU_TOGGLE_SIDEBAR: &str = "toggle_sidebar";
const MENU_TOGGLE_MARKDOWN_MODE: &str = "toggle_markdown_mode";
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

fn build_new_window(app: &tauri::AppHandle, label: String) -> Result<tauri::WebviewWindow, String> {
    let new_window = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::default())
        .title("Teex")
        .inner_size(800.0, 600.0)
        .theme(Some(tauri::Theme::Dark))
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
