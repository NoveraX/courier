/**
 * Mock-server lifecycle handlers for the Studio app namespace. Tracks
 * `mock:server:connect/disconnect` and `mock:network:config` events,
 * keyed by socket.id so disconnect cleanup can release the right state.
 */

import type { Socket } from "socket.io";
import { mockServers, socketMockServers } from "./app-namespace-state";
import { sanitizeMockNetworkConfig, sanitizeMockServerEvent } from "./sanitize-mock-events";

export function handleMockServerConnect(event: Record<string, unknown>, socket: Socket): void {
  const sanitized = sanitizeMockServerEvent(event);
  if (!sanitized) return;
  mockServers.set(sanitized.serverId, sanitized);
  const owned = socketMockServers.get(socket.id) ?? new Set();
  owned.add(sanitized.serverId);
  socketMockServers.set(socket.id, owned);
}

export function handleMockServerDisconnect(event: Record<string, unknown>, socket: Socket): void {
  const sanitized = sanitizeMockServerEvent(event);
  if (!sanitized) return;
  mockServers.delete(sanitized.serverId);
  socketMockServers.get(socket.id)?.delete(sanitized.serverId);
}

export function handleMockNetworkConfig(event: Record<string, unknown>): void {
  const sanitized = sanitizeMockServerEvent(event);
  const cached = sanitized ? mockServers.get(sanitized.serverId) : undefined;
  if (!cached) return;
  const cfg = sanitizeMockNetworkConfig(event.config);
  if (!cfg) return;
  cached.networkConfig = cfg;
  cached.latencyPreset = cfg.latencyPreset;
  cached.latencyStartedAt = cfg.latencyStartedAt;
  cached.chaosPreset = cfg.chaosPreset;
  cached.chaosStartedAt = cfg.chaosStartedAt;
}
