use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchContext {
    pub(crate) mode: String,
    pub(crate) path: Option<String>,
    pub(crate) paths: Vec<String>,
}

pub(crate) fn queue_open_paths(app: &tauri::AppHandle, paths: &[PathBuf]) {
    let pending = app.state::<PendingOpenPaths>();
    if let Ok(mut queued) = pending.global_paths.lock() {
        queued.extend(paths.iter().map(|p| path_to_string(p)));
    };
}

pub(crate) fn queue_open_paths_for_window(app: &tauri::AppHandle, label: &str, paths: &[PathBuf]) {
    let pending = app.state::<PendingOpenPaths>();
    if let Ok(mut queued) = pending.by_window.lock() {
        queued
            .entry(label.to_string())
            .or_default()
            .extend(paths.iter().map(|p| path_to_string(p)));
    };
}

pub(crate) fn clear_pending_open_paths_for_window(app: &tauri::AppHandle, label: &str) {
    let pending = app.state::<PendingOpenPaths>();
    if let Ok(mut queued) = pending.by_window.lock() {
        queued.remove(label);
    };
}

#[tauri::command]
pub(crate) fn get_launch_context() -> LaunchContext {
    let mut args = env::args();
    let _ = args.next();

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
pub(crate) fn categorize_paths(paths: Vec<String>) -> LaunchContext {
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
pub(crate) fn take_pending_open_paths(window: tauri::Window) -> Vec<String> {
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
pub(crate) fn open_paths_in_new_window(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<(), String> {
    let open_paths: Vec<PathBuf> = paths
        .into_iter()
        .filter(|raw| !raw.trim().is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists() && (path.is_file() || path.is_dir()))
        .collect();

    if open_paths.is_empty() {
        return Ok(());
    }

    let label = next_window_label();
    queue_open_paths_for_window(&app, &label, &open_paths);

    if let Err(err) = build_new_window(&app, label.clone()) {
        clear_pending_open_paths_for_window(&app, &label);
        return Err(err);
    }

    Ok(())
}
