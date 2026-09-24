import { realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLogger } from "@noverax/courier";
import { createConfigJiti } from "@noverax/courier-studio-core/config";
import { MocksEditRefusal } from "./mocks-edit-refusal";

const log = createLogger("Studio");

/**
 * Refuse an edit when the mocks file's import of the config would bind
 * another file than the config Studio loads — a compiled `courier.config.js`
 * beside `courier.config.ts`, say, which an extensionless import reaches
 * first. Each new mock would then take its source from that copy, which is
 * neither the config Studio runs nor, once the config changes, the same
 * sources.
 *
 * The import is resolved by the loader that will run the file, exactly as
 * written in the planned file, so the answer is the loader's own.
 *
 * @param root - The project root, symlinks resolved
 * @param configName - The name of the config Studio loads, e.g. `courier.config.ts`
 * @param mocksName - The mocks file, relative to the root
 * @param specifier - The specifier the planned file imports the config with
 * @throws {MocksEditRefusal} `CONFIG_SHADOWED`, naming the file the import would load
 * @example
 * ```ts
 * await checkConfigNotShadowed(root, "courier.config.ts", "courier.mocks.ts", plan.configSpecifier);
 * ```
 */
export async function checkConfigNotShadowed(
  root: string,
  configName: string,
  mocksName: string,
  specifier: string,
): Promise<void> {
  const bound = await boundFile(join(root, mocksName), specifier);
  if (bound === null || bound === realpathSync(join(root, configName))) return;
  const shown = relative(root, bound).split(sep).join("/");
  throw new MocksEditRefusal(
    "CONFIG_SHADOWED",
    `${shown} sits beside ${configName}, so the import of "${specifier}" in ${mocksName} would load ${shown}, not ${configName}, which Studio loads. Delete or move ${shown} — most likely compiled output — then ask again.`,
  );
}

/* A specifier the loader cannot resolve binds nothing to compare; the load
   after the edit reports it, and the edit is taken back. */
async function boundFile(mocksPath: string, specifier: string): Promise<string | null> {
  const jiti = await createConfigJiti(mocksPath);
  try {
    const resolved = jiti.esmResolve(specifier, { parentURL: pathToFileURL(mocksPath).href });
    return realpathSync(resolved.startsWith("file:") ? fileURLToPath(resolved) : resolved);
  } catch (err) {
    log.debug(`${specifier} could not be resolved from ${mocksPath}`, err);
    return null;
  }
}
