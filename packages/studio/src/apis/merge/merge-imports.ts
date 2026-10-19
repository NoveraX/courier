/**
 * Merges import statements from existing and generated group files.
 *
 * Strategy: union of all imports, deduplicate by source, preserve user's
 * extras. Of a module the generated file imports too, a name only the file
 * imported is kept while the merged code uses it: a schema the spec no
 * longer has would otherwise stay imported from a module that no longer
 * exports it. A module the update removes — the file of a group the
 * specification dropped — stays imported only while the merged code uses a
 * name it brings: its import went on keeping that file, though the update
 * said it was removed.
 */

import { parseSource } from "@noverax/courier-cli/devkit";
import { escapeForRegex } from "../escape-for-regex";
import { namedStatement } from "../generator/named-statement";
import { referencedNames } from "../manage/referenced-names";
import type { MergeChange, ParsedImport } from "./types";

/** Whether the merged code uses a name a specifier binds. */
type Uses = (specifier: string) => boolean;

/**
 * Merge existing + generated imports, tracking changes.
 *
 * @param existing - The file's imports
 * @param generated - The freshly generated file's imports
 * @param changes - Where the imports kept for the user are noted
 * @param code - The merged code below the imports, which a kept name must be used in
 * @param removed - Whether a module is a file the update removes
 * @returns The import lines
 * @example
 * ```ts
 * mergeImports(own.imports, fresh.imports, changes, "endpoint.get('').response(PetSchema)");
 * ```
 */
export function mergeImports(
  existing: ParsedImport[],
  generated: ParsedImport[],
  changes: MergeChange[],
  code: string,
  removed: (source: string) => boolean = () => false,
): string[] {
  const merged = new Map<string, ParsedImport>();
  const used = usesIn(code);

  for (const imp of generated) {
    merged.set(imp.source, imp);
  }

  for (const imp of existing) {
    const gen = merged.get(imp.source);
    if (gen) {
      merged.set(imp.source, unionImport(gen, imp, used));
    } else if (removed(imp.source) && !stillUsed(imp, used)) {
      changes.push({
        type: "removed",
        target: `import:${imp.source}`,
        detail: "its module is removed",
      });
    } else {
      merged.set(imp.source, imp);
      changes.push({
        type: "preserved",
        target: `import:${imp.source}`,
        detail: "user import preserved",
      });
    }
  }

  return [...merged.values()].map(formatImport);
}

/* The names the code reads, by its syntax: a name a comment or a string
   only mentions keeps no import alive. Code that does not parse is read by
   its words. */
function usesIn(code: string): Uses {
  const local = (specifier: string): string => specifier.split(/\s+as\s+/).at(-1) ?? specifier;
  const parsed = parseSource("merged.ts", code);
  if (parsed.problem === null) {
    const names = referencedNames(parsed.program.body);
    return (specifier) => names.has(local(specifier));
  }
  return (specifier) =>
    new RegExp(`(?<![\\w$])${escapeForRegex(local(specifier))}(?![\\w$])`).test(code);
}

/* Whether the merged code uses a name the import binds: one that binds none runs the module for its effects, and stays. */
function stillUsed(imp: ParsedImport, uses: Uses): boolean {
  if (imp.namespaceImport) return uses(imp.namespaceImport);
  const bound = [...imp.names, ...imp.typeNames];
  return bound.length === 0 || bound.some(uses);
}

function unionImport(generated: ParsedImport, existing: ParsedImport, uses: Uses): ParsedImport {
  if (generated.namespaceImport || existing.namespaceImport) {
    return generated.namespaceImport ? generated : existing;
  }

  const kept = (name: string, own: readonly string[]): boolean => own.includes(name) || uses(name);
  const names = [
    ...new Set([...generated.names, ...existing.names.filter((n) => kept(n, generated.names))]),
  ];
  const typeNames = [
    ...new Set([
      ...generated.typeNames,
      ...existing.typeNames.filter((n) => kept(n, generated.typeNames)),
    ]),
  ];

  return { raw: "", source: generated.source, names, typeNames };
}

/* Written as the generator writes an import, so merging a file it just wrote changes nothing. */
function formatImport(imp: ParsedImport): string {
  if (imp.namespaceImport) {
    return `import ${imp.typeOnly ? "type " : ""}* as ${imp.namespaceImport} from "${imp.source}";`;
  }

  if (imp.names.length === 0 && imp.typeNames.length > 0) {
    return namedStatement("import type", imp.typeNames, imp.source);
  }
  const specifiers: string[] = [...imp.names, ...imp.typeNames.map((t) => `type ${t}`)];

  if (specifiers.length === 0) return imp.raw;
  return namedStatement("import", specifiers, imp.source);
}
