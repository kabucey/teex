use crate::git::{parse_unified_diff, LineDiff};
use crate::git::{parse_full_unified_diff, DiffLine};

#[test]
fn empty_diff_produces_no_annotations() {
    let result = parse_unified_diff("");
    assert!(result.is_empty());
}

#[test]
fn single_added_line() {
    let diff = "\
diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line1
 line2
+new line
 line3
";
    let result = parse_unified_diff(diff);
    assert_eq!(
        result,
        vec![LineDiff {
            line: 3,
            diff_type: "added".to_string(),
        }]
    );
}

#[test]
fn multiple_added_lines() {
    let diff = "\
@@ -0,0 +1,3 @@
+line1
+line2
+line3
";
    let result = parse_unified_diff(diff);
    assert_eq!(
        result,
        vec![
            LineDiff {
                line: 1,
                diff_type: "added".to_string(),
            },
            LineDiff {
                line: 2,
                diff_type: "added".to_string(),
            },
            LineDiff {
                line: 3,
                diff_type: "added".to_string(),
            },
        ]
    );
}

#[test]
fn removed_lines_not_in_output() {
    let diff = "\
@@ -1,3 +1,2 @@
 line1
-removed
 line3
";
    let result = parse_unified_diff(diff);
    assert!(
        result.is_empty(),
        "Removed lines should not produce annotations"
    );
}

#[test]
fn mixed_add_and_remove() {
    let diff = "\
@@ -1,4 +1,4 @@
 line1
-old line2
+new line2
 line3
 line4
";
    let result = parse_unified_diff(diff);
    assert_eq!(
        result,
        vec![LineDiff {
            line: 2,
            diff_type: "added".to_string(),
        }]
    );
}

#[test]
fn multiple_hunks() {
    let diff = "\
@@ -1,3 +1,4 @@
 line1
+inserted
 line2
 line3
@@ -10,3 +11,4 @@
 line10
 line11
+another
 line12
";
    let result = parse_unified_diff(diff);
    assert_eq!(
        result,
        vec![
            LineDiff {
                line: 2,
                diff_type: "added".to_string(),
            },
            LineDiff {
                line: 13,
                diff_type: "added".to_string(),
            },
        ]
    );
}

#[test]
fn hunk_header_with_no_count() {
    // Some hunks omit the count when it's 1: @@ -1 +1 @@
    let diff = "\
@@ -1 +1 @@
-old
+new
";
    let result = parse_unified_diff(diff);
    assert_eq!(
        result,
        vec![LineDiff {
            line: 1,
            diff_type: "added".to_string(),
        }]
    );
}

#[test]
fn no_newline_at_end_marker_ignored() {
    let diff = "\
@@ -1,2 +1,2 @@
-old
+new
\\ No newline at end of file
";
    let result = parse_unified_diff(diff);
    assert_eq!(
        result,
        vec![LineDiff {
            line: 1,
            diff_type: "added".to_string(),
        }]
    );
}

// --- parse_full_unified_diff tests ---

#[test]
fn full_diff_empty_input() {
    let result = parse_full_unified_diff("");
    assert!(result.is_empty());
}

#[test]
fn full_diff_single_file_single_hunk() {
    let diff = "\
diff --git a/src/main.rs b/src/main.rs
index 1234567..abcdefg 100644
--- a/src/main.rs
+++ b/src/main.rs
@@ -1,3 +1,4 @@
 line1
 line2
+new line
 line3
";
    let result = parse_full_unified_diff(diff);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].rel_path, "src/main.rs");
    assert_eq!(result[0].hunks.len(), 1);
    assert_eq!(result[0].hunks[0].lines.len(), 4);
    assert_eq!(result[0].hunks[0].lines[0].line_type, "context");
    assert_eq!(result[0].hunks[0].lines[1].line_type, "context");
    assert_eq!(result[0].hunks[0].lines[2].line_type, "added");
    assert_eq!(result[0].hunks[0].lines[2].content, "new line");
    assert_eq!(result[0].hunks[0].lines[3].line_type, "context");
}

#[test]
fn full_diff_single_file_multiple_hunks() {
    let diff = "\
diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line1
+inserted
 line2
 line3
@@ -10,3 +11,4 @@
 line10
 line11
+another
 line12
";
    let result = parse_full_unified_diff(diff);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].hunks.len(), 2);
    assert_eq!(result[0].hunks[0].lines[1].content, "inserted");
    assert_eq!(result[0].hunks[1].lines[2].content, "another");
}

#[test]
fn full_diff_multiple_files() {
    let diff = "\
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,3 @@
 hello
+world
 end
diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -1,3 +1,2 @@
 foo
-bar
 baz
";
    let result = parse_full_unified_diff(diff);
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].rel_path, "a.txt");
    assert_eq!(result[1].rel_path, "b.txt");
    assert!(result[0].hunks[0]
        .lines
        .iter()
        .any(|l| l.line_type == "added" && l.content == "world"));
    assert!(result[1].hunks[0]
        .lines
        .iter()
        .any(|l| l.line_type == "removed" && l.content == "bar"));
}

#[test]
fn full_diff_line_type_classification() {
    let diff = "\
diff --git a/x.rs b/x.rs
--- a/x.rs
+++ b/x.rs
@@ -1,4 +1,4 @@
 keep
-old
+new
 also keep
";
    let result = parse_full_unified_diff(diff);
    let lines = &result[0].hunks[0].lines;
    assert_eq!(
        lines[0],
        DiffLine {
            content: "keep".to_string(),
            line_type: "context".to_string()
        }
    );
    assert_eq!(
        lines[1],
        DiffLine {
            content: "old".to_string(),
            line_type: "removed".to_string()
        }
    );
    assert_eq!(
        lines[2],
        DiffLine {
            content: "new".to_string(),
            line_type: "added".to_string()
        }
    );
    assert_eq!(
        lines[3],
        DiffLine {
            content: "also keep".to_string(),
            line_type: "context".to_string()
        }
    );
}

#[test]
fn full_diff_binary_file_skipped() {
    let diff = "\
diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
diff --git a/code.rs b/code.rs
--- a/code.rs
+++ b/code.rs
@@ -1 +1 @@
-old
+new
";
    let result = parse_full_unified_diff(diff);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].rel_path, "code.rs");
}

#[test]
fn full_diff_no_newline_marker_ignored() {
    let diff = "\
diff --git a/f.txt b/f.txt
--- a/f.txt
+++ b/f.txt
@@ -1 +1 @@
-old
+new
\\ No newline at end of file
";
    let result = parse_full_unified_diff(diff);
    assert_eq!(result[0].hunks[0].lines.len(), 2);
}
