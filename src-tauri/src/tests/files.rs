use super::common::TempTestDir;
use super::*;

#[test]
fn list_project_entries_filters_hidden_binary_and_build_artifacts() {
    let temp = TempTestDir::new();
    let root = temp.path().to_path_buf();

    temp.write_text("a.md", "# root");
    temp.write_text("nested/b.txt", "text");
    temp.write_text("nested/c.JSON", "{}");
    temp.write_text(".hidden.md", "skip");
    temp.write_text(".git/ignored.md", "skip");
    temp.write_text("node_modules/ignored.js", "skip");
    temp.write_text("target/ignored.rs", "skip");
    temp.write_text("dist/ignored.txt", "skip");
    temp.write_text("build/ignored.txt", "skip");
    temp.write_text(".config/ignored.yaml", "skip");
    temp.write_bytes("image.png", &[0x89, b'P', b'N', b'G']);

    let mut entries = list_project_entries(root.to_string_lossy().to_string())
        .expect("list project entries should succeed");

    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));

    let rel_nested_b = Path::new("nested")
        .join("b.txt")
        .to_string_lossy()
        .to_string();
    let rel_nested_c = Path::new("nested")
        .join("c.JSON")
        .to_string_lossy()
        .to_string();

    let rel_paths: Vec<String> = entries.iter().map(|e| e.rel_path.clone()).collect();
    assert_eq!(
        rel_paths,
        vec!["a.md".to_string(), rel_nested_b, rel_nested_c]
    );

    assert!(entries
        .iter()
        .all(|e| e.path.starts_with(root.to_string_lossy().as_ref())));
}

#[test]
fn list_project_entries_errors_when_root_is_not_directory() {
    let temp = TempTestDir::new();
    let file = temp.write_text("just-a-file.txt", "hi");

    let error = list_project_entries(file.to_string_lossy().to_string()).unwrap_err();
    assert!(error.contains("not a folder"));
}

#[test]
fn read_and_write_text_file_round_trip_preserves_content_and_kind() {
    let temp = TempTestDir::new();
    let file = temp.path().join("draft.md");
    let file_string = file.to_string_lossy().to_string();

    write_text_file(file_string.clone(), "# Title\n\nBody".to_string())
        .expect("write text file should succeed");

    let payload = read_text_file(file_string.clone()).expect("read text file should succeed");
    assert_eq!(payload.path, file_string);
    assert_eq!(payload.content, "# Title\n\nBody");
    assert_eq!(payload.kind, "markdown");
    assert!(payload.writable);
}

#[test]
fn read_text_file_returns_error_for_missing_or_non_utf8_files() {
    let temp = TempTestDir::new();
    let missing = temp.path().join("missing.txt");
    let missing_error = read_text_file(missing.to_string_lossy().to_string()).unwrap_err();
    assert!(missing_error.contains("not found"));

    let binary = temp.write_bytes("bad.txt", &[0xFF, 0xFE, 0x00]);
    let utf8_error = read_text_file(binary.to_string_lossy().to_string()).unwrap_err();
    assert!(utf8_error.contains("UTF-8"));
}

#[test]
fn trash_file_moves_file_to_trash() {
    let temp = TempTestDir::new();
    let file = temp.write_text("delete-me.md", "bye");
    let file_string = file.to_string_lossy().to_string();

    trash_file(file_string).expect("trash file should succeed");
    assert!(!file.exists(), "file should no longer exist on disk");
}

#[test]
fn trash_file_returns_error_for_missing_file() {
    let temp = TempTestDir::new();
    let missing = temp.path().join("nope.txt");

    let error = trash_file(missing.to_string_lossy().to_string()).unwrap_err();
    assert!(error.contains("not found"));
}

#[test]
fn format_structured_text_formats_json_input() {
    let result =
        format_structured_text("{\"name\":\"teex\"}".to_string(), Some("json".to_string()))
            .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("json"));
    assert!(result.changed);
    assert_eq!(result.formatted, "{\n  \"name\": \"teex\"\n}");
}

#[test]
fn format_structured_text_formats_yaml_input() {
    let input = "root:\n    child: yes\n    count: 1".to_string();
    let result = format_structured_text(input, Some("yaml".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("yaml"));
    assert!(result.changed);
    assert_eq!(result.formatted, "root:\n  child: 'yes'\n  count: 1");
}

#[test]
fn format_structured_text_returns_unchanged_for_plain_text() {
    let input = "hello world".to_string();
    let result =
        format_structured_text(input.clone(), None).expect("format structured text should succeed");

    assert_eq!(result.detected_kind, None);
    assert!(!result.changed);
    assert_eq!(result.formatted, input);
}
