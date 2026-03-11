use super::*;

pub(crate) struct CrossWindowDragEntry {
    source_label: String,
    current_target_label: Option<String>,
}

pub(crate) struct CrossWindowDragRegistry {
    by_drag_id: Mutex<HashMap<String, CrossWindowDragEntry>>,
}

impl CrossWindowDragRegistry {
    pub(crate) fn new() -> Self {
        Self {
            by_drag_id: Mutex::new(HashMap::new()),
        }
    }
}

fn window_contains_point(
    window: &tauri::WebviewWindow,
    physical_x: i32,
    physical_y: i32,
) -> bool {
    let Ok(pos) = window.outer_position() else {
        return false;
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };

    physical_x >= pos.x
        && physical_x < pos.x + size.width as i32
        && physical_y >= pos.y
        && physical_y < pos.y + size.height as i32
}

fn find_window_at_position(
    app: &tauri::AppHandle,
    source_label: &str,
    physical_x: i32,
    physical_y: i32,
) -> Option<String> {
    for (label, window) in app.webview_windows() {
        if label == source_label || label == tab_drag_preview::PREVIEW_WINDOW_LABEL {
            continue;
        }
        if window_contains_point(&window, physical_x, physical_y) {
            return Some(label);
        }
    }
    None
}

#[tauri::command]
pub(crate) fn report_drag_position(
    app: tauri::AppHandle,
    drag_id: String,
    source_label: String,
    physical_x: i32,
    physical_y: i32,
) -> Option<String> {
    let new_target = find_window_at_position(&app, &source_label, physical_x, physical_y);

    let registry = app.state::<CrossWindowDragRegistry>();
    let mut map = registry.by_drag_id.lock().ok()?;

    let entry = map.entry(drag_id).or_insert_with(|| CrossWindowDragEntry {
        source_label,
        current_target_label: None,
    });

    let old_target = entry.current_target_label.clone();

    if old_target == new_target {
        return new_target;
    }

    if let Some(ref prev) = old_target {
        emit_to_window(&app, prev, EVENT_CROSS_WINDOW_DRAG_LEAVE, ());
    }

    if let Some(ref next) = new_target {
        emit_to_window(&app, next, EVENT_CROSS_WINDOW_DRAG_ENTER, ());
    }

    entry.current_target_label = new_target.clone();
    new_target
}

#[tauri::command]
pub(crate) fn cancel_cross_window_drag_hover(app: tauri::AppHandle, drag_id: String) {
    let registry = app.state::<CrossWindowDragRegistry>();
    let Ok(mut map) = registry.by_drag_id.lock() else {
        return;
    };

    if let Some(entry) = map.remove(&drag_id) {
        if let Some(ref target) = entry.current_target_label {
            emit_to_window(&app, target, EVENT_CROSS_WINDOW_DRAG_LEAVE, ());
        }
    }
}

pub(crate) fn cleanup_drag_entries_for_window(app: &tauri::AppHandle, label: &str) {
    let registry = app.state::<CrossWindowDragRegistry>();
    let Ok(mut map) = registry.by_drag_id.lock() else {
        return;
    };

    let drag_ids: Vec<String> = map
        .iter()
        .filter(|(_, entry)| entry.source_label == label)
        .map(|(id, _)| id.clone())
        .collect();

    for drag_id in drag_ids {
        if let Some(entry) = map.remove(&drag_id) {
            if let Some(ref target) = entry.current_target_label {
                emit_to_window(app, target, EVENT_CROSS_WINDOW_DRAG_LEAVE, ());
            }
        }
    }
}
