import type { MockServerInfo, UploadConditions } from "@/store/mock-slice";
import type { Delay } from "./latency-window";
import { delayOf } from "./latency-window";
import { hasOwnSettings, routeOverridesOf } from "./route-overrides";
import { uploadsOf } from "./upload-conditions";

/** What a mock simulates, as the network condition sums it up. */
export interface NetworkCondition {
  /** The share of answers it fails, in percent */
  rate: number;
  /** The delay it adds to every answer, or `null` for none */
  delay: Delay | null;
  /** Its cap on how fast bodies are sent, in Kbps; 0 for none */
  kbps: number;
  /** How it takes uploads: how fast, the largest, and the types of file */
  uploads: UploadConditions;
  /** How many routes are answered under an override of their own */
  routes: number;
}

/**
 * What a mock simulates: its failure rate, its delay and bandwidth cap,
 * its upload conditions, and the routes answered under an override of
 * their own.
 *
 * @param server - The mock server
 * @returns What it simulates
 * @example
 * ```ts
 * networkConditionOf(server); // { rate: 40, delay: { base: 600, jitter: 450 }, kbps: 512, uploads: {}, routes: 1 }
 * ```
 */
export function networkConditionOf(
  server: Pick<MockServerInfo, "networkConfig">,
): NetworkCondition {
  const config = server.networkConfig;
  return {
    rate: Math.round((config?.errorRate ?? 0) * 100),
    delay: delayOf(config?.latency),
    kbps: config?.bandwidth ?? 0,
    uploads: uploadsOf(server),
    routes: routeOverridesOf(server).filter(hasOwnSettings).length,
  };
}

/**
 * A bandwidth cap as Studio names it: in Kbps below a megabit, in Mbps from one up.
 *
 * @param kbps - The cap in kilobits a second
 * @returns Its label
 * @example
 * ```ts
 * bandwidthLabel(512); // "512 Kbps"
 * bandwidthLabel(1500); // "1.5 Mbps"
 * ```
 */
export function bandwidthLabel(kbps: number): string {
  return kbps < 1_000 ? `${kbps} Kbps` : `${Number((kbps / 1_000).toFixed(1))} Mbps`;
}
