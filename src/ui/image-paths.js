export function resolveImagePath(src, fileDir) {
  if (/^https?:\/\//.test(src)) {
    return null;
  }
  if (src.startsWith("/")) {
    return src;
  }
  const joined = `${fileDir}/${src}`;
  const parts = joined.split("/");
  const resolved = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return `/${resolved.join("/")}`;
}

export function rewritePreviewImages(previewEl, fileDir, convertFn) {
  const images = previewEl.querySelectorAll("img");
  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src) continue;
    const resolved = resolveImagePath(src, fileDir);
    if (resolved !== null) {
      img.src = convertFn(resolved);
    }
  }
}
