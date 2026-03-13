import { connectDevTools } from "./connect-devtools";
import type { DevToolsConnection, InstrumentServerOptions } from "./types";

const NOOP_CONNECTION: DevToolsConnection = {
  bus: { on: () => () => {}, emit: () => {}, clear: () => {}, getBuffer: () => [] } as never,
  sessionId: "",
  disconnect: () => {},
};

/** Detect framework from environment variables */
function detectFramework(): string {
  if (typeof process === "undefined") return "server";
  const env = process.env;

  if (env.NEXT_RUNTIME === "nodejs") return "next-server";
  if (env.NEXT_RUNTIME === "edge") return "next-edge";
  if (env.NEXT_RUNTIME) return `next-${env.NEXT_RUNTIME}`;
  if (env.__NUXT__) return "nuxt-server";
  return "server";
}

/**
 * Instrument the server process for DevTools.
 *
 * Wires `devtoolsHooks` on the server so proxy-mode requests
 * (via `apiRoute()`) emit events to the DevTools UI.
 *
 * Safe to call unconditionally — returns a no-op in production
 * and warns if called in a browser environment.
 *
 * @example
 * ```ts
 * // instrumentation.ts
 * export async function register() {
 *   const { instrumentServer } = await import("@noverax/nexus-devtools-core");
 *   const { api } = await import("./src/api");
 *   instrumentServer({ sources: { api } });
 * }
 * ```
 *
 * @param options - Server instrumentation options (sources required)
 * @returns DevTools connection with `disconnect()` method
 */
export function instrumentServer(options: InstrumentServerOptions): DevToolsConnection {
  // No-op in production — zero overhead, safe to call unconditionally
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return NOOP_CONNECTION;
  }

  // Warn if accidentally called in browser
  if (typeof window !== "undefined") {
    console.warn(
      "[nexus-devtools] instrumentServer() is for server use. Use connectDevTools() in browser.",
    );
    return NOOP_CONNECTION;
  }

  const { sources, framework, ...rest } = options;

  return connectDevTools({
    ...rest,
    sources,
    framework: framework ?? detectFramework(),
  });
}
