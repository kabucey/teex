import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenPathsController,
  shouldSkipDuplicateOsOpenForDeduper,
} from "../../src/app/open-paths-controller.js";

test("OS open deduper suppresses only matching signatures within time window", () => {
  const deduper = { signature: "", timestamp: 0 };

  assert.equal(
    shouldSkipDuplicateOsOpenForDeduper(deduper, ["/a.txt"], 1000),
    false,
  );
  assert.equal(deduper.signature, "/a.txt");
  assert.equal(deduper.timestamp, 1000);

  assert.equal(
    shouldSkipDuplicateOsOpenForDeduper(deduper, ["/a.txt"], 2500),
    true,
  );

  assert.equal(
    shouldSkipDuplicateOsOpenForDeduper(deduper, ["/a.txt"], 3001),
    false,
  );

  assert.equal(
    shouldSkipDuplicateOsOpenForDeduper(deduper, ["/b.txt"], 3100),
    false,
  );
  assert.equal(deduper.signature, "/b.txt");
});

test("bootstrap resolves quickly when no paths are pending", async () => {
  const invoke = async (command) => {
    if (command === "take_pending_open_paths") return [];
    if (command === "get_launch_context") return { mode: "empty" };
    return null;
  };

  const controller = createOpenPathsController({
    state: { mode: "empty" },
    invoke,
    setStatus: () => {},
    openFile: async () => {},
    openFileInTabs: async () => {},
    openSingleFileFromUi: async () => {},
    openMultipleFiles: async () => {},
    openFolder: async () => {},
    createNewTab: () => {},
    deduper: { signature: "", timestamp: 0 },
  });

  const start = performance.now();
  await controller.bootstrap();
  const elapsed = performance.now() - start;

  assert.ok(
    elapsed < 50,
    `bootstrap took ${elapsed.toFixed(0)}ms, expected < 50ms`,
  );
});

test("bootstrap creates a new tab when no paths are pending and launch context is empty", async () => {
  let newTabCalled = false;

  const invoke = async (command) => {
    if (command === "take_pending_open_paths") {
      return [];
    }
    if (command === "get_launch_context") {
      return { mode: "empty" };
    }
    return null;
  };

  const controller = createOpenPathsController({
    state: { mode: "empty" },
    invoke,
    setStatus: () => {},
    render: () => {},
    updateMenuState: () => {},
    openFile: async () => {},
    openFileInTabs: async () => {},
    openSingleFileFromUi: async () => {},
    openMultipleFiles: async () => {},
    openFolder: async () => {},
    createNewTab: () => {
      newTabCalled = true;
    },
    deduper: { signature: "", timestamp: 0 },
  });

  await controller.bootstrap();
  assert.equal(
    newTabCalled,
    true,
    "createNewTab should be called on empty launch",
  );
});

test("bootstrap does not create a duplicate startup tab when one already exists", async () => {
  let newTabCalls = 0;

  const invoke = async (command) => {
    if (command === "take_pending_open_paths") {
      return [];
    }
    if (command === "get_launch_context") {
      return { mode: "empty" };
    }
    return null;
  };

  const controller = createOpenPathsController({
    state: {
      mode: "files",
      activePath: null,
      openFiles: [{ path: null, kind: "markdown" }],
    },
    invoke,
    setStatus: () => {},
    render: () => {},
    updateMenuState: () => {},
    openFile: async () => {},
    openFileInTabs: async () => {},
    openSingleFileFromUi: async () => {},
    openMultipleFiles: async () => {},
    openFolder: async () => {},
    createNewTab: () => {
      newTabCalls += 1;
    },
    deduper: { signature: "", timestamp: 0 },
  });

  await controller.bootstrap();

  assert.equal(newTabCalls, 0);
});
