use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct LineDiff {
    pub line: usize,
    pub diff_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct DiffLine {
    pub content: String,
    pub line_type: String, // "added" | "removed" | "context"
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct FileDiff {
    pub rel_path: String,
    pub hunks: Vec<DiffHunk>,
}

/// Parse full `git diff` output into per-file structured diffs.
///
/// Splits on `diff --git` boundaries, extracts file paths from `+++ b/...`,
/// then splits each file section into hunks at `@@` markers.
pub(crate) fn parse_full_unified_diff(diff_output: &str) -> Vec<FileDiff> {
    let mut files: Vec<FileDiff> = Vec::new();

    // Split into per-file sections at "diff --git" boundaries
    let file_sections: Vec<&str> = diff_output.split("\ndiff --git ").collect();

    for (i, section) in file_sections.iter().enumerate() {
        let section = if i == 0 {
            // First section may start with "diff --git " (no leading newline)
            section.strip_prefix("diff --git ").unwrap_or(section)
        } else {
            section
        };

        if section.trim().is_empty() {
            continue;
        }

        // Skip binary files
        if section.contains("Binary files") && section.contains("differ") {
            continue;
        }

        // Extract rel_path from "+++ b/..." line
        let rel_path = section
            .lines()
            .find(|l| l.starts_with("+++ b/"))
            .map(|l| l[6..].to_string());

        let Some(rel_path) = rel_path else {
            continue;
        };

        let mut hunks: Vec<DiffHunk> = Vec::new();
        let mut current_hunk: Option<DiffHunk> = None;

        for line in section.lines() {
            if line.starts_with("@@") {
                if let Some(hunk) = current_hunk.take() {
                    hunks.push(hunk);
                }
                current_hunk = Some(DiffHunk {
                    header: line.to_string(),
                    lines: Vec::new(),
                });
                continue;
            }

            let Some(ref mut hunk) = current_hunk else {
                continue;
            };

            if let Some(rest) = line.strip_prefix('+') {
                hunk.lines.push(DiffLine {
                    content: rest.to_string(),
                    line_type: "added".to_string(),
                });
            } else if let Some(rest) = line.strip_prefix('-') {
                hunk.lines.push(DiffLine {
                    content: rest.to_string(),
                    line_type: "removed".to_string(),
                });
            } else if line.starts_with('\\') {
                // "\ No newline at end of file" — skip
            } else if let Some(rest) = line.strip_prefix(' ') {
                hunk.lines.push(DiffLine {
                    content: rest.to_string(),
                    line_type: "context".to_string(),
                });
            }
        }

        if let Some(hunk) = current_hunk {
            hunks.push(hunk);
        }

        if !hunks.is_empty() {
            files.push(FileDiff { rel_path, hunks });
        }
    }

    files
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

fn is_tracked(git_root: &Path, rel_path: &str) -> bool {
    let output = Command::new("git")
        .args(["ls-files", "--", rel_path])
        .current_dir(git_root)
        .output();

    match output {
        Ok(o) => !String::from_utf8_lossy(&o.stdout).trim().is_empty(),
        Err(_) => false,
    }
}

fn all_lines_added(file_path: &Path) -> Result<Vec<LineDiff>, String> {
    let content =
        std::fs::read_to_string(file_path).map_err(|e| format!("Unable to read file: {e}"))?;
    let line_count = content.lines().count().max(1);
    Ok((1..=line_count)
        .map(|line| LineDiff {
            line,
            diff_type: "added".to_string(),
        })
        .collect())
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

    // Try diff first — handles the common case (tracked + modified) in one spawn
    let output = Command::new("git")
        .args(["diff", "HEAD", "--unified=0", "--", &rel_path])
        .current_dir(&git_root)
        .output()
        .map_err(|e| format!("Failed to run git diff: {e}"))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if !stdout.is_empty() {
            return Ok(parse_unified_diff(&stdout));
        }
    }

    // Diff was empty — check if untracked (only case needing a second spawn)
    if !is_tracked(&git_root, &rel_path) {
        return all_lines_added(file_path);
    }

    Ok(Vec::new())
}

fn untracked_files(git_root: &Path) -> Vec<String> {
    let output = Command::new("git")
        .args(["ls-files", "--others", "--exclude-standard"])
        .current_dir(git_root)
        .output();

    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect(),
        _ => Vec::new(),
    }
}

fn file_as_all_added(git_root: &Path, rel_path: &str) -> Option<FileDiff> {
    let full_path = git_root.join(rel_path);
    let content = std::fs::read_to_string(&full_path).ok()?;
    let lines: Vec<DiffLine> = content
        .lines()
        .map(|l| DiffLine {
            content: l.to_string(),
            line_type: "added".to_string(),
        })
        .collect();

    if lines.is_empty() {
        return None;
    }

    let header = format!("@@ -0,0 +1,{} @@", lines.len());
    Some(FileDiff {
        rel_path: rel_path.to_string(),
        hunks: vec![DiffHunk { header, lines }],
    })
}

#[tauri::command]
pub(crate) fn git_diff_all(root: String) -> Result<Vec<FileDiff>, String> {
    let root_path = Path::new(&root);

    if !root_path.is_dir() {
        return Ok(Vec::new());
    }

    let git_root = match find_git_root(root_path) {
        Some(r) => r,
        None => return Ok(Vec::new()),
    };

    // Get tracked file diffs
    let output = Command::new("git")
        .args(["diff", "HEAD"])
        .current_dir(&git_root)
        .output()
        .map_err(|e| format!("Failed to run git diff: {e}"))?;

    let mut files = if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_full_unified_diff(&stdout)
    } else {
        Vec::new()
    };

    // Append untracked files as all-added
    for rel in untracked_files(&git_root) {
        if let Some(fd) = file_as_all_added(&git_root, &rel) {
            files.push(fd);
        }
    }

    Ok(files)
}
