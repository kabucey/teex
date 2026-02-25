use serde::{Deserialize, Serialize};
#[cfg(target_os = "macos")]
use std::ffi::{c_char, c_void, CString};
#[cfg(target_os = "macos")]
use std::os::unix::fs as unix_fs;
use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
    sync::Mutex,
    time::Instant,
};
#[cfg(target_os = "ios")]
use tauri::RunEvent;
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager,
};
use tauri_plugin_dialog::DialogExt;
#[cfg(target_os = "macos")]
use tauri_plugin_dialog::MessageDialogKind;
use walkdir::{DirEntry, WalkDir};

/// On macOS, when Finder opens a file with teex, the kAEOpenDocuments Apple
/// Event is processed during [NSApp finishLaunching] which tao calls inside
/// EventLoop::new() (during Builder::build()). tao's application:openURLs:
/// delegate method panics if its internal state isn't ready yet, and since
/// it's an extern "C" function the panic causes an immediate abort.
///
/// Fix: before Builder::build(), swizzle [NSApplication finishLaunching].
/// Our replacement temporarily patches the delegate's application:openURLs:
/// with a safe version that captures file URLs, calls the original
/// finishLaunching, then restores the original delegate method. This way:
/// - First launch from Finder: our safe handler captures URLs, no crash
/// - Subsequent file opens (app running): tao's restored handler works normally
#[cfg(target_os = "macos")]
mod apple_events {
    use std::ffi::c_void;
    use std::path::PathBuf;
    use std::sync::Mutex;

    type Id = *mut c_void;
    type Sel = *const c_void;
    type Class = *const c_void;
    type Method = *mut c_void;

    extern "C" {
        fn objc_getClass(name: *const u8) -> Class;
        fn sel_registerName(name: *const u8) -> Sel;
        fn objc_msgSend();
        fn object_getClass(obj: Id) -> Class;
        fn class_getInstanceMethod(cls: Class, sel: Sel) -> Method;
        fn method_setImplementation(method: Method, imp: *const c_void) -> *const c_void;
    }

    // Typed wrappers around objc_msgSend (required for correct ARM64 ABI).
    unsafe fn msg0(obj: Id, sel: Sel) -> Id {
        let f: unsafe extern "C" fn(Id, Sel) -> Id =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel)
    }
    unsafe fn msg0_usize(obj: Id, sel: Sel) -> usize {
        let f: unsafe extern "C" fn(Id, Sel) -> usize =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel)
    }
    unsafe fn msg1_usize(obj: Id, sel: Sel, arg: usize) -> Id {
        let f: unsafe extern "C" fn(Id, Sel, usize) -> Id =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel, arg)
    }

    static CAPTURED: Mutex<Vec<String>> = Mutex::new(Vec::new());

    // Stored as usize because raw fn pointers don't impl Send.
    static ORIGINAL_FINISH_IMP: Mutex<usize> = Mutex::new(0);

    /// Safe replacement for application:openURLs: that captures file URLs
    /// without touching tao's internal state.
    unsafe extern "C" fn safe_open_urls(_this: Id, _cmd: Sel, _app: Id, urls: Id) {
        let count_sel = sel_registerName(b"count\0".as_ptr());
        let count = msg0_usize(urls, count_sel);

        let obj_at_sel = sel_registerName(b"objectAtIndex:\0".as_ptr());
        let abs_sel = sel_registerName(b"absoluteString\0".as_ptr());
        let utf8_sel = sel_registerName(b"UTF8String\0".as_ptr());

        let mut strings = Vec::new();
        for i in 0..count {
            let url = msg1_usize(urls, obj_at_sel, i);
            if url.is_null() {
                continue;
            }
            let ns_string = msg0(url, abs_sel);
            if ns_string.is_null() {
                continue;
            }
            let c_str = msg0(ns_string, utf8_sel) as *const i8;
            if c_str.is_null() {
                continue;
            }
            if let Ok(s) = std::ffi::CStr::from_ptr(c_str).to_str() {
                strings.push(s.to_string());
            }
        }

        if let Ok(mut cap) = CAPTURED.lock() {
            cap.extend(strings);
        }
    }

    /// Swizzled [NSApplication finishLaunching]. Permanently replaces the
    /// delegate's application:openURLs: with our safe version, then calls
    /// the original finishLaunching. The replacement stays in place because
    /// the Apple Event arrives later during [NSApplication run], not during
    /// finishLaunching itself.
    unsafe extern "C" fn swizzled_finish_launching(this: Id, cmd: Sel) {
        let delegate_sel = sel_registerName(b"delegate\0".as_ptr());
        let open_sel = sel_registerName(b"application:openURLs:\0".as_ptr());

        let delegate = msg0(this, delegate_sel);

        // Permanently replace the delegate's application:openURLs:
        if !delegate.is_null() {
            let cls = object_getClass(delegate);
            let method = class_getInstanceMethod(cls, open_sel);
            if !method.is_null() {
                method_setImplementation(method, safe_open_urls as *const c_void);
            }
        }

        // Call original finishLaunching
        let original_imp = ORIGINAL_FINISH_IMP.lock().ok().map(|g| *g).unwrap_or(0);
        if original_imp != 0 {
            let f: unsafe extern "C" fn(Id, Sel) = std::mem::transmute(original_imp);
            f(this, cmd);
        }
    }

    /// Swizzle [NSApplication finishLaunching]. Must be called BEFORE
    /// tauri::Builder::build() so the swizzle is in place when tao's
    /// EventLoop::new() calls finishLaunching.
    pub fn install() {
        unsafe {
            let cls = objc_getClass(b"NSApplication\0".as_ptr());
            if cls.is_null() {
                return;
            }
            let sel = sel_registerName(b"finishLaunching\0".as_ptr());
            let method = class_getInstanceMethod(cls, sel);
            if method.is_null() {
                return;
            }

            let original =
                method_setImplementation(method, swizzled_finish_launching as *const c_void);

            if let Ok(mut guard) = ORIGINAL_FINISH_IMP.lock() {
                *guard = original as usize;
            }
        }
    }

    /// Drain captured URL strings and convert file:// URLs to paths.
    pub fn take_paths() -> Vec<PathBuf> {
        let strings = {
            let Ok(mut cap) = CAPTURED.lock() else {
                return Vec::new();
            };
            std::mem::take(&mut *cap)
        };
        strings.iter().filter_map(|s| file_url_to_path(s)).collect()
    }

    fn file_url_to_path(url: &str) -> Option<PathBuf> {
        let encoded = url.strip_prefix("file://")?;
        let mut bytes = Vec::with_capacity(encoded.len());
        let raw = encoded.as_bytes();
        let mut i = 0;
        while i < raw.len() {
            if raw[i] == b'%' && i + 2 < raw.len() {
                if let Ok(byte) =
                    u8::from_str_radix(std::str::from_utf8(&raw[i + 1..i + 3]).unwrap_or(""), 16)
                {
                    bytes.push(byte);
                    i += 3;
                    continue;
                }
            }
            bytes.push(raw[i]);
            i += 1;
        }
        Some(PathBuf::from(String::from_utf8(bytes).ok()?))
    }
}

