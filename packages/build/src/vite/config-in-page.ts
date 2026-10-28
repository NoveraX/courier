import { basename } from "node:path";

/** What of Vite's plugin context tells a page's modules from a server's, and fails a build. */
export interface TransformContext {
  readonly environment?: { readonly config: { readonly consumer: string } } | undefined;
  error(message: string): never;
}

/**
 * Refuse the project's config as a module of a page. It holds the server's
 * settings and the definition of every API — their addresses, their
 * middleware, what reads their secrets — and imported as a value it ships
 * all of them to the browser. A page needs its type alone, which an
 * `import type` gives without a byte of it.
 *
 * @param context - Vite's plugin context
 * @param id - The module Vite is transforming
 * @param options - What Vite before 6 says of the module: `ssr` for a server's
 * @param configFile - The project's config, absolute
 * @example
 * ```ts
 * transform(code, id, options) { refuseConfigInPage(this, id, options, configFile); }
 * ```
 */
export function refuseConfigInPage(
  context: TransformContext,
  id: string,
  options: { ssr?: boolean | undefined } | undefined,
  configFile: string | undefined,
): void {
  if (configFile === undefined || !isPageModule(context, options)) return;
  if (withSlashes(id.split("?")[0] ?? id) !== withSlashes(configFile)) return;
  context.error(
    `[courier] ${basename(configFile)} is imported into a page as a value, which would ship the server's settings and every API's definition to the browser. Import its type alone: write \`import type config from\` where the page writes \`import config from\`.`,
  );
}

/* A module of a page: the client environment's, or, before Vite 6, one not built for the server. */
function isPageModule(
  context: TransformContext,
  options: { ssr?: boolean | undefined } | undefined,
): boolean {
  const consumer = context.environment?.config.consumer;
  return consumer === undefined ? options?.ssr !== true : consumer === "client";
}

function withSlashes(path: string): string {
  return path.split("\\").join("/");
}
