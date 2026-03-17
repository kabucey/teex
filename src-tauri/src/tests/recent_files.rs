use super::common::TempTestDir;
use super::*;
use crate::recent_files::{
    add_to_list, display_name_for_file, display_name_for_folder, load_from_path, save_to_path,
};

#[test]
fn load_from_missing_file_returns_empty() {
    let temp = TempTestDir::new();
    let path = temp.path().join("nonexistent.json");
    let (files, folders) = load_from_path(&path);
    assert!(files.is_empty());
    assert!(folders.is_empty());
}

#[test]
fn load_from_corrupt_file_returns_empty() {
    let temp = TempTestDir::new();
    let path = temp.write_text("recent_files.json", "not json at all");
    let (files, folders) = load_from_path(&path);
    assert!(files.is_empty());
    assert!(folders.is_empty());
}

#[test]
fn save_and_load_round_trip() {
    let temp = TempTestDir::new();
    let path = temp.path().join("recent_files.json");

    let files = vec!["/a.md".to_string(), "/b.txt".to_string()];
    let folders = vec!["/projects".to_string()];
    save_to_path(&path, &files, &folders);

    let (loaded_files, loaded_folders) = load_from_path(&path);
    assert_eq!(loaded_files, files);
    assert_eq!(loaded_folders, folders);
}

#[test]
fn save_creates_parent_directories() {
    let temp = TempTestDir::new();
    let path = temp.path().join("nested").join("dir").join("recent.json");

    save_to_path(&path, &["/a.md".to_string()], &[]);
    let (files, _) = load_from_path(&path);
    assert_eq!(files, vec!["/a.md".to_string()]);
}

#[test]
fn add_to_list_prepends() {
    let mut list = vec!["a".to_string(), "b".to_string()];
    add_to_list(&mut list, "c".to_string(), 10);
    assert_eq!(list, vec!["c", "a", "b"]);
}

#[test]
fn add_to_list_deduplicates() {
    let mut list = vec!["a".to_string(), "b".to_string(), "c".to_string()];
    add_to_list(&mut list, "b".to_string(), 10);
    assert_eq!(list, vec!["b", "a", "c"]);
}

#[test]
fn add_to_list_caps_at_limit() {
    let mut list: Vec<String> = (0..10).map(|i| format!("file{i}")).collect();
    add_to_list(&mut list, "new".to_string(), 10);
    assert_eq!(list.len(), 10);
    assert_eq!(list[0], "new");
    assert_eq!(list[9], "file8");
}

#[test]
fn add_to_list_caps_folders_at_five() {
    let mut list: Vec<String> = (0..5).map(|i| format!("folder{i}")).collect();
    add_to_list(&mut list, "new".to_string(), 5);
    assert_eq!(list.len(), 5);
    assert_eq!(list[0], "new");
    assert_eq!(list[4], "folder3");
}

#[test]
fn display_name_for_file_shows_filename() {
    let paths = vec!["/Users/kel/docs/README.md".to_string()];
    assert_eq!(display_name_for_file(&paths[0], &paths), "README.md");
}

#[test]
fn display_name_for_file_disambiguates_duplicates() {
    let paths = vec![
        "/Users/kel/project-a/README.md".to_string(),
        "/Users/kel/project-b/README.md".to_string(),
    ];
    assert_eq!(
        display_name_for_file(&paths[0], &paths),
        "README.md \u{2014} project-a"
    );
    assert_eq!(
        display_name_for_file(&paths[1], &paths),
        "README.md \u{2014} project-b"
    );
}

#[test]
fn display_name_for_folder_abbreviates_home() {
    let home = env::var("HOME").unwrap_or_default();
    let path = format!("{home}/Projects/myapp");
    assert_eq!(display_name_for_folder(&path), "~/Projects/myapp");
}

#[test]
fn display_name_for_folder_keeps_non_home_paths() {
    assert_eq!(display_name_for_folder("/tmp/test"), "/tmp/test");
}
