use crate::git::{parse_unified_diff, LineDiff};

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
