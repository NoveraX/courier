import { provideServerCapability } from "../capabilities/provide-server-capability";
import type { StudioHooks } from "./hooks";
import { createStudioReport } from "./studio-report";

/**
 * Global hooks object shared via `Symbol.for` to survive bundler module duplication.
 * Turbopack / webpack may create separate module instances for the same package
 * (e.g. instrumentation context vs route handler context). Using `globalThis`
 * ensures a single hooks object across all instances.
 */
const HOOKS_KEY = Symbol.for("courier.studio.hooks");
const COUNTER_KEY = Symbol.for("courier.studio.counter");

const g = globalThis as Record<symbol, unknown>;

if (!g[HOOKS_KEY]) g[HOOKS_KEY] = {};
export const studioHooks: StudioHooks = g[HOOKS_KEY] as StudioHooks;

if (!(COUNTER_KEY in g)) g[COUNTER_KEY] = 0;

/** Generate a unique request ID for studio tracing */
export function generateRequestId(): string {
  const count = g[COUNTER_KEY] as number;
  g[COUNTER_KEY] = count + 1;
  return `req_${Date.now().toString(36)}_${count.toString(36)}`;
}

/* The hooks and the calls' view of them are lent together: whatever sets a
   hook has loaded this module, and a page, which loads none of Studio,
   tells it nothing. */
provideServerCapability("studio", createStudioReport(studioHooks, generateRequestId));
