use super::*;

const PREVIEW_LABEL: &str = "teex-drag-preview";
const PREVIEW_WIDTH: f64 = 240.0;
const PREVIEW_HEIGHT: f64 = 180.0;
const FULL_WIDTH: f64 = 800.0;
const FULL_HEIGHT: f64 = 600.0;

pub(crate) const PREVIEW_WINDOW_LABEL: &str = PREVIEW_LABEL;

pub(crate) struct TabDragPreviewState {
    label: Mutex<Option<String>>,
    content: Mutex<Option<PreviewContent>>,
}

struct PreviewContent {
    title: String,
    body: String,
}

impl TabDragPreviewState {
    pub(crate) fn new() -> Self {
        Self {
            label: Mutex::new(None),
            content: Mutex::new(None),
        }
    }
}

fn preview_position(physical_x: i32, physical_y: i32, scale: f64) -> (f64, f64) {
    let logical_x = physical_x as f64 / scale;
    let logical_y = physical_y as f64 / scale;
    (logical_x - PREVIEW_WIDTH / 2.0, logical_y - 20.0)
}

fn full_window_position(physical_x: i32, physical_y: i32, scale: f64) -> (f64, f64) {
    let logical_x = physical_x as f64 / scale;
    let logical_y = physical_y as f64 / scale;
    (logical_x - FULL_WIDTH / 2.0, logical_y - 20.0)
}

fn get_scale(app: &tauri::AppHandle) -> f64 {
    app.webview_windows()
        .values()
        .next()
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0)
}

#[tauri::command]
pub(crate) fn show_tab_drag_preview(
    app: tauri::AppHandle,
    physical_x: i32,
    physical_y: i32,
    title: String,
    content: String,
) -> Result<(), String> {
    let preview_state = app.state::<TabDragPreviewState>();

    if let Ok(mut c) = preview_state.content.lock() {
        *c = Some(PreviewContent {
            title,
            body: content,
        });
    }

    let mut label_guard = preview_state
        .label
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;

    let scale = get_scale(&app);
    let (x, y) = preview_position(physical_x, physical_y, scale);

    if let Some(ref existing_label) = *label_guard {
        if let Some(window) = app.webview_windows().get(existing_label) {
            let _ = window.set_position(tauri::LogicalPosition::new(x, y));
            return Ok(());
        }
        *label_guard = None;
    }

    let window = tauri::WebviewWindowBuilder::new(
        &app,
        PREVIEW_LABEL,
        tauri::WebviewUrl::App("preview.html".into()),
    )
    .title("")
    .inner_size(PREVIEW_WIDTH, PREVIEW_HEIGHT)
    .position(x, y)
    .decorations(false)
    .always_on_top(true)
    .focused(false)
    .skip_taskbar(true)
    .resizable(false)
    .build()
    .map_err(|e| format!("Unable to create preview window: {e}"))?;

    let _ = window.set_ignore_cursor_events(true);

    *label_guard = Some(PREVIEW_LABEL.to_string());
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DragPreviewContent {
    title: String,
    content: String,
}

#[tauri::command]
pub(crate) fn get_drag_preview_content(
    app: tauri::AppHandle,
) -> Option<DragPreviewContent> {
    let preview_state = app.state::<TabDragPreviewState>();
    let guard = preview_state.content.lock().ok()?;
    let content = guard.as_ref()?;
    Some(DragPreviewContent {
        title: content.title.clone(),
        content: content.body.clone(),
    })
}

#[tauri::command]
pub(crate) fn hide_tab_drag_preview(app: tauri::AppHandle) {
    let preview_state = app.state::<TabDragPreviewState>();
    if let Ok(mut label_guard) = preview_state.label.lock() {
        if let Some(ref label) = *label_guard {
            if let Some(window) = app.webview_windows().get(label) {
                let _ = window.close();
            }
        }
        *label_guard = None;
    }
    if let Ok(mut c) = preview_state.content.lock() {
        *c = None;
    };
}

#[tauri::command]
pub(crate) fn create_window_from_drag(
    app: tauri::AppHandle,
    physical_x: i32,
    physical_y: i32,
    path: Option<String>,
) -> Result<String, String> {
    hide_tab_drag_preview(app.clone());

    let label = next_window_label();

    if let Some(ref file_path) = path {
        let path_buf = PathBuf::from(file_path);
        if path_buf.exists() {
            queue_open_paths_for_window(&app, &label, &[path_buf]);
        }
    }

    let scale = get_scale(&app);
    let (x, y) = full_window_position(physical_x, physical_y, scale);

    let new_window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::default())
            .title("Teex")
            .inner_size(FULL_WIDTH, FULL_HEIGHT)
            .position(x, y)
            .build()
            .map_err(|e| format!("Unable to create window: {e}"))?;

    let window_label = new_window.label().to_string();
    set_tracked_window_label(&app, window_label.clone());
    set_recently_created_window(&app, window_label.clone());

    Ok(window_label)
}
