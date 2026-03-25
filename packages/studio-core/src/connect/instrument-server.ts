import { createLogger } from "@noverax/nexus";

import { extractSourceMap } from "../source-map";
import { registerSources } from "../sources-registry";
import { connectStudio } from "./connect-studio";
import type { InstrumentServerOptions, StudioConnection } from "./types";

const log = createLogger("Studio");

const NOOP_CONNECTION: StudioConnection = {
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
 * Instrument the server process for Studio.
 *
 * Wires `studioHooks` on the server so proxy-mode requests
 * (via `apiRoute()`) emit events to the Studio UI.
 *
 * Safe to call unconditionally — returns a no-op in production
 * and warns if called in a browser environment.
 *
 * @example
 * ```ts
 * // instrumentation.ts
 * export async function register() {
 *   const { instrumentServer } = await import("@noverax/nexus-studio-core");
 *   const { api } = await import("./src/api");
 *   instrumentServer({ sources: { api } });
 * }
 * ```
 *
 * @param options - Server instrumentation options (sources required)
 * @returns Studio connection with `disconnect()` method
 */
export function instrumentServer(options: InstrumentServerOptions): StudioConnection {
  // No-op in production
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    log.debug("Skipped — production environment.");
    return NOOP_CONNECTION;
  }

  // Warn if accidentally called in browser
  if (typeof window !== "undefined") {
    log.warn("instrumentServer() is for server use. Use connectStudio() in browser.");
    return NOOP_CONNECTION;
  }

  // Skip in Edge runtime — Socket.IO requires Node.js net/tls APIs
  if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "edge") {
    log.debug("Skipped — Edge runtime does not support Socket.IO. Use Node.js runtime.");
    return NOOP_CONNECTION;
  }

  const { sources, framework, ...rest } = options;

  // Register sources before connectStudio so the registry is populated
  // (onSourcesChange listener isn't set up yet, so we pass sourceMap explicitly)
  registerSources(sources);

  return connectStudio({
    ...rest,
    sourceMap: extractSourceMap(sources),
    framework: framework ?? detectFramework(),
  });
}
