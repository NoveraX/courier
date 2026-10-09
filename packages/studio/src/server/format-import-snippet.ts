import type { CourierImportEntry } from "@noverax/courier/config";

import { selectorText } from "./selector-text";

/* The codegen choices a declaration carries, in the order they are written. */
const CODEGEN_FIELDS = [
  "validation",
  "groupBy",
  "generateTypes",
  "generateSchemas",
  "generateClient",
  "addAuthMiddleware",
  "includeComments",
] as const;

/**
 * Format one import's entry as the user writes it under `imports:` in
 * `courier.config.ts`. URL imports carry `from` / `auth` / `pinHash`; file and
 * raw imports are supplied through the UI each time and therefore have no
 * `from`. Every codegen choice the entry sets is written too, since Studio
 * regenerates an import's code from its declaration, and so are the
 * endpoints its `include` and `exclude` name.
 *
 * @param name - The import's key under `imports`
 * @param entry - Its declaration
 * @returns The entry's lines, indented as under `imports: {`
 *
 * @example
 * ```ts
 * formatImportSnippet("pets", { importType: "file", type: "openapi", outputDir: "src/api", validation: "valibot" });
 * // → '  "pets": {\n    importType: "file",\n    type: "openapi",\n    outputDir: "src/api",\n    validation: "valibot",\n  },'
 * ```
 */
export function formatImportSnippet(name: string, entry: CourierImportEntry): string {
  const lines: string[] = [`  ${JSON.stringify(name)}: {`];
  lines.push(`    importType: ${JSON.stringify(entry.importType)},`);
  lines.push(`    type: ${JSON.stringify(entry.type)},`);
  if (entry.importType === "url") {
    lines.push(`    from: ${JSON.stringify(entry.from)},`);
    if (entry.auth) lines.push(`    auth: ${JSON.stringify(entry.auth)},`);
    if (entry.pinHash) lines.push(`    pinHash: ${JSON.stringify(entry.pinHash)},`);
  }
  lines.push(`    outputDir: ${JSON.stringify(entry.outputDir)},`);
  if (entry.sourceName) lines.push(`    sourceName: ${JSON.stringify(entry.sourceName)},`);
  for (const field of CODEGEN_FIELDS) {
    const value = entry[field];
    if (value !== undefined) lines.push(`    ${field}: ${JSON.stringify(value)},`);
  }
  for (const field of ["include", "exclude"] as const) {
    const selector = entry[field];
    if (selector !== undefined)
      lines.push(`    ${field}: ${selectorText(selector, JSON.stringify)},`);
  }
  lines.push("  },");
  return lines.join("\n");
}
