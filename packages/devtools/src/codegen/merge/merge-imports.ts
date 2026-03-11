/**
 * Merges import statements from existing and generated group files.
 *
 * Strategy: union of all imports, deduplicate by source, preserve user's extras.
 */

import type { MergeChange, ParsedImport } from "./types";

/** Merge existing + generated imports, tracking changes */
export function mergeImports(
  existing: ParsedImport[],
  generated: ParsedImport[],
  changes: MergeChange[],
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
    merged.set(imp.source, unionImport(gen, imp));
  }

  return [...merged.values()].map(formatImport);
}

function unionImport(generated: ParsedImport, existing: ParsedImport): ParsedImport {
  if (generated.namespaceImport || existing.namespaceImport) {
    return generated.namespaceImport ? generated : existing;
  }

  const names = [...new Set([...generated.names, ...existing.names])];
  const typeNames = [...new Set([...generated.typeNames, ...existing.typeNames])];

  return { raw: "", source: generated.source, names, typeNames };
}

function formatImport(imp: ParsedImport): string {
  if (imp.namespaceImport) {
    return `import * as ${imp.namespaceImport} from "${imp.source}";`;
  }

  const specifiers: string[] = [...imp.names, ...imp.typeNames.map((t) => `type ${t}`)];

  if (specifiers.length === 0) return imp.raw;
  return `import { ${specifiers.join(", ")} } from "${imp.source}";`;
}
