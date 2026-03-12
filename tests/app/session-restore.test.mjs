import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionRestoreController,
  sessionPaths,
} from "../../src/app/session-restore.js";

test("sessionPaths returns folder path for folder sessions", () => {
  assert.deepEqual(
    sessionPaths({
      mode: "folder",
      folderPath: "/project",
      tabs: [{ path: "/project/a.md" }],
    }),
    ["/project"],
  );
});

test("sessionPaths returns tab paths for non-folder sessions", () => {
  assert.deepEqual(
    sessionPaths({
      mode: "files",
      tabs: [{ path: "/a.md" }, { path: null }, { path: "/b.md" }],
    }),
    ["/a.md", "/b.md"],
  );
});

test("restoreLastSession restores first session locally and opens others in new windows", async () => {
  const openedWindows = [];
  const actions = [];
  const sessions = [
    {
      mode: "files",
      tabs: [{ path: "/a.md" }, { path: "/b.md" }],
      activeTabIndex: 1,
    },
    {
      mode: "folder",
      folderPath: "/project",
      tabs: [{ path: "/project/a.md" }],
    },
  ];

  const controller = createSessionRestoreController({
    state: { openFiles: [{ path: "/a.md" }, { path: "/b.md" }] },
    invoke: async (command, args) => {
      if (command === "open_paths_in_new_window") {
        openedWindows.push(args.paths);
      }
    },
    loadAllSessions: () => sessions,
    clearAllSessions: () => {
      actions.push("clearAllSessions");
    },
    pruneStaleWindows: () => {},
    buildCollapsedFoldersFromExpanded: () => new Set(),
    reconcileRestoredFolderTabs: () => ({ switchToIndex: -1 }),
    markSidebarTreeDirty: () => {},
    openFolder: async () => {
      throw new Error("should not open folder for first session");
    },
    openFile: async () => {
      throw new Error("should not open single file");
    },
    openMultipleFiles: async (paths) => {
      actions.push(["openMultipleFiles", paths]);
    },
    openFolderEntryInTabs: async () => {},
    switchTab: (index) => {
      actions.push(["switchTab", index]);
    },
    render: () => {},
  });

  await controller.restoreLastSession();

  assert.deepEqual(actions, [
    "clearAllSessions",
    ["openMultipleFiles", ["/a.md", "/b.md"]],
    ["switchTab", 1],
  ]);
  assert.deepEqual(openedWindows, [["/project"]]);
});

test("restoreLastSession restores folder expansion and tabs for folder sessions", async () => {
  const state = {
    entries: [{ path: "/project/a.md", relPath: "docs/a.md" }],
    collapsedFolders: new Set(),
    savedCollapsedFolders: new Set(["x"]),
    openFiles: [{ path: "/project/a.md" }, { path: "/project/b.md" }],
  };
  const openedTabs = [];
  let markedTreeDirty = 0;
  let renderCalls = 0;
  let switchedTo = null;

  const controller = createSessionRestoreController({
    state,
    invoke: async () => {},
    loadAllSessions: () => [
      {
        mode: "folder",
        folderPath: "/project",
        tabs: [{ path: "/project/a.md" }, { path: "/project/b.md" }],
        activeTabIndex: 1,
        expandedFolders: ["docs"],
      },
    ],
    clearAllSessions: () => {},
    pruneStaleWindows: () => {},
    buildCollapsedFoldersFromExpanded: (entries, expandedFolders) => {
      assert.equal(entries, state.entries);
      assert.deepEqual([...expandedFolders], ["docs"]);
      return new Set(["other"]);
    },
    reconcileRestoredFolderTabs: (_state, tabs, activeTabIndex) => {
      assert.deepEqual(tabs, [
        { path: "/project/a.md" },
        { path: "/project/b.md" },
      ]);
      assert.equal(activeTabIndex, 1);
      return { switchToIndex: 1 };
    },
    markSidebarTreeDirty: () => {
      markedTreeDirty += 1;
    },
    openFolder: async (path) => {
      assert.equal(path, "/project");
    },
    openFile: async () => {},
    openMultipleFiles: async () => {},
    openFolderEntryInTabs: async (path) => {
      openedTabs.push(path);
    },
    switchTab: (index) => {
      switchedTo = index;
    },
    render: () => {
      renderCalls += 1;
    },
  });

  await controller.restoreLastSession();

  assert.deepEqual(openedTabs, ["/project/a.md", "/project/b.md"]);
  assert.deepEqual([...state.collapsedFolders], ["other"]);
  assert.equal(state.savedCollapsedFolders, null);
  assert.equal(markedTreeDirty, 1);
  assert.equal(switchedTo, 1);
  assert.equal(renderCalls, 1);
});
