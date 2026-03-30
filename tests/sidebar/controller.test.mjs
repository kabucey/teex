import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSidebarController } from "../../src/sidebar/controller.js";

function createHarness({
  stateOverrides = {},
  addEventListener = () => {},
} = {}) {
  const state = {
    mode: "folder",
    rootPath: "/project",
    entries: [
      { path: "/project/a.md", relPath: "a.md" },
      { path: "/project/b.md", relPath: "b.md" },
    ],
    activePath: null,
    collapsedFolders: new Set(),
    filterModifiedOnly: false,
    gitStatusMap: {},
    folderIconUrl: null,
    ...stateOverrides,
  };

  const el = {
    projectList: {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener,
    },
    projectRootLabel: { textContent: "", removeAttribute() {}, title: "" },
    modifiedToggleBtn: {
      style: {},
      classList: { toggle() {} },
      setAttribute() {},
      title: "",
    },
    collapseToggleBtn: {
      style: {},
      classList: { toggle() {} },
      setAttribute() {},
      title: "",
    },
  };

  const sidebarRenderState = { treeDirty: true, activePath: null };
  const sidebarClickState = {};

  const controller = createSidebarController({
    state,
    el,
    baseName: (v) => v.split("/").pop(),
    sidebarRenderState,
    sidebarClickState,
    normalizeTransferTab: () => {},
    snapshotActiveFileAsTransferTab: () => {},
    hasTabSession: () => false,
    syncActiveTabToState: () => {},
    saveNow: async () => {},
    replaceActiveTab: () => {},
    openEntry: () => {},
    openFolderEntryInTabs: () => {},
    render: () => {},
    updateMenuState: () => {},
    invoke: async () => {},
    crossWindowDrag: {},
  });

  return { state, el, sidebarRenderState, controller };
}

describe("sidebar empty state for modified filter", () => {
  it("shows empty state message when filterModifiedOnly is true and no files are modified", () => {
    const { el, controller } = createHarness({
      stateOverrides: {
        filterModifiedOnly: true,
        gitStatusMap: {},
        entries: [
          { path: "/project/a.md", relPath: "a.md" },
          { path: "/project/b.md", relPath: "b.md" },
        ],
      },
    });

    controller.renderSidebar();

    assert.match(el.projectList.innerHTML, /No modified files\./);
    assert.match(el.projectList.innerHTML, /sidebar-empty-state/);
  });

  it("does not show empty state when filterModifiedOnly is false", () => {
    const { el, controller } = createHarness({
      stateOverrides: { filterModifiedOnly: false },
    });

    controller.renderSidebar();

    assert.doesNotMatch(el.projectList.innerHTML, /sidebar-empty-state/);
    assert.match(el.projectList.innerHTML, /project-item/);
  });

  it("does not show empty state when modified files exist", () => {
    const { el, controller } = createHarness({
      stateOverrides: {
        filterModifiedOnly: true,
        gitStatusMap: { "a.md": "M" },
      },
    });

    controller.renderSidebar();

    assert.doesNotMatch(el.projectList.innerHTML, /sidebar-empty-state/);
    assert.match(el.projectList.innerHTML, /project-item/);
  });

  it("binds delegated sidebar events only once across rerenders", () => {
    const registrations = [];
    const { controller } = createHarness({
      stateOverrides: {
        entries: [
          { path: "/project/folder/a.md", relPath: "folder/a.md" },
          { path: "/project/folder/b.md", relPath: "folder/b.md" },
        ],
      },
      addEventListener: (...args) => {
        registrations.push(args[0]);
      },
    });

    controller.renderSidebar();
    controller.markTreeDirty();
    controller.renderSidebar();

    assert.deepEqual(registrations.sort(), [
      "click",
      "contextmenu",
      "dblclick",
      "mousedown",
      "mouseenter",
    ]);
  });

  it("updates folder collapse state in place when toggling all folders", () => {
    const folderButton = {
      dataset: { folderPath: "folder" },
      setAttribute(name, value) {
        this[name] = value;
      },
    };
    const children = {
      hidden: false,
      previousElementSibling: folderButton,
    };

    const { controller, state, el } = createHarness({
      stateOverrides: {
        entries: [{ path: "/project/folder/a.md", relPath: "folder/a.md" }],
      },
    });

    el.projectList.querySelectorAll = (selector) => {
      if (selector === ".folder-toggle") return [folderButton];
      if (selector === ".folder-children") return [children];
      return [];
    };

    controller.renderSidebar();
    state.collapsedFolders = new Set(["folder"]);
    controller.toggleCollapseAllFolders();
    assert.equal(folderButton["aria-expanded"], "true");
    assert.equal(children.hidden, false);

    controller.toggleCollapseAllFolders();
    assert.equal(folderButton["aria-expanded"], "false");
    assert.equal(children.hidden, true);
  });

  it("updates a single folder collapse state in place", () => {
    const folderButton = {
      dataset: { folderPath: "folder" },
      nextElementSibling: {
        hidden: false,
        classList: { contains: (value) => value === "folder-children" },
      },
      setAttribute(name, value) {
        this[name] = value;
      },
    };

    const { controller, state } = createHarness({
      stateOverrides: {
        entries: [{ path: "/project/folder/a.md", relPath: "folder/a.md" }],
      },
    });

    state.collapsedFolders.add("folder");
    controller.applyFolderCollapsedStateToDom("folder", folderButton);
    assert.equal(folderButton["aria-expanded"], "false");
    assert.equal(folderButton.nextElementSibling.hidden, true);

    state.collapsedFolders.delete("folder");
    controller.applyFolderCollapsedStateToDom("folder", folderButton);
    assert.equal(folderButton["aria-expanded"], "true");
    assert.equal(folderButton.nextElementSibling.hidden, false);
  });
});
