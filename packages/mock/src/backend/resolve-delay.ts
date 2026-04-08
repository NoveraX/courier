import { resolveLatency } from "../network/latency";
import type { NetworkConfig } from "../types";

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Resolve handler delay from handler config, latency profile, or network config */
export function resolveHandlerDelay(
  handler: { delayMs?: number; latency?: Parameters<typeof resolveLatency>[0] },
  network?: NetworkConfig,
): number | undefined {
  return (
    handler.delayMs ??
    (handler.latency ? resolveLatency(handler.latency) : undefined) ??
    (network?.latency
      ? resolveLatency(
          typeof network.latency === "number"
            ? { min: network.latency, max: network.latency }
            : network.latency,
        )
      : undefined)
  );
}
