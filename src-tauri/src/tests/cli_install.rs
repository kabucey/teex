use super::common::TempTestDir;
#[cfg(target_os = "macos")]
use super::common::ENV_LOCK;
use super::*;

#[cfg(target_os = "macos")]
#[test]
fn ensure_cli_source_path_is_stable_rejects_transient_locations() {
    let volumes_error =
        ensure_cli_source_path_is_stable(Path::new("/Volumes/Teex/Teex.app")).unwrap_err();
    assert!(volumes_error.contains("mounted installer image"));

    let translocation_error = ensure_cli_source_path_is_stable(Path::new(
        "/private/var/folders/.../AppTranslocation/Teex.app/Contents/MacOS/teex",
    ))
    .unwrap_err();
    assert!(translocation_error.contains("App Translocation"));

    assert!(ensure_cli_source_path_is_stable(Path::new(
        "/Applications/Teex.app/Contents/MacOS/teex"
    ))
    .is_ok());
}

#[cfg(target_os = "macos")]
#[test]
fn preferred_cli_install_dir_respects_existing_path_entries() {
    let _guard = ENV_LOCK.lock().expect("lock env");
    let temp = TempTestDir::new();
    let home = temp.mkdir("home");
    let home_bin = home.join("bin");
    let local_bin = home.join(".local").join("bin");
    fs::create_dir_all(&home_bin).expect("create ~/bin");
    fs::create_dir_all(&local_bin).expect("create ~/.local/bin");

    let original_path = env::var_os("PATH");
    let path_with_home_bin =
        env::join_paths([home_bin.clone(), PathBuf::from("/usr/bin")]).expect("join PATH");
    env::set_var("PATH", path_with_home_bin);
    assert_eq!(preferred_cli_install_dir(&home), home_bin);

    let path_with_local_bin =
        env::join_paths([local_bin.clone(), PathBuf::from("/usr/bin")]).expect("join PATH");
    env::set_var("PATH", path_with_local_bin);
    assert_eq!(preferred_cli_install_dir(&home), local_bin.clone());

    env::set_var("PATH", "/usr/bin");
    assert_eq!(preferred_cli_install_dir(&home), local_bin);

    match original_path {
        Some(value) => env::set_var("PATH", value),
        None => env::remove_var("PATH"),
    }
}

#[cfg(target_os = "macos")]
#[test]
fn path_contains_dir_requires_exact_path_match() {
    let _guard = ENV_LOCK.lock().expect("lock env");
    let temp = TempTestDir::new();
    let home = temp.mkdir("home");
    let home_bin = home.join("bin");
    let sibling = home.join("bin-tools");
    fs::create_dir_all(&home_bin).expect("create dir");
    fs::create_dir_all(&sibling).expect("create dir");

    let original_path = env::var_os("PATH");
    let joined = env::join_paths([home_bin.clone(), PathBuf::from("/usr/bin")]).expect("PATH");
    env::set_var("PATH", joined);

    assert!(path_contains_dir(&home_bin));
    assert!(!path_contains_dir(&sibling));

    match original_path {
        Some(value) => env::set_var("PATH", value),
        None => env::remove_var("PATH"),
    }
}
