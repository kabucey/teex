use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectEntry {
    pub(crate) path: String,
    pub(crate) rel_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FilePayload {
    pub(crate) path: String,
    pub(crate) content: String,
    pub(crate) kind: String,
    pub(crate) writable: bool,
}

#[tauri::command]
pub(crate) fn list_project_entries(root: String) -> Result<Vec<ProjectEntry>, String> {
    let root_path = PathBuf::from(root);

    if !root_path.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let mut entries = Vec::new();

    for entry in WalkDir::new(&root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_traverse)
    {
        let entry = match entry {
            Ok(item) => item,
            Err(_) => continue,
        };

        let path = entry.path();
        if !path.is_file() || !is_text_like(path) {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        let relative = match path.strip_prefix(&root_path) {
            Ok(rel) => rel,
            Err(_) => continue,
        };

        entries.push(ProjectEntry {
            path: path_to_string(path),
            rel_path: relative.to_string_lossy().to_string(),
        });
    }

    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));

    Ok(entries)
}

#[tauri::command]
pub(crate) fn read_text_file(path: String) -> Result<FilePayload, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.is_file() {
        return Err("File was not found".to_string());
    }

    let content = fs::read_to_string(&path_buf)
        .map_err(|e| format!("Unable to read file as UTF-8 text: {e}"))?;

    let metadata =
        fs::metadata(&path_buf).map_err(|e| format!("Unable to read file metadata: {e}"))?;

    Ok(FilePayload {
        path,
        content,
        kind: file_kind(&path_buf).to_string(),
        writable: !metadata.permissions().readonly(),
    })
}

#[tauri::command]
pub(crate) fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| format!("Unable to write file: {e}"))
}
