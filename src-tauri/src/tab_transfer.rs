use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransferredTab {
    pub(crate) path: String,
    pub(crate) content: String,
    pub(crate) kind: String,
    pub(crate) writable: bool,
    pub(crate) is_dirty: bool,
    pub(crate) markdown_view_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RequestExportAllTabsPayload {
    pub(crate) request_id: String,
    pub(crate) target_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReceiveTransferredTabsPayload {
    pub(crate) request_id: String,
    pub(crate) source_label: String,
    pub(crate) tabs: Vec<TransferredTab>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TabTransferResultPayload {
    pub(crate) request_id: String,
    pub(crate) target_label: String,
    pub(crate) accepted_count: usize,
}

#[tauri::command]
pub(crate) fn route_tab_transfer(
    app: tauri::AppHandle,
    source_label: String,
    target_label: String,
    request_id: String,
    tabs: Vec<TransferredTab>,
) -> Result<(), String> {
    if app.get_webview_window(&target_label).is_none() {
        return Err("Target window is no longer available".to_string());
    }

    emit_to_window(
        &app,
        &target_label,
        EVENT_RECEIVE_TRANSFERRED_TABS,
        ReceiveTransferredTabsPayload {
            request_id,
            source_label,
            tabs,
        },
    );

    Ok(())
}

#[tauri::command]
pub(crate) fn route_tab_transfer_result(
    app: tauri::AppHandle,
    source_label: String,
    target_label: String,
    request_id: String,
    accepted_count: usize,
) -> Result<(), String> {
    if app.get_webview_window(&source_label).is_none() {
        return Ok(());
    }

    emit_to_window(
        &app,
        &source_label,
        EVENT_TAB_TRANSFER_RESULT,
        TabTransferResultPayload {
            request_id,
            target_label,
            accepted_count,
        },
    );

    Ok(())
}
