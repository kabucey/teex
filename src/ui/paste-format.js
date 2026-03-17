const JSON_EXTENSIONS = new Set(["json", "jsonc", "geojson"]);
const YAML_EXTENSIONS = new Set(["yaml", "yml"]);
const TOML_EXTENSIONS = new Set(["toml"]);
const XML_EXTENSIONS = new Set(["xml", "svg", "xhtml"]);
const CSV_EXTENSIONS = new Set(["csv", "tsv"]);
const COMPOSE_ROOT_KEYS = new Set([
  "version",
  "services",
  "networks",
  "volumes",
  "secrets",
  "configs",
]);

function getExtension(path) {
  if (typeof path !== "string" || !path) {
    return "";
  }

  const fileName = path.split(/[\\/]/).pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

function looksLikeJson(text) {
  return /^\s*[[{]/.test(text);
}

function looksLikeToml(text) {
  const hasSection = /(^|\n)\s*\[[A-Za-z0-9_.-]+\]/.test(text);
  const hasKeyEquals = /(^|\n)\s*[A-Za-z0-9_.-]+\s*=\s*\S/.test(text);
  return hasSection || (hasKeyEquals && !/:\s/.test(text));
}

function looksLikeXml(text) {
  return /^\s*<[?A-Za-z!]/.test(text);
}

function looksLikeYaml(text) {
  if (!/\n/.test(text) && !/^\s*-\s+/.test(text)) {
    return false;
  }

  const hasKeyValue = /(^|\n)\s*['"]?[A-Za-z0-9_.-]+['"]?\s*:\s*(\S|$)/.test(
    text,
  );
  const hasListItem = /(^|\n)\s*-\s+\S/.test(text);
  return hasKeyValue || hasListItem;
}

export function detectStructuredPasteKind({ activePath, text }) {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }

  const extension = getExtension(activePath);
  if (JSON_EXTENSIONS.has(extension)) {
    return "json";
  }
  if (YAML_EXTENSIONS.has(extension)) {
    return "yaml";
  }
  if (TOML_EXTENSIONS.has(extension)) {
    return "toml";
  }
  if (XML_EXTENSIONS.has(extension)) {
    return "xml";
  }
  if (CSV_EXTENSIONS.has(extension)) {
    return "csv";
  }

  if (looksLikeJson(text)) {
    return "json";
  }
  if (looksLikeXml(text)) {
    return "xml";
  }
  if (looksLikeYaml(text)) {
    return "yaml";
  }
  if (looksLikeToml(text)) {
    return "toml";
  }

  return null;
}

function normalizeKeyLine(line) {
  const index = line.indexOf(":");
  if (index <= 0 || line.startsWith("- ")) {
    return null;
  }

  const key = line.slice(0, index).trim();
  const rest = line.slice(index + 1).trim();
  if (!key) {
    return null;
  }

  return { key, rest, hasValue: rest.length > 0 };
}

function autoIndentYamlHeuristic(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output = [];

  let depth = 0;
  let pendingChildIndent = false;
  let hadBlankLine = false;
  let previousType = "none";

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      output.push("");
      hadBlankLine = true;
      continue;
    }

    if (pendingChildIndent) {
      depth += 1;
      pendingChildIndent = false;
    }

    const keyLine = normalizeKeyLine(trimmed);
    if (keyLine) {
      if (previousType === "list" && depth > 0) {
        depth -= 1;
      }

      if (hadBlankLine && depth > 0) {
        if (COMPOSE_ROOT_KEYS.has(keyLine.key.toLowerCase())) {
          depth = 0;
        } else {
          depth = Math.min(depth, 1);
        }
      }

      const padded = `${"  ".repeat(depth)}${keyLine.key}:${keyLine.hasValue ? ` ${keyLine.rest}` : ""}`;
      output.push(padded);
      previousType = keyLine.hasValue ? "key" : "keyEmpty";
      if (!keyLine.hasValue) {
        pendingChildIndent = true;
      }
      hadBlankLine = false;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      output.push(`${"  ".repeat(depth)}${trimmed}`);
      previousType = "list";
      hadBlankLine = false;
      const listValue = trimmed.slice(2).trim();
      if (listValue.endsWith(":") && !listValue.includes(": ")) {
        pendingChildIndent = true;
      }
      continue;
    }

    output.push(`${"  ".repeat(depth)}${trimmed}`);
    previousType = "other";
    hadBlankLine = false;
  }

  return output.join("\n");
}

async function callStructuredFormatter(invoke, content, preferredKind) {
  try {
    const result = await invoke("format_structured_text", {
      content,
      preferredKind,
    });
    if (!result || typeof result.formatted !== "string") {
      return {
        detectedKind: null,
        changed: false,
        formatted: null,
      };
    }

    return {
      detectedKind: result.detectedKind ?? null,
      changed: Boolean(result.changed),
      formatted: result.changed ? result.formatted : null,
    };
  } catch {
    return {
      detectedKind: null,
      changed: false,
      formatted: null,
    };
  }
}

export async function formatStructuredPasteText({ invoke, text, activePath }) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    typeof invoke !== "function"
  ) {
    return null;
  }

  const preferredKind = detectStructuredPasteKind({ activePath, text });
  if (!preferredKind) {
    return null;
  }

  const primaryResult = await callStructuredFormatter(
    invoke,
    text,
    preferredKind,
  );
  if (primaryResult.detectedKind) {
    return {
      preferredKind,
      ...primaryResult,
    };
  }

  if (preferredKind !== "yaml") {
    return {
      preferredKind,
      ...primaryResult,
    };
  }

  const heuristicallyIndented = autoIndentYamlHeuristic(text);
  if (!heuristicallyIndented || heuristicallyIndented === text) {
    return {
      preferredKind,
      ...primaryResult,
    };
  }

  return {
    preferredKind,
    detectedKind: "yaml",
    changed: heuristicallyIndented !== text,
    formatted: heuristicallyIndented !== text ? heuristicallyIndented : null,
  };
}
