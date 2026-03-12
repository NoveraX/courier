import type { ResolvedOptions } from "./types";

/**
 * Generates the JS code snippet that connects the app to DevTools.
 * Injected by build plugins into the client bundle in dev mode.
 */
export function generateConnectSnippet(options: ResolvedOptions): string {
  const filterArg = options.filter ? `, filter: ${JSON.stringify(options.filter)}` : "";

  return [
    `import { connectDevTools } from "@noverax/nexus-devtools-core"`,
    `connectDevTools({ port: ${options.port}, host: ${JSON.stringify(options.host)}${filterArg} })`,
  ].join("\n");
}
