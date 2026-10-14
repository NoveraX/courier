/**
 * Generates the module browser code imports the proxy caller from.
 */

import { posix } from "node:path";
import type { ParsedSpec } from "../parser/types";
import { callerDoc } from "./caller-doc";
import { routesExportName } from "./routes-export-name";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/* The extension a module runs as, which an import that names it carries under Node's resolution. */
const RUNS_AS: Readonly<Record<string, string>> = {
  ".ts": ".js",
  ".mts": ".mjs",
  ".js": ".js",
  ".mjs": ".mjs",
};

/**
 * Write the import's proxy caller in a module of its own: it takes the
 * source's routes from the project's routes module, which Studio writes
 * from the endpoints marked `.expose()`, and imports nothing of the import,
 * so a browser bundle that imports it holds the proxy caller alone — not
 * the source's upstream address, its middleware, nor a schema. In the
 * barrel, beside the direct caller and the schemas, a browser importing it
 * got all of them, since a bundler keeps a module whose top level makes calls.
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
  /* Exported under the name courier.config keys the source by, which is the import's. */
  const routes = routesExportName(options.layout.importName) ?? `${name}Routes`;
  const content = [
    'import { createProxyCaller } from "@noverax/courier";',
    "",
    `import { ${routes} } from "${routesSpecifier(options)}";`,
    "",
    ...callerDoc(spec, "PROXY"),
    `export const ${name}ProxyApi = createProxyCaller(${routes});`,
    "",
  ].join("\n");
  return { path: options.layout.proxyFile, content };
}

/* From the proxy module's folder to the routes module, with the extension it runs as where imports carry one. */
function routesSpecifier({
  layout,
  routesModule,
  importExtension,
}: ResolvedGenerateOptions): string {
  const extension = posix.extname(routesModule);
  const relative = posix.relative(posix.dirname(layout.proxyFile), routesModule);
  const bare = relative.slice(0, relative.length - extension.length);
  const specifier = bare.startsWith("../") ? bare : `./${bare}`;
  return importExtension === "" ? specifier : `${specifier}${RUNS_AS[extension] ?? ".js"}`;
}
