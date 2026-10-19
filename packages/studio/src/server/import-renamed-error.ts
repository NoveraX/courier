import { CourierError } from "@noverax/courier";
import type { PlacedSource } from "../apis/layout";
import type { FormerFolder } from "./former-folder";

/**
 * An import Courier Studio 0.3.0 wrote under a binding this release gives
 * it no more — `eval`, `arguments`, `undefined` or `globalThis` — still has
 * its files where 0.3.0 put them. Studio does not move an import's files:
 * writing it afresh made a second copy beside the first, which the config
 * went on importing, and managing it found none of its endpoints. Answered
 * 409, with what to do: remove the import, which works on the folder 0.3.0
 * wrote, then import it again; where both folders hold its files, first
 * delete the one not kept.
 *
 * @example
 * ```ts
 * throw new ImportRenamedError("undefined", former, { binding: "undefinedGroup", dir: layout.dir });
 * ```
 */
export class ImportRenamedError extends CourierError<"IMPORT_RENAMED"> {
  /** The status a route answers with. */
  readonly httpStatus = 409;

  /**
   * @param name - The import's key under `imports`
   * @param former - Where 0.3.0 put it, the binding it gave its source, and whether the folder this release writes holds files of it too
   * @param current - Where this release puts it, and the binding it gives it
   */
  constructor(name: string, former: FormerFolder, current: PlacedSource) {
    const { inBoth } = former;
    const found = inBoth
      ? `holds files both in ${former.dir}, where Studio 0.3.0 bound it as ${former.binding}, and in ${current.dir}`
      : `has its files in ${former.dir}, where Studio 0.3.0 bound it as ${former.binding}`;
    const step = inBoth
      ? "Delete the folder you do not keep first."
      : "Remove the import, then import it again: the files the removal takes are kept in .courier/backups.";
    super(
      `The import "${name}" ${found}. Studio now binds it as ${current.binding}, in ${current.dir}, and does not move an import's files. ${step}`,
      { code: "IMPORT_RENAMED", context: { name, former, current } },
    );
  }
}