const EVENT_OPEN_FILE_SELECTED: &str = "teex://open-file-selected";
const EVENT_OPEN_FOLDER_SELECTED: &str = "teex://open-folder-selected";
const EVENT_OS_OPEN_PATHS: &str = "teex://os-open-paths";
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

struct FocusTracker {
    label: Mutex<Option<String>>,
    recently_created: Mutex<Option<(String, Instant)>>,
}

struct PendingOpenPaths {
    global_paths: Mutex<Vec<String>>,
    by_window: Mutex<HashMap<String, Vec<String>>>,
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

fn queue_open_paths(app: &tauri::AppHandle, paths: &[PathBuf]) {
    let pending = app.state::<PendingOpenPaths>();
    if let Ok(mut queued) = pending.global_paths.lock() {
        queued.extend(paths.iter().map(|p| path_to_string(p)));
    };
}

fn queue_open_paths_for_window(app: &tauri::AppHandle, label: &str, paths: &[PathBuf]) {
    let pending = app.state::<PendingOpenPaths>();
    if let Ok(mut queued) = pending.by_window.lock() {
        queued
            .entry(label.to_string())
            .or_default()
            .extend(paths.iter().map(|p| path_to_string(p)));
    };
}

fn clear_pending_open_paths_for_window(app: &tauri::AppHandle, label: &str) {
    let pending = app.state::<PendingOpenPaths>();
    if let Ok(mut queued) = pending.by_window.lock() {
        queued.remove(label);
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchContext {
    mode: String,
    path: Option<String>,
    paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectEntry {
    path: String,
    rel_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FilePayload {
    path: String,
    content: String,
    kind: String,
    writable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferredTab {
    path: String,
    content: String,
    kind: String,
    writable: bool,
    is_dirty: bool,
    markdown_view_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RequestExportAllTabsPayload {
    request_id: String,
    target_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReceiveTransferredTabsPayload {
    request_id: String,
    source_label: String,
    tabs: Vec<TransferredTab>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabTransferResultPayload {
    request_id: String,
    target_label: String,
    accepted_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MenuState {
    can_toggle_sidebar: bool,
    can_toggle_markdown_mode: bool,
}

#[tauri::command]
fn get_launch_context() -> LaunchContext {
    let mut args = env::args();
    let _ = args.next(); // skip program name

    let mut files: Vec<String> = Vec::new();
    let mut folder: Option<String> = None;

    for arg in args {
        if arg.starts_with("--") {
            continue;
        }

        let candidate = PathBuf::from(&arg);
        if !candidate.exists() {
            continue;
        }

        if candidate.is_file() {
            files.push(path_to_string(&candidate));
        } else if candidate.is_dir() && folder.is_none() {
            folder = Some(path_to_string(&candidate));
        }
    }

    if let Some(folder_path) = folder {
        return LaunchContext {
            mode: "folder".to_string(),
            path: Some(folder_path),
            paths: Vec::new(),
        };
    }

    if files.len() >= 2 {
        return LaunchContext {
            mode: "files".to_string(),
            path: None,
            paths: files,
        };
    }

    if let Some(file_path) = files.into_iter().next() {
        return LaunchContext {
            mode: "file".to_string(),
            path: Some(file_path),
            paths: Vec::new(),
        };
    }

    LaunchContext {
        mode: "empty".to_string(),
        path: None,
        paths: Vec::new(),
    }
}

#[tauri::command]
fn categorize_paths(paths: Vec<String>) -> LaunchContext {
    let mut files: Vec<String> = Vec::new();
    let mut folders: Vec<String> = Vec::new();

    for raw in paths {
        if raw.trim().is_empty() {
            continue;
        }

        let candidate = PathBuf::from(&raw);
        if !candidate.exists() {
            continue;
        }

        if candidate.is_file() {
            files.push(path_to_string(&candidate));
        } else if candidate.is_dir() {
            folders.push(path_to_string(&candidate));
        }
    }

    if files.is_empty() && folders.len() == 1 {
        return LaunchContext {
            mode: "folder".to_string(),
            path: folders.into_iter().next(),
            paths: Vec::new(),
        };
    }

    if files.len() >= 2 {
        return LaunchContext {
            mode: "files".to_string(),
            path: None,
            paths: files,
        };
    }

    if let Some(file_path) = files.into_iter().next() {
        return LaunchContext {
            mode: "file".to_string(),
            path: Some(file_path),
            paths: Vec::new(),
        };
    }

    LaunchContext {
        mode: "empty".to_string(),
        path: None,
        paths: Vec::new(),
    }
}

#[tauri::command]
fn list_project_entries(root: String) -> Result<Vec<ProjectEntry>, String> {
    let root_path = PathBuf::from(root);

    if !root_path.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let mut entries = Vec::new();

    for entry in WalkDir::new(&root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_traverse)
    {
        let entry = match entry {
            Ok(item) => item,
            Err(_) => continue,
        };

        let path = entry.path();
        if !path.is_file() || !is_text_like(path) {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        let relative = match path.strip_prefix(&root_path) {
            Ok(rel) => rel,
            Err(_) => continue,
        };

        entries.push(ProjectEntry {
            path: path_to_string(path),
            rel_path: relative.to_string_lossy().to_string(),
        });
    }

    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));

    Ok(entries)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<FilePayload, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.is_file() {
        return Err("File was not found".to_string());
    }

    let content = fs::read_to_string(&path_buf)
        .map_err(|e| format!("Unable to read file as UTF-8 text: {e}"))?;

    let metadata =
        fs::metadata(&path_buf).map_err(|e| format!("Unable to read file metadata: {e}"))?;

    Ok(FilePayload {
        path,
        content,
        kind: file_kind(&path_buf).to_string(),
        writable: !metadata.permissions().readonly(),
    })
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| format!("Unable to write file: {e}"))
}

#[cfg(target_os = "macos")]
fn set_macos_window_represented_path(
    window: &tauri::Window,
    represented_path: Option<&str>,
) -> Result<(), String> {
    let window_for_main = window.clone();
    let represented_path = represented_path.map(str::to_owned);

    window
        .run_on_main_thread(move || {
            if let Err(error) = unsafe {
                set_macos_window_represented_path_main_thread(
                    &window_for_main,
                    represented_path.as_deref(),
                )
            } {
                eprintln!("{error}");
            }
        })
        .map_err(|e| format!("Unable to schedule macOS proxy icon update: {e}"))
}

#[cfg(target_os = "macos")]
unsafe fn set_macos_window_represented_path_main_thread(
    window: &tauri::Window,
    represented_path: Option<&str>,
) -> Result<(), String> {
    type Id = *mut c_void;
    type Sel = *const c_void;
    type Class = *const c_void;

    extern "C" {
        fn objc_getClass(name: *const u8) -> Class;
        fn sel_registerName(name: *const u8) -> Sel;
        fn objc_msgSend();
    }

    unsafe fn msg1_id(obj: Id, sel: Sel, arg: Id) -> Id {
        let f: unsafe extern "C" fn(Id, Sel, Id) -> Id =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel, arg)
    }

    unsafe fn msg1_cstr(obj: Id, sel: Sel, arg: *const c_char) -> Id {
        let f: unsafe extern "C" fn(Id, Sel, *const c_char) -> Id =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel, arg)
    }

    unsafe fn msg1_void_id(obj: Id, sel: Sel, arg: Id) {
        let f: unsafe extern "C" fn(Id, Sel, Id) =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel, arg);
    }

    let ns_window = window
        .ns_window()
        .map_err(|e| format!("Unable to access native macOS window: {e}"))?
        as Id;
    if ns_window.is_null() {
        return Err("macOS NSWindow handle was null".to_string());
    }

    let represented_url: Id = if let Some(path) = represented_path {
        let path_cstr = CString::new(path)
            .map_err(|_| "Represented path contains an unsupported NUL byte".to_string())?;

        let ns_string_class = objc_getClass(b"NSString\0".as_ptr());
        let ns_url_class = objc_getClass(b"NSURL\0".as_ptr());
        if ns_string_class.is_null() || ns_url_class.is_null() {
            return Err("Unable to load macOS Foundation classes for proxy icon".to_string());
        }

        let string_with_utf8_sel = sel_registerName(b"stringWithUTF8String:\0".as_ptr());
        let file_url_with_path_sel = sel_registerName(b"fileURLWithPath:\0".as_ptr());

        let ns_path = msg1_cstr(
            ns_string_class as Id,
            string_with_utf8_sel,
            path_cstr.as_ptr(),
        );
        if ns_path.is_null() {
            return Err("Unable to create NSString for represented path".to_string());
        }

        let ns_url = msg1_id(ns_url_class as Id, file_url_with_path_sel, ns_path);
        if ns_url.is_null() {
            return Err("Unable to create NSURL for represented path".to_string());
        }

        ns_url
    } else {
        std::ptr::null_mut()
    };

    let set_represented_url_sel = sel_registerName(b"setRepresentedURL:\0".as_ptr());
    msg1_void_id(ns_window, set_represented_url_sel, represented_url);

    Ok(())
}

#[tauri::command]
fn set_window_title(
    window: tauri::Window,
    title: String,
    represented_path: Option<String>,
) -> Result<(), String> {
    window
        .set_title(&title)
        .map_err(|e| format!("Unable to set window title: {e}"))?;

    #[cfg(target_os = "macos")]
    set_macos_window_represented_path(&window, represented_path.as_deref())?;

    #[cfg(not(target_os = "macos"))]
    let _ = represented_path;

    Ok(())
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
fn take_pending_open_paths(window: tauri::Window) -> Vec<String> {
    let app = window.app_handle();
    let pending = app.state::<PendingOpenPaths>();
    let mut drained = Vec::new();

    if let Ok(mut by_window) = pending.by_window.lock() {
        if let Some(paths) = by_window.remove(window.label()) {
            drained.extend(paths);
        }
    }

    if let Ok(mut global_paths) = pending.global_paths.lock() {
        drained.extend(std::mem::take(&mut *global_paths));
    }

    drained
}

#[tauri::command]
fn open_paths_in_new_window(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let file_paths: Vec<PathBuf> = paths
        .into_iter()
        .filter(|raw| !raw.trim().is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .collect();

    if file_paths.is_empty() {
        return Ok(());
    }

    let label = next_window_label();
    queue_open_paths_for_window(&app, &label, &file_paths);

    if let Err(err) = build_new_window(&app, label.clone()) {
        clear_pending_open_paths_for_window(&app, &label);
        return Err(err);
    }

    Ok(())
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
fn route_tab_transfer(
    app: tauri::AppHandle,
    source_label: String,
    target_label: String,
    request_id: String,
    tabs: Vec<TransferredTab>,
) -> Result<(), String> {
    if app.get_webview_window(&target_label).is_none() {
        return Err("Target window is no longer available".to_string());
    }

    emit_to_window(
        &app,
        &target_label,
        EVENT_RECEIVE_TRANSFERRED_TABS,
        ReceiveTransferredTabsPayload {
            request_id,
            source_label,
            tabs,
        },
    );

    Ok(())
}

#[tauri::command]
fn route_tab_transfer_result(
    app: tauri::AppHandle,
    source_label: String,
    target_label: String,
    request_id: String,
    accepted_count: usize,
) -> Result<(), String> {
    if app.get_webview_window(&source_label).is_none() {
        return Ok(());
    }

    emit_to_window(
        &app,
        &source_label,
        EVENT_TAB_TRANSFER_RESULT,
        TabTransferResultPayload {
            request_id,
            target_label,
            accepted_count,
        },
    );

    Ok(())
}

fn set_menu_item_enabled<R: tauri::Runtime>(
    menu: &tauri::menu::Menu<R>,
    id: &str,
    enabled: bool,
) -> Result<(), String> {
    let Some(item) = menu.get(id) else {
        return Ok(());
    };

    if let Some(menu_item) = item.as_menuitem() {
        menu_item
            .set_enabled(enabled)
            .map_err(|e| format!("Unable to update menu state for '{id}': {e}"))?;
    }

    Ok(())
}

fn should_traverse(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }

    let Some(name) = entry.file_name().to_str() else {
        return false;
    };

    !matches!(name, ".git" | "node_modules" | "target" | "dist" | "build") && !name.starts_with('.')
}

fn file_kind(path: &Path) -> &'static str {
    if is_markdown(path) {
        "markdown"
    } else {
        "text"
    }
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

fn is_text_like(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };

    matches!(
        ext.to_ascii_lowercase().as_str(),
        "md" | "markdown"
            | "txt"
            | "rst"
            | "json"
            | "toml"
            | "yaml"
            | "yml"
            | "csv"
            | "log"
            | "js"
            | "ts"
            | "jsx"
            | "tsx"
            | "html"
            | "css"
            | "scss"
            | "rs"
            | "py"
            | "go"
            | "java"
            | "kt"
            | "swift"
            | "sh"
            | "zsh"
    )
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn window_event(base: &str, label: &str) -> String {
    format!("{}/{}", base, label)
}

fn emit_to_window(
    app: &tauri::AppHandle,
    label: &str,
    event_name: &str,
    payload: impl serde::Serialize + Clone,
) {
    let scoped = window_event(event_name, label);
    let _ = app.emit(&scoped, payload);
}

fn emit_path_event(
    app: &tauri::AppHandle,
    label: &str,
    event_name: &str,
    maybe_path: Option<PathBuf>,
) {
    let Some(path) = maybe_path else {
        return;
    };
    emit_to_window(app, label, event_name, path_to_string(&path));
}

fn emit_os_open_paths(app: &tauri::AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }

    let target = target_window(app).or_else(|| {
        app.webview_windows()
            .values()
            .next()
            .map(|window| window.as_ref().window())
    });

    let Some(window) = target else {
        return;
    };

    let mut folders = Vec::new();
    let mut files = Vec::new();

    for path in paths {
        if path.is_dir() {
            folders.push(path);
        } else if path.is_file() {
            files.push(path);
        }
    }

    if files.is_empty() && folders.is_empty() {
        return;
    }

    if files.is_empty() && folders.len() == 1 {
        emit_to_window(
            app,
            window.label(),
            EVENT_OPEN_FOLDER_SELECTED,
            path_to_string(&folders[0]),
        );
        return;
    }

    let payload: Vec<String> = files.iter().map(|p| path_to_string(p)).collect();
    if !payload.is_empty() {
        emit_to_window(app, window.label(), EVENT_OS_OPEN_PATHS, payload);
    }
}

fn next_transfer_request_id() -> String {
    format!(
        "tab-transfer-{}",
        NEXT_TRANSFER_REQUEST_ID.fetch_add(1, Ordering::Relaxed)
    )
}

fn target_window(app: &tauri::AppHandle) -> Option<tauri::Window> {
    let tracker = app.state::<FocusTracker>();

    if let Ok(created) = tracker.recently_created.lock() {
        if let Some((label, created_at)) = created.as_ref() {
            if created_at.elapsed().as_secs() < 2 {
                if let Some(window) = app.get_webview_window(label) {
                    return Some(window.as_ref().window());
                }
            }
        }
    }

    // Real-time focus check — most reliable when called outside menu interaction
    // (e.g. inside a dialog callback after the panel has closed).
    if let Some(focused) = app
        .webview_windows()
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
    {
        return Some(focused.as_ref().window());
    }

    // Fall back to the tracker (updated by JS pointerdown / focus events)
    let tracked_label = tracker.label.lock().ok().and_then(|label| label.clone());

    if let Some(label) = tracked_label {
        if let Some(window) = app.get_webview_window(&label) {
            return Some(window.as_ref().window());
        }
    }

    app.webview_windows()
        .values()
        .next()
        .map(|window| window.as_ref().window())
}

fn handle_app_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().0.as_str() {
        MENU_NEW_WINDOW => match build_new_window(app, next_window_label()) {
            Ok(_) => {}
            Err(err) => {
                if let Some(window) = target_window(app) {
                    emit_to_window(app, window.label(), "teex://window-error", err);
                }
            }
        },
        MENU_MERGE_ALL_WINDOWS_INTO_THIS_WINDOW => {
            let Some(target) = target_window(app) else {
                return;
            };

            let target_label = target.label().to_string();
            let labels: Vec<String> = app.webview_windows().keys().cloned().collect();

            for label in labels {
                if label == target_label {
                    continue;
                }

                if app.get_webview_window(&label).is_none() {
                    continue;
                }

                emit_to_window(
                    app,
                    &label,
                    EVENT_REQUEST_EXPORT_ALL_TABS,
                    RequestExportAllTabsPayload {
                        request_id: next_transfer_request_id(),
                        target_label: target_label.clone(),
                    },
                );
            }
        }
        MENU_CLOSE_ACTIVE_FILE => {
            if let Some(window) = target_window(app) {
                emit_to_window(app, window.label(), EVENT_CLOSE_ACTIVE_FILE, ());
            }
        }
        MENU_CLOSE_WINDOW => {
            if let Some(window) = target_window(app) {
                let _ = window.close();
            }
        }
        MENU_OPEN_FILE => {
            let Some(window) = target_window(app) else {
                return;
            };
            let target_label = window.label().to_string();
            let app_handle = app.clone();
            window
                .dialog()
                .file()
                .set_parent(&window)
                .set_title("Open File")
                .pick_file(move |path| {
                    emit_path_event(
                        &app_handle,
                        &target_label,
                        EVENT_OPEN_FILE_SELECTED,
                        path.and_then(|p| p.into_path().ok()),
                    )
                });
        }
        MENU_OPEN_FOLDER => {
            let Some(window) = target_window(app) else {
                return;
            };
            let target_label = window.label().to_string();
            let app_handle = app.clone();
            window
                .dialog()
                .file()
                .set_parent(&window)
                .set_title("Open Folder")
                .pick_folder(move |path| {
                    emit_path_event(
                        &app_handle,
                        &target_label,
                        EVENT_OPEN_FOLDER_SELECTED,
                        path.and_then(|p| p.into_path().ok()),
                    )
                });
        }
        MENU_INSTALL_CLI => {
            #[cfg(target_os = "macos")]
            install_cli_from_menu(app);
        }
        MENU_TOGGLE_SIDEBAR => {
            if let Some(window) = target_window(app) {
                emit_to_window(app, window.label(), EVENT_TOGGLE_SIDEBAR, ());
            }
        }
        MENU_TOGGLE_MARKDOWN_MODE => {
            if let Some(window) = target_window(app) {
                emit_to_window(app, window.label(), EVENT_TOGGLE_MARKDOWN_MODE, ());
            }
        }
        _ => {}
    }
}

#[cfg(target_os = "macos")]
fn install_cli_from_menu(app: &tauri::AppHandle) {
    match install_cli_symlink() {
        Ok((link_path, bin_dir_on_path)) => {
            let mut message = format!(
                "Installed `teex` to:\n{}\n\nThe command points to this app bundle's executable.",
                link_path.display()
            );

            if bin_dir_on_path {
                message.push_str(
                    "\n\nOpen a new Terminal window (or restart your shell), then run `teex`.",
                );
            } else if let Some(parent) = link_path.parent() {
                message.push_str(&format!(
                    "\n\nAdd this directory to your PATH, then restart your shell:\n{}",
                    parent.display()
                ));
            }

            if bin_dir_on_path {
                message.push_str(
                    "\n\nTo install the agent skills for Claude Code and Codex, run:\n`teex install-skill`",
                );
            } else {
                message.push_str(
                    "\n\nAfter updating PATH and restarting your shell, install the agent skills for Claude Code and Codex with:\n`teex install-skill`",
                );
            }

            show_message_dialog(
                app,
                "Command Line Tool Installed",
                message,
                MessageDialogKind::Info,
            );
        }
        Err(message) => {
            show_message_dialog(
                app,
                "Unable to Install Command Line Tool",
                message,
                MessageDialogKind::Error,
            );
        }
    }
}

#[cfg(target_os = "macos")]
fn show_message_dialog(
    app: &tauri::AppHandle,
    title: &str,
    message: String,
    kind: MessageDialogKind,
) {
    if let Some(window) = target_window(app) {
        window
            .dialog()
            .message(message)
            .title(title)
            .kind(kind)
            .parent(&window)
            .show(|_| {});
        return;
    }

    app.dialog()
        .message(message)
        .title(title)
        .kind(kind)
        .show(|_| {});
}

#[cfg(target_os = "macos")]
fn install_cli_symlink() -> Result<(PathBuf, bool), String> {
    let exe_path =
        env::current_exe().map_err(|e| format!("Unable to locate Teex executable: {e}"))?;
    let exe_path = fs::canonicalize(&exe_path).unwrap_or(exe_path);
    ensure_cli_source_path_is_stable(&exe_path)?;

    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to determine your home directory".to_string())?;

    let install_dir = preferred_cli_install_dir(&home);
    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Unable to create {}: {e}", install_dir.display()))?;

    let link_path = install_dir.join("teex");
    if let Ok(metadata) = fs::symlink_metadata(&link_path) {
        let file_type = metadata.file_type();
        if file_type.is_dir() && !file_type.is_symlink() {
            return Err(format!(
                "{} already exists and is a directory",
                link_path.display()
            ));
        }

        fs::remove_file(&link_path)
            .map_err(|e| format!("Unable to replace existing {}: {e}", link_path.display()))?;
    }

    unix_fs::symlink(&exe_path, &link_path).map_err(|e| {
        format!(
            "Unable to create symlink {} -> {}: {e}",
            link_path.display(),
            exe_path.display()
        )
    })?;

    Ok((
        link_path.clone(),
        path_contains_dir(link_path.parent().unwrap_or(&install_dir)),
    ))
}

#[cfg(target_os = "macos")]
fn ensure_cli_source_path_is_stable(exe_path: &Path) -> Result<(), String> {
    if exe_path.starts_with("/Volumes/") {
        return Err(
            "Teex appears to be running from the mounted installer image. Drag Teex to Applications, open it from there, then try “Install Command Line Tool...” again.".to_string(),
        );
    }

    let exe_string = exe_path.to_string_lossy();
    if exe_string.contains("/AppTranslocation/") {
        return Err(
            "Teex is running from a temporary App Translocation path. Move it to a permanent location (for example /Applications), reopen it, then try again.".to_string(),
        );
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn preferred_cli_install_dir(home: &Path) -> PathBuf {
    let home_bin = home.join("bin");
    if path_contains_dir(&home_bin) {
        return home_bin;
    }

    let local_bin = home.join(".local").join("bin");
    if path_contains_dir(&local_bin) {
        return local_bin;
    }

    local_bin
}

#[cfg(target_os = "macos")]
fn path_contains_dir(dir: &Path) -> bool {
    env::var_os("PATH")
        .map(|raw| env::split_paths(&raw).any(|entry| entry == dir))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_COUNTER: AtomicUsize = AtomicUsize::new(1);
    #[cfg(target_os = "macos")]
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct TempTestDir {
        path: PathBuf,
    }

    impl TempTestDir {
        fn new() -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let id = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "teex-tests-{}-{}-{}",
                std::process::id(),
                nanos,
                id
            ));
            fs::create_dir_all(&path).expect("create temp test dir");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }

        fn write_text(&self, relative: &str, content: &str) -> PathBuf {
            let path = self.path.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create parent dirs");
            }
            fs::write(&path, content).expect("write text fixture");
            path
        }

        fn write_bytes(&self, relative: &str, content: &[u8]) -> PathBuf {
            let path = self.path.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create parent dirs");
            }
            fs::write(&path, content).expect("write binary fixture");
            path
        }

        fn mkdir(&self, relative: &str) -> PathBuf {
            let path = self.path.join(relative);
            fs::create_dir_all(&path).expect("create fixture directory");
            path
        }
    }

    impl Drop for TempTestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn categorize_paths_prefers_single_folder_when_no_files() {
        let temp = TempTestDir::new();
        let folder = temp.mkdir("project");

        let result = categorize_paths(vec![
            "".to_string(),
            "   ".to_string(),
            temp.path().join("missing.txt").to_string_lossy().to_string(),
            folder.to_string_lossy().to_string(),
        ]);

        assert_eq!(result.mode, "folder");
        assert_eq!(result.path, Some(folder.to_string_lossy().to_string()));
        assert!(result.paths.is_empty());
    }

    #[test]
    fn categorize_paths_prefers_multiple_files_over_folders() {
        let temp = TempTestDir::new();
        let file_a = temp.write_text("a.md", "# A");
        let file_b = temp.write_text("b.txt", "B");
        let folder = temp.mkdir("folder");

        let result = categorize_paths(vec![
            folder.to_string_lossy().to_string(),
            file_a.to_string_lossy().to_string(),
            file_b.to_string_lossy().to_string(),
        ]);

        assert_eq!(result.mode, "files");
        assert_eq!(result.path, None);
        assert_eq!(
            result.paths,
            vec![
                file_a.to_string_lossy().to_string(),
                file_b.to_string_lossy().to_string()
            ]
        );
    }

    #[test]
    fn categorize_paths_returns_single_file_mode_for_one_valid_file() {
        let temp = TempTestDir::new();
        let file = temp.write_text("note.md", "hello");

        let result = categorize_paths(vec![
            temp.path().join("missing.md").to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        ]);

        assert_eq!(result.mode, "file");
        assert_eq!(result.path, Some(file.to_string_lossy().to_string()));
        assert!(result.paths.is_empty());
    }

    #[test]
    fn list_project_entries_filters_hidden_binary_and_build_artifacts() {
        let temp = TempTestDir::new();
        let root = temp.path().to_path_buf();

        temp.write_text("a.md", "# root");
        temp.write_text("nested/b.txt", "text");
        temp.write_text("nested/c.JSON", "{}");
        temp.write_text(".hidden.md", "skip");
        temp.write_text(".git/ignored.md", "skip");
        temp.write_text("node_modules/ignored.js", "skip");
        temp.write_text("target/ignored.rs", "skip");
        temp.write_text("dist/ignored.txt", "skip");
        temp.write_text("build/ignored.txt", "skip");
        temp.write_text(".config/ignored.yaml", "skip");
        temp.write_bytes("image.png", &[0x89, b'P', b'N', b'G']);

        let mut entries = list_project_entries(root.to_string_lossy().to_string())
            .expect("list project entries should succeed");

        entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));

        let rel_nested_b = Path::new("nested").join("b.txt").to_string_lossy().to_string();
        let rel_nested_c = Path::new("nested")
            .join("c.JSON")
            .to_string_lossy()
            .to_string();

        let rel_paths: Vec<String> = entries.iter().map(|e| e.rel_path.clone()).collect();
        assert_eq!(rel_paths, vec!["a.md".to_string(), rel_nested_b, rel_nested_c]);

        assert!(entries.iter().all(|e| e.path.starts_with(root.to_string_lossy().as_ref())));
    }

