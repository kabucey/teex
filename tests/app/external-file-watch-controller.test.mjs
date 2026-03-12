import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWatchedProjectFileSignature,
  collectWatchedProjectFilePaths,
  createExternalFileWatchController,
} from "../../src/app/external-file-watch-controller.js";

test("collectWatchedProjectFilePaths deduplicates and sorts tab paths", () => {
  assert.deepEqual(
    collectWatchedProjectFilePaths({
      openFiles: [
        { path: "/b.md" },
        { path: "/a.md" },
        { path: "/b.md" },
        { path: null },
      ],
      activePath: "/ignored.md",
    }),
    ["/a.md", "/b.md"],
  );
});

test("collectWatchedProjectFilePaths falls back to active path when no tabs exist", () => {
  assert.deepEqual(
    collectWatchedProjectFilePaths({
      openFiles: [],
      activePath: "/solo.md",
    }),
    ["/solo.md"],
  );
});

test("buildWatchedProjectFileSignature joins paths deterministically", () => {
  assert.equal(
    buildWatchedProjectFileSignature(["/a.md", "/b.md"]),
    "/a.md\n/b.md",
  );
});

test("syncWatchedProjectFiles invokes backend only when signature changes", async () => {
  const state = {
    openFiles: [{ path: "/a.md" }],
    activePath: null,
  };
  const watched = [];

  const controller = createExternalFileWatchController({
    state,
    invoke: async (command, args) => {
      if (command === "watch_project_files") {
        watched.push(args.paths);
      }
    },
    baseName: (value) => value.split("/").pop(),
    hasTabSession: () => state.openFiles.length > 0,
    applyFilePayload: () => {},
    render: () => {},
    updateMenuState: () => {},
    setStatus: () => {},
    confirmReloadExternalChange: async () => true,
  });

  controller.syncWatchedProjectFiles();
  await Promise.resolve();
  controller.syncWatchedProjectFiles();
  await Promise.resolve();
  state.openFiles.push({ path: "/b.md" });
  controller.syncWatchedProjectFiles();
  await Promise.resolve();

  assert.deepEqual(watched, [["/a.md"], ["/a.md", "/b.md"]]);
});

test("handleProjectFileChanged ignores recently saved paths", async () => {
  const controller = createExternalFileWatchController({
    state: {
      openFiles: [],
      activePath: "/a.md",
      isDirty: false,
    },
    invoke: async () => {
      throw new Error("should not reload");
    },
    baseName: (value) => value.split("/").pop(),
    hasTabSession: () => false,
    applyFilePayload: () => {},
    render: () => {},
    updateMenuState: () => {},
    setStatus: () => {},
    confirmReloadExternalChange: async () => true,
  });

  controller.onFileSaved("/a.md");
  await controller.handleProjectFileChanged("/a.md");
});

test("handleProjectFileChanged reloads active clean file and re-renders", async () => {
  const state = {
    openFiles: [],
    activePath: "/a.md",
    activeKind: "markdown",
    isDirty: false,
  };
  const applyCalls = [];
  let renderCalls = 0;
  let updateMenuCalls = 0;
  const statusCalls = [];

  const controller = createExternalFileWatchController({
    state,
    invoke: async (command, args) => {
      if (command === "read_text_file") {
        assert.deepEqual(args, { path: "/a.md" });
        return {
          path: "/a.md",
          kind: "markdown",
          content: "# Updated",
          writable: true,
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
    baseName: (value) => value.split("/").pop(),
    hasTabSession: () => false,
    applyFilePayload: (payload, options) => {
      applyCalls.push({ payload, options });
    },
    render: () => {
      renderCalls += 1;
    },
    updateMenuState: () => {
      updateMenuCalls += 1;
    },
    setStatus: (message, isError = false) => {
      statusCalls.push({ message, isError });
    },
    confirmReloadExternalChange: async () => true,
  });

  await controller.handleProjectFileChanged("/a.md");

  assert.deepEqual(applyCalls, [
    {
      payload: {
        path: "/a.md",
        kind: "markdown",
        content: "# Updated",
        writable: true,
      },
      options: {
        defaultMarkdownMode: "preview",
        preserveMarkdownMode: true,
      },
    },
  ]);
  assert.equal(renderCalls, 1);
  assert.equal(updateMenuCalls, 1);
  assert.deepEqual(statusCalls, [
    { message: "Reloaded a.md (changed outside Teex)", isError: false },
  ]);
});
