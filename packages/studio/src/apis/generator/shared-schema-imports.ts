import { parseSource } from "@noverax/courier-cli/devkit";
import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import { referencedNames } from "../manage/referenced-names";
import type { DeclaredKind } from "./declared-in-lines";
import { namedStatement } from "./named-statement";
import type { GeneratedFile } from "./types";

/* A name as JavaScript writes one. */
const IDENTIFIER = /[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*/gu;

/**
 * A group's schemas module with an import of what it names of the import's
 * own module: each name its schemas refer to that the import's module
 * declares, a type alone imported as a type. Read from the module as it was
 * written, so it imports exactly what a schema, a type or a cycle's lazy
 * reference names, whichever validator wrote it. A module that writes none
 * of the import's names anywhere, not even in a comment, imports nothing
 * and is not parsed.
 *
 * @param file - The group's schemas or types module
 * @param shared - What the import's own module exports, as its writer declared it
 * @param from - How the group's module names the import's: `../schemas`
 * @returns The module, its import of the import's module after its own imports
 * @example
 * ```ts
 * withSharedImports(petsSchemas, rootSchemas.declares, "../schemas").content;
 * // 'import { z } from "zod";\nimport { CategorySchema } from "../schemas";\n…'
 * ```
 */
export function withSharedImports(
  file: GeneratedFile,
  shared: ReadonlyMap<string, DeclaredKind>,
  from: string,
): GeneratedFile {
  if (!writesAnyOf(file.content, shared)) return file;
  const parsed = parseSource(file.path, file.content);
  if (parsed.problem !== null) return file;
  const bound = collectModuleBindings(parsed.program);
  const used = referencedNames(parsed.program.body);
  const needed = [...shared].filter(([name]) => used.has(name) && !bound.has(name));
  if (needed.length === 0) return file;
  const statement = needed.every(([, kind]) => kind === "type")
    ? namedStatement(
        "import type",
        needed.map(([name]) => name),
        from,
      )
    : namedStatement(
        "import",
        needed.map(([name, kind]) => (kind === "type" ? `type ${name}` : name)),
        from,
      );
  const last = parsed.program.body.filter((s) => s.type === "ImportDeclaration").at(-1);
  if (last === undefined) return { ...file, content: `${statement}\n\n${file.content}` };
  const eol = file.content.indexOf("\n", last.end);
  const at = eol === -1 ? file.content.length : eol + 1;
  return {
    ...file,
    content: `${file.content.slice(0, at)}${statement}\n${file.content.slice(at)}`,
  };
}

/* Whether a module's text holds any of the names, as a whole name, wherever it stands. */
function writesAnyOf(text: string, names: ReadonlyMap<string, DeclaredKind>): boolean {
  for (const [word] of text.matchAll(IDENTIFIER)) {
    if (names.has(word)) return true;
  }
  return false;
}
