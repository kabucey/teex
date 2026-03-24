import { baseName } from "../utils/app-utils.js";

let nextDragId = 1;

export function createCrossWindowDragSession() {
  let session = {
    dragId: null,
    dragMode: "tab",
    dragPath: null,
    dragPreviewInfo: null,
    fromIndex: -1,
    previewVisible: false,
    reporting: false,
    targetLabel: null,
  };

  function reset() {
    session = {
      dragId: null,
      dragMode: "tab",
      dragPath: null,
      dragPreviewInfo: null,
      fromIndex: -1,
      previewVisible: false,
      reporting: false,
      targetLabel: null,
    };
  }

  function activate(index) {
    reset();
    session.dragId = `cwdrag-${nextDragId++}`;
    session.fromIndex = index;
  }

  function activateForPath(path, previewInfo) {
    reset();
    session.dragId = `cwdrag-${nextDragId++}`;
    session.dragMode = "path";
    session.dragPath = path;
    session.dragPreviewInfo = previewInfo || {
      title: baseName(path),
      content: "",
    };
  }

  function setPreviewInfo(info) {
    if (session.dragId && session.dragMode === "path" && info) {
      session.dragPreviewInfo = info;
    }
  }

  return {
    activate,
    activateForPath,
    clearTargetLabel() {
      session.targetLabel = null;
    },
    get dragId() {
      return session.dragId;
    },
    get dragMode() {
      return session.dragMode;
    },
    get dragPath() {
      return session.dragPath;
    },
    get dragPreviewInfo() {
      return session.dragPreviewInfo;
    },
    get fromIndex() {
      return session.fromIndex;
    },
    get targetLabel() {
      return session.targetLabel;
    },
    isActive() {
      return session.dragId !== null;
    },
    isPreviewVisible() {
      return session.previewVisible;
    },
    isReporting() {
      return session.reporting;
    },
    reset,
    setPreviewInfo,
    setPreviewVisible(value) {
      session.previewVisible = value;
    },
    setReporting(value) {
      session.reporting = value;
    },
    setTargetLabel(value) {
      session.targetLabel = value;
    },
    snapshotAndReset() {
      const current = { ...session };
      reset();
      return current;
    },
  };
}
