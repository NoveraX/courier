/**
 * Generates the module browser code imports the proxy caller from.
 */

import type { ParsedSpec } from "../parser/types";
import { callerDoc } from "./caller-doc";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/**
 * Write the import's proxy caller in a module of its own: it names the
 * source only as a type and imports nothing else of the import, so a
 * browser bundle that imports it holds the proxy caller alone — not the
 * source's upstream address, its middleware, nor a schema. In the barrel,
 * beside the direct caller and the schemas, a browser importing it got all
 * of them, since a bundler keeps a module whose top level makes calls.
 *
 * @param spec - The parsed specification
 * @param options - The import's resolved options
 * @returns The module, or `null` when the import has no proxy caller
 * @example
 * ```ts
 * generateProxyFile(spec, options)?.path; // "src/api/pets/proxy.ts"
 * ```
 */
export function generateProxyFile(
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
): GeneratedFile | null {
  if (options.generateClient !== "proxy" && options.generateClient !== "both") return null;
  const name = options.sourceName;
  const content = [
    'import { createProxyCaller } from "@noverax/courier";',
    `import type { ${name} } from "./source${options.importExtension}";`,
    "",
    ...callerDoc(spec, "PROXY"),
    `export const ${name}ProxyApi = createProxyCaller<typeof ${name}>("${name}");`,
    "",
  ].join("\n");
  return { path: options.layout.proxyFile, content };
}
