import { createLogger } from "@noverax/courier";
import type { Socket } from "socket.io";

import { buildBindingSnapshot } from "./binding-snapshot";
import { BindingConflictError } from "./catalog/binding-table";
import type { SetupRuntimeNamespaceDeps } from "./runtime-namespace";
import {
  registerRuntime,
  releaseRuntimeSocket,
  unregisterRuntime,
  updateRuntimeClaim,
} from "./runtime-namespace-state";
import { sanitizeRuntimeAnnounce, sanitizeRuntimeHello } from "./sanitize-runtime-events";

const log = createLogger("Studio");

export function handleHello(
  raw: unknown,
  socket: Socket,
  ref: { runtimeId: string | undefined },
  deps: SetupRuntimeNamespaceDeps,
): void {
  const hello = sanitizeRuntimeHello(raw);
  if (!hello) {
    log.warn("Rejected malformed runtime:hello payload");
    return;
  }
  ref.runtimeId = hello.runtimeId;
  registerRuntime({
    runtimeId: hello.runtimeId,
    kind: hello.kind,
    socket,
    transports: [],
    sourceNames: [],
    // The sanitized hello payload may carry `listenOrigin` directly — adopt it
    // immediately so a runtime that never sends `runtime:announce` (e.g. one
    // that hosts no transports yet still wants to appear in the registry) is
    // still resolvable for the playground "resolved URL" badge.
    ...(hello.listenOrigin && { listenOrigin: hello.listenOrigin }),
  });
  /* A runtime counts as attached from its hello, whether or not it ever
     announces a transport — a browser never does. */
  emitBindingSnapshot(deps);
}

export function handleAnnounce(
  raw: unknown,
  ref: { runtimeId: string | undefined },
  deps: SetupRuntimeNamespaceDeps,
): void {
  if (!ref.runtimeId) {
    log.warn("Rejected runtime:announce before runtime:hello");
    return;
  }
  const announce = sanitizeRuntimeAnnounce(raw);
  if (!announce) {
    log.warn("Rejected malformed runtime:announce payload");
    return;
  }
  /* An announce adds a claim; it does not restate everything the runtime
     serves. Adapters send one per transport — `courierHandler` announces
     http, `courierSSEHandler` sse, `courierWSAttach` ws — so detaching first
     made each message erase the ones before it, and only the last transport
     a runtime announced was ever bound. Ownership is released on disconnect,
     which is where a runtime that goes away is actually handled. */
  deps.bindingTable.attachRuntime(ref.runtimeId, announce.transports, announce.sources);
  updateRuntimeClaim(ref.runtimeId, announce.transports, announce.sources, {
    listenOrigin: announce.listenOrigin,
    framework: announce.framework,
  });
  emitBindingSnapshot(deps);
}

export function handleDisconnect(
  socket: Socket,
  ref: { runtimeId: string | undefined },
  deps: SetupRuntimeNamespaceDeps,
): void {
  const runtimeId = ref.runtimeId;
  if (!runtimeId) return;
  ref.runtimeId = undefined;
  // Another process still runs under this id; its bindings stay.
  if (releaseRuntimeSocket(runtimeId, socket) === "remaining") return;
  // Synthesize errors for any playground requests still in-flight on this
  // runtime BEFORE the registry entry is removed — the router needs the
  // mapping intact to find the originating UI sockets.
  deps.playgroundRouter?.onRuntimeDisconnect(runtimeId);
  unregisterRuntime(runtimeId);
  deps.bindingTable.detachRuntime(runtimeId);
  emitBindingSnapshot(deps);
}

export function emitBindingSnapshot(deps: SetupRuntimeNamespaceDeps): void {
  if (!deps.uiNamespace) return;
  try {
    deps.uiNamespace.emit("binding:snapshot", buildBindingSnapshot(deps.bindingTable));
  } catch (err) {
    if (err instanceof BindingConflictError) {
      deps.uiNamespace.emit("binding:error", {
        kind: "conflict",
        details: err.context,
      });
      return;
    }
    log.warn("Failed to emit binding:snapshot", err);
  }
}
