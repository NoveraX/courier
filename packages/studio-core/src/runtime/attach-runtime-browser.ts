import { attachRuntimeUsing } from "./attach-runtime-core";
import type { RuntimeHandle } from "./attach-runtime-types";

/**
 * Connect this browser bundle to a Studio dev server — the build of
 * `attachRuntime` that the `browser` export condition selects.
 *
 * It is the server one without the config loader. A browser build that
 * reached the loader failed: the bundler followed it into a TypeScript loader
 * and `node:module`, which no browser has.
 *
 * @param id - Optional explicit runtime id; `"browser"` by default.
 * @returns The runtime's handle.
 */
export function attachRuntime(id?: string): Promise<RuntimeHandle> {
  return attachRuntimeUsing(undefined, id);
}
