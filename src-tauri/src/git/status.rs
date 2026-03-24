use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct GitFileStatus {
    pub rel_path: String,
    pub status: String,
}

/// Parse a single line of `git status --porcelain` output into (rel_path, status_code).
/// Returns `None` for blank or unparseable lines.
pub(crate) fn parse_porcelain_line(line: &str) -> Option<GitFileStatus> {
    if line.len() < 4 {
        return None;
    }

    let x = line.as_bytes()[0];
    let y = line.as_bytes()[1];
    let rest = &line[3..];

    // Renamed/copied: "R  old -> new" — use the new path
    let is_rename = (x == b'R' || x == b'C' || y == b'R' || y == b'C') && rest.contains(" -> ");
    let rel_path = if is_rename {
        rest.rsplit(" -> ").next()?.to_string()
    } else {
        rest.to_string()
    };

    // Strip trailing slash if present (directories from -uall)
    let rel_path = rel_path.trim_end_matches('/').to_string();

    if rel_path.is_empty() {
        return None;
    }

    let status = simplify_status(x, y);
    Some(GitFileStatus { rel_path, status })
}

/// Map the two-character XY status to a single simplified code.
/// Prefer the worktree (Y) status when present, fall back to index (X).
fn simplify_status(x: u8, y: u8) -> String {
    // Untracked
    if x == b'?' && y == b'?' {
        return "?".to_string();
    }

    // Worktree status takes priority for display
    match y {
        b'M' => return "M".to_string(),
        b'D' => return "D".to_string(),
        b'R' => return "R".to_string(),
        b'A' => return "A".to_string(),
        _ => {}
    }

    // Fall back to index status
    match x {
        b'M' => "M".to_string(),
        b'A' => "A".to_string(),
        b'D' => "D".to_string(),
        b'R' => "R".to_string(),
        b'C' => "A".to_string(), // Copied → treat as added
        _ => "M".to_string(),    // Catch-all for unusual combos
    }
}

fn is_git_repo(root: &Path) -> bool {
    super::diff::find_git_root(root).is_some()
}

#[tauri::command]
pub(crate) fn git_status(root: String) -> Result<HashMap<String, String>, String> {
    let root_path = Path::new(&root);

    if !root_path.is_dir() {
        return Ok(HashMap::new());
    }

    if !is_git_repo(root_path) {
        return Ok(HashMap::new());
    }

    let output = Command::new("git")
        .args(["status", "--porcelain", "-uall"])
        .current_dir(root_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {e}"))?;

    if !output.status.success() {
        // git command failed (e.g., not a repo after all) — return empty
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut result = HashMap::new();

    for line in stdout.lines() {
        if let Some(entry) = parse_porcelain_line(line) {
            result.insert(entry.rel_path, entry.status);
        }
    }

    Ok(result)
}
