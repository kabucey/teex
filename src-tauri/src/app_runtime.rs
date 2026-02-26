use super::*;
use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
#[cfg(target_os = "ios")]
use tauri::RunEvent;

pub(crate) fn run_app() {
    #[cfg(target_os = "macos")]
    apple_events::install();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .menu(build_app_menu)
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
            route_tab_transfer,
            route_tab_transfer_result,
            notify_window_focused,
            take_pending_open_paths,
            watch_project_folder,
            clear_project_folder_watch,
            watch_project_files,
            open_paths_in_new_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[allow(unused_variables)]
    app.run(|app_handle, event| {
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

fn build_app_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<tauri::menu::Menu<R>> {
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
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
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
    app.manage(FolderWatchRegistry {
        by_window: Mutex::new(HashMap::new()),
    });
    app.manage(FileWatchRegistry {
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
