import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectFormatKind,
  formatActiveFileContent,
} from "../../src/ui/format-controller.js";

describe("detectFormatKind", () => {
  it("returns json for .json files", () => {
    assert.equal(detectFormatKind("/foo/bar.json"), "json");
  });

  it("returns json for .jsonc files", () => {
    assert.equal(detectFormatKind("/foo/bar.jsonc"), "json");
  });

  it("returns json for .geojson files", () => {
    assert.equal(detectFormatKind("/foo/data.geojson"), "json");
  });

  it("returns yaml for .yaml files", () => {
    assert.equal(detectFormatKind("/foo/config.yaml"), "yaml");
  });

  it("returns yaml for .yml files", () => {
    assert.equal(detectFormatKind("/foo/config.yml"), "yaml");
  });

  it("returns toml for .toml files", () => {
    assert.equal(detectFormatKind("/foo/Cargo.toml"), "toml");
  });

  it("returns xml for .xml files", () => {
    assert.equal(detectFormatKind("/foo/data.xml"), "xml");
  });

  it("returns xml for .svg files", () => {
    assert.equal(detectFormatKind("/foo/icon.svg"), "xml");
  });

  it("returns null for unsupported extensions", () => {
    assert.equal(detectFormatKind("/foo/bar.js"), null);
    assert.equal(detectFormatKind("/foo/bar.rs"), null);
    assert.equal(detectFormatKind("/foo/bar.py"), null);
  });

  it("returns null for null/undefined path", () => {
    assert.equal(detectFormatKind(null), null);
    assert.equal(detectFormatKind(undefined), null);
    assert.equal(detectFormatKind(""), null);
  });

  it("returns csv for .csv files", () => {
    assert.equal(detectFormatKind("/foo/data.csv"), "csv");
  });

  it("returns csv for .tsv files", () => {
    assert.equal(detectFormatKind("/foo/data.tsv"), "csv");
  });
});

describe("formatActiveFileContent", () => {
  it("returns null when no active path", async () => {
    const result = await formatActiveFileContent({
      activePath: null,
      content: '{"a":1}',
      invoke: () => {},
    });
    assert.equal(result, null);
  });

  it("returns null when content is empty", async () => {
    const result = await formatActiveFileContent({
      activePath: "/foo/bar.json",
      content: "",
      invoke: () => {},
    });
    assert.equal(result, null);
  });

  it("returns null for unsupported file type", async () => {
    const result = await formatActiveFileContent({
      activePath: "/foo/bar.js",
      content: "const x = 1;",
      invoke: () => {},
    });
    assert.equal(result, null);
  });

  it("calls invoke with correct args for json", async () => {
    let invokedArgs = null;
    const result = await formatActiveFileContent({
      activePath: "/foo/bar.json",
      content: '{"a":1}',
      invoke: (cmd, args) => {
        invokedArgs = { cmd, args };
        return { formatted: '{\n  "a": 1\n}', detectedKind: "json", changed: true };
      },
    });
    assert.equal(invokedArgs.cmd, "format_structured_text");
    assert.equal(invokedArgs.args.content, '{"a":1}');
    assert.equal(invokedArgs.args.preferredKind, "json");
    assert.equal(result.formatted, '{\n  "a": 1\n}');
    assert.equal(result.kind, "json");
    assert.equal(result.changed, true);
  });

  it("returns null when backend says unchanged", async () => {
    const result = await formatActiveFileContent({
      activePath: "/foo/bar.json",
      content: '{\n  "a": 1\n}',
      invoke: () => ({ formatted: '{\n  "a": 1\n}', detectedKind: "json", changed: false }),
    });
    assert.equal(result, null);
  });

  it("returns null when invoke throws", async () => {
    const result = await formatActiveFileContent({
      activePath: "/foo/bar.json",
      content: '{"a":1}',
      invoke: () => {
        throw new Error("backend error");
      },
    });
    assert.equal(result, null);
  });

  it("returns null when invoke returns null", async () => {
    const result = await formatActiveFileContent({
      activePath: "/foo/bar.json",
      content: '{"a":1}',
      invoke: () => null,
    });
    assert.equal(result, null);
  });
});
