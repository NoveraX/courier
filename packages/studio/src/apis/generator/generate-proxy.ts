/**
 * Generates the module browser code imports the proxy caller from.
 */

import { posix } from "node:path";
import { routesExportName } from "@noverax/courier-cli/devkit";
import type { ParsedSpec } from "../parser/types";
import { callerDoc } from "./caller-doc";
import { jsLiteral } from "./literals";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/* The extension a module runs as, which an import that names it carries under Node's resolution. */
const RUNS_AS: Readonly<Record<string, string>> = {
  ".ts": ".js",
  ".mts": ".mjs",
  ".js": ".js",
  ".mjs": ".mjs",
};

/* The module's head where Courier's plugin gives the routes: `routes`, and the config registered for its type alone. */
function pluginHead(options: ResolvedGenerateOptions, config: string): string[] {
  return [
    'import { createProxyCaller } from "@noverax/courier/client";',
    'import { routes } from "@noverax/courier/routes";',
    "",
    `import type config from "${specifierTo(options, config)}";`,
    "",
    "/* Types `routes` from the config: one registration for the app. */",
    'declare module "@noverax/courier/routes" {',
    "  interface Register {",
    "    config: typeof config;",
    "  }",
    "}",
    "",
  ];
}

/**
 * Write the import's proxy caller in a module of its own: it takes the
 * source's routes from the project's routes module, which Studio writes
 * from the endpoints marked `.expose()` — or, where the config keeps none,
 * from `@noverax/courier/routes`, which Courier's plugin for the app's
 * build gives the page, with the config registered there — and imports
 * nothing of the import, so a browser bundle that imports it holds the
 * proxy caller alone — not the source's upstream address, its middleware,
 * nor a schema. In the barrel, beside the direct caller and the schemas, a
 * browser importing it got all of them, since a bundler keeps a module
 * whose top level makes calls. The proxy caller comes from the page's
 * entry, `@noverax/courier/client`, the same caller the root gives, so the
 * bundle holds none of the server's part the root takes along either. It is
 * made pure, so a module that imports the proxy module and takes nothing of
 * it carries none of it.
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
  const { importName } = options.layout;
  if (options.routesConfig !== undefined) {
    /* The routes of the source courier.config keys by the import's name. */
    const read = /^[A-Za-z_$][\w$]*$/.test(importName)
      ? `routes.${importName}`
      : `routes[${jsLiteral(importName)}]`;
    const content = [
      ...pluginHead(options, options.routesConfig),
      ...callerDoc(spec, "PROXY"),
      `export const ${name}ProxyApi = /* @__PURE__ */ createProxyCaller(${read});`,
      "",
    ].join("\n");
    return { path: options.layout.proxyFile, content };
  }
  /* Exported under the name courier.config keys the source by, which is the import's. */
  const routes = routesExportName(importName) ?? `${name}Routes`;
  const content = [
    'import { createProxyCaller } from "@noverax/courier/client";',
    "",
    `import { ${routes} } from "${specifierTo(options, options.routesModule)}";`,
    "",
    ...callerDoc(spec, "PROXY"),
    `export const ${name}ProxyApi = /* @__PURE__ */ createProxyCaller(${routes});`,
    "",
  ].join("\n");
  return { path: options.layout.proxyFile, content };
}

/* From the proxy module's folder to a module of the project's, with the extension it runs as where imports carry one. */
function specifierTo({ layout, importExtension }: ResolvedGenerateOptions, module: string): string {
  const extension = posix.extname(module);
  const relative = posix.relative(posix.dirname(layout.proxyFile), module);
  const bare = relative.slice(0, relative.length - extension.length);
  const specifier = bare.startsWith("../") ? bare : `./${bare}`;
  return importExtension === "" ? specifier : `${specifier}${RUNS_AS[extension] ?? ".js"}`;
}
