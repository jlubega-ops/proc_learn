import path from "path";

/**
 * Root directory for protected user files (not web-public). Override with PROC_LEARN_UPLOAD_ROOT in .env (absolute or relative to cwd).
 */
export function getUploadRoot() {
  const raw = process.env.PROC_LEARN_UPLOAD_ROOT?.trim();
  if (!raw) {
    return path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      "storage",
      "uploads",
    );
  }
  return path.isAbsolute(raw)
    ? raw
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), raw);
}

/**
 * Resolve a stored relative key safely under the upload root (blocks path traversal).
 * @param {string} storageKey
 * @returns {string | null} absolute file path or null if unsafe
 */
export function resolveStoredFilePath(storageKey) {
  if (!storageKey || storageKey.includes("..")) return null;
  const root = getUploadRoot();
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}
