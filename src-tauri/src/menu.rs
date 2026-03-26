use crate::constants::*;
use crate::recent_files;
use crate::ThemeMenuState;
use tauri::menu::{CheckMenuItem, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

pub(crate) fn build_app_menu(
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
    let new_tab_item = MenuItem::with_id(app, MENU_NEW_TAB, "New Tab", true, Some("CmdOrCtrl+T"))?;
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
    #[cfg(target_os = "macos")]
    let set_default_markdown_item = MenuItem::with_id(
        app,
        MENU_SET_DEFAULT_MARKDOWN,
        "Set as Default for Markdown...",
        true,
        None::<&str>,
    )?;
    let restore_session_item = MenuItem::with_id(
        app,
        MENU_RESTORE_SESSION,
        "Restore Last Session",
        true,
        Some("CmdOrCtrl+Shift+R"),
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
        Some("CmdOrCtrl+\\"),
    )?;
    let toggle_markdown_mode_item = MenuItem::with_id(
        app,
        MENU_TOGGLE_MARKDOWN_MODE,
        "Toggle Markdown Edit/Preview",
        true,
        Some("CmdOrCtrl+E"),
    )?;
    let toggle_status_bar_item = MenuItem::with_id(
        app,
        MENU_TOGGLE_STATUS_BAR,
        "Toggle Status Bar",
        true,
        Some("CmdOrCtrl+/"),
    )?;
    let show_hidden_files_item = CheckMenuItem::with_id(
        app,
        MENU_SHOW_HIDDEN_FILES,
        "Show Hidden Files",
        true,
        true,
        Some("CmdOrCtrl+Shift+."),
    )?;
    let show_modified_only_item = CheckMenuItem::with_id(
        app,
        MENU_SHOW_MODIFIED_ONLY,
        "Show Modified Files Only",
        true,
        false,
        Some("CmdOrCtrl+Shift+M"),
    )?;
    let toggle_collapse_all_folders_item = MenuItem::with_id(
        app,
        MENU_TOGGLE_COLLAPSE_ALL_FOLDERS,
        "Expand/Collapse All Folders",
        true,
        Some("CmdOrCtrl+Shift+E"),
    )?;
    let unified_diff_item = MenuItem::with_id(
        app,
        MENU_UNIFIED_DIFF,
        "Review All Changes",
        true,
        Some("CmdOrCtrl+Shift+G"),
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

    let recent_submenu = build_recent_submenu_from_state(app)?;

    let file_submenu = SubmenuBuilder::new(app, "File")
        .items(&[
            &new_tab_item,
            &new_window_item,
            &open_file_item,
            &open_folder_item,
            &recent_submenu,
            &PredefinedMenuItem::separator(app)?,
            &restore_session_item,
            &PredefinedMenuItem::separator(app)?,
            &close_active_file_item,
            &close_window_item,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::quit(app, None)?,
        ])
        .build()?;

    let find_item = MenuItem::with_id(app, MENU_FIND, "Find", true, Some("CmdOrCtrl+F"))?;
    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .items(&[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &find_item,
        ])
        .build()?;

    let view_submenu = SubmenuBuilder::new(app, "View")
        .items(&[
            &toggle_sidebar_item,
            &toggle_status_bar_item,
            &show_hidden_files_item,
            &show_modified_only_item,
            &toggle_collapse_all_folders_item,
            &PredefinedMenuItem::separator(app)?,
            &unified_diff_item,
            &PredefinedMenuItem::separator(app)?,
            &toggle_markdown_mode_item,
            &PredefinedMenuItem::separator(app)?,
            &theme_submenu,
        ])
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .items(&[&merge_all_windows_item])
        .build()?;

    #[cfg(target_os = "macos")]
    let app_submenu = SubmenuBuilder::new(app, app.package_info().name.clone())
        .items(&[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &install_cli_item,
            &set_default_markdown_item,
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
    let top_level_items: Vec<&dyn tauri::menu::IsMenuItem<_>> = vec![
        &app_submenu,
        &file_submenu,
        &edit_submenu,
        &view_submenu,
        &window_submenu,
    ];

    #[cfg(not(target_os = "macos"))]
    let top_level_items: Vec<&dyn tauri::menu::IsMenuItem<_>> =
        vec![&file_submenu, &edit_submenu, &view_submenu, &window_submenu];

    let menu = MenuBuilder::new(app).items(&top_level_items).build()?;
    let theme_state = ThemeMenuState {
        system: theme_system_item,
        light: theme_light_item,
        dark: theme_dark_item,
    };
    Ok((menu, theme_state))
}

fn build_recent_submenu_from_state(
    app: &tauri::AppHandle,
) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    let (files, folders) = if let Some(state) = app.try_state::<recent_files::RecentState>() {
        let files = state.files.lock().unwrap().clone();
        let folders = state.folders.lock().unwrap().clone();
        (files, folders)
    } else {
        (vec![], vec![])
    };
    recent_files::build_recent_submenu(app, &files, &folders)
}
