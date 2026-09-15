import type { ResolvedOptions } from "./types";

/**
 * Symbol key shared with `attach-runtime.ts`. Defining it as a real symbol
 * (then deriving its registry key with `Symbol.keyFor`) means a typo would
 * surface as a TypeScript error here, not as a silent runtime mismatch on
 * the browser side.
 */
const STUDIO_URL_SYMBOL = Symbol.for("nexus.studio.url");
const STUDIO_URL_KEY_LITERAL = `Symbol.for(${JSON.stringify(Symbol.keyFor(STUDIO_URL_SYMBOL))})`;

/**
 * Generate the JS snippet that connects a browser bundle to Studio.
 *
 * Two statements: pin the resolved Studio URL on globalThis (so the runtime
 * picks it up without bundler-specific env injection), then call
 * `attachRuntime` with the framework-suffixed runtime id.
 */
export function generateConnectSnippet(options: ResolvedOptions): string {
  const url = JSON.stringify(options.studioUrl);
  const runtimeId = JSON.stringify(`${options.framework}-browser`);
  return [
    `globalThis[${STUDIO_URL_KEY_LITERAL}] = ${url};`,
    `import { attachRuntime } from "@noverax/nexus-studio-core/runtime";`,
    `attachRuntime(${runtimeId});`,
  ].join("\n");
}
