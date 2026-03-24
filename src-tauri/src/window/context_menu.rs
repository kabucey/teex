use crate::constants::EVENT_CONTEXT_MENU_DELETE;
use crate::menu_events::emit_to_window;
use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub(crate) fn show_sidebar_context_menu(window: tauri::Window, path: String) -> Result<(), String> {
    let app = window.app_handle().clone();
    let label = window.label().to_string();

    let reveal_label = if cfg!(target_os = "macos") {
        "Reveal in Finder"
    } else if cfg!(target_os = "windows") {
        "Show in Explorer"
    } else {
        "Reveal File"
    };

    let reveal_item = MenuItem::with_id(&app, "context_reveal", reveal_label, true, None::<&str>)
        .map_err(|e| format!("Unable to create menu item: {e}"))?;

    let separator = PredefinedMenuItem::separator(&app)
        .map_err(|e| format!("Unable to create separator: {e}"))?;

    let delete_item = MenuItem::with_id(&app, "context_delete", "Delete", true, None::<&str>)
        .map_err(|e| format!("Unable to create menu item: {e}"))?;

    let menu = MenuBuilder::new(&app)
        .item(&reveal_item)
        .item(&separator)
        .item(&delete_item)
        .build()
        .map_err(|e| format!("Unable to build context menu: {e}"))?;

    window.on_menu_event(move |_window, event| match event.id().0.as_str() {
        "context_reveal" => {
            let _ = app.opener().reveal_item_in_dir(&path);
        }
        "context_delete" => {
            emit_to_window(&app, &label, EVENT_CONTEXT_MENU_DELETE, path.clone());
        }
        _ => {}
    });

    window
        .popup_menu(&menu)
        .map_err(|e| format!("Unable to show context menu: {e}"))?;

    Ok(())
}
