import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type FileFormatter, moduleObject, toolApi } from "./tool-api";

interface PrettierApi {
  format: (text: string, options: Record<string, unknown>) => unknown;
  resolveConfig: (path: string, options: Record<string, unknown>) => unknown;
  getFileInfo: (path: string, options: Record<string, unknown>) => unknown;
}

function isPrettierApi(value: unknown): value is PrettierApi {
  if (typeof value !== "object" || value === null) return false;
  return ["format", "resolveConfig", "getFileInfo"].every(
    (key) => typeof Reflect.get(value, key) === "function",
  );
}

/**
 * Load the project's Prettier once and format with it: each file with the
 * configuration Prettier resolves for its path, `.editorconfig` included,
 * and none where `.prettierignore` or `.gitignore` leaves it out, as
 * Prettier's own command line does.
 *
 * @param module - The module the project resolves Prettier from
 * @param root - The project root, where the ignore files are
 * @returns The formatter
 * @throws {Error} When the module is not Prettier
 * @example
 * ```ts
 * const format = await prettierFormatter("/app/node_modules/prettier/index.cjs", "/app");
 * ```
 */
export async function prettierFormatter(module: string, root: string): Promise<FileFormatter> {
  const api = toolApi(await import(pathToFileURL(module).href), isPrettierApi);
  if (api === null) throw new Error(`${module} is not Prettier`);
  const ignorePath = [join(root, ".gitignore"), join(root, ".prettierignore")];
  return async (path, text) => {
    const info: unknown = await api.getFileInfo(path, { ignorePath });
    if (Reflect.get(moduleObject(info), "ignored") === true) return text;
    const options: unknown = await api.resolveConfig(path, { editorconfig: true });
    const own = typeof options === "object" && options !== null ? options : {};
    const formatted: unknown = await api.format(text, { ...own, filepath: path });
    if (typeof formatted !== "string") throw new Error("Prettier returned no text");
    return formatted;
  };
}
