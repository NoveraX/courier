import { parseSource } from "@noverax/courier-cli/devkit";
import { referencedNames } from "./referenced-names";
import { readSchemaFile } from "./schema-file";

const SCHEMA_SUFFIX = "Schema";

/**
 * Find the schemas that removed endpoints used, directly or through other
 * schemas, and that nothing left uses: the remaining endpoints, or a schema
 * that stays. A schema and the type written for it — `Pet` and `PetSchema`
 * — stay or go together, as a full write has both or neither. A schema the
 * removed endpoints did not use is never one, and neither is anything a
 * schema that stays depends on. Everything is read as code, so a bracket
 * or a quote in a description, or an endpoint named like a keyword, cannot
 * throw it off; a file that does not parse gives no orphan at all.
 *
 * @param schemaFileContent - The schemas or types file, without Studio's header
 * @param remainingCode - Every file that may use it, as the removal leaves them: the endpoints
 *   beside it, and for the import's own module every file of the import
 * @param removedCode - The code of each endpoint removed, as its property is written
 * @returns The names safe to remove, in the order the file declares them
 * @example
 * ```ts
 * detectOrphanSchemas(schemas, [groupAfter], ['getPet: endpoint.get(":id").response(PetSchema)']);
 * ```
 */
export function detectOrphanSchemas(
  schemaFileContent: string,
  remainingCode: readonly string[],
  removedCode: readonly string[],
): string[] {
  const statements = readSchemaFile("schemas.ts", schemaFileContent);
  const read = remainingCode.map(codeNames);
  if (statements === null || read.some((names) => names === null)) return [];
  const remaining = new Set(read.flatMap((names) => [...(names ?? [])]));
  const declarations = statements.filter((s) => s.kind === "declaration");
  const declared = new Set(declarations.flatMap((s) => s.binds));
  const unitOf = (name: string): string => {
    const base = name.endsWith(SCHEMA_SUFFIX) ? name.slice(0, -SCHEMA_SUFFIX.length) : name;
    return base !== name && declared.has(base) ? base : name;
  };
  const deps = new Map<string, Set<string>>();
  for (const statement of declarations) {
    for (const name of statement.binds) {
      const unit = unitOf(name);
      const into = deps.get(unit) ?? new Set();
      for (const ref of statement.references)
        if (declared.has(ref) && unitOf(ref) !== unit) into.add(unitOf(ref));
      deps.set(unit, into);
    }
  }
  const unitsIn = (names: Iterable<string>): Set<string> =>
    new Set([...names].filter((name) => declared.has(name)).map(unitOf));
  const alive = closure(unitsIn(remaining), deps);
  const touched = closure(unitsIn(removedCode.flatMap((code) => [...snippetNames(code)])), deps);
  const staying = [...deps.keys()].filter((unit) => alive.has(unit) || !touched.has(unit));
  const kept = closure(new Set(staying), deps);
  return declarations.flatMap((s) => s.binds).filter((name) => !kept.has(unitOf(name)));
}

/* The units given, and every unit they depend on. */
function closure(start: Set<string>, deps: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const reached = new Set(start);
  const pending = [...start];
  for (let unit = pending.pop(); unit !== undefined; unit = pending.pop()) {
    for (const dep of deps.get(unit) ?? []) {
      if (reached.has(dep)) continue;
      reached.add(dep);
      pending.push(dep);
    }
  }
  return reached;
}

/* The names a file's code refers to outside its imports, or `null` when it does not parse. */
function codeNames(text: string): Set<string> | null {
  const parsed = parseSource("endpoints.ts", text);
  if (parsed.problem !== null) return null;
  return referencedNames(parsed.program.body.filter((s) => s.type !== "ImportDeclaration"));
}

/* An endpoint's property read as code; one that does not parse counts every word it holds. */
function snippetNames(code: string): Set<string> {
  const parsed = parseSource("endpoint.ts", `({ ${code.trim()} });`);
  if (parsed.problem === null) return referencedNames(parsed.program.body);
  return new Set(code.match(/[A-Za-z_$][\w$]*/g) ?? []);
}
