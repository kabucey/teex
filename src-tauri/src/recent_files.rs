use super::*;
use tauri::menu::{MenuItem, SubmenuBuilder};

const MAX_RECENT_FILES: usize = 10;
const MAX_RECENT_FOLDERS: usize = 5;
const STORAGE_VERSION: u64 = 1;
const STORAGE_FILE: &str = "recent_files.json";

#[derive(Debug, Serialize, Deserialize)]
struct StoredRecents {
    version: u64,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    folders: Vec<String>,
}

pub(crate) struct RecentState {
    pub files: Mutex<Vec<String>>,
    pub folders: Mutex<Vec<String>>,
}

fn storage_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(STORAGE_FILE))
}

pub(crate) fn load_from_path(path: &Path) -> (Vec<String>, Vec<String>) {
    let Ok(data) = fs::read_to_string(path) else {
        return (vec![], vec![]);
    };
    let Ok(stored) = serde_json::from_str::<StoredRecents>(&data) else {
        return (vec![], vec![]);
    };
    (stored.files, stored.folders)
}

pub(crate) fn save_to_path(path: &Path, files: &[String], folders: &[String]) {
    let stored = StoredRecents {
        version: STORAGE_VERSION,
        files: files.to_vec(),
        folders: folders.to_vec(),
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let Ok(json) = serde_json::to_string_pretty(&stored) else {
        return;
    };
    let _ = fs::write(path, json);
}

pub(crate) fn add_to_list(list: &mut Vec<String>, path: String, cap: usize) {
    list.retain(|p| p != &path);
    list.insert(0, path);
    list.truncate(cap);
}

pub(crate) fn display_name_for_file(path: &str, all_paths: &[String]) -> String {
    let p = Path::new(path);
    let name = p
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let duplicates: Vec<&String> = all_paths
        .iter()
        .filter(|other| {
            Path::new(other.as_str()).file_name().unwrap_or_default()
                == p.file_name().unwrap_or_default()
        })
        .collect();

    if duplicates.len() > 1 {
        if let Some(parent) = p.parent() {
            let dir = parent.file_name().unwrap_or_default().to_string_lossy();
            return format!("{name} — {dir}");
        }
    }
    name
}

pub(crate) fn display_name_for_folder(path: &str) -> String {
    if let Ok(home) = env::var("HOME") {
        let p = Path::new(path);
        if let Ok(stripped) = p.strip_prefix(&home) {
            return format!("~/{}", stripped.display());
        }
    }
    path.to_string()
}

fn save_state(app: &tauri::AppHandle, files: &[String], folders: &[String]) {
    if let Some(path) = storage_path(app) {
        save_to_path(&path, files, folders);
    }
}

fn load_and_manage(app: &tauri::AppHandle) -> (Vec<String>, Vec<String>) {
    let (files, folders) = storage_path(app)
        .map(|p| load_from_path(&p))
        .unwrap_or_default();
    (files, folders)
}

pub(crate) fn init(app: &mut tauri::App) {
    let (files, folders) = load_and_manage(app.handle());
    app.manage(RecentState {
        files: Mutex::new(files),
        folders: Mutex::new(folders),
    });
}

fn add_file_impl(app: &tauri::AppHandle, path: String) {
    let state = app.state::<RecentState>();
    let (files, folders) = {
        let mut files = state.files.lock().unwrap();
        let folders = state.folders.lock().unwrap();
        add_to_list(&mut files, path, MAX_RECENT_FILES);
        (files.clone(), folders.clone())
    };
    save_state(app, &files, &folders);
    rebuild_menu(app);
}

fn add_folder_impl(app: &tauri::AppHandle, path: String) {
    let state = app.state::<RecentState>();
    let (files, folders) = {
        let files = state.files.lock().unwrap();
        let mut folders = state.folders.lock().unwrap();
        add_to_list(&mut folders, path, MAX_RECENT_FOLDERS);
        (files.clone(), folders.clone())
    };
    save_state(app, &files, &folders);
    rebuild_menu(app);
}

pub(crate) fn clear(app: &tauri::AppHandle) {
    let state = app.state::<RecentState>();
    {
        let mut files = state.files.lock().unwrap();
        let mut folders = state.folders.lock().unwrap();
        files.clear();
        folders.clear();
    }
    save_state(app, &[], &[]);
    rebuild_menu(app);
}

pub(crate) fn build_recent_submenu(
    app: &tauri::AppHandle,
    files: &[String],
    folders: &[String],
) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    let mut builder = SubmenuBuilder::new(app, "Open Recent");

    if files.is_empty() && folders.is_empty() {
        let empty = MenuItem::with_id(app, "recent_empty", "No Recent Items", false, None::<&str>)?;
        builder = builder.item(&empty);
    } else {
        for path in files {
            let label = display_name_for_file(path, files);
            let id = format!("{}{}", MENU_RECENT_FILE_PREFIX, path);
            let item = MenuItem::with_id(app, &id, &label, true, None::<&str>)?;
            builder = builder.item(&item);
        }

        if !files.is_empty() && !folders.is_empty() {
            builder = builder.separator();
        }

        for path in folders {
            let label = display_name_for_folder(path);
            let id = format!("{}{}", MENU_RECENT_FOLDER_PREFIX, path);
            let item = MenuItem::with_id(app, &id, &label, true, None::<&str>)?;
            builder = builder.item(&item);
        }

        builder = builder.separator();
        let clear_item =
            MenuItem::with_id(app, MENU_CLEAR_RECENTS, "Clear Recents", true, None::<&str>)?;
        builder = builder.item(&clear_item);
    }

    builder.build()
}

fn rebuild_menu(app: &tauri::AppHandle) {
    let Ok((menu, theme_state)) = crate::menu::build_app_menu(app) else {
        return;
    };
    let _ = app.set_menu(menu);

    // Sync theme check state with current managed state
    let current = app.state::<ThemeMenuState>();
    let _ = theme_state
        .system
        .set_checked(current.system.is_checked().unwrap_or(false));
    let _ = theme_state
        .light
        .set_checked(current.light.is_checked().unwrap_or(false));
    let _ = theme_state
        .dark
        .set_checked(current.dark.is_checked().unwrap_or(false));
}

#[tauri::command]
pub(crate) fn add_recent_file(app: tauri::AppHandle, path: String) {
    add_file_impl(&app, path);
}

#[tauri::command]
pub(crate) fn add_recent_folder(app: tauri::AppHandle, path: String) {
    add_folder_impl(&app, path);
}
