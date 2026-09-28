/**
 * Generates the barrel index file (client exports + schema re-exports).
 */

import type { ParsedGroup, ParsedSpec } from "../parser/types";
import { barrelReexports } from "./barrel-reexports";
import { jsdocText } from "./jsdoc-text";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

const DIRECT_HINT =
  "Calls the API directly from the runtime environment (browser, Node.js, Deno, Bun).";
const PROXY_HINT =
  "Routes requests through a server-side proxy endpoint. Hides secrets, bypasses CORS, and forwards only the headers a source names.";

/**
 * Write the import's barrel: the callers asked for, and the re-exports of
 * its schemas and types.
 *
 * @param spec - The parsed specification
 * @param groups - The groups, in order; none for an import generated flat
 * @param options - The import's resolved options
 * @param groupSchemaMap - The names each written schemas file declares, by group
 * @returns The barrel
 * @example
 * ```ts
 * generateIndexFile(spec, spec.groups, options, schemaMap).path; // "src/api/pets/index.ts"
 * ```
 */
export function generateIndexFile(
  spec: ParsedSpec,
  groups: ParsedGroup[],
  options: ResolvedGenerateOptions,
  groupSchemaMap: ReadonlyMap<string, ReadonlySet<string>>,
): GeneratedFile {
  const name = options.sourceName;
  const hasDirect = options.generateClient === "direct" || options.generateClient === "both";
  const hasProxy = options.generateClient === "proxy" || options.generateClient === "both";
  const lines: string[] = [];

  const courierImports = [
    ...(hasDirect ? ["createCaller"] : []),
    ...(hasProxy ? ["createProxyCaller"] : []),
  ];
  if (courierImports.length > 0) {
    lines.push(`import { ${courierImports.join(", ")} } from "@noverax/courier";`);
  }
  /* The proxy caller needs the source's type alone. Imported as a value, a
     bundler keeping every import as written — `verbatimModuleSyntax` — put
     the source, its upstream address and its headers in the browser. With
     no caller the source is not imported at all: nothing would read it. */
  if (hasDirect || hasProxy) {
    lines.push(
      `import ${hasDirect ? "" : "type "}{ ${name} } from "./source${options.importExtension}";`,
      "",
    );
  }

  if (hasDirect) {
    lines.push(...callerDoc(spec, "DIRECT", DIRECT_HINT));
    lines.push(`export const ${name}Api = createCaller(${name});`, "");
  }
  if (hasProxy) {
    lines.push(...callerDoc(spec, "PROXY", PROXY_HINT));
    lines.push(`export const ${name}ProxyApi = createProxyCaller<typeof ${name}>("${name}");`, "");
  }

  lines.push(...barrelReexports(groups, options, groupSchemaMap), "");
  return { path: options.layout.indexFile, content: lines.join("\n") };
}

/** The comment above a caller: the API, the mode, and its description. */
function callerDoc(spec: ParsedSpec, mode: string, hint: string): string[] {
  const short = extractFirstParagraph(spec.description) || spec.title;
  const lines = ["/**", ` * \`${mode}\` — ${jsdocText(spec.title)} v${jsdocText(spec.version)}`];
  lines.push(" *", ` * ${hint}`);
  if (short) lines.push(" *", " * ---", " *", ` * ${jsdocText(short)}`);
  lines.push(" */");
  return lines;
}

/** Extract first meaningful paragraph from a description, skipping markdown headers. */
function extractFirstParagraph(description: string): string {
  if (!description) return "";

  for (const line of description.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
  }
  return "";
}