    #[test]
    fn list_project_entries_errors_when_root_is_not_directory() {
        let temp = TempTestDir::new();
        let file = temp.write_text("just-a-file.txt", "hi");

        let error = list_project_entries(file.to_string_lossy().to_string()).unwrap_err();
        assert!(error.contains("not a folder"));
    }

    #[test]
    fn read_and_write_text_file_round_trip_preserves_content_and_kind() {
        let temp = TempTestDir::new();
        let file = temp.path().join("draft.md");
        let file_string = file.to_string_lossy().to_string();

        write_text_file(file_string.clone(), "# Title\n\nBody".to_string())
            .expect("write text file should succeed");

        let payload = read_text_file(file_string.clone()).expect("read text file should succeed");
        assert_eq!(payload.path, file_string);
        assert_eq!(payload.content, "# Title\n\nBody");
        assert_eq!(payload.kind, "markdown");
        assert!(payload.writable);
    }

    #[test]
    fn read_text_file_returns_error_for_missing_or_non_utf8_files() {
        let temp = TempTestDir::new();
        let missing = temp.path().join("missing.txt");
        let missing_error = read_text_file(missing.to_string_lossy().to_string()).unwrap_err();
        assert!(missing_error.contains("not found"));

        let binary = temp.write_bytes("bad.txt", &[0xFF, 0xFE, 0x00]);
        let utf8_error = read_text_file(binary.to_string_lossy().to_string()).unwrap_err();
        assert!(utf8_error.contains("UTF-8"));
    }

