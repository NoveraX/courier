import type { ParsedImport } from "../merge/types";

function uses(text: string, name: string, member = false): boolean {
  const escaped = name.replace(/[$]/g, "\\$");
  return new RegExp(`(?<![\\w$.])${escaped}${member ? "\\." : "(?![\\w$])"}`).test(text);
}

/* The name a specifier binds: `b` for `a as b`. */
function localOf(specifier: string): string {
  return specifier.split(/\s+as\s+/).at(-1) ?? specifier;
}

/**
 * Keep, of the imports a generated file has, the names some code uses: the
 * code added to a file needs those, and nothing it does not mention.
 *
 * @param imports - The generated file's imports
 * @param code - The code being added
 * @returns The imports, each with only the names the code uses; empty ones dropped
 * @example
 * ```ts
 * referencedImports(generated.imports, 'createPet: endpoint.post("").body(PetSchema)');
 * // → [{ source: "./schemas", names: ["PetSchema"], typeNames: [], raw: "…" }]
 * ```
 */
export function referencedImports(imports: readonly ParsedImport[], code: string): ParsedImport[] {
  return imports.flatMap((statement) => {
    const namespace = statement.namespaceImport;
    if (namespace !== undefined) return uses(code, namespace, true) ? [statement] : [];
    const names = statement.names.filter((name) => uses(code, localOf(name)));
    const typeNames = statement.typeNames.filter((name) => uses(code, localOf(name)));
    return names.length + typeNames.length === 0 ? [] : [{ ...statement, names, typeNames }];
  });
}
