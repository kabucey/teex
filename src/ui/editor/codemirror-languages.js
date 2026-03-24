import {
  cpp,
  csharp,
  css,
  dart,
  go,
  html,
  java,
  javascript,
  json,
  kotlin,
  lua,
  markdown,
  php,
  python,
  ruby,
  rust,
  StreamLanguage,
  scala,
  shell,
  sql,
  swift,
  toml,
  xml,
  yaml,
} from "/vendor/codemirror.js";

const LANG_SUPPORT = new Map([
  ["javascript", javascript],
  ["python", python],
  ["rust", rust],
  ["json", json],
  ["html", html],
  ["css", css],
  ["xml", xml],
  ["yaml", yaml],
  ["sql", sql],
  ["go", go],
  ["java", java],
  ["cpp", cpp],
  ["php", php],
  ["markdown", markdown],
]);

const LEGACY_MODES = new Map([
  ["ruby", ruby],
  ["lua", lua],
  ["swift", swift],
  ["kotlin", kotlin],
  ["scala", scala],
  ["csharp", csharp],
  ["dart", dart],
  ["shell", shell],
  ["toml", toml],
]);

const EXT_TO_LANG = new Map([
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["jsx", "javascript"],
  ["ts", "javascript"],
  ["tsx", "javascript"],
  ["py", "python"],
  ["rs", "rust"],
  ["go", "go"],
  ["rb", "ruby"],
  ["php", "php"],
  ["lua", "lua"],
  ["swift", "swift"],
  ["java", "java"],
  ["kt", "kotlin"],
  ["dart", "dart"],
  ["scala", "scala"],
  ["c", "cpp"],
  ["h", "cpp"],
  ["cpp", "cpp"],
  ["hpp", "cpp"],
  ["cc", "cpp"],
  ["cs", "csharp"],
  ["json", "json"],
  ["jsonc", "json"],
  ["jsonl", "json"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "toml"],
  ["xml", "xml"],
  ["html", "html"],
  ["css", "css"],
  ["scss", "css"],
  ["less", "css"],
  ["sql", "sql"],
  ["sh", "shell"],
  ["bash", "shell"],
  ["zsh", "shell"],
  ["md", "markdown"],
  ["markdown", "markdown"],
]);

export function languageForExtension(ext) {
  if (!ext) return null;
  const langName = EXT_TO_LANG.get(ext.toLowerCase());
  if (!langName) return null;

  const support = LANG_SUPPORT.get(langName);
  if (support) return support();

  const legacy = LEGACY_MODES.get(langName);
  if (legacy) return StreamLanguage.define(legacy);

  return null;
}
