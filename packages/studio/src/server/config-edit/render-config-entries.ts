import type { CourierImportEntry, CourierImportSelector } from "@noverax/courier/config";

import { quoteString } from "../mocks-edit/plan/quote-string";
import type { FileStyle } from "../mocks-edit/plan/types";
import { selectorText } from "../selector-text";

/** Writes one entry at an indentation, on its own lines when `block`. */
export type RenderEntry = (indent: string, block: boolean) => string;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/* The fields an `imports` entry is written with, in the order the manual
   snippet shows them, so both read the same. */
const FIELDS = [
  "importType",
  "type",
  "from",
  "outputDir",
  "sourceName",
  "validation",
  "groupBy",
  "generateTypes",
  "generateSchemas",
  "generateClient",
  "addAuthMiddleware",
  "includeComments",
  "include",
  "exclude",
] as const;

type FieldValue = string | boolean | CourierImportSelector;

/**
 * A key as the config writes it: bare when it is an identifier, quoted in
 * the config's quotes otherwise.
 *
 * @param name - The key
 * @param style - How the config is written
 * @returns The key's text
 * @example
 * ```ts
 * configKey("billing-v2", { ...style, quote: "'" }); // → "'billing-v2'"
 * ```
 */
export function configKey(name: string, style: FileStyle): string {
  return IDENTIFIER.test(name) ? name : quoteString(name, style.quote);
}

/**
 * The `sources` entry naming a generated source: shorthand when the import
 * and the source share a name.
 *
 * @param name - The import's name, the key under `sources`
 * @param binding - The name the generated source is imported under
 * @param style - How the config is written
 * @returns The entry's text, without its comma
 * @example
 * ```ts
 * sourceEntry("billing", "billing", style); // → "billing"
 * ```
 */
export function sourceEntry(name: string, binding: string, style: FileStyle): string {
  return name === binding ? binding : `${configKey(name, style)}: ${binding}`;
}

/**
 * The `imports` entry for an import, written like the config around it.
 *
 * @param name - The import's name
 * @param entry - What it declares
 * @param style - How the config is written
 * @returns How to write it at an indentation
 * @example
 * ```ts
 * importEntry("billing", entry, style)("  ", false);
 * // → 'billing: { importType: "url", type: "openapi", from: "…", outputDir: "src/api" }'
 * ```
 */
export function importEntry(
  name: string,
  entry: CourierImportEntry,
  style: FileStyle,
): RenderEntry {
  const fields = fieldsOf(entry).map(
    ([key, value]): RenderEntry =>
      () =>
        `${key}: ${valueText(value, style)}`,
  );
  return objectEntry(configKey(name, style), fields, style);
}

/**
 * A key holding an object of entries, the object opened on lines of its
 * own in a block, one level in, and kept on one line otherwise.
 *
 * @param key - The key, as written
 * @param entries - The object's entries, each written without its comma
 * @param style - How the config is written
 * @returns How to write it at an indentation
 * @example
 * ```ts
 * objectEntry("sources", [() => "billing"], style)("", false); // → "sources: { billing }"
 * ```
 */
export function objectEntry(
  key: string,
  entries: readonly RenderEntry[],
  style: FileStyle,
): RenderEntry {
  return (indent, block) => {
    if (!block) return `${key}: { ${entries.map((render) => render("", false)).join(", ")} }`;
    const inner = indent + style.indent;
    const last = entries.length - 1;
    const lines = entries.map(
      (render, i) => `${inner}${render(inner, true)}${i < last || style.trailingCommas ? "," : ""}`,
    );
    return [`${key}: {`, ...lines, `${indent}}`].join(style.eol);
  };
}

function fieldsOf(entry: CourierImportEntry): Array<[string, FieldValue]> {
  const fields: Array<[string, FieldValue]> = [];
  for (const key of FIELDS) {
    if (key === "include" || key === "exclude") {
      const selector = entry[key];
      if (selector !== undefined) fields.push([key, selector]);
      continue;
    }
    const value: unknown = key in entry ? Reflect.get(entry, key) : undefined;
    if (typeof value === "string" || typeof value === "boolean") fields.push([key, value]);
  }
  return fields;
}

function valueText(value: FieldValue, style: FileStyle): string {
  if (typeof value === "string") return quoteString(value, style.quote);
  if (typeof value === "boolean") return String(value);
  return selectorText(value, (text) => quoteString(text, style.quote));
}
