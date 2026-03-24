import assert from "node:assert/strict";
import test from "node:test";

import { prismLanguageForExtension } from "../../../src/ui/editor/prism-languages.js";

test("maps JavaScript extensions to 'javascript'", () => {
  assert.equal(prismLanguageForExtension("js"), "javascript");
  assert.equal(prismLanguageForExtension("mjs"), "javascript");
  assert.equal(prismLanguageForExtension("cjs"), "javascript");
  assert.equal(prismLanguageForExtension("jsx"), "javascript");
});

test("maps TypeScript extensions to 'typescript'", () => {
  assert.equal(prismLanguageForExtension("ts"), "typescript");
  assert.equal(prismLanguageForExtension("tsx"), "typescript");
});

test("maps common language extensions", () => {
  assert.equal(prismLanguageForExtension("py"), "python");
  assert.equal(prismLanguageForExtension("rs"), "rust");
  assert.equal(prismLanguageForExtension("go"), "go");
  assert.equal(prismLanguageForExtension("rb"), "ruby");
  assert.equal(prismLanguageForExtension("php"), "php");
  assert.equal(prismLanguageForExtension("lua"), "lua");
  assert.equal(prismLanguageForExtension("swift"), "swift");
  assert.equal(prismLanguageForExtension("java"), "java");
  assert.equal(prismLanguageForExtension("kt"), "kotlin");
  assert.equal(prismLanguageForExtension("dart"), "dart");
  assert.equal(prismLanguageForExtension("scala"), "scala");
});

test("maps C-family extensions", () => {
  assert.equal(prismLanguageForExtension("c"), "c");
  assert.equal(prismLanguageForExtension("h"), "c");
  assert.equal(prismLanguageForExtension("cpp"), "cpp");
  assert.equal(prismLanguageForExtension("hpp"), "cpp");
  assert.equal(prismLanguageForExtension("cc"), "cpp");
  assert.equal(prismLanguageForExtension("cs"), "csharp");
});

test("maps data format extensions", () => {
  assert.equal(prismLanguageForExtension("json"), "json");
  assert.equal(prismLanguageForExtension("jsonc"), "json");
  assert.equal(prismLanguageForExtension("jsonl"), "json");
  assert.equal(prismLanguageForExtension("yaml"), "yaml");
  assert.equal(prismLanguageForExtension("yml"), "yaml");
  assert.equal(prismLanguageForExtension("toml"), "toml");
  assert.equal(prismLanguageForExtension("xml"), "markup");
  assert.equal(prismLanguageForExtension("html"), "markup");
  assert.equal(prismLanguageForExtension("sql"), "sql");
  assert.equal(prismLanguageForExtension("graphql"), "graphql");
  assert.equal(prismLanguageForExtension("gql"), "graphql");
});

test("maps web extensions", () => {
  assert.equal(prismLanguageForExtension("css"), "css");
  assert.equal(prismLanguageForExtension("scss"), "css");
  assert.equal(prismLanguageForExtension("less"), "css");
});

test("maps shell extensions", () => {
  assert.equal(prismLanguageForExtension("sh"), "bash");
  assert.equal(prismLanguageForExtension("bash"), "bash");
  assert.equal(prismLanguageForExtension("zsh"), "bash");
});

test("maps case-insensitively", () => {
  assert.equal(prismLanguageForExtension("JS"), "javascript");
  assert.equal(prismLanguageForExtension("Py"), "python");
});

test("returns null for unknown extensions", () => {
  assert.equal(prismLanguageForExtension("xyz"), null);
  assert.equal(prismLanguageForExtension("cfg"), null);
  assert.equal(prismLanguageForExtension("ini"), null);
});

test("returns null for null/undefined input", () => {
  assert.equal(prismLanguageForExtension(null), null);
  assert.equal(prismLanguageForExtension(undefined), null);
  assert.equal(prismLanguageForExtension(""), null);
});
