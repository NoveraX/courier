import type { SchemaOutline } from "@noverax/courier-studio-core";

/* An enum shows its values while they are this few, as the schema table does; past that it counts them. */
const MAX_VALUES = 4;

/**
 * How a problem names what a part of a schema takes: `string`,
 * `"EUR" | "USD"`, `(string | number)[]`, `object | null`.
 *
 * @param outline - The part
 * @returns Its label
 * @example
 * ```ts
 * outlineLabel({ type: "array", items: { type: "string" } }); // "string[]"
 * ```
 */
export function outlineLabel(outline: SchemaOutline): string {
  switch (outline.type) {
    case "enum": {
      const { values } = outline;
      if (values.length > MAX_VALUES) return `one of ${values.length} values`;
      return values.map((value) => JSON.stringify(value)).join(" | ");
    }
    case "array": {
      if (!outline.items) return "array";
      const items = outlineLabel(outline.items);
      return `${items.includes(" | ") ? `(${items})` : items}[]`;
    }
    case "union":
      return [...new Set(outline.options.map(outlineLabel))].join(" | ");
    default:
      return outline.type;
  }
}
