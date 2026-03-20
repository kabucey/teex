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

    let mut entries = list_project_entries(root.to_string_lossy().to_string(), false)
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
fn list_project_entries_shows_hidden_when_flag_true() {
    let temp = TempTestDir::new();
    let root = temp.path().to_path_buf();

    temp.write_text("visible.md", "# visible");
    temp.write_text(".hidden.md", "# hidden");
    temp.write_text(".secret.yaml", "key: val");
    temp.write_text(".github/workflow.yaml", "on: push");
    temp.write_text(".git/config.txt", "skip");
    temp.write_text("node_modules/pkg.js", "skip");
    temp.write_text("target/debug.rs", "skip");

    let mut entries = list_project_entries(root.to_string_lossy().to_string(), true)
        .expect("list project entries should succeed");

    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    let rel_paths: Vec<String> = entries.iter().map(|e| e.rel_path.clone()).collect();

    let rel_github_workflow = Path::new(".github")
        .join("workflow.yaml")
        .to_string_lossy()
        .to_string();

    assert!(
        rel_paths.contains(&".hidden.md".to_string()),
        "should include .hidden.md"
    );
    assert!(
        rel_paths.contains(&".secret.yaml".to_string()),
        "should include .secret.yaml"
    );
    assert!(
        rel_paths.contains(&rel_github_workflow),
        "should include .github/workflow.yaml"
    );
    assert!(
        rel_paths.contains(&"visible.md".to_string()),
        "should include visible.md"
    );
    assert!(
        !rel_paths.iter().any(|p| p.starts_with(".git/")),
        "should still exclude .git/"
    );
    assert!(
        !rel_paths.iter().any(|p| p.starts_with("node_modules/")),
        "should still exclude node_modules/"
    );
    assert!(
        !rel_paths.iter().any(|p| p.starts_with("target/")),
        "should still exclude target/"
    );
}

