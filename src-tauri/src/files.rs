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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FormatStructuredTextResult {
    pub(crate) formatted: String,
    pub(crate) detected_kind: Option<String>,
    pub(crate) changed: bool,
}

fn format_json(content: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(content).ok()?;
    serde_json::to_string_pretty(&value).ok()
}

fn format_yaml(content: &str) -> Option<String> {
    let value: serde_yml::Value = serde_yml::from_str(content).ok()?;
    match &value {
        serde_yml::Value::Mapping(_) | serde_yml::Value::Sequence(_) => {}
        _ => return None,
    }
    let formatted = serde_yml::to_string(&value).ok()?;
    Some(formatted.trim_end_matches('\n').to_string())
}

fn format_toml(content: &str) -> Option<String> {
    let value: toml::Value = toml::from_str(content).ok()?;
    let formatted = toml::to_string_pretty(&value).ok()?;
    Some(formatted.trim_end_matches('\n').to_string())
}

fn format_xml(content: &str) -> Option<String> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;
    use quick_xml::writer::Writer;

    let mut reader = Reader::from_str(content);
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);

    loop {
        match reader.read_event() {
            Ok(Event::Eof) => break,
            Ok(Event::Text(ref t)) if t.iter().all(|b| b.is_ascii_whitespace()) => continue,
            Ok(event) => {
                if writer.write_event(event).is_err() {
                    return None;
                }
            }
            Err(_) => return None,
        }
    }

    let bytes = writer.into_inner();
    let formatted = String::from_utf8(bytes).ok()?;
    Some(formatted.trim_end_matches('\n').to_string())
}

fn format_csv(content: &str) -> Option<String> {
    let delimiter = if content.contains('\t') { b'\t' } else { b',' };

    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .delimiter(delimiter)
        .flexible(true)
        .from_reader(content.as_bytes());

    let rows: Vec<Vec<String>> = reader
        .records()
        .filter_map(|r| r.ok())
        .map(|r| r.iter().map(|f| f.to_string()).collect())
        .collect();

    if rows.is_empty() {
        return None;
    }

    let col_count = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if col_count == 0 {
        return None;
    }

    let mut widths = vec![0usize; col_count];
    for row in &rows {
        for (i, field) in row.iter().enumerate() {
            widths[i] = widths[i].max(field.trim().len());
        }
    }

    let sep = if delimiter == b'\t' { "\t" } else { "," };
    let formatted: Vec<String> = rows
        .iter()
        .map(|row| {
            let padded: Vec<String> = (0..col_count)
                .map(|i| {
                    let field = row.get(i).map(|f| f.trim()).unwrap_or("");
                    if delimiter == b'\t' {
                        field.to_string()
                    } else if i < col_count - 1 {
                        format!("{:<width$}", field, width = widths[i])
                    } else {
                        field.to_string()
                    }
                })
                .collect();
            padded.join(sep)
        })
        .collect();

    Some(formatted.join("\n"))
}

fn format_structured(
    content: &str,
    preferred_kind: Option<&str>,
) -> (Option<String>, Option<String>) {
    let preferred = preferred_kind.map(|value| value.trim().to_ascii_lowercase());
    let candidates: &[&str] = match preferred.as_deref() {
        Some("json") => &["json", "yaml"],
        Some("yaml") => &["yaml", "json"],
        Some("toml") => &["toml"],
        Some("xml") => &["xml"],
        Some("csv") => &["csv"],
        _ => &["json", "yaml"],
    };

    for candidate in candidates {
        let formatted = match *candidate {
            "json" => format_json(content),
            "yaml" => format_yaml(content),
            "toml" => format_toml(content),
            "xml" => format_xml(content),
            "csv" => format_csv(content),
            _ => None,
        };

        if let Some(formatted) = formatted {
            return (Some(formatted), Some((*candidate).to_string()));
        }
    }

    (None, None)
}

#[tauri::command]
pub(crate) fn list_project_entries(
    root: String,
    show_hidden: bool,
) -> Result<Vec<ProjectEntry>, String> {
    let root_path = PathBuf::from(root);

    if !root_path.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let mut entries = Vec::new();

    for entry in WalkDir::new(&root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| should_traverse_with_hidden(e, show_hidden))
    {
        let entry = match entry {
            Ok(item) => item,
            Err(_) => continue,
        };

        let path = entry.path();
        if !path.is_file() || !is_text_like(path) {
            continue;
        }
        if !show_hidden {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') {
                    continue;
                }
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

#[tauri::command]
pub(crate) fn trash_file(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File not found".to_string());
    }
    trash::delete(&path_buf).map_err(|e| format!("Unable to move file to trash: {e}"))
}

#[tauri::command]
pub(crate) fn format_structured_text(
    content: String,
    preferred_kind: Option<String>,
) -> Result<FormatStructuredTextResult, String> {
    let (formatted, detected_kind) = format_structured(&content, preferred_kind.as_deref());
    let Some(formatted) = formatted else {
        return Ok(FormatStructuredTextResult {
            formatted: content,
            detected_kind: None,
            changed: false,
        });
    };

    let changed = formatted != content;
    Ok(FormatStructuredTextResult {
        formatted,
        detected_kind,
        changed,
    })
}
