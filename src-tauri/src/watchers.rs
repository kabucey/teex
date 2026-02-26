use super::*;

fn should_emit_folder_watch_event(event: &Event) -> bool {
    matches!(
        event.kind,
        EventKind::Create(_)
            | EventKind::Modify(ModifyKind::Name(_))
            | EventKind::Remove(_)
            | EventKind::Any
            | EventKind::Other
    )
}

pub(super) fn clear_project_folder_watch_for_label(app: &tauri::AppHandle, label: &str) {
    let registry = app.state::<FolderWatchRegistry>();
    if let Ok(mut watches) = registry.by_window.lock() {
        watches.remove(label);
    };
}

fn should_emit_file_watch_event(event: &Event) -> bool {
    matches!(
        event.kind,
        EventKind::Create(_)
            | EventKind::Modify(_)
            | EventKind::Remove(_)
            | EventKind::Any
            | EventKind::Other
    )
}

pub(super) fn clear_project_file_watch_for_label(app: &tauri::AppHandle, label: &str) {
    let registry = app.state::<FileWatchRegistry>();
    if let Ok(mut watches) = registry.by_window.lock() {
        watches.remove(label);
    };
}

pub(super) fn install_project_folder_watch(
    app: &tauri::AppHandle,
    label: &str,
    root: PathBuf,
) -> Result<(), String> {
    let canonical_root = fs::canonicalize(&root).unwrap_or(root);
    if !canonical_root.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    {
        let registry = app.state::<FolderWatchRegistry>();
        if let Ok(watches) = registry.by_window.lock() {
            if let Some(existing) = watches.get(label) {
                if existing.root == canonical_root {
                    return Ok(());
                }
            }
        };
    }

    let app_handle = app.clone();
    let label_string = label.to_string();
    let last_emitted = Arc::new(Mutex::new(Instant::now() - FOLDER_WATCH_DEBOUNCE));
    let throttle = Arc::clone(&last_emitted);

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let Ok(event) = result else {
                return;
            };

            if !should_emit_folder_watch_event(&event) {
                return;
            }

            let now = Instant::now();
            let Ok(mut last) = throttle.lock() else {
                return;
            };
            if now.duration_since(*last) < FOLDER_WATCH_DEBOUNCE {
                return;
            }
            *last = now;

            emit_to_window(&app_handle, &label_string, EVENT_PROJECT_FOLDER_CHANGED, ());
        },
        NotifyConfig::default(),
    )
    .map_err(|e| format!("Unable to start folder watcher: {e}"))?;

    watcher
        .watch(&canonical_root, RecursiveMode::Recursive)
        .map_err(|e| format!("Unable to watch folder: {e}"))?;

    let registry = app.state::<FolderWatchRegistry>();
    let mut watches = registry
        .by_window
        .lock()
        .map_err(|_| "Unable to update folder watcher registry".to_string())?;
    watches.insert(
        label.to_string(),
        WindowFolderWatch {
            root: canonical_root,
            _watcher: watcher,
        },
    );
    Ok(())
}

fn normalize_watched_file_paths(paths: Vec<String>) -> Vec<PathBuf> {
    let mut normalized = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for raw in paths {
        if raw.trim().is_empty() {
            continue;
        }

        let path = PathBuf::from(raw);
        let canonical = fs::canonicalize(&path).unwrap_or(path);
        if !canonical.exists() || !canonical.is_file() {
            continue;
        }
        if seen.insert(canonical.clone()) {
            normalized.push(canonical);
        }
    }

    normalized.sort();
    normalized
}

pub(super) fn install_project_file_watch(
    app: &tauri::AppHandle,
    label: &str,
    paths: Vec<String>,
) -> Result<(), String> {
    let normalized_paths = normalize_watched_file_paths(paths);
    if normalized_paths.is_empty() {
        clear_project_file_watch_for_label(app, label);
        return Ok(());
    }

    {
        let registry = app.state::<FileWatchRegistry>();
        if let Ok(watches) = registry.by_window.lock() {
            if let Some(existing) = watches.get(label) {
                if existing.paths == normalized_paths {
                    return Ok(());
                }
            }
        };
    }

    let app_handle = app.clone();
    let label_string = label.to_string();
    let last_emitted_by_path: Arc<Mutex<HashMap<String, Instant>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let throttle = Arc::clone(&last_emitted_by_path);

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let Ok(event) = result else {
                return;
            };

            if !should_emit_file_watch_event(&event) {
                return;
            }

            let now = Instant::now();
            let Ok(mut emitted) = throttle.lock() else {
                return;
            };

            for path in &event.paths {
                let path_string = path_to_string(path);
                let should_emit = emitted
                    .get(&path_string)
                    .map(|last| now.duration_since(*last) >= FILE_WATCH_DEBOUNCE)
                    .unwrap_or(true);
                if !should_emit {
                    continue;
                }
                emitted.insert(path_string.clone(), now);
                emit_to_window(
                    &app_handle,
                    &label_string,
                    EVENT_PROJECT_FILE_CHANGED,
                    path_string,
                );
            }
        },
        NotifyConfig::default(),
    )
    .map_err(|e| format!("Unable to start file watcher: {e}"))?;

    for path in &normalized_paths {
        watcher
            .watch(path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Unable to watch file: {e}"))?;
    }

    let registry = app.state::<FileWatchRegistry>();
    let mut watches = registry
        .by_window
        .lock()
        .map_err(|_| "Unable to update file watcher registry".to_string())?;
    watches.insert(
        label.to_string(),
        WindowFileWatch {
            paths: normalized_paths,
            _watcher: watcher,
        },
    );
    Ok(())
}
