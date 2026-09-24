import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createConfigJiti, loadCourierConfigFile } from "@noverax/courier-studio-core/config";

/** What loading the project's config, and its mocks file if any, produced. */
export interface EvaluatedCourierFiles {
  /** The config's default export. */
  config: unknown;
  /** The mocks file's module namespace; absent when there is no mocks file or it did not load. */
  mocksNamespace?: unknown;
  /** Why the mocks file did not load, while the config did. */
  mocksError: unknown | null;
}

/** The name of the virtual module that imports both files; never written to disk. */
const COMBINED_ENTRY = ".courier-studio-entry.ts";

/**
 * Load `courier.config.*` and `courier.mocks.*` as one module graph.
 *
 * One graph, because the loader caches nothing: two imports would evaluate
 * every source module twice on every reload — seconds for a large generated
 * client — and hand the mocks different source objects than the config's.
 * When the pair does not load, the config is loaded alone: a broken mocks
 * file must not take the sources down with it.
 *
 * @param root - The project root, symlinks resolved; both files are in it
 * @param configFile - The config's path as found in the root
 * @param mocksFile - The mocks file's path as found in the root, or `null`
 * @returns The config's export, the mocks namespace, and a mocks-only failure
 * @throws What the loader reported when the config itself does not load
 */
export async function evaluateCourierFiles(
  root: string,
  configFile: string,
  mocksFile: string | null,
): Promise<EvaluatedCourierFiles> {
  if (mocksFile === null)
    return { config: (await loadCourierConfigFile(configFile)).config, mocksError: null };
  const entry = join(root, COMBINED_ENTRY);
  const source =
    `import config from ${JSON.stringify(`./${basename(configFile)}`)};\n` +
    `import * as mocks from ${JSON.stringify(`./${basename(mocksFile)}`)};\n` +
    "export default { config, mocks };\n";
  try {
    const jiti = await createConfigJiti(entry);
    const loaded = (await jiti.evalModule(source, { filename: entry, async: true })) as {
      default?: { config: unknown; mocks: unknown };
    };
    return {
      config: loaded.default?.config,
      mocksNamespace: loaded.default?.mocks,
      mocksError: null,
    };
  } catch (combinedError) {
    const { config } = await loadCourierConfigFile(configFile);
    return { config, mocksError: combinedError };
  }
}

/**
 * The sha256 of a file's bytes, as hex.
 *
 * @param file - The file to hash
 * @returns Its content hash, or `null` when the file is gone
 */
export function hashFile(file: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
