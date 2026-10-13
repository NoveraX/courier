/** Whether a name a generated module exports is a value, or only a type. */
export type DeclaredKind = "value" | "type";

/* A declaration the generator writes: one entry of a module's lines, opening with it. */
const DECLARATION = /^export (const|type) ([A-Za-z_$][\w$]*)/;

/**
 * The names a generated schemas or types module exports, in the order it
 * declares them, each a value or only a type — read from the lines the
 * generator writes the module from, as it writes them, so the module is
 * not parsed again. Each declaration is an entry of its own, opening with
 * `export const` or `export type`; a doc comment is an entry of its own
 * too, opening with `/**`, so a description the specification wrote with a
 * line reading `export const X` names nothing. A name declared as both a
 * value and a type is a value, which a re-export by name carries with its
 * type.
 *
 * @param lines - The entries the module's text is joined from
 * @returns Each exported name and its kind
 * @example
 * ```ts
 * declaredInLines(["export type Pet = { id: number };", "export const PetSchema = z.object({});"]);
 * // → Map { "Pet" => "type", "PetSchema" => "value" }
 * ```
 */
export function declaredInLines(lines: readonly string[]): Map<string, DeclaredKind> {
  const names = new Map<string, DeclaredKind>();
  for (const line of lines) {
    const declared = DECLARATION.exec(line);
    if (declared === null) continue;
    const [, keyword, name = ""] = declared;
    if (keyword === "const") names.set(name, "value");
    else if (!names.has(name)) names.set(name, "type");
  }
  return names;
}
