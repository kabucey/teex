#[cfg(target_os = "macos")]
use super::cli_install::{
    ensure_cli_source_path_is_stable, path_contains_dir, preferred_cli_install_dir,
};
use super::path_utils::is_markdown;
use super::*;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
mod cli_install;
mod common;
mod files;
mod launch;
mod utils;
