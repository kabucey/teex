use super::common::TempTestDir;
use crate::git_status::{git_status, parse_porcelain_line};

#[test]
fn parse_modified_worktree() {
    let result = parse_porcelain_line(" M src/main.rs").unwrap();
    assert_eq!(result.rel_path, "src/main.rs");
    assert_eq!(result.status, "M");
}

#[test]
fn parse_modified_index() {
    let result = parse_porcelain_line("M  src/lib.rs").unwrap();
    assert_eq!(result.rel_path, "src/lib.rs");
    assert_eq!(result.status, "M");
}

#[test]
fn parse_both_modified() {
    let result = parse_porcelain_line("MM src/both.rs").unwrap();
    assert_eq!(result.rel_path, "src/both.rs");
    assert_eq!(result.status, "M");
}

#[test]
fn parse_untracked() {
    let result = parse_porcelain_line("?? new-file.txt").unwrap();
    assert_eq!(result.rel_path, "new-file.txt");
    assert_eq!(result.status, "?");
}

#[test]
fn parse_added() {
    let result = parse_porcelain_line("A  staged.txt").unwrap();
    assert_eq!(result.rel_path, "staged.txt");
    assert_eq!(result.status, "A");
}

#[test]
fn parse_deleted_worktree() {
    let result = parse_porcelain_line(" D removed.txt").unwrap();
    assert_eq!(result.rel_path, "removed.txt");
    assert_eq!(result.status, "D");
}

#[test]
fn parse_deleted_index() {
    let result = parse_porcelain_line("D  removed.txt").unwrap();
    assert_eq!(result.rel_path, "removed.txt");
    assert_eq!(result.status, "D");
}

#[test]
fn parse_renamed() {
    let result = parse_porcelain_line("R  old.txt -> new.txt").unwrap();
    assert_eq!(result.rel_path, "new.txt");
    assert_eq!(result.status, "R");
}

#[test]
fn parse_renamed_nested() {
    let result = parse_porcelain_line("R  src/old.rs -> src/new.rs").unwrap();
    assert_eq!(result.rel_path, "src/new.rs");
    assert_eq!(result.status, "R");
}

#[test]
fn parse_empty_line_returns_none() {
    assert!(parse_porcelain_line("").is_none());
}

#[test]
fn parse_short_line_returns_none() {
    assert!(parse_porcelain_line("M").is_none());
}

#[test]
fn git_status_non_git_dir_returns_empty() {
    let temp = TempTestDir::new();
    temp.write_text("file.txt", "hello");
    let result =
        git_status(temp.path().to_string_lossy().to_string()).expect("should succeed");
    assert!(result.is_empty());
}

#[test]
fn git_status_nonexistent_dir_returns_empty() {
    let result =
        git_status("/nonexistent/path/xyz".to_string()).expect("should succeed");
    assert!(result.is_empty());
}
