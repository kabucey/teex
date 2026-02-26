use super::*;

pub(super) fn install_cli_from_menu(app: &tauri::AppHandle) {
    match install_cli_symlink() {
        Ok((link_path, bin_dir_on_path)) => {
            let mut message = format!(
                "Installed `teex` to:\n{}\n\nThe command points to this app bundle's executable.",
                link_path.display()
            );

            if bin_dir_on_path {
                message.push_str(
                    "\n\nOpen a new Terminal window (or restart your shell), then run `teex`.",
                );
            } else if let Some(parent) = link_path.parent() {
                message.push_str(&format!(
                    "\n\nAdd this directory to your PATH, then restart your shell:\n{}",
                    parent.display()
                ));
            }

            if bin_dir_on_path {
                message.push_str(
                    "\n\nTo install the agent skills for Claude Code and Codex, run:\n`teex install-skill`",
                );
            } else {
                message.push_str(
                    "\n\nAfter updating PATH and restarting your shell, install the agent skills for Claude Code and Codex with:\n`teex install-skill`",
                );
            }

            show_message_dialog(
                app,
                "Command Line Tool Installed",
                message,
                MessageDialogKind::Info,
            );
        }
        Err(message) => {
            show_message_dialog(
                app,
                "Unable to Install Command Line Tool",
                message,
                MessageDialogKind::Error,
            );
        }
    }
}

fn show_message_dialog(
    app: &tauri::AppHandle,
    title: &str,
    message: String,
    kind: MessageDialogKind,
) {
    if let Some(window) = target_window(app) {
        window
            .dialog()
            .message(message)
            .title(title)
            .kind(kind)
            .parent(&window)
            .show(|_| {});
        return;
    }

    app.dialog()
        .message(message)
        .title(title)
        .kind(kind)
        .show(|_| {});
}

fn install_cli_symlink() -> Result<(PathBuf, bool), String> {
    let exe_path =
        env::current_exe().map_err(|e| format!("Unable to locate Teex executable: {e}"))?;
    let exe_path = fs::canonicalize(&exe_path).unwrap_or(exe_path);
    ensure_cli_source_path_is_stable(&exe_path)?;

    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to determine your home directory".to_string())?;

    let install_dir = preferred_cli_install_dir(&home);
    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Unable to create {}: {e}", install_dir.display()))?;

    let link_path = install_dir.join("teex");
    if let Ok(metadata) = fs::symlink_metadata(&link_path) {
        let file_type = metadata.file_type();
        if file_type.is_dir() && !file_type.is_symlink() {
            return Err(format!(
                "{} already exists and is a directory",
                link_path.display()
            ));
        }

        fs::remove_file(&link_path)
            .map_err(|e| format!("Unable to replace existing {}: {e}", link_path.display()))?;
    }

    unix_fs::symlink(&exe_path, &link_path).map_err(|e| {
        format!(
            "Unable to create symlink {} -> {}: {e}",
            link_path.display(),
            exe_path.display()
        )
    })?;

    Ok((
        link_path.clone(),
        path_contains_dir(link_path.parent().unwrap_or(&install_dir)),
    ))
}

pub(crate) fn ensure_cli_source_path_is_stable(exe_path: &Path) -> Result<(), String> {
    if exe_path.starts_with("/Volumes/") {
        return Err(
            "Teex appears to be running from the mounted installer image. Drag Teex to Applications, open it from there, then try “Install Command Line Tool...” again.".to_string(),
        );
    }

    let exe_string = exe_path.to_string_lossy();
    if exe_string.contains("/AppTranslocation/") {
        return Err(
            "Teex is running from a temporary App Translocation path. Move it to a permanent location (for example /Applications), reopen it, then try again.".to_string(),
        );
    }

    Ok(())
}

pub(crate) fn preferred_cli_install_dir(home: &Path) -> PathBuf {
    let home_bin = home.join("bin");
    if path_contains_dir(&home_bin) {
        return home_bin;
    }

    let local_bin = home.join(".local").join("bin");
    if path_contains_dir(&local_bin) {
        return local_bin;
    }

    local_bin
}

pub(crate) fn path_contains_dir(dir: &Path) -> bool {
    env::var_os("PATH")
        .map(|raw| env::split_paths(&raw).any(|entry| entry == dir))
        .unwrap_or(false)
}
