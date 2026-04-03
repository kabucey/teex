import { fileExtension } from "../utils/app-utils.js";
import { showToast } from "./toast.js";

const JSON_EXTENSIONS = new Set(["json", "jsonc", "geojson"]);
const YAML_EXTENSIONS = new Set(["yaml", "yml"]);
const TOML_EXTENSIONS = new Set(["toml"]);
const XML_EXTENSIONS = new Set(["xml", "svg", "xhtml"]);
const CSV_EXTENSIONS = new Set(["csv", "tsv"]);

export function detectFormatKind(path) {
  if (!path) return null;
  const ext = fileExtension(path);
  if (!ext) return null;
  if (JSON_EXTENSIONS.has(ext)) return "json";
  if (YAML_EXTENSIONS.has(ext)) return "yaml";
  if (TOML_EXTENSIONS.has(ext)) return "toml";
  if (XML_EXTENSIONS.has(ext)) return "xml";
  if (CSV_EXTENSIONS.has(ext)) return "csv";
  return null;
}

export async function formatActiveFileContent({ activePath, content, invoke }) {
  if (!activePath || !content) return null;

  const kind = detectFormatKind(activePath);
  if (!kind) return null;

  try {
    const result = await invoke("format_structured_text", {
      content,
      preferredKind: kind,
    });
    if (!result || !result.changed || typeof result.formatted !== "string") {
      return null;
    }
    return {
      formatted: result.formatted,
      kind: result.detectedKind ?? kind,
      changed: true,
    };
  } catch {
    return null;
  }
}

export function createFormatController({
  state,
  invoke,
  codeEditorController,
  onDirtyStateChanged,
}) {
  async function formatActiveFile() {
    if (!state.activePath || !state.content) return;

    const result = await formatActiveFileContent({
      activePath: state.activePath,
      content: state.content,
      invoke,
    });

    if (!result) {
      showToast("No formatting changes");
      return;
    }

    state.content = result.formatted;
    state.isDirty = state.content !== state.savedContent;

    if (codeEditorController?.isAttached()) {
      codeEditorController.syncContent(result.formatted);
    }

    if (typeof onDirtyStateChanged === "function") {
      onDirtyStateChanged();
    }

    showToast(`Formatted as ${result.kind.toUpperCase()}`);
  }

  return { formatActiveFile };
}
