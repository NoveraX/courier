import type { DevToolsHooks } from "./hooks";

/**
 * Global hooks object shared via `Symbol.for` to survive bundler module duplication.
 * Turbopack / webpack may create separate module instances for the same package
 * (e.g. instrumentation context vs route handler context). Using `globalThis`
 * ensures a single hooks object across all instances.
 */
const HOOKS_KEY = Symbol.for("nexus.devtools.hooks");
const COUNTER_KEY = Symbol.for("nexus.devtools.counter");

const g = globalThis as Record<symbol, unknown>;

if (!g[HOOKS_KEY]) g[HOOKS_KEY] = {};
export const devtoolsHooks: DevToolsHooks = g[HOOKS_KEY] as DevToolsHooks;

if (!(COUNTER_KEY in g)) g[COUNTER_KEY] = 0;

/** Generate a unique request ID for devtools tracing */
export function generateRequestId(): string {
  const count = g[COUNTER_KEY] as number;
  g[COUNTER_KEY] = count + 1;
  return `req_${Date.now().toString(36)}_${count.toString(36)}`;
}
