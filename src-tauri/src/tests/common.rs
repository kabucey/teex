use super::*;

pub(super) static TEST_COUNTER: AtomicUsize = AtomicUsize::new(1);
#[cfg(target_os = "macos")]
pub(super) static ENV_LOCK: Mutex<()> = Mutex::new(());

pub(super) struct TempTestDir {
    path: PathBuf,
}

impl TempTestDir {
    pub(super) fn new() -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let id = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = env::temp_dir().join(format!(
            "teex-tests-{}-{}-{}",
            std::process::id(),
            nanos,
            id
        ));
        fs::create_dir_all(&path).expect("create temp test dir");
        Self { path }
    }

    pub(super) fn path(&self) -> &Path {
        &self.path
    }

    pub(super) fn write_text(&self, relative: &str, content: &str) -> PathBuf {
        let path = self.path.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dirs");
        }
        fs::write(&path, content).expect("write text fixture");
        path
    }

    pub(super) fn write_bytes(&self, relative: &str, content: &[u8]) -> PathBuf {
        let path = self.path.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dirs");
        }
        fs::write(&path, content).expect("write binary fixture");
        path
    }

    pub(super) fn mkdir(&self, relative: &str) -> PathBuf {
        let path = self.path.join(relative);
        fs::create_dir_all(&path).expect("create fixture directory");
        path
    }
}

impl Drop for TempTestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}
