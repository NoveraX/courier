/**
 * Merges import statements from existing and generated group files.
 *
 * Strategy: union of all imports, deduplicate by source, preserve user's
 * extras. Of a module the generated file imports too, a name only the file
 * imported is kept while the merged code uses it: a schema the spec no
 * longer has would otherwise stay imported from a module that no longer
 * exports it.
 */

import { escapeForRegex } from "../escape-for-regex";
import { namedStatement } from "../generator/named-statement";
import type { MergeChange, ParsedImport } from "./types";

/**
 * Merge existing + generated imports, tracking changes.
 *
 * @param existing - The file's imports
 * @param generated - The freshly generated file's imports
 * @param changes - Where the imports kept for the user are noted
 * @param code - The merged code below the imports, which a kept name must be used in
 * @returns The import lines
 */
export function mergeImports(
  existing: ParsedImport[],
  generated: ParsedImport[],
  changes: MergeChange[],
  code: string,
): string[] {
  const merged = new Map<string, ParsedImport>();

  for (const imp of generated) {
    merged.set(imp.source, imp);
  }

  for (const imp of existing) {
    const gen = merged.get(imp.source);
    if (!gen) {
      merged.set(imp.source, imp);
      changes.push({
        type: "preserved",
        target: `import:${imp.source}`,
        detail: "user import preserved",
      });
      continue;
    }
    merged.set(imp.source, unionImport(gen, imp, code));
  }

  return [...merged.values()].map(formatImport);
}

function uses(code: string, specifier: string): boolean {
  const local = specifier.split(/\s+as\s+/).at(-1) ?? specifier;
  return new RegExp(`(?<![\\w$])${escapeForRegex(local)}(?![\\w$])`).test(code);
}

function unionImport(generated: ParsedImport, existing: ParsedImport, code: string): ParsedImport {
  if (generated.namespaceImport || existing.namespaceImport) {
    return generated.namespaceImport ? generated : existing;
  }

  const kept = (name: string, own: readonly string[]): boolean =>
    own.includes(name) || uses(code, name);
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
