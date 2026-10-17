import { binds, importsOf } from "../../edit/imports";
import { scanSource } from "../../edit/source-scan";
import { loadsFile } from "../../project/module-target";
import type { Project } from "../../project/read-project";

/** What a file has of an import an edit would add: the module loaded, the name taken, or neither. */
export type ImportState = "loaded" | "taken" | "free" | undefined;

/**
 * Where an edit is to import a module of Courier's into a file of the
 * project's under a name, what the file has already: it loads the module
 * — by a relative path or one of the project's aliases — so the edit has
 * nothing to add; or the name is taken, so the import is left to the
 * person, with no second binding of it; or neither.
 *
 * @param project - The project
 * @param file - The file the edit changes, relative to the root
 * @param text - Its text
 * @param name - The name the import binds: `courier`, `CourierModule`
 * @param target - Courier's module, relative to the root
 * @returns `loaded`, `taken` or `free`; `undefined` where the file's brackets do not pair
 * @example
 * ```ts
 * importGuard(project, "src/server.ts", text, "courier", "src/courier/routes.ts"); // "loaded"
 * ```
 */
export function importGuard(
  project: Project,
  file: string,
  text: string,
  name: string,
  target: string,
): ImportState {
  const scan = scanSource(text);
  if (scan === undefined) return undefined;
  const loads = importsOf(scan).some((each) => loadsFile(project, file, each.specifier, target));
  if (loads) return "loaded";
  return binds(scan, name) ? "taken" : "free";
}
