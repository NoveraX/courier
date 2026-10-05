/**
 * Network simulation helpers for the mock route handler.
 *
 * Pure functions that resolve the effective network config (dynamic state
 * takes precedence over static config) and simulate bandwidth throttling
 * based on the serialized response payload size.
 */

import type { NetworkConfig } from "../types";
import type { RouteConfig } from "./route-types";

/** Resolve effective NetworkConfig — dynamic state (with per-route) > static config */
export function resolveNetConfig(
  config: RouteConfig,
  group: string,
  method: string,
): NetworkConfig | undefined {
  if (config.networkState) return config.networkState.getConfig(group, method);
  return config.network;
}

/**
 * Simulate bandwidth throttling by adding delay proportional to response size.
 * bandwidth is in Kbps; returns delay in ms (0 = unlimited).
 */
export function computeBandwidthDelay(bandwidth: number | undefined, data: unknown): number {
  if (!bandwidth || bandwidth <= 0) return 0;
  const json = JSON.stringify(data) ?? "";
  const bytes = new TextEncoder().encode(json).byteLength;
  const bitsPerMs = bandwidth; // Kbps = kilobits/sec = bits/ms
  return Math.round((bytes * 8) / bitsPerMs);
}
