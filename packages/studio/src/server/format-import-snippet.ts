import type { CourierImportEntry } from "@noverax/courier/config";

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
 * regenerates an import's code from its declaration.
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
  lines.push("  },");
  return lines.join("\n");
}