    #[test]
    fn file_type_helpers_are_case_insensitive_for_supported_extensions() {
        assert!(is_markdown(Path::new("README.MD")));
        assert!(is_markdown(Path::new("notes.Markdown")));
        assert!(!is_markdown(Path::new("notes.txt")));

        assert!(is_text_like(Path::new("data.JSON")));
        assert!(is_text_like(Path::new("script.TSX")));
        assert!(!is_text_like(Path::new("archive.zip")));
        assert!(!is_text_like(Path::new("no_extension")));

        assert_eq!(file_kind(Path::new("post.md")), "markdown");
        assert_eq!(file_kind(Path::new("post.txt")), "text");
    }

    #[test]
    fn utility_helpers_build_expected_strings_and_ids() {
        assert_eq!(window_event("teex://open", "teex-window-2"), "teex://open/teex-window-2");
        assert_eq!(path_to_string(Path::new("/tmp/example.txt")), "/tmp/example.txt");

        let a = next_transfer_request_id();
        let b = next_transfer_request_id();
        assert!(a.starts_with("tab-transfer-"));
        assert!(b.starts_with("tab-transfer-"));
        assert_ne!(a, b);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn ensure_cli_source_path_is_stable_rejects_transient_locations() {
        let volumes_error =
            ensure_cli_source_path_is_stable(Path::new("/Volumes/Teex/Teex.app")).unwrap_err();
        assert!(volumes_error.contains("mounted installer image"));

        let translocation_error = ensure_cli_source_path_is_stable(Path::new(
            "/private/var/folders/.../AppTranslocation/Teex.app/Contents/MacOS/teex",
        ))
        .unwrap_err();
        assert!(translocation_error.contains("App Translocation"));

        assert!(ensure_cli_source_path_is_stable(Path::new(
            "/Applications/Teex.app/Contents/MacOS/teex"
        ))
        .is_ok());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn preferred_cli_install_dir_respects_existing_path_entries() {
        let _guard = ENV_LOCK.lock().expect("lock env");
        let temp = TempTestDir::new();
        let home = temp.mkdir("home");
        let home_bin = home.join("bin");
        let local_bin = home.join(".local").join("bin");
        fs::create_dir_all(&home_bin).expect("create ~/bin");
        fs::create_dir_all(&local_bin).expect("create ~/.local/bin");

        let original_path = env::var_os("PATH");
        let path_with_home_bin = env::join_paths([home_bin.clone(), PathBuf::from("/usr/bin")])
            .expect("join PATH");
        env::set_var("PATH", path_with_home_bin);
        assert_eq!(preferred_cli_install_dir(&home), home_bin);

        let path_with_local_bin = env::join_paths([local_bin.clone(), PathBuf::from("/usr/bin")])
            .expect("join PATH");
        env::set_var("PATH", path_with_local_bin);
        assert_eq!(preferred_cli_install_dir(&home), local_bin.clone());

        env::set_var("PATH", "/usr/bin");
        assert_eq!(preferred_cli_install_dir(&home), local_bin);

        match original_path {
            Some(value) => env::set_var("PATH", value),
            None => env::remove_var("PATH"),
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn path_contains_dir_requires_exact_path_match() {
        let _guard = ENV_LOCK.lock().expect("lock env");
        let temp = TempTestDir::new();
        let home = temp.mkdir("home");
        let home_bin = home.join("bin");
        let sibling = home.join("bin-tools");
        fs::create_dir_all(&home_bin).expect("create dir");
        fs::create_dir_all(&sibling).expect("create dir");

        let original_path = env::var_os("PATH");
        let joined = env::join_paths([home_bin.clone(), PathBuf::from("/usr/bin")]).expect("PATH");
        env::set_var("PATH", joined);

        assert!(path_contains_dir(&home_bin));
        assert!(!path_contains_dir(&sibling));

        match original_path {
            Some(value) => env::set_var("PATH", value),
            None => env::remove_var("PATH"),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    apple_events::install();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .menu(|app| {
            let open_file_item = MenuItem::with_id(
                app,
                MENU_OPEN_FILE,
                "Open File...",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let open_folder_item = MenuItem::with_id(
                app,
                MENU_OPEN_FOLDER,
                "Open Folder...",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?;
            let new_window_item = MenuItem::with_id(
                app,
                MENU_NEW_WINDOW,
                "New Window",
                true,
                Some("CmdOrCtrl+N"),
            )?;
            let merge_all_windows_item = MenuItem::with_id(
                app,
                MENU_MERGE_ALL_WINDOWS_INTO_THIS_WINDOW,
                "Merge All Windows Into This Window",
                true,
                None::<&str>,
            )?;
            #[cfg(target_os = "macos")]
            let install_cli_item = MenuItem::with_id(
                app,
                MENU_INSTALL_CLI,
                "Install Command Line Tool...",
                true,
                None::<&str>,
            )?;
            let close_active_file_item = MenuItem::with_id(
                app,
                MENU_CLOSE_ACTIVE_FILE,
                "Close File",
                true,
                Some("CmdOrCtrl+W"),
            )?;
            let close_window_item = MenuItem::with_id(
                app,
                MENU_CLOSE_WINDOW,
                "Close Window",
                true,
                Some("CmdOrCtrl+Shift+W"),
            )?;
            let toggle_sidebar_item = MenuItem::with_id(
                app,
                MENU_TOGGLE_SIDEBAR,
                "Toggle Sidebar",
                true,
                Some("CmdOrCtrl+\\\\"),
            )?;
            let toggle_markdown_mode_item = MenuItem::with_id(
                app,
                MENU_TOGGLE_MARKDOWN_MODE,
                "Toggle Markdown Edit/Preview",
                true,
                Some("CmdOrCtrl+E"),
            )?;

            let file_submenu = SubmenuBuilder::new(app, "File")
                .items(&[
                    &new_window_item,
                    &open_file_item,
                    &open_folder_item,
                    &PredefinedMenuItem::separator(app)?,
                    &close_active_file_item,
                    &close_window_item,
                    #[cfg(not(target_os = "macos"))]
                    &PredefinedMenuItem::quit(app, None)?,
                ])
                .build()?;

            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .items(&[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ])
                .build()?;

            let view_submenu = SubmenuBuilder::new(app, "View")
                .items(&[
                    &toggle_sidebar_item,
                    &PredefinedMenuItem::separator(app)?,
                    &toggle_markdown_mode_item,
                ])
                .build()?;

            let window_submenu = SubmenuBuilder::new(app, "Window")
                .items(&[&merge_all_windows_item])
                .build()?;

            let mut top_level_items: Vec<&dyn tauri::menu::IsMenuItem<_>> = Vec::new();

            #[cfg(target_os = "macos")]
            let app_submenu = SubmenuBuilder::new(app, app.package_info().name.clone())
                .items(&[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &install_cli_item,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ])
                .build()?;

            #[cfg(target_os = "macos")]
            top_level_items.push(&app_submenu);

            top_level_items.push(&file_submenu);
            top_level_items.push(&edit_submenu);
            top_level_items.push(&view_submenu);
            top_level_items.push(&window_submenu);

            MenuBuilder::new(app).items(&top_level_items).build()
        })
        .setup(|app| {
            if let Some(menu) = app.menu() {
                let _ = set_menu_item_enabled(&menu, MENU_TOGGLE_SIDEBAR, false);
                let _ = set_menu_item_enabled(&menu, MENU_TOGGLE_MARKDOWN_MODE, false);
            }
            let initial_label = app.webview_windows().keys().next().cloned();
            app.manage(FocusTracker {
                label: Mutex::new(initial_label),
                recently_created: Mutex::new(None),
            });
            app.manage(PendingOpenPaths {
                global_paths: Mutex::new(Vec::new()),
                by_window: Mutex::new(HashMap::new()),
            });
            #[cfg(target_os = "macos")]
            {
                let paths = apple_events::take_paths();
                if !paths.is_empty() {
                    queue_open_paths(app.handle(), &paths);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(true) = event {
                set_tracked_window_label(window.app_handle(), window.label().to_string());
            }
        })
        .on_menu_event(|app, event| {
            handle_app_menu_event(app, event);
        })
        .invoke_handler(tauri::generate_handler![
            get_launch_context,
            categorize_paths,
            get_window_label,
            list_project_entries,
            read_text_file,
            write_text_file,
            set_window_title,
            set_menu_state,
            close_current_window,
            route_tab_transfer,
            route_tab_transfer_result,
            notify_window_focused,
            take_pending_open_paths,
            open_paths_in_new_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[allow(unused_variables)]
    app.run(|app_handle, event| {
        // Drain file URLs captured by our safe application:openURLs: replacement.
        // This handles both first-launch and subsequent file opens.
        #[cfg(target_os = "macos")]
        {
            let paths = apple_events::take_paths();
            if !paths.is_empty() {
                queue_open_paths(app_handle, &paths);
                emit_os_open_paths(app_handle, paths);
            }
        }
        // Fallback for iOS (which doesn't use the swizzle).
        #[cfg(target_os = "ios")]
        if let RunEvent::Opened { urls } = event {
            let paths: Vec<PathBuf> = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect();
            queue_open_paths(app_handle, &paths);
            emit_os_open_paths(app_handle, paths);
        }
    });
}
