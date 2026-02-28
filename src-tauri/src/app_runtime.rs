use super::*;
use tauri::menu::{CheckMenuItem, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
#[cfg(target_os = "ios")]
use tauri::RunEvent;

pub(crate) fn run_app() {
    #[cfg(target_os = "macos")]
    apple_events::install();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(setup_app)
        .on_window_event(handle_window_event)
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
            open_in_file_manager,
            route_tab_transfer,
            route_tab_transfer_result,
            notify_window_focused,
            take_pending_open_paths,
            watch_project_folder,
            clear_project_folder_watch,
            watch_project_files,
            open_paths_in_new_window,
            set_theme
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[allow(unused_variables)]
    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        drain_mac_service_requests(app_handle);

        #[cfg(target_os = "macos")]
        {
            let paths = apple_events::take_paths();
            if !paths.is_empty() {
                queue_open_paths(app_handle, &paths);
                emit_os_open_paths(app_handle, paths);
            }
        }

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

fn build_app_menu(
    app: &tauri::AppHandle,
) -> tauri::Result<(tauri::menu::Menu<tauri::Wry>, ThemeMenuState)> {
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
    let new_tab_item = MenuItem::with_id(
        app,
        MENU_NEW_TAB,
        "New Tab",
        true,
        Some("CmdOrCtrl+T"),
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

    let theme_system_item =
        CheckMenuItem::with_id(app, MENU_THEME_SYSTEM, "System", true, true, None::<&str>)?;
    let theme_light_item =
        CheckMenuItem::with_id(app, MENU_THEME_LIGHT, "Light", true, false, None::<&str>)?;
    let theme_dark_item =
        CheckMenuItem::with_id(app, MENU_THEME_DARK, "Dark", true, false, None::<&str>)?;

    let theme_submenu = SubmenuBuilder::new(app, "Theme")
        .items(&[&theme_system_item, &theme_light_item, &theme_dark_item])
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, "File")
        .items(&[
            &new_tab_item,
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
            &PredefinedMenuItem::separator(app)?,
            &theme_submenu,
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

    let menu = MenuBuilder::new(app).items(&top_level_items).build()?;
    let theme_state = ThemeMenuState {
        system: theme_system_item,
        light: theme_light_item,
        dark: theme_dark_item,
    };
    Ok((menu, theme_state))
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
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

    #[cfg(target_os = "macos")]
    {
        mac_services::install();
        drain_mac_service_requests(app.handle());

        let paths = apple_events::take_paths();
        if !paths.is_empty() {
            queue_open_paths(app.handle(), &paths);
        }
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn drain_mac_service_requests(app: &tauri::AppHandle) {
    for request in mac_services::take_requests() {
        handle_mac_service_request(app, request);
    }
}

#[cfg(target_os = "macos")]
fn handle_mac_service_request(app: &tauri::AppHandle, request: mac_services::ServiceRequest) {
    let path = request.path;

    match request.action {
        mac_services::ServiceAction::NewFileTabHere => {
            if let Some(window) = target_window(app) {
                emit_to_window(app, window.label(), EVENT_OPEN_FILE_SELECTED, path_to_string(&path));
                return;
            }

            queue_open_paths(app, &[path]);
        }
        mac_services::ServiceAction::NewWindowHere => {
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
    let _ = items.system.set_checked(theme != "light" && theme != "dark");
    let _ = items.light.set_checked(theme == "light");
    let _ = items.dark.set_checked(theme == "dark");
}

#[tauri::command]
fn set_theme(app: tauri::AppHandle, theme: String) {
    apply_theme(&app, &theme);
}
