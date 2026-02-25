import test from "node:test";
import assert from "node:assert/strict";

import {
  getSingleFileUiOpenMode,
  getSidebarSelectedPath,
  shouldSidebarSingleClickOpenAsTab,
  shouldSidebarSingleClickIgnoreSamePath,
  shouldCapturePreviousSingleFolderFile,
  shouldCollapseHiddenSingleTabForSidebarOpen,
  shouldSuppressDropOverlayForSelfHover,
} from "../src/ui-behavior.js";

test("single-file UI opens in folder mode use folder tab flow", () => {
  assert.equal(getSingleFileUiOpenMode("folder"), "folderTabs");
});

test("single-file UI opens in file/files mode use tab flow", () => {
  assert.equal(getSingleFileUiOpenMode("file"), "tabs");
  assert.equal(getSingleFileUiOpenMode("files"), "tabs");
});

test("single-file UI opens in empty mode use single-file flow", () => {
  assert.equal(getSingleFileUiOpenMode("empty"), "single");
  assert.equal(getSingleFileUiOpenMode("unknown"), "single");
});

test("sidebar selection clears for active file outside current folder entries", () => {
  const entries = [{ path: "/root/a.md" }, { path: "/root/b.md" }];
  assert.equal(
    getSidebarSelectedPath({
      mode: "folder",
      activePath: "/elsewhere/x.md",
      entries,
    }),
    null,
  );
});

test("sidebar selection keeps active file when path is in current folder entries", () => {
  const entries = [{ path: "/root/a.md" }, { path: "/root/b.md" }];
  assert.equal(
    getSidebarSelectedPath({
      mode: "folder",
      activePath: "/root/b.md",
      entries,
    }),
    "/root/b.md",
  );
});

test("sidebar selection clears when not in folder mode or no active path", () => {
  const entries = [{ path: "/root/a.md" }];
  assert.equal(
    getSidebarSelectedPath({
      mode: "file",
      activePath: "/root/a.md",
      entries,
    }),
    null,
  );
  assert.equal(
    getSidebarSelectedPath({
      mode: "folder",
      activePath: "",
      entries,
    }),
    null,
  );
  assert.equal(
    getSidebarSelectedPath({
      mode: "folder",
      activePath: "/root/a.md",
      entries: null,
    }),
    null,
  );
});

test("sidebar single-click only opens tabs when tabs are visible", () => {
  assert.equal(
    shouldSidebarSingleClickOpenAsTab({ mode: "folder", openFilesCount: 0 }),
    false,
  );
  assert.equal(
    shouldSidebarSingleClickOpenAsTab({ mode: "folder", openFilesCount: 1 }),
    false,
  );
  assert.equal(
    shouldSidebarSingleClickOpenAsTab({ mode: "folder", openFilesCount: 2 }),
    true,
  );
  assert.equal(
    shouldSidebarSingleClickOpenAsTab({ mode: "folder", openFilesCount: "2" }),
    true,
  );
  assert.equal(
    shouldSidebarSingleClickOpenAsTab({ mode: "file", openFilesCount: 9 }),
    false,
  );
});

test("sidebar single-click ignores same path when no tabs are visible", () => {
  assert.equal(
    shouldSidebarSingleClickIgnoreSamePath({
      mode: "folder",
      openFilesCount: 0,
      activePath: "/root/a.md",
      nextPath: "/root/a.md",
    }),
    true,
  );
  assert.equal(
    shouldSidebarSingleClickIgnoreSamePath({
      mode: "folder",
      openFilesCount: 1,
      activePath: "/root/a.md",
      nextPath: "/root/a.md",
    }),
    true,
  );
  assert.equal(
    shouldSidebarSingleClickIgnoreSamePath({
      mode: "folder",
      openFilesCount: 2,
      activePath: "/root/a.md",
      nextPath: "/root/a.md",
    }),
    false,
  );
  assert.equal(
    shouldSidebarSingleClickIgnoreSamePath({
      mode: "file",
      openFilesCount: 0,
      activePath: "/root/a.md",
      nextPath: "/root/a.md",
    }),
    false,
  );
  assert.equal(
    shouldSidebarSingleClickIgnoreSamePath({
      mode: "folder",
      openFilesCount: 0,
      activePath: null,
      nextPath: "/root/a.md",
    }),
    false,
  );
  assert.equal(
    shouldSidebarSingleClickIgnoreSamePath({
      mode: "folder",
      openFilesCount: 0,
      activePath: "/root/a.md",
      nextPath: "/root/b.md",
    }),
    false,
  );
});

