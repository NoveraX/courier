import type { ResolvedOptions } from "./types";

/**
 * Generates the JS code snippet that connects the app to Studio.
 * Injected by build plugins into the client bundle in dev mode.
 */
export function generateConnectSnippet(options: ResolvedOptions): string {
  const filterArg = options.filter ? `, filter: ${JSON.stringify(options.filter)}` : "";

  return [
    `import { connectStudio } from "@noverax/nexus-studio-core"`,
    `connectStudio({ port: ${options.port}, host: ${JSON.stringify(options.host)}, framework: ${JSON.stringify(options.framework)}${filterArg} })`,
  ].join("\n");
}
