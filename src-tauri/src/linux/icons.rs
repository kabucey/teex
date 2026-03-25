use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::Path;
use std::{env, fs};

/// Detects the current GTK icon theme name from settings or environment.
fn gtk_icon_theme() -> String {
    if let Ok(theme) = env::var("GTK_THEME") {
        if !theme.is_empty() {
            return theme;
        }
    }

    let home = env::var("HOME").unwrap_or_default();
    for settings_path in [
        format!("{home}/.config/gtk-3.0/settings.ini"),
        format!("{home}/.config/gtk-4.0/settings.ini"),
    ] {
        if let Ok(contents) = fs::read_to_string(&settings_path) {
            for line in contents.lines() {
                if let Some(value) = line.strip_prefix("gtk-icon-theme-name") {
                    let value = value.trim_start_matches(|c: char| c == '=' || c.is_whitespace());
                    if !value.is_empty() {
                        return value.to_string();
                    }
                }
            }
        }
    }

    "Adwaita".to_string()
}

/// Searches for the folder icon in freedesktop icon theme directories.
fn find_folder_icon(theme: &str) -> Option<(Vec<u8>, &'static str)> {
    let sizes = ["32x32", "48x48", "32", "48", "scalable"];
    let base_dirs = [
        format!("/usr/share/icons/{theme}"),
        "/usr/share/icons/hicolor".to_string(),
        "/usr/share/icons/Adwaita".to_string(),
    ];

    for base in &base_dirs {
        for size in &sizes {
            let png_path = format!("{base}/{size}/places/folder.png");
            if let Ok(bytes) = fs::read(&png_path) {
                return Some((bytes, "image/png"));
            }
            let svg_path = format!("{base}/{size}/places/folder.svg");
            if let Ok(bytes) = fs::read(&svg_path) {
                return Some((bytes, "image/svg+xml"));
            }
        }

        // Some themes use category subdirectories without size prefix
        let places_dir = format!("{base}/places");
        if Path::new(&places_dir).is_dir() {
            let png_path = format!("{places_dir}/folder.png");
            if let Ok(bytes) = fs::read(&png_path) {
                return Some((bytes, "image/png"));
            }
        }
    }

    None
}

/// Fetches the Linux system folder icon from the current freedesktop icon
/// theme and returns it as a base64-encoded data URL.
pub(crate) fn get_system_folder_icon() -> Option<String> {
    let theme = gtk_icon_theme();
    let (bytes, mime) = find_folder_icon(&theme)?;
    let encoded = STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}
