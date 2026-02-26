use super::*;

pub(super) fn should_traverse(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }

    let Some(name) = entry.file_name().to_str() else {
        return false;
    };

    !matches!(name, ".git" | "node_modules" | "target" | "dist" | "build") && !name.starts_with('.')
}

pub(super) fn file_kind(path: &Path) -> &'static str {
    if is_markdown(path) {
        "markdown"
    } else {
        "text"
    }
}

pub(super) fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

pub(super) fn is_text_like(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };

    matches!(
        ext.to_ascii_lowercase().as_str(),
        "md" | "markdown"
            | "txt"
            | "rst"
            | "json"
            | "toml"
            | "yaml"
            | "yml"
            | "csv"
            | "log"
            | "js"
            | "ts"
            | "jsx"
            | "tsx"
            | "html"
            | "css"
            | "scss"
            | "rs"
            | "py"
            | "go"
            | "java"
            | "kt"
            | "swift"
            | "sh"
            | "zsh"
    )
}

pub(super) fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
