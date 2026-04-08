/**
 * Per-socket event and disconnect handlers for the Studio app namespace.
 * Mock-server lifecycle lives in `app-namespace-mock-handlers.ts`; this
 * module owns connection-init / sources / disconnect bookkeeping.
 */

import type { Namespace, Socket } from "socket.io";
import { removeSessionEnv, setSessionEnv } from "../runtime-env";
import {
  handleMockNetworkConfig,
  handleMockServerConnect,
  handleMockServerDisconnect,
} from "./app-namespace-mock-handlers";
import {
  mockServers,
  nextSessionVersion,
  sessionVersionRegistry,
  socketMockServers,
} from "./app-namespace-state";
import { logAppConnect, logAppDisconnect } from "./banner";
import type { CatalogStore } from "./catalog";
import { sanitizeEnv, sanitizeSourceMap } from "./sanitize-source-map";
import { bufferEvent } from "./session-buffer";
import type { SessionInfo } from "./types";

export interface AppSocketHandlerDeps {
  uiNamespace: Namespace;
  sessions: Map<string, SessionInfo>;
  catalogStore: CatalogStore;
}

export interface SessionRef {
  current: string | undefined;
}

export function handleAppEvent(
  event: Record<string, unknown>,
  socket: Socket,
  ref: SessionRef,
  deps: AppSocketHandlerDeps,
): void {
  bufferEvent(event);

  if (event.type === "connection:init") {
    handleConnectionInit(event, socket, ref, deps);
  }

  if (event.type === "connection:sources" && ref.current) {
    handleConnectionSources(event, ref.current, deps);
  }

  if (event.type === "mock:server:connect") {
    handleMockServerConnect(event, socket);
  }
  if (event.type === "mock:server:disconnect") {
    handleMockServerDisconnect(event, socket);
  }
  if (event.type === "mock:network:config") {
    handleMockNetworkConfig(event);
  }

  // Forward all events to UI
  deps.uiNamespace.emit("event", event);
}

function handleConnectionInit(
  event: Record<string, unknown>,
  socket: Socket,
  ref: SessionRef,
  deps: AppSocketHandlerDeps,
): void {
  // event.* fields come from a wire-format payload typed as
  // Record<string, unknown> — they retain `as string` casts because
  // the runtime is the validation boundary, not socket.data.
  const sessionId = event.sessionId as string;
  ref.current = sessionId;

  const fwInit = (event.framework as string) ?? "unknown";
  const sessionVersion = nextSessionVersion(sessionId);
  socket.data.sessionId = sessionId;
  socket.data.framework = fwInit;
  socket.data.sessionVersion = sessionVersion;
  deps.sessions.set(sessionId, {
    sessionId,
    framework: fwInit,
    nexusVersion: (event.nexusVersion as string) ?? "0.0.0",
    connectedAt: Date.now(),
    sessionVersion,
  });

  const sources = sanitizeSourceMap(event.sources);
  if (sources) deps.catalogStore.setRuntimeLayer(sessionId, sources);

  const env = sanitizeEnv(event.env);
  if (env) setSessionEnv(sessionId, env);

  deps.uiNamespace.emit("session:connect", deps.sessions.get(sessionId));

  const origin = socket.handshake.headers.origin ?? socket.handshake.address;
  logAppConnect(fwInit, origin);
}

function handleConnectionSources(
  event: Record<string, unknown>,
  sessionId: string,
  deps: AppSocketHandlerDeps,
): void {
  const sources = sanitizeSourceMap(event.sources);
  if (sources) deps.catalogStore.setRuntimeLayer(sessionId, sources);

  const env = sanitizeEnv(event.env);
  if (env) setSessionEnv(sessionId, env);
}

export function handleAppDisconnect(
  socket: Socket,
  ref: SessionRef,
  deps: AppSocketHandlerDeps,
): void {
  const sessionId = ref.current;

  if (sessionId) {
    const fw = socket.data.framework ?? "unknown";
    const origin = socket.handshake.headers.origin ?? socket.handshake.address;
    logAppDisconnect(fw, origin);

    deps.catalogStore.removeRuntimeLayer(sessionId);
    removeSessionEnv(sessionId);
    deps.sessions.delete(sessionId);
    sessionVersionRegistry.delete(sessionId);
    deps.uiNamespace.emit("session:disconnect", { sessionId });
  }

  // Mock server cleanup — works for both app sessions and standalone mock bridges
  const owned = socketMockServers.get(socket.id);
  if (!owned) return;
  for (const serverId of owned) {
    mockServers.delete(serverId);
    deps.uiNamespace.emit("event", {
      id: `disconnect_${serverId}_${Date.now().toString(36)}`,
      type: "mock:server:disconnect",
      timestamp: Date.now(),
      sessionId: sessionId ?? socket.id,
      serverId,
    });
  }
  socketMockServers.delete(socket.id);
}
