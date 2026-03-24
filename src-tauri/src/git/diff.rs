use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct LineDiff {
    pub line: usize,
    pub diff_type: String,
}

/// Parse unified diff output into per-line annotations for the new file.
///
/// Only processes `@@` hunk headers and `+`/`-` lines. Tracks the new-file
/// line number so decorations map to the current working-tree content.
pub(crate) fn parse_unified_diff(diff_output: &str) -> Vec<LineDiff> {
    let mut result = Vec::new();
    let mut new_line: usize = 0;

    for line in diff_output.lines() {
        if line.starts_with("@@") {
            // Parse hunk header: @@ -old_start[,old_count] +new_start[,new_count] @@
            if let Some(plus_part) = line.split('+').nth(1) {
                let num_part = plus_part.split(' ').next().unwrap_or("");
                let start_str = num_part.split(',').next().unwrap_or("0");
                new_line = start_str.parse::<usize>().unwrap_or(0);
            }
            continue;
        }

        if new_line == 0 {
            // Haven't seen a hunk header yet — skip diff metadata lines
            continue;
        }

        if line.starts_with('+') {
            result.push(LineDiff {
                line: new_line,
                diff_type: "added".to_string(),
            });
            new_line += 1;
        } else if line.starts_with('-') {
            // Removed lines don't exist in the new file, so we mark the
            // *next* new-file line as modified if it's an addition (handled
            // by post-processing below). For now, skip — the line doesn't
            // appear in the working tree.
        } else {
            // Context line (or no-newline-at-end marker)
            if !line.starts_with('\\') {
                new_line += 1;
            }
        }
    }

    result
}

pub(crate) fn find_git_root(path: &Path) -> Option<std::path::PathBuf> {
    let mut dir = if path.is_file() {
        path.parent()?.to_path_buf()
    } else {
        path.to_path_buf()
    };
    loop {
        if dir.join(".git").exists() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}

fn is_untracked(git_root: &Path, rel_path: &str) -> bool {
    let output = Command::new("git")
        .args(["status", "--porcelain", "--", rel_path])
        .current_dir(git_root)
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.lines().any(|l| l.starts_with("??"))
        }
        Err(_) => false,
    }
}

#[tauri::command]
pub(crate) fn git_diff(path: String) -> Result<Vec<LineDiff>, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Ok(Vec::new());
    }

    let git_root = match find_git_root(file_path) {
        Some(root) => root,
        None => return Ok(Vec::new()),
    };

    let rel_path = file_path
        .strip_prefix(&git_root)
        .map_err(|e| format!("Path prefix error: {e}"))?
        .to_string_lossy()
        .to_string();

    // Untracked files: every line is "added"
    if is_untracked(&git_root, &rel_path) {
        let content =
            std::fs::read_to_string(file_path).map_err(|e| format!("Unable to read file: {e}"))?;
        let line_count = content.lines().count().max(1);
        let result: Vec<LineDiff> = (1..=line_count)
            .map(|line| LineDiff {
                line,
                diff_type: "added".to_string(),
            })
            .collect();
        return Ok(result);
    }

    let output = Command::new("git")
        .args(["diff", "HEAD", "--unified=0", "--", &rel_path])
        .current_dir(&git_root)
        .output()
        .map_err(|e| format!("Failed to run git diff: {e}"))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_unified_diff(&stdout))
}
