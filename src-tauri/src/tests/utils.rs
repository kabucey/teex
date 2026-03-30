use super::common::TempTestDir;
use super::*;
use walkdir::WalkDir;

#[test]
fn file_type_helpers_are_case_insensitive_for_supported_extensions() {
    assert!(is_markdown(Path::new("README.MD")));
    assert!(is_markdown(Path::new("notes.Markdown")));
    assert!(!is_markdown(Path::new("notes.txt")));

    assert!(is_text_like(Path::new("data.JSON")));
    assert!(is_text_like(Path::new("script.TSX")));
    assert!(!is_text_like(Path::new("archive.zip")));
    assert!(!is_text_like(Path::new("no_extension")));

    assert_eq!(file_kind(Path::new("post.md")), "markdown");
    assert_eq!(file_kind(Path::new("post.txt")), "text");
    assert_eq!(file_kind(Path::new("main.rs")), "code");
    assert_eq!(file_kind(Path::new("app.swift")), "code");
    assert_eq!(file_kind(Path::new("data.json")), "code");
    assert_eq!(file_kind(Path::new("main.cpp")), "code");
    assert_eq!(file_kind(Path::new("style.CSS")), "code");
    assert_eq!(file_kind(Path::new(".gitignore")), "code");
    assert_eq!(file_kind(Path::new(".dockerignore")), "code");
    assert_eq!(file_kind(Path::new("Dockerfile")), "code");

    assert!(is_text_like(Path::new("Dockerfile")));

    assert!(is_code(Path::new("lib.rs")));
    assert!(is_code(Path::new("index.JS")));
    assert!(!is_code(Path::new("readme.txt")));
    assert!(!is_code(Path::new("notes.md")));
}

#[test]
fn utility_helpers_build_expected_strings_and_ids() {
    assert_eq!(
        window_event("teex://open", "teex-window-2"),
        "teex://open/teex-window-2"
    );
    assert_eq!(
        path_to_string(Path::new("/tmp/example.txt")),
        "/tmp/example.txt"
    );

    let a = next_transfer_request_id();
    let b = next_transfer_request_id();
    assert!(a.starts_with("tab-transfer-"));
    assert!(b.starts_with("tab-transfer-"));
    assert_ne!(a, b);
}

#[test]
fn should_traverse_blocks_known_build_dirs() {
    let temp = TempTestDir::new();
    for dir in &[".git", "node_modules", "target", "dist", "build"] {
        temp.mkdir(dir);
    }

    for entry in WalkDir::new(temp.path()).min_depth(1).max_depth(1) {
        let entry = entry.unwrap();
        let name = entry.file_name().to_str().unwrap().to_string();
        if [".git", "node_modules", "target", "dist", "build"].contains(&name.as_str()) {
            assert!(
                !should_traverse_with_hidden(&entry, true),
                "{name} should not be traversed even when show_hidden=true"
            );
            assert!(
                !should_traverse_with_hidden(&entry, false),
                "{name} should not be traversed when show_hidden=false"
            );
        }
    }
}

#[test]
fn should_traverse_respects_show_hidden_for_dotdirs() {
    let temp = TempTestDir::new();
    temp.mkdir(".hidden_config");
    temp.mkdir("visible");

    for entry in WalkDir::new(temp.path()).min_depth(1).max_depth(1) {
        let entry = entry.unwrap();
        let name = entry.file_name().to_str().unwrap();
        match name {
            ".hidden_config" => {
                assert!(
                    !should_traverse_with_hidden(&entry, false),
                    "hidden dir skipped when show_hidden=false"
                );
                assert!(
                    should_traverse_with_hidden(&entry, true),
                    "hidden dir traversed when show_hidden=true"
                );
            }
            "visible" => {
                assert!(should_traverse_with_hidden(&entry, false));
                assert!(should_traverse_with_hidden(&entry, true));
            }
            _ => {}
        }
    }
}

#[test]
fn should_traverse_non_dirs_always_traverse() {
    let temp = TempTestDir::new();
    temp.write_text("file.md", "content");

    for entry in WalkDir::new(temp.path()).min_depth(1).max_depth(1) {
        let entry = entry.unwrap();
        if entry.file_name().to_str().unwrap() == "file.md" {
            assert!(should_traverse_with_hidden(&entry, false));
            assert!(should_traverse_with_hidden(&entry, true));
        }
    }
}

#[test]
fn is_dotfile_config_detects_extensionless_dotfiles() {
    // Standard dotfile configs (starts with dot, no extension)
    assert!(is_dotfile_config(Path::new(".gitconfig")));
    assert!(is_dotfile_config(Path::new(".npmrc")));
    assert!(is_dotfile_config(Path::new(".zshrc")));
    assert!(is_dotfile_config(Path::new(".gitignore")));

    // .DS_Store is explicitly excluded
    assert!(!is_dotfile_config(Path::new(".DS_Store")));

    // Dotfiles with extensions are not dotfile configs
    assert!(!is_dotfile_config(Path::new(".env.local")));
    assert!(!is_dotfile_config(Path::new(".eslintrc.json")));

    // Regular files are not dotfile configs
    assert!(!is_dotfile_config(Path::new("config.toml")));
    assert!(!is_dotfile_config(Path::new("README.md")));
}
