import type { ImportDeclaration, Program } from "oxc-parser";
import { planImportLines } from "../../server/mocks-edit/plan/import-lines";
import { planImportJoin } from "../../server/mocks-edit/plan/join-import";
import type { ModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import type { ParsedSource } from "../../server/mocks-edit/plan/parse-source";
import { quoteString } from "../../server/mocks-edit/plan/quote-string";
import type { FileStyle } from "../../server/mocks-edit/plan/types";
import type { TextEdit } from "../../server/mocks-edit/types";
import type { ParsedImport } from "../merge/types";

/* The name a specifier binds: `b` for `a as b`. */
function localOf(specifier: string): string {
  return specifier.split(/\s+as\s+/).at(-1) ?? specifier;
}

/* A value import of the module holding named specifiers only, which names can join. */
function joinable(program: Program, source: string): ImportDeclaration | null {
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== source) continue;
    if (statement.importKind !== "value" || statement.specifiers.length === 0) continue;
    if (statement.specifiers.every((s) => s.type === "ImportSpecifier")) return statement;
  }
  return null;
}

function statement(clause: string, source: string, style: FileStyle): string {
  const text = `import ${clause} from ${quoteString(source, style.quote)}`;
  return style.semicolons ? `${text};` : text;
}

/**
 * Plan importing what new code needs and the file does not bind yet: each
 * name joins the file's value import of its module when there is one, and
 * comes in a new import after the file's imports otherwise. A name the file
 * binds already, by an import or a declaration, is left alone.
 *
 * @param parsed - The parsed file
 * @param needed - The imports the new code was generated with
 * @param bindings - What the file binds at its top level
 * @param style - The file's style
 * @returns The insertions, in ascending order
 * @example
 * ```ts
 * planMissingImports(parsed, generated.imports, collectModuleBindings(parsed.program), style);
 * ```
 */
export function planMissingImports(
  parsed: ParsedSource,
  needed: readonly ParsedImport[],
  bindings: ModuleBindings,
  style: FileStyle,
): TextEdit[] {
  const joins: TextEdit[] = [];
  const statements: string[] = [];
  for (const wanted of needed) {
    const namespace = wanted.namespaceImport;
    if (namespace !== undefined) {
      if (!bindings.has(namespace))
        statements.push(statement(`* as ${namespace}`, wanted.source, style));
      continue;
    }
    const names = [...wanted.names, ...wanted.typeNames.map((name) => `type ${name}`)].filter(
      (name) => !bindings.has(localOf(name.replace(/^type\s+/, ""))),
    );
    if (names.length === 0) continue;
    const existing = joinable(parsed.program, wanted.source);
    const joined = existing === null ? null : planImportJoin(parsed, existing, names, style);
    if (joined !== null) joins.push(...joined);
    else statements.push(statement(`{ ${names.join(", ")} }`, wanted.source, style));
  }
  const lines = planImportLines(parsed, statements, style);
  return lines === null ? joins : [...joins, lines.edit].sort((a, b) => a.start - b.start);
}
