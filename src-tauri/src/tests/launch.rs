use super::common::TempTestDir;
use super::*;

#[test]
fn categorize_paths_prefers_single_folder_when_no_files() {
    let temp = TempTestDir::new();
    let folder = temp.mkdir("project");

    let result = categorize_paths(vec![
        "".to_string(),
        "   ".to_string(),
        temp.path()
            .join("missing.txt")
            .to_string_lossy()
            .to_string(),
        folder.to_string_lossy().to_string(),
    ]);

    assert_eq!(result.mode, "folder");
    assert_eq!(result.path, Some(folder.to_string_lossy().to_string()));
    assert!(result.paths.is_empty());
}

#[test]
fn categorize_paths_prefers_multiple_files_over_folders() {
    let temp = TempTestDir::new();
    let file_a = temp.write_text("a.md", "# A");
    let file_b = temp.write_text("b.txt", "B");
    let folder = temp.mkdir("folder");

    let result = categorize_paths(vec![
        folder.to_string_lossy().to_string(),
        file_a.to_string_lossy().to_string(),
        file_b.to_string_lossy().to_string(),
    ]);

    assert_eq!(result.mode, "files");
    assert_eq!(result.path, None);
    assert_eq!(
        result.paths,
        vec![
            file_a.to_string_lossy().to_string(),
            file_b.to_string_lossy().to_string()
        ]
    );
}

#[test]
fn categorize_paths_returns_single_file_mode_for_one_valid_file() {
    let temp = TempTestDir::new();
    let file = temp.write_text("note.md", "hello");

    let result = categorize_paths(vec![
        temp.path().join("missing.md").to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    ]);

    assert_eq!(result.mode, "file");
    assert_eq!(result.path, Some(file.to_string_lossy().to_string()));
    assert!(result.paths.is_empty());
}
