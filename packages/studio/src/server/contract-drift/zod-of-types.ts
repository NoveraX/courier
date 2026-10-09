const ZOD: Readonly<Record<string, string>> = {
  string: "z.string()",
  number: "z.number()",
  boolean: "z.boolean()",
  object: "z.object({})",
  array: "z.array(z.unknown())",
};

/**
 * The Zod schema that takes values of the JSON types given: one type's
 * schema, the union of several, nullable when `null` is among them.
 *
 * @param types - The JSON types: `string`, `number`, `boolean`, `object`, `array`, `null`
 * @returns The schema, as Zod writes it
 * @example
 * ```ts
 * zodOfTypes(["number", "null"]); // "z.number().nullable()"
 * zodOfTypes(["string", "number"]); // "z.union([z.string(), z.number()])"
 * ```
 */
export function zodOfTypes(types: readonly string[]): string {
  const values = types.filter((type) => type !== "null" && type !== "any");
  const nullable = types.includes("null");
  const written = values.map((type) => ZOD[type] ?? "z.unknown()");
  const base =
    written.length === 0
      ? "z.null()"
      : written.length === 1
        ? (written[0] ?? "z.unknown()")
        : `z.union([${written.join(", ")}])`;
  return `${base}${nullable && written.length > 0 ? ".nullable()" : ""}`;
}
