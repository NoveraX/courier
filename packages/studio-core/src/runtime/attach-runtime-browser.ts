import { attachRuntimeUsing } from "./attach-runtime-core";
import type { RuntimeHandle } from "./attach-runtime-types";
import { observeBrowserHttpVersions } from "./http-versions/browser-http-versions";

/**
 * Connect this browser bundle to a Studio dev server — the build of
 * `attachRuntime` that the `browser` export condition selects, which a
 * Cloudflare Worker takes too, and where it attaches nothing.
 *
 * It is the server one without the config loader, and without what
 * answers the Playground's calls and a webhook's deliveries, which Studio
 * sends only a runtime that showed it the project's token: a page never
 * has it. A browser build that reached the loader failed:
 * the bundler followed it into a TypeScript loader and `node:module`,
 * which no browser has. One that carried the Playground took the server's
 * half of the core, and a page built for development kept all of it.
 *
 * @param id - Optional explicit runtime id; `"browser"` by default.
 * @returns The runtime's handle.
 */
export function attachRuntime(id?: string): Promise<RuntimeHandle> {
  return attachRuntimeUsing({ observeVersions: observeBrowserHttpVersions }, id);
}
