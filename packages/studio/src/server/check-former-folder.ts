import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import type { ImportStateEntry } from "../apis/imports-state";
import type { ImportLayout, ImportPlacement } from "../apis/layout";
import { formerFolder } from "./former-folder";
import { ImportRenamedError } from "./import-renamed-error";

/**
 * Refuse to write, update or manage an import whose files are still where
 * Courier Studio 0.3.0 put it under a binding this release gives it no
 * more, before anything is generated: written afresh, it became a second
 * copy the config did not import, and managed, it showed none of its
 * endpoints. Removing it is what the refusal asks for, and works there.
 *
 * @param root - The project
 * @param name - The import's key under `imports`
 * @param placement - Its `outputDir` and `sourceName`, as the layout was resolved from
 * @param layout - Where this release puts it
 * @param state - What Studio recorded about it, if anything
 * @throws {ImportRenamedError} When the folder 0.3.0 wrote holds the import's files
 * @example
 * ```ts
 * checkFormerFolder(root, body.name, entry, layout, getImportState(imports, body.name));
 * ```
 */
export function checkFormerFolder(
  root: ProjectRoot,
  name: string,
  placement: ImportPlacement,
  layout: ImportLayout,
  state: ImportStateEntry | undefined,
): void {
  const former = formerFolder(root, name, placement, layout.dir, state);
  if (former === undefined) return;
  const current = { binding: layout.sourceBinding, dir: layout.dir };
  throw new ImportRenamedError(name, former, current);
}
