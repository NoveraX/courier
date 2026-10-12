import type { Program } from "oxc-parser";
import { Visitor } from "oxc-parser";

import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import { type DeclarationLayout, readLayout } from "./declaration-layout";
import type { MergedEntry } from "./place-under-prefix";

/**
 * Whether a merged file, read back from its syntax, is what the merge meant
 * to write: the file's own declaration, under the same name and from the
 * same definer; exactly the merged endpoints, in order, each as merged; every
 * top-level name the file declared besides its imports; and no name in its
 * code that neither file it came from has in its code.
 *
 * The last guards what the others cannot see: a merge that cut a file where
 * a comment or a string only looked like code would bring the
 * specification's text out as code, under names that both files hold in
 * comments and strings alone.
 *
 * @param content - The merged file
 * @param own - The file on disk, laid out
 * @param fresh - The file the import generated, laid out
 * @param entries - The endpoints the merge wrote, in order
 * @returns `true` when the file holds the merge
 * @example
 * ```ts
 * if (!holdsMerge(content, own, fresh, entries)) return conflict(generated);
 * ```
 */
export function holdsMerge(
  content: string,
  own: DeclarationLayout,
  fresh: DeclarationLayout,
  entries: readonly MergedEntry[],
): boolean {
  const merged = readLayout(content, own.declaration.name);
  if (merged === null || definedAs(merged) !== definedAs(own)) return false;
  const written = merged.endpoints;
  const same = (entry: MergedEntry, at: number): boolean =>
    written[at]?.name === entry.name && written[at]?.code === entry.code;
  if (written.length !== entries.length || !entries.every(same)) return false;
  const known = names(own.parsed.program, names(fresh.parsed.program));
  if ([...names(merged.parsed.program)].some((name) => !known.has(name))) return false;
  const bound = collectModuleBindings(merged.parsed.program);
  const declared = collectModuleBindings({
    ...own.parsed.program,
    body: own.parsed.program.body.filter((statement) => statement.type !== "ImportDeclaration"),
  });
  return [...declared.keys()].every((name) => bound.has(name));
}

/* How a declaration is introduced, up to its options: `export const api = defineApi(`. */
function definedAs({ parsed, declaration }: DeclarationLayout): string {
  return parsed.text
    .slice(declaration.statement.start, declaration.config.start)
    .replace(/\s+/g, " ");
}

/* Every name a program writes as code, its bindings, references and keys alike. */
function names(program: Program, into: Set<string> = new Set()): Set<string> {
  new Visitor({
    Identifier: (node) => into.add(node.name),
    PrivateIdentifier: (node) => into.add(node.name),
  }).visit(program);
  return into;
}
