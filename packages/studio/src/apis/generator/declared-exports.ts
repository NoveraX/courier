/* A declaration the generator writes at the start of a line: `export const XSchema`, `export type X`. */
const EXPORT_DECLARATION = /^export (const|type) ([A-Za-z_$][\w$]*)/gm;

/** Whether a name a generated module exports is a value, or only a type. */
export type DeclaredKind = "value" | "type";

/**
 * The names a generated schemas or types module exports, in the order it
 * declares them, each a value or only a type. The generator declares each
 * export at the start of a line, so the declarations are read from there;
 * a name declared as both a value and a type is a value, which a
 * re-export by name carries with its type.
 *
 * @param content - The module the generator wrote
 * @returns Each exported name and its kind
 * @example
 * ```ts
 * declaredExports("export type Pet = { id: number };\nexport const PetSchema = z.object({});\n");
 * // → Map { "Pet" => "type", "PetSchema" => "value" }
 * ```
 */
export function declaredExports(content: string): Map<string, DeclaredKind> {
  const names = new Map<string, DeclaredKind>();
  for (const [, keyword, name] of content.matchAll(EXPORT_DECLARATION)) {
    if (name === undefined || names.get(name) === "value") continue;
    names.set(name, keyword === "const" ? "value" : "type");
  }
  return names;
}
