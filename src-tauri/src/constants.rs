use std::sync::atomic::AtomicUsize;
use std::time::Duration;

// Frontend event names
pub(crate) const EVENT_OPEN_FILE_SELECTED: &str = "teex://open-file-selected";
pub(crate) const EVENT_OPEN_FOLDER_SELECTED: &str = "teex://open-folder-selected";
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub(crate) const EVENT_OS_OPEN_PATHS: &str = "teex://os-open-paths";
pub(crate) const EVENT_PROJECT_FOLDER_CHANGED: &str = "teex://project-folder-changed";
pub(crate) const EVENT_PROJECT_FILE_CHANGED: &str = "teex://project-file-changed";
pub(crate) const EVENT_TOGGLE_SIDEBAR: &str = "teex://toggle-sidebar";
pub(crate) const EVENT_TOGGLE_MARKDOWN_MODE: &str = "teex://toggle-markdown-mode";
pub(crate) const EVENT_CLOSE_ACTIVE_FILE: &str = "teex://close-active-file";
pub(crate) const EVENT_NEW_TAB: &str = "teex://new-tab";
pub(crate) const EVENT_REQUEST_EXPORT_ALL_TABS: &str = "teex://request-export-all-tabs";
pub(crate) const EVENT_RECEIVE_TRANSFERRED_TABS: &str = "teex://receive-transferred-tabs";
pub(crate) const EVENT_TAB_TRANSFER_RESULT: &str = "teex://tab-transfer-result";
pub(crate) const EVENT_CONTEXT_MENU_DELETE: &str = "teex://context-menu-delete";
pub(crate) const EVENT_CROSS_WINDOW_DRAG_ENTER: &str = "teex://cross-window-drag-enter";
pub(crate) const EVENT_CROSS_WINDOW_DRAG_LEAVE: &str = "teex://cross-window-drag-leave";
#[cfg(target_os = "macos")]
pub(crate) const EVENT_MOUSE_NAV_BACK: &str = "teex://mouse-nav-back";
#[cfg(target_os = "macos")]
pub(crate) const EVENT_MOUSE_NAV_FORWARD: &str = "teex://mouse-nav-forward";
pub(crate) const EVENT_TOGGLE_STATUS_BAR: &str = "teex://toggle-status-bar";
pub(crate) const EVENT_TOGGLE_HIDDEN_FILES: &str = "teex://toggle-hidden-files";
pub(crate) const EVENT_TOGGLE_MODIFIED_ONLY: &str = "teex://toggle-modified-only";
pub(crate) const EVENT_FIND: &str = "teex://find";
pub(crate) const EVENT_SET_THEME: &str = "teex://set-theme";
pub(crate) const EVENT_RESTORE_SESSION: &str = "teex://restore-session";
pub(crate) const EVENT_OPEN_RECENT_FILE: &str = "teex://open-recent-file";
pub(crate) const EVENT_OPEN_RECENT_FOLDER: &str = "teex://open-recent-folder";

// Menu item IDs
pub(crate) const MENU_OPEN_FILE: &str = "open_file";
pub(crate) const MENU_OPEN_FOLDER: &str = "open_folder";
pub(crate) const MENU_NEW_WINDOW: &str = "new_window";
pub(crate) const MENU_MERGE_ALL_WINDOWS_INTO_THIS_WINDOW: &str = "merge_all_windows_into_this_window";
pub(crate) const MENU_INSTALL_CLI: &str = "install_cli";
pub(crate) const MENU_SET_DEFAULT_MARKDOWN: &str = "set_default_markdown";
pub(crate) const MENU_CLOSE_ACTIVE_FILE: &str = "close_active_file";
pub(crate) const MENU_CLOSE_WINDOW: &str = "close_window";
pub(crate) const MENU_TOGGLE_SIDEBAR: &str = "toggle_sidebar";
pub(crate) const MENU_NEW_TAB: &str = "new_tab";
pub(crate) const MENU_TOGGLE_MARKDOWN_MODE: &str = "toggle_markdown_mode";
pub(crate) const MENU_TOGGLE_STATUS_BAR: &str = "toggle_status_bar";
pub(crate) const MENU_SHOW_HIDDEN_FILES: &str = "show_hidden_files";
pub(crate) const MENU_SHOW_MODIFIED_ONLY: &str = "show_modified_only";
pub(crate) const MENU_FIND: &str = "find";
pub(crate) const MENU_THEME_SYSTEM: &str = "theme_system";
pub(crate) const MENU_THEME_LIGHT: &str = "theme_light";
pub(crate) const MENU_THEME_DARK: &str = "theme_dark";
pub(crate) const MENU_RESTORE_SESSION: &str = "restore_session";
pub(crate) const MENU_CLEAR_RECENTS: &str = "clear_recents";
pub(crate) const MENU_RECENT_FILE_PREFIX: &str = "recent_file:";
pub(crate) const MENU_RECENT_FOLDER_PREFIX: &str = "recent_folder:";

// Global counters
pub(crate) static NEXT_WINDOW_ID: AtomicUsize = AtomicUsize::new(1);
pub(crate) static NEXT_TRANSFER_REQUEST_ID: AtomicUsize = AtomicUsize::new(1);

// Timing
pub(crate) const FOLDER_WATCH_DEBOUNCE: Duration = Duration::from_millis(250);
pub(crate) const FILE_WATCH_DEBOUNCE: Duration = Duration::from_millis(250);
