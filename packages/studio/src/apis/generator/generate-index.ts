/**
 * Generates the barrel index file (client exports + schema re-exports).
 */

import type { ParsedGroup, ParsedSpec } from "../parser/types";
import type { GeneratedFile, GenerateOptions } from "./types";

export function generateIndexFile(
  spec: ParsedSpec,
  groups: ParsedGroup[],
  options: GenerateOptions,
  groupSchemaMap?: Map<string, Set<string>>,
  flat = false,
): GeneratedFile {
  const lines: string[] = [];
  const name = options.sourceName;
  const hasDirect =
    options.generateClient !== "none" &&
    (options.generateClient === "direct" || options.generateClient === "both");
  const hasProxy = options.generateClient === "proxy" || options.generateClient === "both";

  // Imports
  const courierImports: string[] = [];
  if (hasDirect) courierImports.push("createCaller");
  if (hasProxy) courierImports.push("createProxyCaller");

  if (courierImports.length > 0) {
    lines.push(`import { ${courierImports.join(", ")} } from "@noverax/courier";`);
  }
  lines.push(`import { ${name} } from "./source";`);
  lines.push("");

  // Extract first meaningful paragraph from description (skip markdown headers)
  const shortDescription = extractFirstParagraph(spec.description) || spec.title;

  // Build JSDoc block
  const buildJsDoc = (mode: string, modeHint: string) => {
    const jsDocLines: string[] = [];
    jsDocLines.push("/**");
    jsDocLines.push(` * \`${mode}\` — ${spec.title} v${spec.version}`);
    jsDocLines.push(` *`);
    jsDocLines.push(` * ${modeHint}`);
    if (shortDescription) {
      jsDocLines.push(` *`);
      jsDocLines.push(` * ---`);
      jsDocLines.push(` *`);
      jsDocLines.push(` * ${shortDescription}`);
    }
    jsDocLines.push(" */");
    return jsDocLines;
  };

  // PascalCase source name for variable: timeweb → timewebApi
  const varDirect = `${name}Api`;
  const varProxy = `${name}ProxyApi`;

  // Direct mode
  if (hasDirect) {
    for (const line of buildJsDoc(
      "DIRECT",
      "Calls the API directly from the runtime environment (browser, Node.js, Deno, Bun).",
    )) {
      lines.push(line);
    }
    lines.push(`export const ${varDirect} = createCaller(${name});`);
    lines.push("");
  }

  // Proxy mode
  if (hasProxy) {
    for (const line of buildJsDoc(
      "PROXY",
      "Routes requests through a server-side proxy endpoint. Hides secrets, bypasses CORS, forwards cookies.",
    )) {
      lines.push(line);
    }
    lines.push(`export const ${varProxy} = createProxyCaller<typeof ${name}>("${name}");`);
    lines.push("");
  }

  // Re-export schemas/types
  if (flat) {
    const file = options.generateSchemas ? "schemas" : "types";
    if (options.generateSchemas || options.generateTypes) {
      lines.push(`export * from "./${file}";`);
    }
  } else if (groupSchemaMap && groupSchemaMap.size > 0) {
    const file = options.generateSchemas ? "schemas" : "types";
    const exported = new Set<string>();

    for (const group of groups) {
      const schemaNames = groupSchemaMap.get(group.name);
      if (!schemaNames) continue;

      const unique = [...schemaNames].filter((n) => !exported.has(n));
      if (unique.length === 0) continue;

      if (unique.length === schemaNames.size) {
        lines.push(`export * from "./${group.name}/${file}";`);
      } else {
        const imports: string[] = [];
        for (const n of unique) {
          if (options.generateSchemas) imports.push(`${n}Schema`);
          if (options.generateTypes) imports.push(`type ${n}`);
        }
        if (imports.length > 0) {
          lines.push(`export { ${imports.join(", ")} } from "./${group.name}/${file}";`);
        }
      }

      for (const n of schemaNames) exported.add(n);
    }
  }
  lines.push("");

  return {
    path: `${options.outputDir}/index.ts`,
    content: lines.join("\n"),
  };
}

/** Extract first meaningful paragraph from a description, skipping markdown headers. */
function extractFirstParagraph(description: string): string {
  if (!description) return "";

  const lines = description.split(/\n+/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and markdown headers
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Found first content paragraph — truncate if too long
    if (trimmed.length > 200) {
      return `${trimmed.slice(0, 200)}...`;
    }
    return trimmed;
  }
  return "";
}
