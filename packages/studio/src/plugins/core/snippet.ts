import { RUNTIME_SPECIFIER } from "./constants";
import type { ResolvedOptions } from "./types";

/**
 * Symbol key shared with `attach-runtime.ts`. Defining it as a real symbol
 * (then deriving its registry key with `Symbol.keyFor`) means a typo would
 * surface as a TypeScript error here, not as a silent runtime mismatch on
 * the browser side.
 */
const STUDIO_URL_SYMBOL = Symbol.for("courier.studio.url");
const STUDIO_URL_KEY_LITERAL = `Symbol.for(${JSON.stringify(Symbol.keyFor(STUDIO_URL_SYMBOL))})`;

/**
 * Generate the JS module that connects a browser bundle to Studio.
 *
 * It pins the resolved Studio URL on globalThis (so the runtime picks it up
 * without bundler-specific env injection), then calls `attachRuntime` with
 * the framework-suffixed runtime id. The import is hoisted above the
 * assignment, which is fine: the runtime reads the URL when called.
 *
 * @param options - The resolved plugin options.
 * @param runtime - What to import the runtime from: its package name, or a
 *   path for integrations that cannot resolve a package name from here.
 * @returns The module source.
 */
export function generateConnectSnippet(
  options: ResolvedOptions,
  runtime: string = RUNTIME_SPECIFIER,
): string {
  const url = JSON.stringify(options.studioUrl);
  const runtimeId = JSON.stringify(`${options.framework}-browser`);
  return [
    `globalThis[${STUDIO_URL_KEY_LITERAL}] = ${url};`,
    `import { attachRuntime } from ${JSON.stringify(runtime)};`,
    `attachRuntime(${runtimeId});`,
  ].join("\n");
}
