use super::*;
use crate::menu::build_app_menu;
#[cfg(target_os = "ios")]
use tauri::RunEvent;

pub(crate) fn run_app() {
    #[cfg(target_os = "macos")]
    macos::apple_events::install();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("localimage", |_ctx, request| serve_local_image(request))
        .setup(setup_app)
        .on_window_event(handle_window_event)
        .on_menu_event(|app, event| {
            handle_app_menu_event(app, event);
        })
        .invoke_handler(tauri::generate_handler![
            get_launch_context,
            categorize_paths,
            get_window_label,
            get_all_window_labels,
            list_project_entries,
            read_text_file,
            write_text_file,
            format_structured_text,
            set_window_title,
            set_menu_state,
            close_current_window,
            focus_window,
            open_in_file_manager,
            route_tab_transfer,
            route_tab_transfer_result,
            notify_window_focused,
            take_pending_open_paths,
            watch_project_folder,
            clear_project_folder_watch,
            watch_project_files,
            open_paths_in_new_window,
            set_theme,
            report_drag_position,
            cancel_cross_window_drag_hover,
            show_tab_drag_preview,
            hide_tab_drag_preview,
            get_drag_preview_content,
            create_window_from_drag,
            trash_file,
            show_sidebar_context_menu,
            set_show_hidden_files_checked,
            set_show_modified_only_checked,
            add_recent_file,
            add_recent_folder,
            git_status,
            git_diff,
            git_diff_all,
            get_folder_icon
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[allow(unused_variables)]
    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        drain_mac_service_requests(app_handle);

        #[cfg(target_os = "macos")]
        {
            let paths = macos::apple_events::take_paths();
            if !paths.is_empty() {
                launch::queue_open_paths(app_handle, &paths);
                menu_events::emit_os_open_paths(app_handle, paths);
            }
        }

        #[cfg(target_os = "ios")]
        if let RunEvent::Opened { urls } = event {
            let paths: Vec<PathBuf> = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect();
            launch::queue_open_paths(app_handle, &paths);
            menu_events::emit_os_open_paths(app_handle, paths);
        }
    });
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    recent_files::init(app);

    let (menu, theme_state) = build_app_menu(app.handle())?;
    app.set_menu(menu.clone())?;
    app.manage(theme_state);

    let _ = set_menu_item_enabled(&menu, MENU_TOGGLE_SIDEBAR, false);
    let _ = set_menu_item_enabled(&menu, MENU_TOGGLE_MARKDOWN_MODE, false);

    let initial_label = app.webview_windows().keys().next().cloned();
    app.manage(FocusTracker {
        label: Mutex::new(initial_label),
        recently_created: Mutex::new(None),
    });
    app.manage(PendingOpenPaths {
        global_paths: Mutex::new(Vec::new()),
        by_window: Mutex::new(HashMap::new()),
    });
    app.manage(FolderWatchRegistry {
        by_window: Mutex::new(HashMap::new()),
    });
    app.manage(FileWatchRegistry {
        by_window: Mutex::new(HashMap::new()),
    });
    app.manage(CrossWindowDragRegistry::new());
    app.manage(TabDragPreviewState::new());

    #[cfg(target_os = "macos")]
    {
        macos::services::install();
        macos::mouse_nav::install(app.handle());
        drain_mac_service_requests(app.handle());

        let paths = macos::apple_events::take_paths();
        if !paths.is_empty() {
            queue_open_paths(app.handle(), &paths);
        }
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn drain_mac_service_requests(app: &tauri::AppHandle) {
    for request in macos::services::take_requests() {
        handle_mac_service_request(app, request);
    }
}

#[cfg(target_os = "macos")]
fn handle_mac_service_request(app: &tauri::AppHandle, request: macos::services::ServiceRequest) {
    let path = request.path;

    match request.action {
        macos::services::ServiceAction::NewFileTabHere => {
            if let Some(window) = menu_events::target_window(app) {
                emit_to_window(
                    app,
                    window.label(),
                    EVENT_OPEN_FILE_SELECTED,
                    path_to_string(&path),
                );
                return;
            }

            queue_open_paths(app, &[path]);
        }
        macos::services::ServiceAction::NewWindowHere => {
            let _ = open_paths_in_new_window(app.clone(), vec![path_to_string(&path)]);
        }
    }
}

fn handle_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::Focused(true) = event {
        set_tracked_window_label(window.app_handle(), window.label().to_string());
    }
    if let tauri::WindowEvent::Destroyed = event {
        clear_project_folder_watch_for_label(window.app_handle(), window.label());
        clear_project_file_watch_for_label(window.app_handle(), window.label());
        cleanup_drag_entries_for_window(window.app_handle(), window.label());
    }
}

fn theme_from_str(value: &str) -> Option<tauri::Theme> {
    match value {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    }
}

pub(crate) fn apply_theme(app: &tauri::AppHandle, theme: &str) {
    let native_theme = theme_from_str(theme);
    for window in app.webview_windows().values() {
        let _ = window.set_theme(native_theme);
    }
    let items = app.state::<ThemeMenuState>();
    let _ = items
        .system
        .set_checked(theme != "light" && theme != "dark");
    let _ = items.light.set_checked(theme == "light");
    let _ = items.dark.set_checked(theme == "dark");
}

fn serve_local_image(request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let path = percent_encoding::percent_decode_str(request.uri().path())
        .decode_utf8_lossy()
        .into_owned();
    let file_path = std::path::Path::new(&path);

    let Ok(data) = std::fs::read(file_path) else {
        return http::Response::builder()
            .status(404)
            .body(Vec::new())
            .unwrap();
    };

    let mime = match file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    };

    http::Response::builder()
        .status(200)
        .header("Content-Type", mime)
        .body(data)
        .unwrap()
}

#[tauri::command]
fn set_theme(app: tauri::AppHandle, theme: String) {
    apply_theme(&app, &theme);
}
