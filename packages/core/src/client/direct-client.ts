import type { CallerDefaults } from "../caller";
import type { AnyDefinedApi } from "../define";
import { composeBackend } from "../transport/compose-backend";
import { createDirectHTTPExecutor } from "../transport/direct/http";
import { directStreamingFactories } from "../transport/direct-streaming";
import { buildClientProxy } from "./proxy";
import { shapeOfSource } from "./shape";

/**
 * The client a direct caller hands out, its types left to the caller that
 * made it: every way of making one — a page's, a server's — builds it here.
 *
 * @param source - The API the client calls
 * @param defaults - The caller's defaults
 * @returns The client
 * @example
 * ```ts
 * const client = directClient(api, { timeout: 5000 });
 * ```
 */
export function directClient(source: AnyDefinedApi, defaults: CallerDefaults = {}): unknown {
  const http = createDirectHTTPExecutor(source, defaults);
  const backend = composeBackend(
    source as Record<string, unknown>,
    http,
    directStreamingFactories(source, defaults),
  );
  return buildClientProxy(backend, {}, false, shapeOfSource(source as Record<string, unknown>));
}
