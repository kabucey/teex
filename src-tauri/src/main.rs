// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, fs, io::IsTerminal, path::PathBuf, process};

const SKILL_CONTENT: &str = include_str!("../../skills/teex.md");
const CODEX_SKILL_FRONTMATTER: &str = r#"---
name: teex
description: Companion text editor for AI workflows. Use when the user should review or edit files, when previewing markdown, or when presenting plans/proposals in a focused editor with tabs, markdown preview, and auto-save.
---

"#;

enum StartupAction {
    LaunchApp { wait: bool, app_args: Vec<String> },
    InstallSkill,
    PrintHelp,
    UsageError(String),
}

fn main() {
    match parse_startup_action(env::args().skip(1).collect()) {
        StartupAction::PrintHelp => {
            print_help_stdout();
            process::exit(0);
        }
        StartupAction::InstallSkill => install_skill(),
        StartupAction::UsageError(message) => {
            eprintln!("{message}\n");
            print_help_stderr();
            process::exit(2);
        }
        StartupAction::LaunchApp { wait, app_args } => {
            if should_run_in_process(wait) {
                teex_lib::run();
            } else {
                launch_app_detached(app_args);
            }
        }
    }
}

fn parse_startup_action(args: Vec<String>) -> StartupAction {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        return StartupAction::PrintHelp;
    }

    if let Some(first) = args.first() {
        if first == "install-skill" {
            if args.len() == 1 {
                return StartupAction::InstallSkill;
            }
            return StartupAction::UsageError(
                "install-skill does not accept additional arguments".to_string(),
            );
        }
    }

    let mut wait = false;
    let mut app_args = Vec::new();

    for arg in args {
        if arg == "--wait" {
            wait = true;
            continue;
        }

        if arg.starts_with('-') {
            return StartupAction::UsageError(format!("Unknown flag: {arg}"));
        }

        app_args.push(arg);
    }

    StartupAction::LaunchApp { wait, app_args }
}

fn should_run_in_process(wait: bool) -> bool {
    // `cargo tauri dev` launches this binary and serves frontend assets from a
    // builtin dev server owned by the CLI process. If we detach/respawn here,
    // the original process exits, the CLI shuts down the server, and the child
    // window is left pointing at a dead URL (white screen).
    wait || !std::io::stdin().is_terminal() || cfg!(dev)
}

fn launch_app_detached(app_args: Vec<String>) {
    #[cfg(target_os = "macos")]
    if let Some(app_bundle) = current_macos_app_bundle() {
        let mut child = process::Command::new("open");
        child.arg("-a").arg(&app_bundle).args(&app_args);

        match child.spawn() {
            Ok(_) => process::exit(0),
            Err(err) => {
                eprintln!(
                    "Failed to launch Teex via app bundle ({}): {err}. Falling back to direct launch.",
                    app_bundle.display()
                );
            }
        }
    }

    let exe = match env::current_exe() {
        Ok(path) => path,
        Err(err) => {
            eprintln!("Failed to locate teex executable: {err}");
            process::exit(1);
        }
    };

    let mut child = process::Command::new(exe);
    child.arg("--wait").args(app_args);

    if let Err(err) = child.spawn() {
        eprintln!("Failed to launch teex UI: {err}");
        process::exit(1);
    }

    process::exit(0);
}

#[cfg(target_os = "macos")]
fn current_macos_app_bundle() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let exe = fs::canonicalize(&exe).unwrap_or(exe);

    let macos_dir = exe.parent()?;
    if macos_dir.file_name()?.to_str()? != "MacOS" {
        return None;
    }

    let contents_dir = macos_dir.parent()?;
    if contents_dir.file_name()?.to_str()? != "Contents" {
        return None;
    }

    let app_dir = contents_dir.parent()?;
    let is_app_bundle = app_dir
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("app"))
        .unwrap_or(false);

    if is_app_bundle {
        Some(app_dir.to_path_buf())
    } else {
        None
    }
}

fn print_help_stdout() {
    println!("{}", help_text());
}

fn print_help_stderr() {
    eprintln!("{}", help_text());
}

fn help_text() -> &'static str {
    r#"teex - Companion text editor for AI workflows

Usage:
  teex [--wait] [FILES...]
  teex [--wait] [FOLDER]
  teex install-skill
  teex --help | -h

Commands:
  install-skill    Install teex skill files for Claude Code and Codex

Options:
  --wait            Wait until the UI exits before returning
  -h, --help       Show this help and exit

Examples:
  teex notes.md
  teex report.md config.json
  teex /path/to/folder
  teex install-skill

Notes:
  By default, teex launches the UI and returns immediately.
  Multiple files open in a single window with tabs.
"#
}

fn install_skill() {
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .expect("Unable to determine home directory");

    let claude_skills_dir = home.join(".claude").join("skills");
    fs::create_dir_all(&claude_skills_dir).expect("Unable to create ~/.claude/skills/");

    let claude_skill_path = claude_skills_dir.join("teex.md");
    fs::write(&claude_skill_path, SKILL_CONTENT).expect("Unable to write Claude skill file");

    let codex_skill_dir = home.join(".codex").join("skills").join("teex");
    fs::create_dir_all(&codex_skill_dir).expect("Unable to create ~/.codex/skills/teex/");

    let codex_skill_path = codex_skill_dir.join("SKILL.md");
    let codex_skill_content = format!("{CODEX_SKILL_FRONTMATTER}{SKILL_CONTENT}");
    fs::write(&codex_skill_path, codex_skill_content).expect("Unable to write Codex skill file");

    println!("teex skill installed to {}", claude_skill_path.display());
    println!("teex skill installed to {}", codex_skill_path.display());
    process::exit(0);
}
