import type { ResolvedOptions, StudioPluginOptions } from "./types";

const DEFAULT_PORT = 4380;
const DEFAULT_HOST = "localhost";
const HOST_RE = /^[a-zA-Z0-9.-]+$/;

export function resolveOptions(options: StudioPluginOptions = {}): ResolvedOptions {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;

  if (typeof port !== "number" || !Number.isFinite(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid studio port: ${String(port)}`);
  }
  if (!HOST_RE.test(host)) {
    throw new Error(`Invalid studio host: ${host}`);
  }

  return {
    port,
    host,
    enabled: options.enabled ?? process.env.NODE_ENV !== "production",
    filter: options.filter,
  };
}
