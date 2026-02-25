import { normalizeIncomingPaths } from "../path-input.js";

export function shouldSkipDuplicateOsOpenForDeduper(deduper, paths, now = Date.now()) {
  const signature = paths.join("\n");
  if (deduper.signature === signature && now - deduper.timestamp < 2000) {
    return true;
  }

  deduper.signature = signature;
  deduper.timestamp = now;
  return false;
}

export function createOpenPathsController({
  state,
  invoke,
  setStatus,
  render,
  updateMenuState,
  openFile,
  openFileInTabs,
  openSingleFileFromUi,
  openMultipleFiles,
  openFolder,
  deduper,
}) {
  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function shouldSkipDuplicateOsOpen(paths) {
    return shouldSkipDuplicateOsOpenForDeduper(deduper, paths);
  }

  async function handleOsOpenFiles(paths) {
    const normalized = normalizeIncomingPaths(paths);
    if (normalized.length === 0) {
      return;
    }

    if (shouldSkipDuplicateOsOpen(normalized)) {
      return;
    }

    if (state.mode === "folder") {
      try {
        await invoke("open_paths_in_new_window", { paths: normalized });
      } catch (error) {
        setStatus(String(error), true);
      }
      return;
    }

    if (normalized.length >= 2) {
      await openMultipleFiles(normalized);
      return;
    }

    if (state.mode === "file" || state.mode === "files") {
      await openFileInTabs(normalized[0]);
      return;
    }

    await openFile(normalized[0]);
  }

  async function handleDroppedPaths(paths) {
    const normalized = normalizeIncomingPaths(paths);
    if (normalized.length === 0) {
      return;
    }

    try {
      const launch = await invoke("categorize_paths", { paths: normalized });
      if (!launch || !launch.mode) {
        return;
      }

      if (launch.mode === "folder" && launch.path) {
        await openFolder(launch.path);
        return;
      }

      if (launch.mode === "files" && Array.isArray(launch.paths) && launch.paths.length >= 2) {
        await openMultipleFiles(launch.paths);
        return;
      }

      if (launch.mode === "file" && launch.path) {
        await openSingleFileFromUi(launch.path);
        return;
      }

      setStatus("No supported files were dropped");
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  async function drainPendingOpenPaths() {
    const pendingOpenPaths = await invoke("take_pending_open_paths");
    if (!Array.isArray(pendingOpenPaths) || pendingOpenPaths.length === 0) {
      return false;
    }

    await handleOsOpenFiles(pendingOpenPaths);
    return true;
  }

  function startPendingOpenPathPoller() {
    let attempts = 0;
    const maxAttempts = 20;

    const timer = setInterval(async () => {
      attempts += 1;
      try {
        await drainPendingOpenPaths();
      } catch (error) {
        setStatus(String(error), true);
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 150);
  }

  async function bootstrap() {
    setStatus("Ready");

    try {
      if (await drainPendingOpenPaths()) {
        return;
      }

      const launch = await invoke("get_launch_context");
      if (launch.mode === "file" && launch.path) {
        await openFile(launch.path);
        return;
      }

      if (launch.mode === "files" && launch.paths && launch.paths.length >= 2) {
        await openMultipleFiles(launch.paths);
        return;
      }

      if (launch.mode === "folder" && launch.path) {
        await openFolder(launch.path);
        return;
      }

      await sleep(250);
      if (await drainPendingOpenPaths()) {
        return;
      }
    } catch (error) {
      setStatus(String(error), true);
    }

    render();
    updateMenuState();
  }

  return {
    bootstrap,
    drainPendingOpenPaths,
    handleOsOpenFiles,
    handleDroppedPaths,
    startPendingOpenPathPoller,
  };
}
