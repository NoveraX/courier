/**
 * Typed `socket.data` shape for the Studio app namespace.
 *
 * Socket.IO's `Namespace` and `Socket` types accept a `SocketData` generic
 * as their fourth parameter. We pin it once here and use the resulting
 * `AppNamespace` / `AppSocket` aliases everywhere instead of the bare
 * `Namespace` / `Socket` types — that lets us read `socket.data.sessionId`
 * and `socket.data.framework` without `as string` panic-casts and forces
 * the compiler to flag any new field that gets added without updating
 * the shape here first.
 *
 * # Why this lives in its own file
 *
 * The shape is shared between `app-namespace.ts` (which writes the fields
 * during `connection:init`), `playground-stream-routing.ts` (which reads
 * `sessionId` and `framework`), and `ui-namespace.ts` / the playground/replay
 * handlers (which type the `appNamespace` parameter). A dedicated module
 * keeps the contract centralized and prevents drift.
 */

import type { DefaultEventsMap, Namespace, Socket } from "socket.io";

/**
 * Fields stored on `socket.data` for every connected app socket. Populated
 * by the `connection:init` handler in `app-namespace.ts`.
 *
 * **Adding a field?** Add it here first, then `app-namespace.ts` and any
 * reader. The compiler will refuse to merge until both ends agree.
 */
export interface AppSocketData {
  /**
   * Stable identifier for the user-app session. Set on `connection:init` and
   * used as the key for `CatalogStore.getRuntimeLayer(sessionId)` lookups.
   */
  sessionId?: string;

  /**
   * Framework label sent by the app (`"next-server"`, `"hono"`, `"server"`,
   * `"unknown"`, …). Used by the framework-aware fallback in
   * `pickStreamTargetSocket` and the connection banner.
   */
  framework?: string;

  /**
   * Monotonically increasing version for this `sessionId`. Bumped on every
   * `connection:init` for a sessionId we have already seen, so consumers can
   * distinguish a stale buffered event from an old session generation from a
   * fresh event in the new generation. Starts at 1 for the first init.
   *
   * The version lives on `socket.data` (per-socket) AND on the {@link SessionInfo}
   * record (per-sessionId, surviving the disconnect window). When a new
   * connection arrives reusing the same sessionId, `app-namespace.ts` reads
   * the previous max version from a module-scoped registry and stamps the
   * incremented value on both places.
   */
  sessionVersion?: number;
}

/**
 * Studio app namespace — pins `SocketData` to `AppSocketData`. The first
 * three generics (`ListenEvents`, `EmitEvents`, `ServerSideEvents`) stay at
 * the Socket.IO defaults because we still pass payloads as `unknown` and
 * narrow them at the handler boundary; only the data shape needs locking.
 */
export type AppNamespace = Namespace<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  AppSocketData
>;

/** Per-socket counterpart of `AppNamespace`. */
export type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, AppSocketData>;
