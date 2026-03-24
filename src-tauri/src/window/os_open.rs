use std::path::PathBuf;
use std::process::Command;

#[tauri::command]
pub(crate) fn open_in_file_manager(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(&path_buf);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(&path_buf);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(&path_buf);
        cmd
    };

    let status = command
        .status()
        .map_err(|e| format!("Unable to open file manager: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "File manager command exited with status {}",
            status
        ))
    }
}
