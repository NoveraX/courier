import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { referencedNames } from "../manage/referenced-names";
import { declaredExports } from "./declared-exports";
import { namedStatement } from "./named-statement";
import type { GeneratedFile } from "./types";

/**
 * A group's schemas module with an import of what it names of the import's
 * own module: each name its schemas refer to that the import's module
 * declares, a type alone imported as a type. Read from the module as it was
 * written, so it imports exactly what a schema, a type or a cycle's lazy
 * reference names, whichever validator wrote it.
 *
 * @param file - The group's schemas or types module
 * @param shared - The text of the import's own module
 * @param from - How the group's module names the import's: `../schemas`
 * @returns The module, its import of the import's module after its own imports
 * @example
 * ```ts
 * withSharedImports(petsSchemas, rootSchemas.content, "../schemas").content;
 * // 'import { z } from "zod";\nimport { CategorySchema } from "../schemas";\n…'
 * ```
 */
export function withSharedImports(
  file: GeneratedFile,
  shared: string,
  from: string,
): GeneratedFile {
  const parsed = parseSource(file.path, file.content);
  if (parsed.problem !== null) return file;
  const bound = collectModuleBindings(parsed.program);
  const used = referencedNames(parsed.program.body);
  const needed = [...declaredExports(shared)].filter(
    ([name]) => used.has(name) && !bound.has(name),
  );
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
