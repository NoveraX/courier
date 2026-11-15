import type { OutlineField, SchemaOutline } from "@noverax/courier-studio-core";

import { isPlainObject } from "./is-plain-object";

const SCALARS: ReadonlySet<unknown> = new Set(["string", "number", "boolean", "null"]);

/* How deep an outline Studio writes may nest, with room to spare: a deeper one is no outline. */
const MAX_DEPTH = 64;

function isOutlineValue(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return value === null || typeof value === "string" || typeof value === "boolean";
}

function isOutlineField(item: unknown, depth: number): item is OutlineField {
  return (
    isPlainObject(item) &&
    typeof item.name === "string" &&
    typeof item.required === "boolean" &&
    (item.outline === undefined || isOutlineAt(item.outline, depth + 1))
  );
}

function isOutlineAt(item: unknown, depth: number): item is SchemaOutline {
  if (depth > MAX_DEPTH || !isPlainObject(item)) return false;
  if (SCALARS.has(item.type)) return true;
  const { fields, items, values, options } = item;
  switch (item.type) {
    case "object":
      return (
        fields === undefined ||
        (Array.isArray(fields) && fields.every((field) => isOutlineField(field, depth)))
      );
    case "array":
      return items === undefined || isOutlineAt(items, depth + 1);
    case "enum":
      return Array.isArray(values) && values.every(isOutlineValue);
    case "union":
      return Array.isArray(options) && options.every((option) => isOutlineAt(option, depth + 1));
    default:
      return false;
  }
}

/**
 * Whether what a scanned endpoint carries as its variables' outline is one
 * the Playground can check variables against: each part a JSON type, an
 * enum of JSON values, an object with its fields, an array with its items,
 * or a union of such parts.
 *
 * @param item - The outline, as Socket.IO delivered it
 * @returns Whether it is a well-formed outline
 * @example
 * ```ts
 * isSchemaOutline({ type: "object", fields: [{ name: "id", required: true, outline: { type: "string" } }] }); // true
 * ```
 */
export function isSchemaOutline(item: unknown): item is SchemaOutline {
  return isOutlineAt(item, 0);
}
