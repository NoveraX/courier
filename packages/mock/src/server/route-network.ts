/**
 * Network simulation helpers for the mock route handler.
 *
 * Pure functions that resolve the effective network config (dynamic state
 * takes precedence over static config), compute the delay to apply before
 * the response, and simulate bandwidth throttling based on the serialized
 * response payload size.
 */

import { resolveLatency } from "../network/latency";
import type { LatencyDistribution, LatencyProfile, NetworkConfig } from "../types";
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

/** Resolve delay from handler-level or effective network config */
export function resolveDelay(
  handler: { delayMs?: number; latency?: LatencyProfile },
  network?: NetworkConfig,
): number | undefined {
  const distribution = network?.distribution ?? "uniform";
  return (
    handler.delayMs ??
    (handler.latency ? resolveLatency(handler.latency, distribution) : undefined) ??
    resolveNetworkLatency(network, distribution)
  );
}

function resolveNetworkLatency(
  network: NetworkConfig | undefined,
  distribution: LatencyDistribution,
): number | undefined {
  if (!network?.latency) return undefined;
  const profile: LatencyProfile =
    typeof network.latency === "number"
      ? { min: network.latency, max: network.latency }
      : network.latency;
  return resolveLatency(profile, distribution);
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