#[test]
fn list_project_entries_errors_when_root_is_not_directory() {
    let temp = TempTestDir::new();
    let file = temp.write_text("just-a-file.txt", "hi");

    let error = list_project_entries(file.to_string_lossy().to_string(), false).unwrap_err();
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

#[test]
fn format_structured_text_formats_toml_input() {
    let input = "name=\"teex\"\nversion=\"0.1.0\"\n[dependencies]\nserde=\"1\"".to_string();
    let result = format_structured_text(input, Some("toml".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("toml"));
    assert!(result.changed);
    assert!(result.formatted.contains("name = \"teex\""));
    assert!(result.formatted.contains("[dependencies]"));
    assert!(result.formatted.contains("serde = \"1\""));
}

#[test]
fn format_structured_text_formats_xml_input() {
    let input = "<root><child>text</child><other/></root>".to_string();
    let result = format_structured_text(input, Some("xml".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("xml"));
    assert!(result.changed);
    assert!(result.formatted.contains("  <child>"));
    assert!(result.formatted.contains("  <other/>"));
}

#[test]
fn format_structured_text_indents_xml_with_existing_linebreaks() {
    let input = "<note>\n<to>Tove</to>\n<from>Jani</from>\n<heading>Reminder</heading>\n<body>Don't forget me this weekend!</body>\n</note>".to_string();
    let result = format_structured_text(input, Some("xml".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("xml"));
    assert!(result.changed, "should detect formatting change");
    let expected = "<note>\n  <to>Tove</to>\n  <from>Jani</from>\n  <heading>Reminder</heading>\n  <body>Don't forget me this weekend!</body>\n</note>";
    assert_eq!(result.formatted, expected);
}

#[test]
fn format_structured_text_formats_csv_input() {
    let input = "name,age,city\nAlice,30,NYC\nBob,25,LA".to_string();
    let result = format_structured_text(input, Some("csv".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("csv"));
    assert!(result.changed);
    let lines: Vec<&str> = result.formatted.lines().collect();
    assert_eq!(lines.len(), 3);
    assert!(lines[0].starts_with("name "));
    assert!(lines[1].starts_with("Alice"));
}

#[test]
fn format_structured_text_returns_unchanged_for_already_formatted_toml() {
    let input = "name = \"teex\"\nversion = \"0.1.0\"".to_string();
    let result = format_structured_text(input.clone(), Some("toml".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("toml"));
    assert!(!result.changed);
}

#[test]
fn format_structured_text_returns_unchanged_for_already_formatted_json() {
    let input = "{\n  \"name\": \"teex\"\n}".to_string();
    let result = format_structured_text(input.clone(), Some("json".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("json"));
    assert!(!result.changed);
    assert_eq!(result.formatted, input);
}

#[test]
fn format_structured_text_returns_unchanged_for_already_formatted_yaml() {
    // serde_yml normalizes "0.1.0" → quoted string, so use values that roundtrip cleanly
    let input = "name: teex\ncount: 1".to_string();
    let result = format_structured_text(input.clone(), Some("yaml".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("yaml"));
    assert!(!result.changed);
    assert_eq!(result.formatted, input);
}

#[test]
fn format_structured_text_returns_unchanged_for_already_formatted_xml() {
    let input = "<note>\n  <to>Tove</to>\n</note>".to_string();
    let result = format_structured_text(input.clone(), Some("xml".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("xml"));
    assert!(!result.changed);
    assert_eq!(result.formatted, input);
}

#[test]
fn format_structured_text_returns_unchanged_for_already_formatted_csv() {
    let input = "name ,age\nAlice,30".to_string();
    let result = format_structured_text(input.clone(), Some("csv".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("csv"));
    assert!(!result.changed);
    assert_eq!(result.formatted, input);
}

// --- Auto-detection (no preferred_kind) ---

#[test]
fn format_structured_text_auto_detects_json() {
    let input = "{\"a\":1}".to_string();
    let result =
        format_structured_text(input, None).expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("json"));
    assert!(result.changed);
    assert_eq!(result.formatted, "{\n  \"a\": 1\n}");
}

#[test]
fn format_structured_text_auto_detects_yaml_mapping() {
    let input = "{host: localhost, port: 8080}".to_string();
    let result =
        format_structured_text(input, None).expect("format structured text should succeed");

    // JSON is tried first but this isn't valid JSON, so YAML picks it up
    assert_eq!(result.detected_kind.as_deref(), Some("yaml"));
    assert!(result.changed);
    assert!(result.formatted.contains("host: localhost"));
    assert!(result.formatted.contains("port: 8080"));
}

// --- Nested structures ---

#[test]
fn format_structured_text_formats_nested_json() {
    let input = "{\"a\":{\"b\":{\"c\":1}}}".to_string();
    let result = format_structured_text(input, Some("json".to_string()))
        .expect("format structured text should succeed");

    assert!(result.changed);
    assert_eq!(
        result.formatted,
        "{\n  \"a\": {\n    \"b\": {\n      \"c\": 1\n    }\n  }\n}"
    );
}

#[test]
fn format_structured_text_formats_nested_xml() {
    let input = "<a><b><c>deep</c></b></a>".to_string();
    let result = format_structured_text(input, Some("xml".to_string()))
        .expect("format structured text should succeed");

    assert!(result.changed);
    assert!(result.formatted.contains("    <c>deep</c>"));
}

#[test]
fn format_structured_text_formats_toml_with_nested_tables() {
    let input = "[server]\nhost=\"localhost\"\nport=8080".to_string();
    let result = format_structured_text(input, Some("toml".to_string()))
        .expect("format structured text should succeed");

    assert!(result.changed);
    assert!(result.formatted.contains("[server]"));
    assert!(result.formatted.contains("host = \"localhost\""));
    assert!(result.formatted.contains("port = 8080"));
}

// --- TSV (tab-separated CSV) ---

#[test]
fn format_structured_text_formats_tsv_input() {
    let input = "name\tage\nAlice\t30\nBob\t25".to_string();
    let result = format_structured_text(input, Some("csv".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("csv"));
    let lines: Vec<&str> = result.formatted.lines().collect();
    assert_eq!(lines.len(), 3);
    assert!(lines[0].contains('\t'));
}

// --- JSON array ---

#[test]
fn format_structured_text_formats_json_array() {
    let input = "[1,2,3]".to_string();
    let result = format_structured_text(input, Some("json".to_string()))
        .expect("format structured text should succeed");

    assert!(result.changed);
    assert_eq!(result.formatted, "[\n  1,\n  2,\n  3\n]");
}

// --- YAML sequence ---

#[test]
fn format_structured_text_formats_yaml_sequence() {
    let input = "[1, 2, 3]".to_string();
    let result = format_structured_text(input, Some("yaml".to_string()))
        .expect("format structured text should succeed");

    assert_eq!(result.detected_kind.as_deref(), Some("yaml"));
    assert!(result.changed);
    assert!(result.formatted.contains("- 1"));
}

// --- XML with attributes ---

#[test]
fn format_structured_text_formats_xml_with_attributes() {
    let input = "<root attr=\"val\"><child id=\"1\">text</child></root>".to_string();
    let result = format_structured_text(input, Some("xml".to_string()))
        .expect("format structured text should succeed");

    assert!(result.changed);
    assert!(result.formatted.contains("  <child id=\"1\">"));
}

// --- Invalid input returns unchanged ---

#[test]
fn format_structured_text_returns_unchanged_for_invalid_json() {
    let input = "{not valid json".to_string();
    let result = format_structured_text(input.clone(), Some("json".to_string()))
        .expect("format structured text should succeed");

    assert!(!result.changed);
    assert_eq!(result.formatted, input);
}

#[test]
fn format_structured_text_returns_unchanged_for_invalid_toml() {
    let input = "[[[invalid toml".to_string();
    let result = format_structured_text(input.clone(), Some("toml".to_string()))
        .expect("format structured text should succeed");

    assert!(!result.changed);
    assert_eq!(result.formatted, input);
}

#[test]
fn format_structured_text_returns_unchanged_for_invalid_xml() {
    let input = "not xml at all {{{".to_string();
    let result = format_structured_text(input.clone(), Some("xml".to_string()))
        .expect("format structured text should succeed");

    assert!(!result.changed);
    assert_eq!(result.formatted, input);
}

// --- CSV edge cases ---

#[test]
fn format_structured_text_formats_csv_with_uneven_columns() {
    let input = "a,bb,ccc\n1111,22,3".to_string();
    let result = format_structured_text(input, Some("csv".to_string()))
        .expect("format structured text should succeed");

    assert!(result.changed);
    let lines: Vec<&str> = result.formatted.lines().collect();
    assert_eq!(lines.len(), 2);
    // Last column should not be padded
    assert!(lines[0].ends_with("ccc"));
    assert!(lines[1].ends_with("3"));
}
