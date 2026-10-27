/**
 * `@noverax/courier/internal-client` — the pieces a client built on Courier
 * takes from it in a page.
 *
 * **Internal subpath.** Public consumers must NOT depend on this module — it
 * exists for `@noverax/courier-react`, whose hooks run in the browser.
 * `@noverax/courier/internal` holds the server's pieces too, and a bundler
 * that splits a page into chunks puts what a module the page imports imports
 * in a chunk the page loads at start, whether or not the page runs it: from
 * here, a page takes the client's pieces alone.
 *
 * Stability: tracked alongside `@noverax/courier-react` releases. No semver
 * guarantees for external consumers.
 */

export { RUNTIME_HOOKS } from "../client/proxy-members";
export { createClientRoot } from "../client/root";
export { type ClientShape, shapeOfRoutes, shapeOfSource } from "../client/shape";
export { GROUP_PATH_SEPARATOR } from "../define/group-tree";
export { proxyDefaultsOf } from "../proxy-caller/proxy-defaults";
export { createConnectionState } from "../realtime/connection-state";
export { createDirectHTTPExecutor } from "../transport/direct/http";
export { directStreamingFactories } from "../transport/direct-streaming";
export { createProxyHTTPExecutor } from "../transport/proxy/http";
export { proxyStreamingFactories } from "../transport/proxy-streaming";
export type { HTTPExecutor } from "../transport/types";
export { anySignal } from "../utils/any-signal";