test("sidebar single-click captures previous file only in no-tab folder browsing", () => {
  assert.equal(
    shouldCapturePreviousSingleFolderFile({
      mode: "folder",
      openFilesCount: 0,
      activePath: "/root/a.md",
      nextPath: "/root/b.md",
    }),
    true,
  );
  assert.equal(
    shouldCapturePreviousSingleFolderFile({
      mode: "folder",
      openFilesCount: 1,
      activePath: "/root/a.md",
      nextPath: "/root/b.md",
    }),
    false,
  );
  assert.equal(
    shouldCapturePreviousSingleFolderFile({
      mode: "folder",
      openFilesCount: 0,
      activePath: "/root/a.md",
      nextPath: "/root/a.md",
    }),
    false,
  );
  assert.equal(
    shouldCapturePreviousSingleFolderFile({
      mode: "folder",
      openFilesCount: 0,
      activePath: null,
      nextPath: "/root/b.md",
    }),
    false,
  );
  assert.equal(
    shouldCapturePreviousSingleFolderFile({
      mode: "files",
      openFilesCount: 0,
      activePath: "/root/a.md",
      nextPath: "/root/b.md",
    }),
    false,
  );
});

test("sidebar single-click collapses hidden single-tab sessions before openEntry", () => {
  assert.equal(
    shouldCollapseHiddenSingleTabForSidebarOpen({ mode: "folder", openFilesCount: 1 }),
    true,
  );
  assert.equal(
    shouldCollapseHiddenSingleTabForSidebarOpen({ mode: "folder", openFilesCount: 0 }),
    false,
  );
  assert.equal(
    shouldCollapseHiddenSingleTabForSidebarOpen({ mode: "folder", openFilesCount: 2 }),
    false,
  );
  assert.equal(
    shouldCollapseHiddenSingleTabForSidebarOpen({ mode: "folder", openFilesCount: "1" }),
    true,
  );
  assert.equal(
    shouldCollapseHiddenSingleTabForSidebarOpen({ mode: "file", openFilesCount: 1 }),
    false,
  );
});

test("drop overlay suppression heuristic matches single dragged active file", () => {
  assert.equal(
    shouldSuppressDropOverlayForSelfHover({
      paths: ["/root/a.md"],
      activePath: "/root/a.md",
      rootPath: "/root",
    }),
    true,
  );
});

test("drop overlay suppression heuristic matches single dragged folder root", () => {
  assert.equal(
    shouldSuppressDropOverlayForSelfHover({
      paths: ["/root"],
      activePath: "/root/a.md",
      rootPath: "/root",
    }),
    true,
  );
});

test("drop overlay suppression heuristic does not suppress other-window/same-app unknowns", () => {
  assert.equal(
    shouldSuppressDropOverlayForSelfHover({
      paths: ["/other/file.md"],
      activePath: "/root/a.md",
      rootPath: "/root",
    }),
    false,
  );
  assert.equal(
    shouldSuppressDropOverlayForSelfHover({
      paths: ["/root/a.md", "/root/b.md"],
      activePath: "/root/a.md",
      rootPath: "/root",
    }),
    false,
  );
  assert.equal(
    shouldSuppressDropOverlayForSelfHover({
      paths: [],
      activePath: "/root/a.md",
      rootPath: "/root",
    }),
    false,
  );
  assert.equal(
    shouldSuppressDropOverlayForSelfHover({
      paths: [""],
      activePath: "/root/a.md",
      rootPath: "/root",
    }),
    false,
  );
  assert.equal(
    shouldSuppressDropOverlayForSelfHover({
      paths: [123],
      activePath: "/root/a.md",
      rootPath: "/root",
    }),
    false,
  );
  assert.equal(
    shouldSuppressDropOverlayForSelfHover({
      paths: null,
      activePath: "/root/a.md",
      rootPath: "/root",
    }),
    false,
  );
});
