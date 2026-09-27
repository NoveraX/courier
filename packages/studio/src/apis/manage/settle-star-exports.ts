import { posix } from "node:path";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { lineStart } from "../../server/mocks-edit/plan/line-start";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import type { TextEdit } from "../../server/mocks-edit/types";
import { exportedNames } from "./exported-names";

/**
 * Keep an import's barrel from exporting one name through two `export *`
 * lines, which TypeScript refuses: a module's schemas can gain a name
 * another group's module already exports, as when endpoints are added to
 * its group. Such a line then re-exports only the names no earlier one
 * exports, or goes when none is left, as a full write does. A name the
 * barrel exports by name is its own and never counts.
 *
 * @param path - The barrel, project-relative
 * @param barrel - The barrel
 * @param textAt - The text a file will have, by its project-relative path, if it exists
 * @returns The barrel with no name exported twice, or `barrel` when none is
 * @example
 * ```ts
 * settleStarExports("src/api/shop/index.ts", barrel, (path) => files[path]);
 * ```
 */
export function settleStarExports(
  path: string,
  barrel: string,
  textAt: (path: string) => string | undefined,
): string {
  const program = parseSource(path, barrel).program;
  const named = exportedNames(program.body);
  const starred = new Set<string>();
  const edits: TextEdit[] = [];
  for (const statement of program.body) {
    if (statement.type !== "ExportAllDeclaration" || statement.exported !== null) continue;
    const text = textAt(posix.join(posix.dirname(path), `${statement.source.value}.ts`));
    if (text === undefined) continue;
    const names = [...exportedNames(parseSource("module.ts", text).program.body)].filter(
      ([name]) => !named.has(name),
    );
    const fresh = names.filter(([name]) => !starred.has(name));
    for (const [name] of fresh) starred.add(name);
    if (fresh.length === names.length) continue;
    const source = barrel.slice(statement.source.start, statement.source.end);
    const listed = fresh.map(([name, kind]) => (kind === "type" ? `type ${name}` : name));
    const eol = barrel.indexOf("\n", statement.end);
    edits.push(
      fresh.length > 0
        ? {
            start: statement.start,
            end: statement.end,
            text: `export { ${listed.join(", ")} } from ${source};`,
          }
        : {
            start: lineStart(barrel, statement.start),
            end: eol === -1 ? barrel.length : eol + 1,
            text: "",
          },
    );
  }
  return edits.length === 0 ? barrel : applyEdits(barrel, edits);
}
