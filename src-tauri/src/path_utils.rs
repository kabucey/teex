use super::*;

const ALWAYS_BLOCKED_DIRS: &[&str] = &[".git", "node_modules", "target", "dist", "build"];

pub(super) fn should_traverse_with_hidden(entry: &DirEntry, show_hidden: bool) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }

    let Some(name) = entry.file_name().to_str() else {
        return false;
    };

    if ALWAYS_BLOCKED_DIRS.contains(&name) {
        return false;
    }

    show_hidden || !name.starts_with('.')
}

pub(super) fn file_kind(path: &Path) -> &'static str {
    if is_markdown(path) {
        "markdown"
    } else if is_code(path) {
        "code"
    } else {
        "text"
    }
}

pub(super) fn is_code(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };

    matches!(
        ext.to_ascii_lowercase().as_str(),
        "json"
            | "jsonc"
            | "jsonl"
            | "yaml"
            | "yml"
            | "toml"
            | "xml"
            | "csv"
            | "ini"
            | "cfg"
            | "conf"
            | "js"
            | "ts"
            | "jsx"
            | "tsx"
            | "mjs"
            | "cjs"
            | "html"
            | "css"
            | "scss"
            | "less"
            | "rs"
            | "py"
            | "go"
            | "java"
            | "kt"
            | "swift"
            | "c"
            | "cpp"
            | "h"
            | "hpp"
            | "cc"
            | "cs"
            | "rb"
            | "php"
            | "lua"
            | "zig"
            | "sql"
            | "graphql"
            | "gql"
            | "proto"
            | "r"
            | "m"
            | "pl"
            | "pm"
            | "ex"
            | "exs"
            | "hs"
            | "ml"
            | "mli"
            | "scala"
            | "clj"
            | "cljs"
            | "dart"
            | "v"
            | "nim"
            | "tf"
            | "hcl"
            | "el"
            | "vim"
            | "sh"
            | "zsh"
            | "bash"
            | "dockerfile"
            | "makefile"
    )
}

pub(super) fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

pub(super) fn is_text_like(path: &Path) -> bool {
    if is_markdown(path) || is_code(path) {
        return true;
    }

    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };

    matches!(ext.to_ascii_lowercase().as_str(), "txt" | "rst" | "log")
}

pub(super) fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
