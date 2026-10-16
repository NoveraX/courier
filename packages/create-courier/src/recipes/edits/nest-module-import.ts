import { codeStyleOf, namedImport } from "../../edit/code-style";
import { addImportLine, appendItem } from "../../edit/insert";
import { decoratorLiteral, propertyLiteral } from "../../edit/literal";
import { scanSource } from "../../edit/source-scan";
import { importSpecifier } from "../import-specifier";
import type { RecipeContext, RecipeEdit } from "../recipe-types";
import { SERVER_DIR } from "../shared/server-files";
import { type ImportState, importGuard } from "./import-guard";

const APP_MODULE = "src/app.module.ts";

/* The root module with Courier's in its imports, as `nest new` writes it — unless the file loads it already, however it names it, or binds the name to something else — then the change is the person's. */
function imported(text: string, specifier: string, guard: ImportState): string | undefined {
  if (guard === "loaded") return text;
  if (guard !== "free") return undefined;
  const scan = scanSource(text);
  const options = scan === undefined ? undefined : decoratorLiteral(scan, "Module");
  if (scan === undefined || options === undefined) return undefined;
  const imports = propertyLiteral(scan, options, "imports");
  const changed =
    imports === null
      ? appendItem(scan, options, "imports: [CourierModule]")
      : imports !== undefined && text[imports.open] === "["
        ? appendItem(scan, imports, "CourierModule")
        : undefined;
  const rescanned = changed === undefined ? undefined : scanSource(changed);
  return rescanned === undefined
    ? undefined
    : addImportLine(rescanned, namedImport(codeStyleOf(text), ["CourierModule"], specifier));
}

/**
 * The edit that imports Courier's module into a NestJS app's root module,
 * as `nest new` writes it — never a second binding of `CourierModule`:
 * where the file loads the module already, through any path the project
 * resolves, nothing is added, and where the name is taken, the import is
 * left to the person.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The edit
 * @example
 * ```ts
 * nestImportEdit(ctx).path; // "src/app.module.ts"
 * ```
 */
export function nestImportEdit(ctx: RecipeContext): RecipeEdit {
  const specifier = importSpecifier(APP_MODULE, `${SERVER_DIR}/courier.module.ts`, ctx.extension);
  return {
    path: APP_MODULE,
    purpose: "imports Courier's module into the app's",
    change: (text) =>
      imported(
        text,
        specifier,
        importGuard(
          ctx.project,
          APP_MODULE,
          text,
          "CourierModule",
          `${SERVER_DIR}/courier.module.ts`,
        ),
      ),
    manual: {
      file: APP_MODULE,
      what: "Import Courier's module into your root module",
      lines: [`import { CourierModule } from "${specifier}";`, "imports: [CourierModule],"],
    },
  };
}
