import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve(process.cwd(), "src");

/**
 * @param {string} specifier
 * @param {{ parentURL?: string; conditions: string[]; importAssertions?: object }} context
 * @param {(s: string, c: object) => Promise<object>} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let filePath = path.join(SRC, specifier.slice(2));
    if (!path.extname(filePath)) {
      filePath += ".js";
    }
    return nextResolve(pathToFileURL(filePath).href, context);
  }
  return nextResolve(specifier, context);
}
