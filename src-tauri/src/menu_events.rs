use super::*;

pub(super) fn set_menu_item_enabled<R: tauri::Runtime>(
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

pub(super) fn window_event(base: &str, label: &str) -> String {
    format!("{}/{}", base, label)
}

pub(super) fn emit_to_window(
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

pub(super) fn emit_os_open_paths(app: &tauri::AppHandle, paths: Vec<PathBuf>) {
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

pub(super) fn next_transfer_request_id() -> String {
    format!(
        "tab-transfer-{}",
        NEXT_TRANSFER_REQUEST_ID.fetch_add(1, Ordering::Relaxed)
    )
}

pub(super) fn target_window(app: &tauri::AppHandle) -> Option<tauri::Window> {
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

    if let Some(focused) = app
        .webview_windows()
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
    {
        return Some(focused.as_ref().window());
    }

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

pub(super) fn handle_app_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
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
        MENU_NEW_TAB => {
            if let Some(window) = target_window(app) {
                emit_to_window(app, window.label(), EVENT_NEW_TAB, ());
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
            cli_install::install_cli_from_menu(app);
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
        MENU_THEME_SYSTEM | MENU_THEME_LIGHT | MENU_THEME_DARK => {
            let theme = match event.id().0.as_str() {
                MENU_THEME_LIGHT => "light",
                MENU_THEME_DARK => "dark",
                _ => "system",
            };
            app_runtime::apply_theme(app, theme);
            let _ = app.emit(EVENT_SET_THEME, theme);
        }
        _ => {}
    }
}
